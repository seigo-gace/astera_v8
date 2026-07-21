import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AsteraCoreSystemOptions } from '../system/astera-core-system.js';
import { DurableStructuredLogger, LogOutbox, TgsClient } from '../feature/log-delivery.js';
import { createAsteraBodyRuntime } from './body-runtime.js';

interface RuntimeConfigModule extends Partial<AsteraCoreSystemOptions> {
  readonly asteraOptions?: AsteraCoreSystemOptions;
}

async function loadRuntimeConfig(path: string): Promise<AsteraCoreSystemOptions> {
  if (!path) throw new Error('ASTERA_RUNTIME_CONFIG_MODULE_REQUIRED');
  const loaded = await import(pathToFileURL(resolve(path)).href) as RuntimeConfigModule;
  const options = loaded.asteraOptions ?? loaded;
  if (!options.implementationSpec) throw new Error('ASTERA_RUNTIME_IMPLEMENTATION_SPEC_REQUIRED');
  return options as AsteraCoreSystemOptions;
}

async function loadServiceKey(): Promise<string> {
  const file = String(process.env.ASTERA_BODY_SERVICE_KEY_FILE || '');
  const direct = String(process.env.ASTERA_BODY_SERVICE_KEY || '');
  const value = file ? (await readFile(file, 'utf8')).trim() : direct.trim();
  if (value.length < 32 || value.length > 256) throw new Error('ASTERA_BODY_SERVICE_KEY_REQUIRED');
  return value;
}

async function main(): Promise<void> {
  const config = await loadRuntimeConfig(process.env.ASTERA_RUNTIME_CONFIG_MODULE || '');
  const serviceKey = await loadServiceKey();
  const logger = process.env.ASTERA_TGS_ENABLED === '0'
    ? undefined
    : new DurableStructuredLogger(new TgsClient(), new LogOutbox());
  const runtime = await createAsteraBodyRuntime({
    ...config,
    serviceKey,
    ...(logger ? { logger } : {}),
    host: process.env.ASTERA_BODY_HOST || '127.0.0.1',
    port: process.env.ASTERA_BODY_PORT === '0' ? 0 : Number(process.env.ASTERA_BODY_PORT || 7373)
  });
  const address = await runtime.start();
  process.stdout.write(`${JSON.stringify({ type: 'astera_body_started', address })}\n`);

  let stopping = false;
  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try {
      await runtime.close();
    } catch {
      exitCode = 1;
    }
    process.stdout.write(`${JSON.stringify({ type: 'astera_body_stopped', signal, exitCode })}\n`);
    process.exit(exitCode);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('uncaughtException', () => void shutdown('uncaughtException', 1));
  process.once('unhandledRejection', () => void shutdown('unhandledRejection', 1));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ type: 'astera_body_start_failed', error: message })}\n`);
  process.exit(1);
});
