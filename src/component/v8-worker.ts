import { parentPort, workerData } from 'node:worker_threads';
import { open } from 'node:fs/promises';
import { fragmentInput } from '../feature/fragmenter.js';
import { extractClaimsFromFragment } from '../feature/claim-extractor.js';
import { parseCodeStructure } from '../part/parsers/code-parser.js';
import { parseLogRecords } from '../part/parsers/log-parser.js';
import { parseTableRecords } from '../part/parsers/table-parser.js';
import { bindCandidate } from '../feature/evidence-binding.js';
import { evaluateClaimConfirmation } from '../feature/confirmation.js';
import { IssuerRegistry, AliasRegistry } from '../feature/registries.js';
import { TaxonomyRegistry } from '../feature/classification.js';
import { classifyShard, type TaxonomyRegistryLike } from '../feature/classification-parallel.js';
import { projectLane, type LaneName } from '../feature/lane-projections.js';
import { WorkerTask, type TextDescriptor, type WorkerEnvelope, type WorkerResponseEnvelope } from '../part/worker-protocol.js';
import type { CanonicalClaim, CandidateRecord, ClaimResultRecord, EvidenceBindingRecord, FragmentRecord, PolicyRecord, QueryRecord, TaxonomyMaster } from '../part/types.js';

interface WorkerBootstrap {
  readonly taxonomyMaster: TaxonomyMaster;
  readonly issuerEntries: readonly unknown[];
  readonly issuerVersion: string;
  readonly aliasEntries: readonly unknown[];
  readonly aliasVersion: string;
}

interface WorkerBootstrapEnvelope {
  readonly bootstrapDescriptor: TextDescriptor;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function decodeTextDescriptor(descriptor: TextDescriptor): Promise<string> {
  if (descriptor.kind === 'INLINE') return descriptor.text;
  if (descriptor.kind === 'SHARED_UTF8') {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(descriptor.buffer, 0, descriptor.byteLength));
  }
  const handle = await open(descriptor.path, 'r');
  try {
    const buffer = Buffer.alloc(descriptor.byteLength);
    const { bytesRead } = await handle.read(buffer, 0, descriptor.byteLength, descriptor.start);
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

const bootstrapEnvelope = workerData as WorkerBootstrapEnvelope;
const bootstrap = JSON.parse(await decodeTextDescriptor(bootstrapEnvelope.bootstrapDescriptor)) as WorkerBootstrap;
const taxonomyRegistry = new (TaxonomyRegistry as any)(bootstrap.taxonomyMaster) as TaxonomyRegistryLike;
const issuerRegistry = new (IssuerRegistry as any)(bootstrap.issuerEntries, bootstrap.issuerVersion);
const aliasRegistry = new (AliasRegistry as any)([...bootstrap.aliasEntries], bootstrap.aliasVersion);

function cancellationReader(buffer: SharedArrayBuffer): () => boolean {
  const flag = new Int32Array(buffer);
  return () => Atomics.load(flag, 0) === 1;
}

function assertNotCancelled(isCancelled: () => boolean): void {
  if (isCancelled()) throw new Error('WORKER_TASK_CANCELLED');
}

async function execute(message: WorkerEnvelope): Promise<unknown> {
  const isCancelled = cancellationReader(message.cancellationBuffer);
  assertNotCancelled(isCancelled);
  const payload = message.payload as Record<string, unknown>;

  switch (message.task) {
    case WorkerTask.FRAGMENT_NATURAL: {
      const text = await decodeTextDescriptor(payload.textDescriptor as TextDescriptor);
      assertNotCancelled(isCancelled);
      return fragmentInput({ inputDocumentId: String(payload.inputDocumentId), text });
    }
    case WorkerTask.EXTRACT_CLAIMS_BATCH: {
      const fragments = payload.fragments as readonly FragmentRecord[];
      const context = payload.context as Readonly<Record<string, unknown>>;
      const claims: CanonicalClaim[] = [];
      const unmappedFragmentIds: string[] = [];
      for (const fragment of fragments) {
        assertNotCancelled(isCancelled);
        const extracted = extractClaimsFromFragment(fragment, context) as { readonly claims: readonly CanonicalClaim[]; readonly unmapped: boolean };
        claims.push(...extracted.claims);
        if (extracted.unmapped) unmappedFragmentIds.push(fragment.fragment_id);
      }
      return Object.freeze({ claims: Object.freeze(claims), unmappedFragmentIds: Object.freeze(unmappedFragmentIds) });
    }
    case WorkerTask.PARSE_CODE: {
      const source = await decodeTextDescriptor(payload.sourceDescriptor as TextDescriptor);
      assertNotCancelled(isCancelled);
      return (parseCodeStructure as any)({ ...(payload.options as Record<string, unknown>), source });
    }
    case WorkerTask.PARSE_LOG: {
      const source = await decodeTextDescriptor(payload.sourceDescriptor as TextDescriptor);
      assertNotCancelled(isCancelled);
      return (parseLogRecords as any)({ ...(payload.options as Record<string, unknown>), source });
    }
    case WorkerTask.PARSE_TABLE: {
      const source = await decodeTextDescriptor(payload.sourceDescriptor as TextDescriptor);
      assertNotCancelled(isCancelled);
      return (parseTableRecords as any)({ ...(payload.options as Record<string, unknown>), source });
    }
    case WorkerTask.CLASSIFY_SHARD: {
      const text = await decodeTextDescriptor(payload.textDescriptor as TextDescriptor);
      return classifyShard({
        text,
        mode: payload.mode as 'GENRE' | 'PATH',
        shardIndex: Number(payload.shardIndex),
        shardCount: Number(payload.shardCount),
        ...(typeof payload.genreId === 'string' ? { genreId: payload.genreId } : {})
      }, taxonomyRegistry, isCancelled);
    }
    case WorkerTask.BIND_BATCH: {
      const items = payload.items as readonly Readonly<{
        claim: CanonicalClaim;
        candidate: CandidateRecord;
        candidateTextDescriptor?: TextDescriptor;
        query: QueryRecord;
        policy: PolicyRecord;
        exclusivityGroups?: readonly unknown[];
      }>[];
      const output: EvidenceBindingRecord[] = [];
      for (const item of items) {
        assertNotCancelled(isCancelled);
        const candidate = item.candidateTextDescriptor
          ? { ...item.candidate, extracted_text: await decodeTextDescriptor(item.candidateTextDescriptor) }
          : item.candidate;
        output.push((bindCandidate as any)({
          claim: item.claim,
          candidate,
          query: item.query,
          policy: item.policy,
          issuerRegistry,
          aliasRegistry,
          exclusivityGroups: item.exclusivityGroups ? [...item.exclusivityGroups] : []
        }) as EvidenceBindingRecord);
      }
      return Object.freeze(output);
    }
    case WorkerTask.CONFIRM_BATCH: {
      const items = payload.items as readonly Readonly<{
        claim: CanonicalClaim;
        policy: PolicyRecord | null;
        bindings: readonly EvidenceBindingRecord[];
        queries: readonly QueryRecord[];
        retrievalRecords: readonly CandidateRecord[];
        candidateEntries: readonly (readonly [string, CandidateRecord])[];
        unresolvedContradictions: readonly EvidenceBindingRecord[];
        additionalReasons: readonly string[];
      }>[];
      const output: ClaimResultRecord[] = [];
      for (const item of items) {
        assertNotCancelled(isCancelled);
        output.push((evaluateClaimConfirmation as any)({
          claim: item.claim,
          policy: item.policy,
          bindings: [...item.bindings],
          queries: [...item.queries],
          retrievalRecords: [...item.retrievalRecords],
          candidateById: new Map(item.candidateEntries),
          unresolvedContradictions: [...item.unresolvedContradictions],
          additionalReasons: [...item.additionalReasons]
        }) as ClaimResultRecord);
      }
      return Object.freeze(output);
    }
    case WorkerTask.PROJECT_LANE: {
      const snapshot = JSON.parse(await decodeTextDescriptor(payload.snapshotDescriptor as TextDescriptor)) as {
        readonly claims: readonly CanonicalClaim[];
        readonly results: readonly ClaimResultRecord[];
        readonly policyEntries: readonly (readonly [string, PolicyRecord | null])[];
        readonly criticalTargetIds: readonly string[];
      };
      assertNotCancelled(isCancelled);
      return projectLane({ lane: payload.lane as LaneName, ...snapshot });
    }
  }
}

if (!parentPort) throw new Error('WORKER_PARENT_PORT_REQUIRED');
const port = parentPort;
port.on('message', (message: WorkerEnvelope) => {
  void (async () => {
    let response: WorkerResponseEnvelope;
    try {
      const result = await execute(message);
      response = { id: message.id, ok: true, result };
    } catch (error) {
      response = { id: message.id, ok: false, error: toErrorMessage(error) };
    }
    port.postMessage(response);
  })();
});
