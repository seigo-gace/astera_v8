#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createAsteraBodyApplicationSystem } from './astera-body-application-system.js';
import type { AsteraCoreSystemOptions } from '../system/astera-core-system.js';

function usage(): string {
  return [
    'Usage: node dist/application-system/cli.js --runtime ./runtime-config.mjs --request ./request.json [--taxonomy ./all_domain_taxonomy_v1.json]',
    '',
    'runtime-config.mjs must export:',
    '  implementationSpec  // explicit TBD-05 implementation values and security contracts',
    '  taxonomyMasterPath or --taxonomy',
    'Optional: retrievalAdapter override, evidenceSearch options, aliasEntries, issuerEntries, policyEntries, registryVersions, versionOverrides',
    '',
    'The CLI does not guess missing TBD-05 values.'
  ].join('\n');
}

function argsOf(argv: readonly string[]): Readonly<Record<string, string>> {
  const output: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value) throw new TypeError(`CLI_ARGUMENT_VALUE_REQUIRED:${token}`);
    output[token.slice(2)] = value;
    index += 1;
  }
  return Object.freeze(output);
}

const args = argsOf(process.argv.slice(2));
if (!args.runtime || !args.request) {
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 2;
} else {
  const runtime = await import(pathToFileURL(resolve(args.runtime)).href) as Readonly<Record<string, unknown>>;
  const request = JSON.parse(await readFile(resolve(args.request), 'utf8')) as unknown;
  const options: AsteraCoreSystemOptions = {
    implementationSpec: runtime.implementationSpec,
    ...(runtime.retrievalAdapter && typeof runtime.retrievalAdapter === 'object' ? { retrievalAdapter: runtime.retrievalAdapter as NonNullable<AsteraCoreSystemOptions['retrievalAdapter']> } : {}),
    ...(runtime.evidenceSearch && typeof runtime.evidenceSearch === 'object' ? { evidenceSearch: runtime.evidenceSearch as NonNullable<AsteraCoreSystemOptions['evidenceSearch']> } : {}),
    ...(args.taxonomy ? { taxonomyMasterPath: resolve(args.taxonomy) } : {}),
    ...(Array.isArray(runtime.aliasEntries) ? { aliasEntries: runtime.aliasEntries } : {}),
    ...(Array.isArray(runtime.issuerEntries) ? { issuerEntries: runtime.issuerEntries } : {}),
    ...(Array.isArray(runtime.policyEntries) ? { policyEntries: runtime.policyEntries } : {}),
    ...(runtime.registryVersions && typeof runtime.registryVersions === 'object' ? { registryVersions: runtime.registryVersions as Readonly<Record<string, string>> } : {}),
    ...(runtime.versionOverrides && typeof runtime.versionOverrides === 'object' ? { versionOverrides: runtime.versionOverrides as Readonly<Record<string, unknown>> } : {})
  };
  const system = await createAsteraBodyApplicationSystem(options);
  try {
    const result = await system.process({ input: request });
    process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
  } finally {
    await system.close();
  }
}
