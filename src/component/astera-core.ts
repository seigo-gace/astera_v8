import { randomUUID } from 'node:crypto';
import type {
  CoreExecutionHooks,
  CoreExecutionRequest,
  CoreExecutionResult,
  CoreExecutionStatus,
  CoreModule,
  CoreModuleExecutionContext,
  ModuleExecutionError,
  ModuleExecutionResult
} from '../part/core-contracts.js';
import { sanitize } from '../part/safe-json.js';
import { buildExecutionPlan } from '../feature/execution-plan.js';
import { ModuleRegistry, phaseRank } from '../feature/module-registry.js';

function isoNow(): string {
  return new Date().toISOString();
}

function durationMs(started: number): number {
  return Math.max(0, Date.now() - started);
}

function toExecutionError(error: unknown): ModuleExecutionError {
  if (error instanceof Error) {
    const code = typeof (error as Error & { code?: unknown }).code === 'string' ? (error as Error & { code: string }).code : undefined;
    return Object.freeze({ name: error.name, message: error.message, ...(code ? { code } : {}) });
  }
  return Object.freeze({ name: 'Error', message: String(error) });
}

function linkAbortSignal(parent: AbortSignal | undefined, controller: AbortController): () => void {
  if (!parent) return () => {};
  if (parent.aborted) {
    controller.abort(parent.reason);
    return () => {};
  }
  const onAbort = (): void => controller.abort(parent.reason);
  parent.addEventListener('abort', onAbort, { once: true });
  return () => parent.removeEventListener('abort', onAbort);
}

export class AsteraCore {
  readonly #registry: ModuleRegistry;
  readonly #hooks: CoreExecutionHooks;
  #initialized = false;
  #closed = false;

  constructor(registry: ModuleRegistry, hooks: CoreExecutionHooks = {}) {
    this.#registry = registry.freeze();
    this.#hooks = hooks;
  }

  async initialize(): Promise<void> {
    if (this.#closed) throw new Error('ASTERA_CORE_CLOSED');
    if (this.#initialized) return;
    const plan = buildExecutionPlan(this.#registry.list());
    for (const stage of plan) await Promise.all(stage.modules.map((module) => module.initialize?.()));
    this.#initialized = true;
  }

  async execute(request: CoreExecutionRequest): Promise<CoreExecutionResult> {
    if (this.#closed) throw new Error('ASTERA_CORE_CLOSED');
    await this.initialize();
    const startedEpoch = Date.now();
    const startedAt = isoNow();
    const executionId = randomUUID();
    const requestId = request.requestId?.trim() || executionId;
    const results = new Map<string, ModuleExecutionResult>();
    const plan = buildExecutionPlan(this.#registry.list());
    let criticalFailure = false;

    for (const stage of plan) {
      const runnable: CoreModule[] = [];
      for (const module of stage.modules) {
        if (criticalFailure && module.manifest.runAfterCriticalFailure !== true) {
          const result = skippedResult(module, 'CORE_SKIPPED_AFTER_CRITICAL_FAILURE');
          results.set(module.manifest.moduleId, result);
          await this.#hooks.onModuleResult?.(result);
          continue;
        }
        const unsuccessfulDependencies = module.manifest.dependsOn.filter((dependencyId) => results.get(dependencyId)?.status !== 'SUCCESS');
        if ((module.manifest.requiresSuccessfulDependencies ?? true) && unsuccessfulDependencies.length) {
          const result = skippedResult(module, `CORE_DEPENDENCY_NOT_SUCCESS:${unsuccessfulDependencies.sort().join(',')}`);
          results.set(module.manifest.moduleId, result);
          await this.#hooks.onModuleResult?.(result);
          continue;
        }
        runnable.push(module);
      }
      if (!runnable.length) continue;
      const snapshot = new Map(results);
      const stageResults = await Promise.all(runnable.map((module) => this.#executeModule(module, request, {
        executionId,
        requestId,
        startedAt,
        results: snapshot
      })));
      for (const result of stageResults.sort(compareResults)) {
        results.set(result.moduleId, result);
        if ((result.status === 'FAILED' || result.status === 'CANCELLED') && this.#registry.get(result.moduleId)?.manifest.critical) criticalFailure = true;
        await this.#hooks.onModuleResult?.(result);
      }
    }

    const ordered = [...results.values()].sort(compareResults);
    const main = this.#registry.list().find((module) => module.manifest.role === 'MAIN');
    if (!main) throw new Error('CORE_MAIN_MODULE_MISSING_AFTER_VALIDATION');
    const mainResult = results.get(main.manifest.moduleId);
    const completedAt = isoNow();
    const status = resolveCoreStatus(ordered, request.signal);
    const result: CoreExecutionResult = Object.freeze({
      executionId,
      requestId,
      status,
      output: mainResult?.status === 'SUCCESS' ? sanitize(mainResult.data) : null,
      mainModuleId: main.manifest.moduleId,
      moduleResults: Object.freeze(ordered),
      startedAt,
      completedAt,
      durationMs: durationMs(startedEpoch)
    });
    await this.#hooks.onExecutionCompleted?.(result);
    return result;
  }

  async #executeModule(module: CoreModule, request: CoreExecutionRequest, base: {
    readonly executionId: string;
    readonly requestId: string;
    readonly startedAt: string;
    readonly results: ReadonlyMap<string, ModuleExecutionResult>;
  }): Promise<ModuleExecutionResult> {
    const startedEpoch = Date.now();
    const startedAt = isoNow();
    const controller = new AbortController();
    const unlink = linkAbortSignal(request.signal, controller);
    const timeoutMs = Math.max(1, Math.floor(module.manifest.timeoutMs ?? 60_000));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(Object.assign(new Error(`CORE_MODULE_TIMEOUT:${module.manifest.moduleId}`), { code: 'CORE_MODULE_TIMEOUT' }));
    }, timeoutMs);
    timer.unref?.();
    const context: CoreModuleExecutionContext = Object.freeze({
      executionId: base.executionId,
      requestId: base.requestId,
      startedAt: base.startedAt,
      input: request.input,
      metadata: request.metadata ?? Object.freeze({}),
      signal: controller.signal,
      results: base.results,
      getResult: (moduleId: string) => base.results.get(moduleId)
    });
    try {
      let abortListener: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        abortListener = () => reject(controller.signal.reason ?? new Error('CORE_MODULE_CANCELLED'));
        controller.signal.addEventListener('abort', abortListener, { once: true });
      });
      const value = await Promise.race([module.execute(context), aborted]);
      if (abortListener) controller.signal.removeEventListener('abort', abortListener);
      return Object.freeze({
        moduleId: module.manifest.moduleId,
        moduleVersion: module.manifest.moduleVersion,
        phase: module.manifest.phase,
        role: module.manifest.role,
        status: 'SUCCESS' as const,
        data: sanitize(value.data),
        diagnostics: Object.freeze([...(value.diagnostics ?? [])]),
        evidenceRefs: Object.freeze([...(value.evidenceRefs ?? [])].sort()),
        unresolved: Object.freeze([...(value.unresolved ?? [])].sort()),
        resourceUsage: Object.freeze({ ...(value.resourceUsage ?? {}) }),
        timing: Object.freeze({ startedAt, completedAt: isoNow(), durationMs: durationMs(startedEpoch) })
      });
    } catch (error) {
      const cancelled = controller.signal.aborted && !timedOut;
      return Object.freeze({
        moduleId: module.manifest.moduleId,
        moduleVersion: module.manifest.moduleVersion,
        phase: module.manifest.phase,
        role: module.manifest.role,
        status: cancelled ? 'CANCELLED' as const : 'FAILED' as const,
        diagnostics: Object.freeze([]),
        evidenceRefs: Object.freeze([]),
        unresolved: Object.freeze([]),
        resourceUsage: Object.freeze({}),
        error: toExecutionError(error),
        timing: Object.freeze({ startedAt, completedAt: isoNow(), durationMs: durationMs(startedEpoch) })
      });
    } finally {
      clearTimeout(timer);
      unlink();
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const stages = [...buildExecutionPlan(this.#registry.list())].reverse();
    for (const stage of stages) await Promise.allSettled([...stage.modules].reverse().map((module) => module.close?.()));
  }
}

function skippedResult(module: CoreModule, reason: string): ModuleExecutionResult {
  const at = isoNow();
  return Object.freeze({
    moduleId: module.manifest.moduleId,
    moduleVersion: module.manifest.moduleVersion,
    phase: module.manifest.phase,
    role: module.manifest.role,
    status: 'SKIPPED',
    diagnostics: Object.freeze([reason]),
    evidenceRefs: Object.freeze([]),
    unresolved: Object.freeze([]),
    resourceUsage: Object.freeze({}),
    timing: Object.freeze({ startedAt: at, completedAt: at, durationMs: 0 })
  });
}

function compareResults(a: ModuleExecutionResult, b: ModuleExecutionResult): number {
  return phaseRank(a.phase) - phaseRank(b.phase) || (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0);
}

function resolveCoreStatus(results: readonly ModuleExecutionResult[], signal: AbortSignal | undefined): CoreExecutionStatus {
  if (signal?.aborted) return 'CANCELLED';
  const main = results.find((result) => result.role === 'MAIN');
  if (!main || main.status !== 'SUCCESS') return main?.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
  return results.some((result) => result.status === 'FAILED' || result.status === 'CANCELLED') ? 'PARTIAL' : 'COMPLETED';
}
