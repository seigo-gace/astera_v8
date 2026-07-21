import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CoreExecutionResult } from '../part/core-contracts.js';
import { parseJsonStrict, sanitize } from '../part/safe-json.js';
import { timingSafeStringEqual } from '../part/timing-safe.js';
import type { StructuredLogSink } from '../part/operational-contracts.js';
import { AsteraBodyApplicationSystem } from './astera-body-application-system.js';

const ONE_MB = 1024 * 1024;

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export interface AsteraInternalApiApplicationSystemOptions {
  readonly body: AsteraBodyApplicationSystem;
  readonly serviceKey: string;
  readonly host?: string;
  readonly port?: number;
  readonly bodyLimitBytes?: number;
  readonly logger?: StructuredLogSink;
  readonly serviceVersion?: string;
}

export class AsteraInternalApiApplicationSystem {
  readonly #body: AsteraBodyApplicationSystem;
  readonly #serviceKey: string;
  readonly #host: string;
  readonly #port: number;
  readonly #bodyLimitBytes: number;
  readonly #logger: StructuredLogSink | undefined;
  readonly #serviceVersion: string;
  readonly #server: Server;
  #stopping = false;

  constructor(options: AsteraInternalApiApplicationSystemOptions) {
    const serviceKey = String(options.serviceKey || '');
    if (serviceKey.length < 32 || serviceKey.length > 256) throw new TypeError('ASTERA_BODY_SERVICE_KEY_INVALID');
    this.#body = options.body;
    this.#serviceKey = serviceKey;
    this.#host = options.host || process.env.ASTERA_BODY_HOST || '127.0.0.1';
    this.#port = options.port === 0 ? 0 : positiveInteger(options.port ?? process.env.ASTERA_BODY_PORT, 7373);
    this.#bodyLimitBytes = positiveInteger(options.bodyLimitBytes ?? process.env.ASTERA_BODY_LIMIT_BYTES, ONE_MB);
    this.#logger = options.logger;
    this.#serviceVersion = options.serviceVersion || '4.2.0-integrated.1';
    this.#server = createServer((request, response) => void this.#handle(request, response));
    this.#server.headersTimeout = positiveInteger(process.env.ASTERA_BODY_HEADERS_TIMEOUT_MS, 10_000);
    this.#server.requestTimeout = positiveInteger(process.env.ASTERA_BODY_REQUEST_TIMEOUT_MS, 60_000);
    this.#server.keepAliveTimeout = positiveInteger(process.env.ASTERA_BODY_KEEPALIVE_TIMEOUT_MS, 5_000);
    this.#server.maxRequestsPerSocket = positiveInteger(process.env.ASTERA_BODY_MAX_REQUESTS_PER_SOCKET, 1000);
  }

  get address(): AddressInfo | string | null {
    return this.#server.address();
  }

  async start(): Promise<AddressInfo | string> {
    if (this.#server.listening) return this.#server.address() as AddressInfo | string;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      this.#server.once('error', onError);
      this.#server.listen(this.#port, this.#host, () => {
        this.#server.off('error', onError);
        resolve();
      });
    });
    const address = this.#server.address();
    if (!address) throw new Error('ASTERA_BODY_API_ADDRESS_UNAVAILABLE');
    await this.#log('info', 'body_api_started', 'Astera Body internal API started', { status: 'started' });
    return address;
  }

  async stop(): Promise<void> {
    if (this.#stopping) return;
    this.#stopping = true;
    if (this.#server.listening) {
      await new Promise<void>((resolve, reject) => this.#server.close((error) => error ? reject(error) : resolve()));
    }
    await this.#body.close();
    await this.#logger?.flush?.(5000);
  }

  #headers(requestId: string): Record<string, string> {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'X-Request-ID': requestId
    };
  }

  #json(response: ServerResponse, status: number, payload: unknown, requestId: string): void {
    response.writeHead(status, this.#headers(requestId));
    response.end(JSON.stringify(sanitize(payload), null, 2));
  }

  #authorized(request: IncomingMessage): boolean {
    return timingSafeStringEqual(request.headers['x-astera-service-key'], this.#serviceKey);
  }

  async #readObject(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > this.#bodyLimitBytes) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
      chunks.push(buffer);
    }
    const body = parseJsonStrict(Buffer.concat(chunks, total));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('JSON_BODY_OBJECT_REQUIRED'), { status: 400 });
    return body as Record<string, unknown>;
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const started = Date.now();
    const path = String(request.url || '').split('?')[0] || '/';
    const requestId = String(request.headers['x-request-id'] || randomUUID());
    let status = 500;
    try {
      if (request.method === 'GET' && path === '/healthz') {
        status = 200;
        return this.#json(response, status, {
          ok: true,
          service: 'astera-body',
          version: this.#serviceVersion,
          architecture: 'core-modular',
          main_module: 'astera.main-decision.v4',
          public_api: false,
          time: new Date().toISOString()
        }, requestId);
      }
      if (request.method === 'POST' && path === '/internal/v1/process') {
        if (!this.#authorized(request)) {
          status = 401;
          return this.#json(response, status, { error: 'service_unauthorized' }, requestId);
        }
        const body = await this.#readObject(request);
        const controller = new AbortController();
        const abort = (): void => controller.abort(new Error('CLIENT_DISCONNECTED'));
        request.once('aborted', abort);
        response.once('close', () => { if (!response.writableFinished) abort(); });
        const result = await this.#body.process({
          requestId,
          input: body,
          metadata: Object.freeze({ source: 'astera-app-api', apiVersion: 'internal-v1' }),
          signal: controller.signal
        });
        request.off('aborted', abort);
        status = statusForCoreResult(result);
        return this.#json(response, status, result, requestId);
      }
      status = 404;
      return this.#json(response, status, { error: 'not_found' }, requestId);
    } catch (error) {
      status = statusForError(error);
      this.#json(response, status, { error: status >= 500 ? 'internal_error' : error instanceof Error ? error.message : String(error) }, requestId);
    } finally {
      await this.#log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'body_api_access', `${request.method} ${path} ${status}`, {
        request_id: requestId,
        method: request.method,
        path,
        status,
        duration_ms: Date.now() - started
      });
    }
  }

  async #log(severity: 'error' | 'warn' | 'info', type: string, text: string, payload: unknown): Promise<void> {
    await this.#logger?.write({
      at: new Date().toISOString(),
      source: 'astera-body',
      severity,
      caller_id: 'astera-app',
      type,
      text,
      payload
    });
  }
}

function statusForCoreResult(result: CoreExecutionResult): number {
  if (result.status === 'COMPLETED') return 200;
  if (result.status === 'PARTIAL') return 206;
  if (result.status === 'CANCELLED') return 499;
  return 422;
}

function statusForError(error: unknown): number {
  const status = Number((error as { status?: unknown } | null)?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}
