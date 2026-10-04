'use strict';

// Additive routing aliases only. These do not replace the canonical 38-genre
// catalog or original v4 four-level classification. Keep aliases domain-specific
// enough to avoid converting generic task words into forced classifications.
const ENGLISH_GENRE_IDENTITY_ALIASES = Object.freeze({
  G01: Object.freeze(['encyclopedia', 'encyclopedic information', 'information resources']),
  G03: Object.freeze(['behavioral intervention', 'behavioural intervention', 'cognitive psychology']),
  G04: Object.freeze(['historical claim', 'history', 'archaeology', 'archaeological evidence', 'genealogy']),
  G05: Object.freeze(['geography', 'geographic analysis', 'geographical analysis', 'regional planning', 'geospatial']),
  G06: Object.freeze(['social welfare', 'human rights', 'welfare policy']),
  G07: Object.freeze(['public policy', 'government policy', 'public administration']),
  G08: Object.freeze(['contract law', 'contract clause', 'regulatory law']),
  G09: Object.freeze(['trade policy', 'economic policy', 'economic development']),
  G11: Object.freeze(['investment comparison', 'investment decision', 'investment analysis', 'banking', 'accounting', 'audit', 'taxation', 'insurance']),
  G12: Object.freeze(['workforce', 'employment planning', 'hiring plan', 'human resources', 'labor market', 'labour market']),
  G16: Object.freeze(['cultural project', 'cultural studies', 'arts', 'music', 'film studies']),
  G20: Object.freeze(['material science', 'materials science', 'material selection']),
  G22: Object.freeze(['ecosystem management', 'ecology', 'ecological assessment', 'biological study']),
  G23: Object.freeze(['health program', 'healthcare', 'medicine', 'clinical program']),
  G24: Object.freeze(['agricultural', 'farming', 'crop production', 'food safety']),
  G30: Object.freeze(['ai evaluation', 'artificial intelligence'])
});

function aliasesForGenre(genreId) {
  const id = String(genreId || '').trim().toUpperCase();
  if (!/^G(?:0[1-9]|[12]\d|3[0-8])$/.test(id)) return [];
  // A canonical genre ID is itself a controlled identity alias. This lets an
  // upstream caller or user explicitly select G01-G38 without requiring the
  // surrounding natural-language wording to independently re-prove the same
  // classification. The existing router still applies overlays and all lens
  // generation after the explicit identity match.
  return [id, ...(ENGLISH_GENRE_IDENTITY_ALIASES[id] || [])];
}

module.exports = {
  ENGLISH_GENRE_IDENTITY_ALIASES,
  aliasesForGenre
};