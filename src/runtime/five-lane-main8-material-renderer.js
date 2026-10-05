'use strict';

const ORDER = Object.freeze([
  '01_purpose','02_premise','03_facts','04_crisis',
  '05_opposition','06_comparison','07_evidence_status','08_reinstruction'
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(array(values).map(clean).filter(Boolean))];
}

function appendBlock(text, title, items) {
  const values = unique(items);
  if (!values.length) return String(text || '');
  const block = [`- ${title}:`, ...values.map((item) => `  - ${item}`)].join('\n');
  const base = String(text || '').trim();
  return base ? `${base}\n${block}` : block;
}

function baseSections(judgment = {}, baseRendered = {}) {
  const renderedParts = String(baseRendered.text || '').split('\n---\n');
  const order = array(judgment.order).length === 8 ? judgment.order : ORDER;
  return order.map((key, index) => {
    const source = array(baseRendered.sections)[index] || judgment[key] || {};
    const label = source.label || judgment[key]?.label || key;
    const segment = String(renderedParts[index] || '');
    const firstBreak = segment.indexOf('\n');
    const text = firstBreak >= 0 ? segment.slice(firstBreak + 1) : String(source.summary || '');
    return { ...source, key, label, text };
  });
}

function sectionByKey(sections = []) {
  return new Map(array(sections).map((section) => [section.key, { ...section }]));
}

function renderFiveLaneMain8(judgment = {}, baseRendered = null) {
  if (!baseRendered || !Array.isArray(baseRendered.sections)) {
    throw new Error('FIVE_LANE_MAIN8_BASE_REQUIRED');
  }
  const lang = String(judgment.output_language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
  const initial = baseSections(judgment, baseRendered);
  const sections = sectionByKey(initial);

  const factRequirements = unique(judgment['03_facts']?.fact_requirements || []);
  const riskRequirements = unique(judgment['04_crisis']?.risk_requirements || []);
  const domainPerspectives = unique(judgment['05_opposition']?.domain_perspectives || []);
  const dimensions = unique(judgment['06_comparison']?.five_lane_dimensions || []);
  const evidenceRequirements = unique(judgment['07_evidence_status']?.evidence_requirements || []);
  const inquiryRequirements = unique(judgment['08_reinstruction']?.inquiry_requirements || []);

  if (sections.has('03_facts') && factRequirements.length) {
    const section = sections.get('03_facts');
    section.text = appendBlock(
      section.text,
      lang === 'ja'
        ? '専門分野上、確認が必要な事実項目（確認済み事実ではない）'
        : 'Domain fact requirements still needing confirmation (not confirmed facts)',
      factRequirements
    );
    sections.set('03_facts', section);
  }

  if (sections.has('04_crisis') && riskRequirements.length) {
    const section = sections.get('04_crisis');
    section.text = appendBlock(
      section.text,
      lang === 'ja'
        ? '専門分野上、確認が必要な危険・失敗条件（発生確定ではない）'
        : 'Domain risk and failure checks (not confirmed occurrences)',
      riskRequirements
    );
    sections.set('04_crisis', section);
  }

  if (sections.has('05_opposition') && domainPerspectives.length) {
    const section = sections.get('05_opposition');
    section.text = appendBlock(
      section.text,
      lang === 'ja' ? '専門分野から追加で見る視点' : 'Additional domain perspectives to check',
      domainPerspectives
    );
    sections.set('05_opposition', section);
  }

  if (sections.has('06_comparison') && dimensions.length) {
    const section = sections.get('06_comparison');
    section.text = appendBlock(
      section.text,
      lang === 'ja' ? '判断・比較で揃える専門軸' : 'Domain dimensions to align for judgment or comparison',
      dimensions
    );
    sections.set('06_comparison', section);
  }

  if (sections.has('07_evidence_status') && evidenceRequirements.length) {
    const section = sections.get('07_evidence_status');
    section.text = appendBlock(
      section.text,
      lang === 'ja'
        ? '成立確認に必要な根拠項目（存在・取得・採用済みとは限らない）'
        : 'Evidence requirements for confirmation (not necessarily found or accepted)',
      evidenceRequirements
    );
    sections.set('07_evidence_status', section);
  }

  if (sections.has('08_reinstruction') && inquiryRequirements.length) {
    const section = sections.get('08_reinstruction');
    section.text = appendBlock(
      section.text,
      lang === 'ja' ? '次に確認する専門項目' : 'Domain questions to verify next',
      inquiryRequirements
    );
    sections.set('08_reinstruction', section);
  }

  const ordered = initial.map((section) => sections.get(section.key) || section);
  return {
    ...baseRendered,
    consumer_scope: baseRendered.consumer_scope || 'HUMAN_AND_AI_SAME_MATERIAL',
    ...(judgment.analysis_intent ? { analysis_intent: judgment.analysis_intent } : {}),
    sections: ordered,
    text: ordered.map((section) => `${section.label}\n${section.text}`).join('\n---\n'),
    compact_text: ordered.map((section) => `${section.label}: ${String(section.text || '').replace(/\n\s*/g, ' / ')}`).join('\n')
  };
}

module.exports = {
  renderFiveLaneMain8
};