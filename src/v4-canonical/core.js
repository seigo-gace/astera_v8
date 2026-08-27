'use strict';

const crypto=require('node:crypto');

const AssertionType=Object.freeze({QUESTION:'QUESTION',COMMAND:'COMMAND',WISH:'WISH',EVALUATION:'EVALUATION',ASSERTION:'ASSERTION',UNKNOWN:'UNKNOWN'});
const ClaimOrigin=Object.freeze({DIRECT_ASSERTION:'DIRECT_ASSERTION',ATTRIBUTED_ASSERTION:'ATTRIBUTED_ASSERTION',CODE_STRUCTURE:'CODE_STRUCTURE',LOG_OBSERVATION:'LOG_OBSERVATION',TABLE_OBSERVATION:'TABLE_OBSERVATION'});
const Modality=Object.freeze({OBSERVED:'OBSERVED',PAST_FACT:'PAST_FACT',REPORTED_PLAN:'REPORTED_PLAN',PREDICTION:'PREDICTION',HYPOTHETICAL_SCENARIO:'HYPOTHETICAL_SCENARIO',CONDITIONAL_RULE:'CONDITIONAL_RULE'});
const Polarity=Object.freeze({AFFIRMATIVE:'AFFIRMATIVE',NEGATIVE:'NEGATIVE',CONDITIONAL:'CONDITIONAL',UNKNOWN:'UNKNOWN'});
const VerificationLine=Object.freeze({NATURAL_LANGUAGE_LINE:'NATURAL_LANGUAGE_LINE',CODE_STRUCTURE_LINE:'CODE_STRUCTURE_LINE',LOG_OBSERVATION_LINE:'LOG_OBSERVATION_LINE',TABLE_OBSERVATION_LINE:'TABLE_OBSERVATION_LINE',ATTRIBUTED_ASSERTION_LINE:'ATTRIBUTED_ASSERTION_LINE'});

const ASSERTION_TYPE_SEED=Object.freeze({
  question:Object.freeze(['か?','か？','ですか','だろうか','?','？']),
  command:Object.freeze(['してください','せよ','しろ','してくれ','して']),
  wish:Object.freeze(['したい','してほしい','望む']),
  evaluation:Object.freeze(['と思う','と考える','べき','かもしれない','だろう','はず','気がする']),
  assertion:Object.freeze(['である','です','だ','した','している','できる','ある','いる'])
});
const MODALITY_SEED=Object.freeze({
  conditional:Object.freeze(['なら','れば','たら','場合','仮に']),
  future:Object.freeze(['予定','見込み','になる','今後','明日','来週','来月','来年']),
  prediction:Object.freeze(['だろう','かもしれない']),
  past:Object.freeze(['した','だった','済み'])
});
const POLARITY_SEED=Object.freeze({
  conditional:Object.freeze(['以外','を除き','とは限らない']),
  negative:Object.freeze(['ない','ません','ず','なし','できない','わけがない','はずがない','未対応','非対応','不可能']),
  doubleNegative:Object.freeze(['なくはない','ないことはない'])
});
const COMPLEX_NEGATION_PATTERNS=Object.freeze(['ないとは発表していない','ないとは述べていない','ないとは言っていない','否定していないとは限らない']);
const BOUNDARY_CONNECTORS=Object.freeze(['しかし','ただし','また','一方','なぜなら','つまり']);

function normalizeText(value){return String(value??'').normalize('NFKC').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').trim();}
function stable(value){if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object'){return`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;}return JSON.stringify(value);}
function sha256(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
function hashParts(parts){return sha256(parts.map((part)=>typeof part==='string'?part:stable(part)).join('\u001f'));}
function createFragmentId({inputDocumentId,canonicalSourcePosition,normalizedFragment}){return hashParts([inputDocumentId,canonicalSourcePosition,normalizedFragment]);}
function createClaimId({fragmentId,canonicalClaimPayload}){return hashParts([fragmentId,canonicalClaimPayload]);}
function createQueryId({claimId,queryRole,normalizedQueryText,queryTemplateVersion}){return hashParts([claimId,queryRole,normalizedQueryText,queryTemplateVersion]);}
function createEvidenceBindingId({claimId,candidateId,sourceSpan,relation}){return hashParts([claimId,candidateId,sourceSpan,relation]);}
function createRawContentId(content){return sha256(String(content??''));}
function sanitizeQueryTerm(value){return normalizeText(value).replace(/[^\p{L}\p{N}\s._:/%+\-]/gu,' ').replace(/\s+/g,' ').trim();}

function containsAny(text,tokens){return tokens.some((token)=>text.includes(token));}
function isCommandAssertion(value){const specific=ASSERTION_TYPE_SEED.command.filter((token)=>token!=='して');if(containsAny(value,specific))return true;return /して[。.!！]?$/u.test(value);}
function classifyAssertionType(text){const value=normalizeText(text);if(containsAny(value,ASSERTION_TYPE_SEED.question))return AssertionType.QUESTION;if(POLARITY_SEED.doubleNegative.some((token)=>value.includes(token)))return AssertionType.ASSERTION;if(COMPLEX_NEGATION_PATTERNS.some((pattern)=>value.includes(pattern)))return AssertionType.ASSERTION;if(MODALITY_SEED.conditional.some((token)=>value.includes(token)))return AssertionType.ASSERTION;if(isCommandAssertion(value))return AssertionType.COMMAND;if(containsAny(value,ASSERTION_TYPE_SEED.wish))return AssertionType.WISH;if(containsAny(value,ASSERTION_TYPE_SEED.evaluation))return AssertionType.EVALUATION;if(containsAny(value,ASSERTION_TYPE_SEED.assertion))return AssertionType.ASSERTION;return AssertionType.UNKNOWN;}
function detectPolarityTags(text){const value=normalizeText(text),tags=[];for(const token of POLARITY_SEED.doubleNegative)if(value.includes(token))tags.push('DOUBLE_NEGATIVE_WEAK_AFFIRMATIVE');for(const token of POLARITY_SEED.conditional)if(value.includes(token))tags.push('CONDITIONAL_NEGATION');for(const pattern of COMPLEX_NEGATION_PATTERNS)if(value.includes(pattern))tags.push('COMPLEX_NEGATION');return[...new Set(tags)].sort();}
function detectPolarity(text){const value=normalizeText(text);if(COMPLEX_NEGATION_PATTERNS.some((pattern)=>value.includes(pattern)))return Polarity.UNKNOWN;if(POLARITY_SEED.doubleNegative.some((token)=>value.includes(token)))return Polarity.AFFIRMATIVE;if(POLARITY_SEED.conditional.some((token)=>value.includes(token)))return Polarity.CONDITIONAL;if(POLARITY_SEED.negative.some((token)=>value.includes(token))||/(?:未|非|不)[\p{L}\p{N}ァ-ヶー]{1,}/u.test(value))return Polarity.NEGATIVE;return value?Polarity.AFFIRMATIVE:Polarity.UNKNOWN;}
function detectModality(text){const value=normalizeText(text);if(MODALITY_SEED.conditional.some((token)=>value.includes(token)))return Modality.CONDITIONAL_RULE;if(MODALITY_SEED.prediction.some((token)=>value.includes(token)))return Modality.PREDICTION;if(MODALITY_SEED.future.some((token)=>value.includes(token))||/来[年月週]/u.test(value))return Modality.REPORTED_PLAN;if(MODALITY_SEED.past.some((token)=>value.includes(token)))return Modality.PAST_FACT;return Modality.OBSERVED;}
function parseVersionScheme(value){const raw=normalizeText(value);if(/^v?\d+(?:\.\d+){0,2}$/iu.test(raw))return{scheme:'SEMVER_LIKE',normalized:raw.replace(/^v/iu,'')};if(/^\d{4}-\d{2}(?:-\d{2})?$/u.test(raw))return{scheme:'DATE_VERSION',normalized:raw};if(/^Rev\.?\s*\d+$/iu.test(raw))return{scheme:'REVISION',normalized:raw.replace(/\s+/g,' ')};return{scheme:'UNKNOWN',normalized:raw||'UNKNOWN'};}
function resolveRelativeTime(text,{sourceRole='DIRECT_INPUT',executionDate=new Date(),documentReferenceDate=null}={}){const original=normalizeText(text);if(/最近|この頃|しばらく|近頃/u.test(original))return{text:original,time_scope:'UNKNOWN',resolved:false};const direct=sourceRole==='DIRECT_INPUT';const base=direct?executionDate:documentReferenceDate;if(!base||Number.isNaN(base.getTime()))return{text:original,time_scope:'UNKNOWN',resolved:false};const iso=(date)=>date.toISOString().slice(0,10);const shifts=[['今日',0],['本日',0],['明日',1],['昨日',-1]];for(const [token,days] of shifts){if(original.includes(token)){const date=new Date(base);date.setUTCDate(date.getUTCDate()+days);const day=iso(date);return{text:original.replaceAll(token,day),time_scope:day,resolved:true};}}const explicit=original.match(/\b\d{4}-\d{2}(?:-\d{2})?\b/u)?.[0];if(explicit)return{text:original,time_scope:explicit,resolved:true};return{text:original,time_scope:'UNKNOWN',resolved:false};}
function extractIdentifiers(text,knownNames=[]){const value=normalizeText(text),identifiers=[];const patterns=[/\b\d+(?:\.\d+)?\s*(?:円|GB|%|％|件|ms|req)\b/giu,/\b[A-Z][A-Z0-9_-]{1,}\b/gu,/[ァ-ヶー]{3,}/gu,/\bv?\d+(?:\.\d+){0,2}\b/giu,/\b\d{4}-\d{2}(?:-\d{2})?\b/gu,/\bRev\.?\s*\d+\b/giu];for(const pattern of patterns)for(const match of value.matchAll(pattern))identifiers.push(match[0]);for(const name of knownNames)if(value.includes(name))identifiers.push(name);return[...new Set(identifiers.map(normalizeText))].sort();}
function stripEnding(text){return normalizeText(text).replace(/[。.!?！？]$/u,'').replace(/(?:である|です|だ)$/u,'').trim();}
function parseConditional(text){const normalized=stripEnding(text),match=normalized.match(/^(.+?)が(.+?)(?:なら|の場合)(.+)$/u);if(!match)return null;return{subject:normalizeText(match[1]),predicate:'RESULT_WHEN',object_or_value:normalizeText(match[3]),predicate_parts:Object.freeze([`CONDITION:${normalizeText(match[1])}=${normalizeText(match[2])}`,`RESULT:${normalizeText(match[3])}`]),condition:Object.freeze({subject:normalizeText(match[1]),value:normalizeText(match[2])})};}
function parseNaturalStructure(text){const normalized=stripEnding(text);if(COMPLEX_NEGATION_PATTERNS.some((pattern)=>normalized.includes(pattern)))return{unresolved:true,diagnostic:'COMPLEX_NEGATION'};if(normalized==='動かないことはない')return{subject:'動作',predicate:'POSSIBLE',object_or_value:true};const conditional=parseConditional(normalized);if(conditional)return conditional;if(/リリースされる$/u.test(normalized))return{subject:'リリース',predicate:'OCCURS',object_or_value:true};const japanese=normalized.match(/^(.+?)(?:は|が)(.+)$/u);if(japanese)return{subject:normalizeText(japanese[1]),predicate:'HAS_STATE',object_or_value:normalizeText(japanese[2])};const english=normalized.match(/^([A-Za-z0-9_.:/ -]+)\s+(?:is|are|was|were)\s+(.+)$/iu);if(english)return{subject:normalizeText(english[1]),predicate:'HAS_STATE',object_or_value:normalizeText(english[2])};const numeric=normalized.match(/^(.+?)\s+([A-Za-z_][A-Za-z0-9_.-]*)\s+(\d+(?:\.\d+)?(?:円|GB|%|％|件|ms|req)?)$/u);if(numeric)return{subject:normalizeText(numeric[1]),predicate:normalizeText(numeric[2]),object_or_value:normalizeText(numeric[3])};return{unresolved:true,diagnostic:'SUBJECT_PREDICATE_OBJECT_UNRESOLVED'};}

function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const child of Object.values(value))deepFreeze(child);return Object.freeze(value);}

module.exports={AssertionType,ClaimOrigin,Modality,Polarity,VerificationLine,ASSERTION_TYPE_SEED,MODALITY_SEED,POLARITY_SEED,COMPLEX_NEGATION_PATTERNS,BOUNDARY_CONNECTORS,normalizeText,stable,sha256,hashParts,createFragmentId,createClaimId,createQueryId,createEvidenceBindingId,createRawContentId,sanitizeQueryTerm,classifyAssertionType,detectPolarityTags,detectPolarity,detectModality,parseVersionScheme,resolveRelativeTime,extractIdentifiers,parseNaturalStructure,deepFreeze};
