'use strict';

const { spawn } = require('node:child_process');

const MCP_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-11-25', '2025-06-18', '2025-03-26']);

function parserError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isJapaneseText(text) {
  return /[ぁ-んァ-ヶ一-龠々]/.test(String(text || ''));
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

class JapaneseParserMCPClient {
  constructor(options = {}) {
    this.command = options.command || process.env.ASTERA_JAPANESE_PARSER_COMMAND || process.env.PYTHON || 'python3';
    this.args = options.args || ['-m', 'deterministic_japanese_parser_mcp.server'];
    this.cwd = options.cwd || process.env.ASTERA_JAPANESE_PARSER_CWD || undefined;
    this.env = { ...process.env, ...(options.env || {}) };
    this.timeoutMs = Number(options.timeoutMs || process.env.ASTERA_JAPANESE_PARSER_TIMEOUT_MS || 50);
    this.initTimeoutMs = Number(options.initTimeoutMs || process.env.ASTERA_JAPANESE_PARSER_INIT_TIMEOUT_MS || 5000);
    this.maxStderrBytes = Number(options.maxStderrBytes || 16 * 1024);
    this.spawnImpl = options.spawnImpl || spawn;
    this.process = null;
    this.ready = false;
    this.initializing = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.negotiatedProtocolVersion = null;
    this.toolSchema = null;
  }

  async initialize() {
    if (this.ready) return;
    if (this.initializing) return this.initializing;
    this.initializing = this._initialize().finally(() => { this.initializing = null; });
    return this.initializing;
  }

  async _initialize() {
    this._startProcess();
    const init = await this._rpc('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'astera-v8', version: '8' }
    }, this.initTimeoutMs);
    const negotiated = String(init?.protocolVersion || '');
    if (!SUPPORTED_PROTOCOL_VERSIONS.has(negotiated)) {
      await this.destroy();
      throw parserError('PARSER_PROTOCOL_UNSUPPORTED', `Japanese Parser MCP negotiated unsupported protocol ${negotiated || '<empty>'}.`);
    }
    this.negotiatedProtocolVersion = negotiated;
    this._notify('notifications/initialized', {});
    const list = await this._rpc('tools/list', {}, this.initTimeoutMs);
    const tool = (list?.tools || []).find((item) => item?.name === 'analyze_japanese');
    if (!tool || !tool.outputSchema || typeof tool.outputSchema !== 'object') {
      await this.destroy();
      throw parserError('PARSER_TOOL_SCHEMA_MISSING', 'Japanese Parser MCP analyze_japanese tool or outputSchema is unavailable.');
    }
    this.toolSchema = tool.outputSchema;
    this.ready = true;
  }

  async analyze({ originalText, conversationContext = [], executionMode = 'external_action', runDeepAnalysis = true, deadlineMs = this.timeoutMs } = {}) {
    const original = String(originalText || '');
    if (!original.trim()) throw parserError('PARSER_INPUT_EMPTY', 'Japanese Parser MCP requires non-empty originalText.');
    await this.initialize();
    const started = process.hrtime.bigint();
    const result = await this._rpc('tools/call', {
      name: 'analyze_japanese',
      arguments: {
        original_text: original,
        conversation_context: Array.isArray(conversationContext) ? conversationContext.map(String) : [],
        execution_mode: executionMode,
        run_deep_analysis: runDeepAnalysis === true,
        absolute_deadline_ms: Number.isFinite(Number(deadlineMs)) ? Math.max(1, Math.min(60000, Number(deadlineMs))) : this.timeoutMs
      }
    }, Math.max(this.timeoutMs + 20, Number(deadlineMs) + 20));
    const structured = parseToolResult(result, original);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    return { ...structured, astera_mcp_transport: { protocol_version: this.negotiatedProtocolVersion, elapsed_ms: Number(elapsedMs.toFixed(3)), tool: 'analyze_japanese' } };
  }

  _startProcess() {
    if (this.process) return;
    let child;
    try {
      child = this.spawnImpl(this.command, this.args, { cwd: this.cwd, env: this.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      throw parserError('PARSER_PROCESS_START_FAILED', `Failed to start Japanese Parser MCP: ${error.message}`);
    }
    this.process = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this._onStdout(chunk));
    child.stderr.on('data', (chunk) => { this.stderrBuffer = (this.stderrBuffer + String(chunk)).slice(-this.maxStderrBytes); });
    child.once('error', (error) => this._failAll(parserError('PARSER_PROCESS_ERROR', `Japanese Parser MCP process error: ${error.message}`)));
    child.once('exit', (code, signal) => {
      const suffix = this.stderrBuffer.trim() ? ` stderr=${this.stderrBuffer.trim().slice(-1000)}` : '';
      this._failAll(parserError('PARSER_PROCESS_EXITED', `Japanese Parser MCP exited code=${code} signal=${signal || 'none'}.${suffix}`));
      this.process = null;
      this.ready = false;
    });
  }

  _onStdout(chunk) {
    this.stdoutBuffer += String(chunk);
    while (true) {
      const index = this.stdoutBuffer.indexOf('\n');
      if (index < 0) break;
      const line = this.stdoutBuffer.slice(0, index).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { this._failAll(parserError('PARSER_MCP_MALFORMED_JSON', 'Japanese Parser MCP emitted malformed JSON-RPC on stdout.')); continue; }
      if (Object.hasOwn(message, 'id') && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(parserError('PARSER_MCP_RPC_ERROR', message.error.message || 'Japanese Parser MCP JSON-RPC error.', { rpc_error: message.error }));
        else pending.resolve(message.result);
      }
    }
  }

  _rpc(method, params, timeoutMs) {
    if (!this.process?.stdin?.writable) return Promise.reject(parserError('PARSER_PROCESS_UNAVAILABLE', 'Japanese Parser MCP stdin is unavailable.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(parserError('PARSER_MCP_TIMEOUT', `Japanese Parser MCP ${method} exceeded ${timeoutMs}ms.`, { method, timeout_ms: timeoutMs }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process.stdin.write(message, 'utf8', (error) => {
        if (!error) return;
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(parserError('PARSER_MCP_WRITE_FAILED', `Failed writing Japanese Parser MCP request: ${error.message}`));
      });
    });
  }

  _notify(method, params) {
    if (!this.process?.stdin?.writable) throw parserError('PARSER_PROCESS_UNAVAILABLE', 'Japanese Parser MCP stdin is unavailable.');
    this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  _failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async destroy() {
    this.ready = false;
    const child = this.process;
    this.process = null;
    if (!child) return;
    this._failAll(parserError('PARSER_CLIENT_CLOSED', 'Japanese Parser MCP client closed.'));
    try { child.stdin?.end(); } catch {}
    if (child.exitCode == null && !child.killed) {
      try { child.kill('SIGTERM'); } catch {}
    }
  }
}

module.exports = {
  JapaneseParserMCPClient,
  MCP_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  isJapaneseText,
  validateParserResult
};
