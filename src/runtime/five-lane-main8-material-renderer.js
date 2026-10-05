'use strict';

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

function sectionByKey(rendered) {
  return new Map(array(rendered?.sections).map((section) => [section?.key, { ...section }]));
}

function renderFiveLaneMain8(judgment = {}, baseRendered = null) {
  if (!baseRendered || !Array.isArray(baseRendered.sections)) {
    throw new Error('FIVE_LANE_MAIN8_BASE_REQUIRED');
  }
  const rendered = { ...baseRendered, sections: array(baseRendered.sections).map((section) => ({ ...section })) };
  const lang = String(judgment.output_language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
  const sections = sectionByKey(rendered);

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
        ? '5段Factで確認対象になった専門事実項目（確認済み事実ではない）'
        : 'Specialist fact requirements emitted by the five-stage Fact lane (not confirmed facts)',
      factRequirements
    );
    sections.set('03_facts', section);
  }

  if (sections.has('04_crisis') && riskRequirements.length) {
    const section = sections.get('04_crisis');
    section.text = appendBlock(
      section.text,
      lang === 'ja'
        ? '5段Riskで確認対象になった危険・失敗条件（発生確定ではない）'
        : 'Risk/failure checks emitted by the five-stage Risk lane (not confirmed occurrences)',
      riskRequirements
    );
    sections.set('04_crisis', section);
  }

  if (sections.has('05_opposition') && domainPerspectives.length) {
    const section = sections.get('05_opposition');
    section.text = appendBlock(
      section.text,
      lang === 'ja' ? '5段Multiで追加された反対・別視点' : 'Additional perspectives emitted by the five-stage Multi lane',
      domainPerspectives
    );
    sections.set('05_opposition', section);
  }

  if (sections.has('06_comparison') && dimensions.length) {
    const section = sections.get('06_comparison');
    section.text = appendBlock(
      section.text,
      lang === 'ja' ? '5段Compareで揃える比較軸' : 'Comparison dimensions emitted by the five-stage Compare lane',
      dimensions
    );
    sections.set('06_comparison', section);
  }

  if (sections.has('07_evidence_status') && evidenceRequirements.length) {
    const section = sections.get('07_evidence_status');
    section.text = appendBlock(
      section.text,
      lang === 'ja'
        ? '5段Inquiryで成立確認が必要とされた根拠項目（存在・取得・採用済みとは限らない）'
        : 'Evidence requirements emitted by the five-stage Inquiry lane (not necessarily found or accepted)',
      evidenceRequirements
    );
    sections.set('07_evidence_status', section);
  }

  if (sections.has('08_reinstruction') && inquiryRequirements.length) {
    const section = sections.get('08_reinstruction');
    section.text = appendBlock(
      section.text,
      lang === 'ja' ? '5段Inquiryが次に確認すべきとした項目' : 'Next checks emitted by the five-stage Inquiry lane',
      inquiryRequirements
    );
    sections.set('08_reinstruction', section);
  }

  const ordered = array(rendered.sections).map((section) => sections.get(section.key) || section);
  return {
    ...rendered,
    sections: ordered,
    text: ordered.map((section) => `${section.label}\n${section.text}`).join('\n---\n'),
    compact_text: ordered.map((section) => `${section.label}: ${String(section.text || '').replace(/\n\s*/g, ' / ')}`).join('\n')
  };
}

module.exports = {
  renderFiveLaneMain8
};