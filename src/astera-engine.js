'use strict';

const CanonicalAsteraEngine = require('./canonical-astera-engine');
const { resolveTaskEvidence } = require('./canonical-evidence-resolver');
const { detectLanguageMetadata } = require('./input-understanding');
const {
  needsJapaneseParser,
  acquireSharedJapaneseParserClient,
  releaseSharedJapaneseParserClient
} = require('./japanese-parser-mcp-client');
const {
  projectJapaneseParserResponse,
  buildJapaneseParserFailureRequest
} = require('./japanese-parser-mcp-adapter');
const {
  runWithJapaneseParserRequest,
  getJapaneseParserRequest
} = require('./japanese-parser-request-context');

// Public decision-material runtime.
// Japanese semantic reading has exactly one authority: Deterministic Japanese
// Parser MCP. Astera consumes its MeaningGraph/TaskGraph and does not run the
// former builtin-ja heuristics as a fallback.
class AsteraEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    this.evidenceSearchClient = options.evidenceSearchClient || null;
    this._sharedJapaneseParserClient = !options.japaneseParserClient;
    this.japaneseParserClient = options.japaneseParserClient || acquireSharedJapaneseParserClient(options.japaneseParserOptions || {});
    this._japaneseParserReleased = false;
  }

  setEvidenceSearchClient(client) {
    this.evidenceSearchClient = client || null;
    return this;
  }

  prepareRequest(input = {}) {
    const authoritative = getJapaneseParserRequest();
    if (authoritative) return authoritative;
    return super.prepareRequest(input);
  }

  async process(input = {}, tenant = { id: 'unknown' }, executionContext = {}) {
    const question = String(input.question || '').trim();
    const context = String(input.context || '').trim();
    const metadata = detectLanguageMetadata(`${question}\n${context}`, input);
    const primaryLanguage = String(metadata.language || '').split('-')[0];
    const japanese = primaryLanguage === 'ja' || needsJapaneseParser(`${question}\n${context}`);
    if (!japanese || !question) return super.process(input, tenant, executionContext);

    const projectionMetadata = {
      ...metadata,
      context_present: Boolean(context),
      context_length: context.length
    };
    let prepared;
    try {
      const parsed = await this.japaneseParserClient.analyze({
        originalText: question,
        conversationContext: context ? [context] : [],
        executionMode: 'analysis',
        analysisDepth: 'auto',
        deadlineMs: Number(process.env.ASTERA_JAPANESE_PARSER_TIMEOUT_MS || 50)
      });
      prepared = projectJapaneseParserResponse(parsed, projectionMetadata);
    } catch (error) {
      prepared = buildJapaneseParserFailureRequest(question, error, projectionMetadata);
      this.logger?.write?.({
        tenantId: tenant.id,
        type: 'japanese_parser_mcp_failure',
        severity: 'error',
        text: 'Authoritative Japanese Parser MCP failed; Astera stopped without builtin fallback.',
        payload: { code: error?.code || 'JAPANESE_PARSER_FAILED', message: error?.message || String(error) }
      });
    }

    return runWithJapaneseParserRequest(prepared, () => super.process(input, tenant, executionContext));
  }

  async resolveEvidenceForTask({ task, input, tenant, signal = null }) {
    return resolveTaskEvidence({
      client: this.evidenceSearchClient,
      task,
      input,
      tenant,
      signal
    });
  }

  async destroy() {
    try {
      await super.destroy();
    } finally {
      if (this._sharedJapaneseParserClient && !this._japaneseParserReleased) {
        this._japaneseParserReleased = true;
        releaseSharedJapaneseParserClient(this.japaneseParserClient);
      } else if (!this._sharedJapaneseParserClient && this.japaneseParserClient && typeof this.japaneseParserClient.destroy === 'function') {
        await this.japaneseParserClient.destroy();
      }
    }
  }
}

module.exports = AsteraEngine;
