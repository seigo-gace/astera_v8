'use strict';

const { spawn } = require('node:child_process');

const MCP_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-11-25', '2025-06-18', '2025-03-26']);
const SERVER_NAME = 'deterministic-japanese-parser';
const DEFAULT_DJPMCP = '/home/admin1/projects/Deterministic-Japanese-Parser-MCP/.venv/bin/djpmcp';
const DEFAULT_HTTP_URL = 'http://127.0.0.1:8765/v1/analyze';
const DISABLED_MODES = new Set(['python-api', 'stdio-docker', 'streamable-http']);
const SUPPORTED_MODES = new Set(['stdio', 'http']);

function parserError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isJapaneseText(text) {
  return /[ぁ-んァ-ヶ一-龠々]/.test(String(text || ''));
}

function needsJapaneseParser(question) {
  return isJapaneseText(question);
}

function isExternalActionHint(question, request = {}) {
  if ((request.analysis_task_packet?.tasks || []).some((task) => ['implement', 'improve', 'integrate', 'migrate', 'remove'].includes(task.action))) return true;
  return /実装|変更|修正|改善|削除|移行|統合|接続|反映|Push|公開|deploy|release|replace|modify|remove/i.test(String(question || ''));
}

function validateParserResult(value, expectedOriginalText) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP returned a non-object result.');
  if (typeof value.original_text !== 'string') throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP result is missing original_text.');
  if (value.original_text !== expectedOriginalText) throw parserError('PARSER_ORIGINAL_MISMATCH', 'Japanese Parser MCP did not preserve the original input exactly.');
  if (!['COMPLETE', 'PARTIAL', 'FAILED'].includes(String(value.overall_status || ''))) throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP result has an invalid overall_status.');
  if (typeof value.execution_allowed !== 'boolean') throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP result is missing execution_allowed.');
  if (!value.meaning_graph || typeof value.meaning_graph !== 'object' || Array.isArray(value.meaning_graph)) throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP result is missing meaning_graph.');
  if (!value.task_graph || typeof value.task_graph !== 'object' || !Array.isArray(value.task_graph.tasks)) throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP result is missing task_graph.tasks.');
  if (!value.versions || typeof value.versions !== 'object' || Array.isArray(value.versions)) throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP result is missing versions.');
  return value;
}

function parseToolResult(result, expectedOriginalText) {
  if (!result || typeof result !== 'object') throw parserError('PARSER_MCP_INVALID_RESULT', 'Japanese Parser MCP tools/call returned no result.');
  if (result.isError === true) {
    const text = (result.content || []).map((item) => item?.text).filter(Boolean).join(' | ');
    throw parserError('PARSER_TOOL_ERROR', text || 'Japanese Parser MCP reported a tool error.');
  }
  let structured = result.structuredContent ?? result.structured_content ?? null;
  if (!structured) {
    const text = (result.content || []).map((item) => item?.text).find((item) => typeof item === 'string');
    if (text) {
      try { structured = JSON.parse(text); } catch { throw parserError('PARSER_SCHEMA_INVALID', 'Japanese Parser MCP text result is not valid JSON.'); }
    }
  }
  return validateParserResult(structured, expectedOriginalText);
}

function resolveParserMode(options = {}) {
  return String(options.mode || process.env.ASTERA_JAPANESE_PARSER_MODE || 'stdio').trim().toLowerCase();
}

function assertSupportedMode(mode) {
  if (DISABLED_MODES.has(mode)) {
    throw parserError('PARSER_MODE_UNSUPPORTED', `Japanese Parser MCP mode "${mode}" is disabled.`);
  }
  if (!SUPPORTED_MODES.has(mode)) {
    throw parserError('PARSER_MODE_UNSUPPORTED', `Japanese Parser MCP mode "${mode}" is unsupported; use http or stdio.`);
  }
}

function defaultDeadlineMs(options = {}) {
  return Number(options.deadlineMs || process.env.ASTERA_JAPANESE_PARSER_DEADLINE_MS || 5000);
}

function resolveHttpUrl(options = {}) {
  return String(options.url || process.env.ASTERA_JAPANESE_PARSER_URL || DEFAULT_HTTP_URL).trim();
}

function resolveHttpApiKey(options = {}) {
  return String(options.apiKey || process.env.ASTERA_JAPANESE_PARSER_API_KEY || '').trim();
}

function isJapaneseParserConfigured(options = {}) {
  const mode = resolveParserMode(options);
  if (!SUPPORTED_MODES.has(mode)) return false;
  if (mode === 'http') {
    return Boolean(resolveHttpUrl(options) && resolveHttpApiKey(options));
  }
  const command = String(options.command || process.env.ASTERA_JAPANESE_PARSER_COMMAND || '').trim();
  return Boolean(command);
}

function buildTransportTrace({ transport, protocolVersion, serverVersion, structured, startedNs }) {
  const elapsedMs = Number(process.hrtime.bigint() - startedNs) / 1e6;
  return {
    parser: SERVER_NAME,
    transport,
    protocol_version: protocolVersion || null,
    server_version: serverVersion || structured?.versions?.parser || null,
    semantic_hash: structured?.meaning_graph?.semantic_hash || null,
    overall_status: structured?.overall_status || null,
    execution_allowed: structured?.execution_allowed == null ? null : structured.execution_allowed === true,
    latency_ms: Number(elapsedMs.toFixed(3)),
    tool: 'analyze_japanese'
  };
}

async function runHttpAnalyzeOnce({ url, apiKey, requestArguments, timeoutMs, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw parserError('PARSER_HTTP_FETCH_UNAVAILABLE', 'Japanese Parser HTTP transport requires fetch support.');
  }
  if (!url) throw parserError('PARSER_HTTP_URL_MISSING', 'ASTERA_JAPANESE_PARSER_URL is required for HTTP mode.');
  if (!apiKey) throw parserError('PARSER_HTTP_API_KEY_MISSING', 'ASTERA_JAPANESE_PARSER_API_KEY is required for HTTP mode.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(requestArguments),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      throw parserError('PARSER_HTTP_TIMEOUT', `Japanese Parser HTTP exceeded ${timeoutMs}ms.`);
    }
    throw parserError('PARSER_HTTP_TRANSPORT_ERROR', `Japanese Parser HTTP request failed: ${error?.message || 'unknown error'}`);
  } finally {
    clearTimeout(timer);
  }

  const status = Number(response?.status || 0);
  let raw = '';
  try {
    raw = await response.text();
  } catch (error) {
    throw parserError('PARSER_HTTP_BODY_READ_FAILED', `Japanese Parser HTTP response body could not be read: ${error?.message || 'unknown error'}`, { http_status: status });
  }

  if (status === 401 || status === 403) {
    throw parserError('PARSER_HTTP_UNAUTHORIZED', `Japanese Parser HTTP authentication failed with status ${status}.`, { http_status: status });
  }
  if (status < 200 || status >= 300) {
    throw parserError('PARSER_HTTP_STATUS', `Japanese Parser HTTP returned status ${status || '<unknown>'}.`, { http_status: status });
  }

  let structured;
  try {
    structured = JSON.parse(raw);
  } catch {
    throw parserError('PARSER_HTTP_INVALID_JSON', 'Japanese Parser HTTP returned invalid JSON.', { http_status: status });
  }
  return structured;
}

async function runStdioAnalyzeOnce({ command, args, cwd, env, requestArguments, timeoutMs, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    let child;
    const childEnv = { ...env };
    const hostLdLibraryPath = String(env.ASTERA_JAPANESE_PARSER_LD_LIBRARY_PATH || process.env.ASTERA_JAPANESE_PARSER_LD_LIBRARY_PATH || '').trim();
    if (hostLdLibraryPath) {
      childEnv.LD_LIBRARY_PATH = hostLdLibraryPath;
    }
    try {
      child = spawnImpl(command, args, { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(parserError('PARSER_PROCESS_START_FAILED', `Failed to start Japanese Parser MCP stdio: ${error.message}`));
      return;
    }
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let nextId = 1;
    const pending = new Map();
    let negotiatedProtocolVersion = null;
    let serverVersion = null;
    let finished = false;

    const cleanup = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
      try { child.stdin?.end(); } catch {}
      if (child.exitCode == null && !child.killed) {
        try { child.kill('SIGTERM'); } catch {}
      }
    };

    const timer = setTimeout(() => {
      cleanup(parserError('PARSER_MCP_TIMEOUT', `Japanese Parser MCP stdio exceeded ${timeoutMs}ms.`));
    }, timeoutMs);

    const writeLine = (message) => new Promise((writeResolve, writeReject) => {
      child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8', (error) => {
        if (error) writeReject(error);
        else writeResolve();
      });
    });

    const rpc = async (method, params) => {
      const id = nextId++;
      await writeLine({ jsonrpc: '2.0', id, method, params });
      return new Promise((rpcResolve, rpcReject) => {
        const itemTimer = setTimeout(() => {
          pending.delete(id);
          rpcReject(parserError('PARSER_MCP_TIMEOUT', `Japanese Parser MCP ${method} timed out.`));
        }, timeoutMs);
        pending.set(id, {
          resolve: rpcResolve,
          reject: rpcReject,
          timer: itemTimer,
          method
        });
      });
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderrBuffer = (stderrBuffer + String(chunk)).slice(-4096); });
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += String(chunk);
      while (true) {
        const index = stdoutBuffer.indexOf('\n');
        if (index < 0) break;
        const line = stdoutBuffer.slice(0, index).trim();
        stdoutBuffer = stdoutBuffer.slice(index + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch {
          cleanup(parserError('PARSER_MCP_MALFORMED_JSON', 'Japanese Parser MCP emitted malformed JSON-RPC on stdout.'));
          return;
        }
        if (Object.hasOwn(message, 'id') && pending.has(message.id)) {
          const pendingItem = pending.get(message.id);
          pending.delete(message.id);
          clearTimeout(pendingItem.timer);
          if (message.error) {
            cleanup(parserError('PARSER_MCP_RPC_ERROR', message.error.message || 'Japanese Parser MCP JSON-RPC error.', { rpc_error: message.error }));
          } else {
            pendingItem.resolve(message.result);
          }
        }
      }
    });
    child.once('error', (error) => cleanup(parserError('PARSER_PROCESS_ERROR', `Japanese Parser MCP process error: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (finished) return;
      cleanup(parserError('PARSER_PROCESS_EXITED', `Japanese Parser MCP exited code=${code} signal=${signal || 'none'} stderr=${stderrBuffer.trim()}`.trim()));
    });

    (async () => {
      try {
        const init = await rpc('initialize', {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'astera-v8', version: '8' }
        });
        negotiatedProtocolVersion = String(init?.protocolVersion || '');
        if (!SUPPORTED_PROTOCOL_VERSIONS.has(negotiatedProtocolVersion)) {
          throw parserError('PARSER_PROTOCOL_UNSUPPORTED', `Japanese Parser MCP negotiated unsupported protocol ${negotiatedProtocolVersion || '<empty>'}.`);
        }
        serverVersion = String(init?.serverInfo?.version || '');
        await writeLine({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
        const result = await rpc('tools/call', {
          name: 'analyze_japanese',
          arguments: requestArguments
        });
        finished = true;
        clearTimeout(timer);
        try { child.stdin?.end(); } catch {}
        if (child.exitCode == null && !child.killed) {
          try { child.kill('SIGTERM'); } catch {}
        }
        resolve({
          result,
          negotiatedProtocolVersion,
          serverVersion
        });
      } catch (error) {
        cleanup(error?.code ? error : parserError('PARSER_MCP_TRANSPORT_ERROR', error?.message || 'Japanese Parser MCP stdio failed.'));
      }
    })();
  });
}

class JapaneseParserMCPClient {
  constructor(options = {}) {
    this.mode = resolveParserMode(options);
    assertSupportedMode(this.mode);
    this.command = String(options.command || process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP);
    this.args = options.args || [];
    this.cwd = options.cwd || process.env.ASTERA_JAPANESE_PARSER_CWD || undefined;
    this.env = { ...process.env, ...(options.env || {}) };
    this.url = resolveHttpUrl(options);
    this.apiKey = resolveHttpApiKey(options);
    this.deadlineMs = defaultDeadlineMs(options);
    this.timeoutMs = Number(options.timeoutMs || process.env.ASTERA_JAPANESE_PARSER_TIMEOUT_MS || this.deadlineMs + 5000);
    this.spawnImpl = options.spawnImpl || spawn;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  async initialize() {}

  async analyze({
    originalText,
    conversationContext = [],
    executionMode = 'analysis',
    analysisDepth = 'auto',
    deadlineMs = this.deadlineMs,
    knownEntities = [],
    protectedElements = []
  } = {}) {
    const original = String(originalText || '');
    if (!original.trim()) throw parserError('PARSER_INPUT_EMPTY', 'Japanese Parser requires non-empty originalText.');
    const started = process.hrtime.bigint();
    const requestArguments = {
      original_text: original,
      conversation_context: Array.isArray(conversationContext) ? conversationContext.map(String) : [],
      known_entities: Array.isArray(knownEntities) ? knownEntities.map(String) : [],
      protected_elements: Array.isArray(protectedElements) ? protectedElements.map(String) : [],
      execution_mode: executionMode,
      analysis_depth: analysisDepth,
      deadline_ms: Number.isFinite(Number(deadlineMs)) ? Math.max(1, Math.min(60000, Number(deadlineMs))) : this.deadlineMs
    };
    const callTimeout = Math.max(this.timeoutMs, requestArguments.deadline_ms + 5000);

    if (this.mode === 'http') {
      const structured = validateParserResult(await runHttpAnalyzeOnce({
        url: this.url,
        apiKey: this.apiKey,
        requestArguments,
        timeoutMs: callTimeout,
        fetchImpl: this.fetchImpl
      }), original);
      return {
        ...structured,
        astera_mcp_transport: buildTransportTrace({
          transport: 'http',
          protocolVersion: null,
          serverVersion: structured?.versions?.parser || null,
          structured,
          startedNs: started
        })
      };
    }

    const { result, negotiatedProtocolVersion, serverVersion } = await runStdioAnalyzeOnce({
      command: this.command,
      args: [...this.args],
      cwd: this.cwd,
      env: this.env,
      requestArguments,
      timeoutMs: callTimeout,
      spawnImpl: this.spawnImpl
    });
    const structured = parseToolResult(result, original);
    return {
      ...structured,
      astera_mcp_transport: buildTransportTrace({
        transport: 'stdio',
        protocolVersion: negotiatedProtocolVersion,
        serverVersion,
        structured,
        startedNs: started
      })
    };
  }

  async destroy() {}
}

module.exports = {
  JapaneseParserMCPClient,
  MCP_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  isJapaneseText,
  needsJapaneseParser,
  isExternalActionHint,
  validateParserResult,
  isJapaneseParserConfigured,
  resolveParserMode,
  defaultDeadlineMs,
  resolveHttpUrl,
  resolveHttpApiKey,
  runHttpAnalyzeOnce,
  DEFAULT_DJPMCP,
  DEFAULT_HTTP_URL
};