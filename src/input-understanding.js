'use strict';

const analyzer = require('./judgment-materials-analyzer');

const SCRIPT_TESTS = Object.freeze([
  ['Hira', /\p{Script=Hiragana}/u],
  ['Kana', /\p{Script=Katakana}/u],
  ['Hani', /\p{Script=Han}/u],
  ['Hang', /\p{Script=Hangul}/u],
  ['Arab', /\p{Script=Arabic}/u],
  ['Hebr', /\p{Script=Hebrew}/u],
  ['Deva', /\p{Script=Devanagari}/u],
  ['Beng', /\p{Script=Bengali}/u],
  ['Guru', /\p{Script=Gurmukhi}/u],
  ['Gujr', /\p{Script=Gujarati}/u],
  ['Taml', /\p{Script=Tamil}/u],
  ['Telu', /\p{Script=Telugu}/u],
  ['Knda', /\p{Script=Kannada}/u],
  ['Mlym', /\p{Script=Malayalam}/u],
  ['Thai', /\p{Script=Thai}/u],
  ['Laoo', /\p{Script=Lao}/u],
  ['Mymr', /\p{Script=Myanmar}/u],
  ['Khmr', /\p{Script=Khmer}/u],
  ['Cyrl', /\p{Script=Cyrillic}/u],
  ['Grek', /\p{Script=Greek}/u],
  ['Armn', /\p{Script=Armenian}/u],
  ['Geor', /\p{Script=Georgian}/u],
  ['Ethi', /\p{Script=Ethiopic}/u],
  ['Latn', /\p{Script=Latin}/u]
]);

function normalizeLanguageTag(value) {
  const raw = String(value || '').trim().replace(/_/g, '-');
  if (!raw || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(raw)) return null;
  return raw.split('-').map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (/^[A-Za-z]{4}$/.test(part)) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    if (/^(?:[A-Za-z]{2}|\d{3})$/.test(part)) return part.toUpperCase();
    return part.toLowerCase();
  }).join('-');
}

function detectScripts(text) {
  const source = String(text || '');
  return SCRIPT_TESTS.filter(([, re]) => re.test(source)).map(([id]) => id);
}

function likelyEnglish(text) {
  const source = String(text || '').toLowerCase();
  const hits = source.match(/\b(?:the|this|that|please|verify|validate|compare|build|implement|improve|should|must|what|how|why|current|source|evidence|test|api)\b/g) || [];
  const letters = [...source].filter((ch) => /\p{L}/u.test(ch));
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch));
  return hits.length >= 2 && letters.length > 0 && latin.length / letters.length >= 0.9;
}

function detectLanguageMetadata(text, { language, locale, output_language: outputLanguage } = {}) {
  const explicitLanguage = normalizeLanguageTag(language);
  const explicitLocale = normalizeLanguageTag(locale);
  const requestedOutput = normalizeLanguageTag(outputLanguage) || explicitLanguage || explicitLocale || null;
  const scripts = detectScripts(text);
  let resolvedLanguage = explicitLanguage;
  let basis = explicitLanguage ? 'EXPLICIT_LANGUAGE' : 'UNRESOLVED';

  if (!resolvedLanguage && (scripts.includes('Hira') || scripts.includes('Kana'))) {
    resolvedLanguage = 'ja';
    basis = 'SCRIPT_HIRAGANA_KATAKANA';
  } else if (!resolvedLanguage && scripts.includes('Hang')) {
    resolvedLanguage = 'ko';
    basis = 'SCRIPT_HANGUL';
  } else if (!resolvedLanguage && likelyEnglish(text)) {
    resolvedLanguage = 'en';
    basis = 'HIGH_CONFIDENCE_ENGLISH_LEXICAL';
  }

  return Object.freeze({
    language: resolvedLanguage || 'und',
    locale: explicitLocale,
    script: scripts[0] || 'Zyyy',
    scripts: Object.freeze(scripts),
    requested_output_language: requestedOutput || resolvedLanguage || 'und',
    detection_basis: basis
  });
}

function trimSpan(text, start, end) {
  const raw = text.slice(start, end);
  const left = raw.length - raw.trimStart().length;
  const right = raw.length - raw.trimEnd().length;
  const from = start + left;
  const to = end - right;
  return to > from ? { start: from, end: to, text: text.slice(from, to) } : null;
}

function splitGeneric(input) {
  const text = String(input || '');
  const spans = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/[.!?。！？؟।॥;；\n]/u.test(text[i])) {
      const span = trimSpan(text, start, i + 1);
      if (span) spans.push(span);
      start = i + 1;
    }
  }
  if (start < text.length) {
    const span = trimSpan(text, start, text.length);
    if (span) spans.push(span);
  }
  return spans;
}

function genericTerms(text) {
  const terms = String(text || '').normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{N}_.:/+-]{1,63}/gu) || [];
  return [...new Set(terms.map((item) => item.toLowerCase()))].slice(0, 64);
}

function buildGenericRequest({ question = '', context = '', language, locale, output_language: outputLanguage } = {}, metadata) {
  const original = String(question || '');
  const normalized = original.normalize('NFKC').replace(/\r\n?/g, '\n').trim();
  const contextText = String(context || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
  const spans = splitGeneric(original);
  const effectiveSpans = spans.length ? spans : (normalized ? [{ start: 0, end: original.length, text: original }] : []);
  const tasks = effectiveSpans.map((span, index) => {
    const id = `T${String(index + 1).padStart(2, '0')}`;
    const target = span.text.trim().slice(0, 160) || 'input';
    const dependsOn = index > 0 ? [`T${String(index).padStart(2, '0')}`] : [];
    return {
      id,
      source_span: { ...span },
      raw_text: span.text,
      clause_type: /[?？؟]$/u.test(span.text.trim()) ? 'question' : 'statement',
      actionable: true,
      action: 'analyze',
      target,
      objective: 'Preserve and analyze this clause without inferring unavailable language-specific semantics.',
      deliverables: [], premises: [], constraints: [], prohibitions: [], preserve: [], replace: [], conditions: [], exceptions: [], deadlines: [],
      priority: 'normal', order: index + 1, depends_on: dependsOn, parallelizable: false,
      success_criteria: ['Preserve original text and source span.', 'Do not invent unresolved language-specific semantics.'],
      verification: [], completion_criteria: ['Preserve original text and source span.'],
      unresolved: ['language_semantics'], evidence_need: { required: false, reasons: [], queries: genericTerms(span.text).slice(0, 12) }, external_action: false, hard_blockers: []
    };
  });
  const dependencies = tasks.slice(1).map((task, index) => ({ from: tasks[index].id, to: task.id, type: 'SOURCE_ORDER_PRESERVATION', reason: 'language_semantics_unresolved' }));
  const waves = tasks.map((task) => [task.id]);
  const unresolved = tasks.map((task) => `${task.id}:language_semantics`);
  const packet = {
    schema_version: 'astera.analysis-task-packet.v1', intent: 'analyze', tasks, dependencies, execution_waves: waves,
    constraints: [], prohibitions: [], preserve: [], replace: [], verification: [],
    completion_criteria: ['Preserve original text and source spans.'], unresolved, conflicts: [], hard_blockers: [],
    source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span }))
  };
  return {
    schema_version: 'astera.request-model.v2',
    language: metadata.language, locale: metadata.locale, script: metadata.script, scripts: metadata.scripts,
    output_language: metadata.requested_output_language,
    normalized_question: normalized, original_question: original,
    target: tasks[0]?.target || '', target_confidence: 'low', action: 'analyze',
    objective: 'Structure the request while preserving unresolved language-specific semantics.',
    success_criteria: packet.completion_criteria, constraints: [], prohibitions: [], preserve: [], replace: [], verification: [],
    query_terms: genericTerms(`${normalized}\n${contextText}`), context_present: Boolean(contextText), context_length: contextText.length,
    instruction_map: { clause_count: tasks.length, task_count: tasks.length, correction_count: 0, prohibition_count: 0, preserve_count: 0, verification_count: 0 },
    instruction_understanding: {
      mode: 'GLOBAL_LANGUAGE_ADAPTER', adapter: 'generic-unicode-fallback', semantic_resolution: 'limited',
      parser: null, execution_allowed: true, blocked_reasons: [], warnings: ['LANGUAGE_SPECIFIC_SEMANTICS_UNRESOLVED'],
      language: metadata.language, locale: metadata.locale, script: metadata.script, scripts: metadata.scripts,
      detection_basis: metadata.detection_basis
    },
    analysis_task_packet: packet
  };
}

function analyzeRequest(input = {}) {
  const metadata = detectLanguageMetadata(`${input.question || ''}\n${input.context || ''}`, input);
  const primary = metadata.language.split('-')[0];
  if (primary === 'ja' || primary === 'en') {
    const request = analyzer.analyzeRequest({ question: input.question, context: input.context });
    return {
      ...request,
      language: metadata.language,
      locale: metadata.locale,
      script: metadata.script,
      scripts: metadata.scripts,
      output_language: metadata.requested_output_language,
      instruction_understanding: {
        ...(request.instruction_understanding || {}),
        mode: 'GLOBAL_LANGUAGE_ADAPTER',
        adapter: primary === 'ja' ? 'builtin-ja' : 'builtin-en',
        semantic_resolution: 'adapter-resolved',
        language: metadata.language,
        locale: metadata.locale,
        script: metadata.script,
        scripts: metadata.scripts,
        detection_basis: metadata.detection_basis
      }
    };
  }
  return buildGenericRequest(input, metadata);
}

module.exports = { analyzeRequest, detectLanguageMetadata, normalizeLanguageTag, splitGeneric };
