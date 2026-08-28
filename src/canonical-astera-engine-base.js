'use strict';

const CanonicalEngineSupport = require('./canonical-engine-support');
const { routeDomainTemplates } = require('./domain-template-router');
const { analyzeRequest } = require('./input-understanding');
const { normalizeEvidencePacket, deriveEvidenceNeed, unique } = require('./judgment-materials-analyzer');
const { buildCanonicalTaskPlan } = require('./canonical-claim-runtime');
const { projectCanonicalFailure } = require('./canonical-task-projection');
const { executeTaskWaves } = require('./runtime/canonical-wave-executor');

const FIVE_STAGE=Object.freeze(['fact','risk','multi','inquiry','compare']);
const ORDER=Object.freeze(['01_purpose','02_premise','03_facts','04_crisis','05_opposition','06_comparison','07_evidence_status','08_reinstruction']);
const LABELS=Object.freeze({
  ja:['01 本当の目的','02 前提不足','03 事実確認','04 危機察知','05 反対視点','06 比較案','07 根拠成立状態','08 主役AI／利用者への再指示'],
  en:['01 True Objective','02 Missing Context','03 Fact Check','04 Risk Detection','05 Opposing View','06 Comparison Material','07 Evidence Status','08 Re-instruction to Main AI / User']
});
const CANON=Object.freeze(['01 True Objective','02 Missing Context','03 Fact Check','04 Risk Detection','05 Opposing View','06 Comparison Material','07 Evidence Status','08 Re-instruction to Main AI / User']);
const line=(value)=>String(value??'-').replace(/\s+/g,' ').trim()||'-';
const join=(items,fallback='-')=>(items||[]).map(line).filter((item)=>item&&item!=='-').join(' / ')||fallback;

function notRequiredEvidence(taskId){return{schema_version:'astera.evidence-search.result.v1',status:'NOT_REQUIRED',search_state:'NOT_REQUIRED',task_id:taskId,evidence:[],coverage:{discovery_scope_state:'NOT_REQUIRED'},quality:{final:{status:'NOT_REQUIRED',score_bp:null}},provider_execution:{initial:[],reinforcement:[]},query_execution:{initial:[],reinforcement:[]},ai_used:false,payment_executed:false};}
function notProvidedEvidence(taskId){return{schema_version:'astera.evidence-search.result.v1',status:'REJECTED_SEARCH_NOT_EXECUTED',search_state:'NOT_EXECUTED',task_id:taskId,evidence:[],coverage:{discovery_scope_state:'NOT_EXECUTED'},quality:{final:{status:'REJECTED_SEARCH_NOT_EXECUTED',score_bp:0,blocking_reasons:['SEARCH_NOT_EXECUTED']}},provider_execution:{initial:[],reinforcement:[]},query_execution:{initial:[],reinforcement:[]},ai_used:false,payment_executed:false};}
function taskText(task,claims=[]){return unique([...(claims||[]).map((claim)=>claim.raw_text),task.target||'',...(task.premises||[]),task.source_span?.text||'']).join('\n');}
function claimStatus(canonical){const total=canonical?.records?.length||0,confirmed=canonical?.confirmed_count||0,undetermined=canonical?.undetermined_count||0;return{status:total&&undetermined===0?'CONFIRMED':'UNDETERMINED',total,confirmed,undetermined};}
function evidenceBindingRefs(records=[]){const refs=[];for(const record of records)for(const binding of record.confirmation?.bindings||[])if(binding.evidence_source==='EXTERNAL_RETRIEVED_EVIDENCE')refs.push(binding);return[...new Map(refs.map((item)=>[item.candidate_id||item.url||JSON.stringify(item),item])).values()];}

function mergeConditionDifferences(taskResults = []) {
  const merged = { constraints: [], prohibitions: [], preserve: [], replace: [], conditions: [], exceptions: [], dependencies: [] };
  for (const result of taskResults) {
    const differences = result.lanes?.compare?.condition_differences || {};
    for (const key of Object.keys(merged)) {
      merged[key] = unique([...(merged[key] || []), ...(differences[key] || [])]);
    }
  }
  return merged;
}

function uniqueComparisonCandidates(taskResults = []) {
  const labels = [];
  for (const result of taskResults) {
    for (const candidate of result.lanes?.compare?.comparison_candidates || []) {
      const label = typeof candidate === 'string' ? candidate : candidate?.label;
      if (label && !labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

function mapMultiPerspective(perspective = {}) {
  return {
    ...(perspective.task_id ? { task_id: perspective.task_id } : {}),
    id: perspective.id,
    class: perspective.class,
    focus: perspective.focus,
    conditions: perspective.conditions,
    weaknesses: perspective.weaknesses,
    failure_conditions: perspective.failure_conditions,
    evidence_refs: perspective.evidence_refs,
    trade_off_material: perspective.trade_off_material || perspective.trade_offs
  };
}

function mapExpandedPerspective(perspective = {}) {
  return {
    ...(perspective.task_id ? { task_id: perspective.task_id } : {}),
    id: perspective.id,
    class: perspective.class,
    focus: perspective.focus,
    conditions: perspective.conditions,
    weaknesses: perspective.weaknesses,
    failure_conditions: perspective.failure_conditions,
    evidence_refs: unique([
      ...(perspective.support_evidence_refs || []),
      ...(perspective.counter_evidence_refs || []),
      ...(perspective.evidence_refs || [])
    ]),
    trade_off_material: perspective.trade_off_material || null,
    trade_offs: perspective.trade_offs || []
  };
}

function formatEvidenceRefList(refs = []) {
  if (!refs.length) return '-';
  return refs.map((ref) => {
    const parts = [];
    if (ref.claim_id) parts.push(`claim=${ref.claim_id}`);
    if (ref.candidate_id) parts.push(`candidate=${ref.candidate_id}`);
    if (ref.binding_id) parts.push(`binding=${ref.binding_id}`);
    if (ref.query_role) parts.push(`role=${ref.query_role}`);
    if (ref.url) parts.push(`url=${ref.url}`);
    return parts.join('; ') || '-';
  }).join(' / ');
}

function formatMissingEvidenceRefList(refs = []) {
  if (!refs.length) return '-';
  return refs.map((item) => {
    if (typeof item === 'string') return item;
    const parts = [];
    if (item.claim_id) parts.push(`claim=${item.claim_id}`);
    if (item.text) parts.push(`text=${line(item.text)}`);
    if (item.reasons?.length) parts.push(`reasons=${join(item.reasons)}`);
    if (item.missing_scope_fields?.length) parts.push(`missing_scope_fields=${join(item.missing_scope_fields)}`);
    return parts.join('; ') || '-';
  }).join(' / ');
}

function formatScopeObject(scope) {
  if (!scope || typeof scope !== 'object') return line(scope);
  return Object.entries(scope).map(([key, value]) => `${key}=${line(value)}`).join('; ');
}

function formatSupportedScopeEntry(entry = {}) {
  const parts = [`claim_id=${line(entry.claim_id)}`];
  if (entry.scope && typeof entry.scope === 'object') parts.push(`scope=${formatScopeObject(entry.scope)}`);
  else if (entry.scope) parts.push(`scope=${line(entry.scope)}`);
  return parts.join('; ');
}

function formatUnsupportedScopeEntry(entry = {}) {
  const parts = [`claim_id=${line(entry.claim_id)}`];
  if (entry.missing_scope_fields?.length) parts.push(`missing_scope_fields=${join(entry.missing_scope_fields)}`);
  if (entry.reasons?.length) parts.push(`reasons=${join(entry.reasons)}`);
  return parts.join('; ');
}

function formatTradeOffMaterialText(material) {
  const empty = !material || typeof material !== 'object' || Array.isArray(material);
  const lines = [
    `status=${line(empty ? '-' : material.status)}`,
    `dimensions=${!empty && material.dimensions?.length ? join(material.dimensions) : '-'}`,
    `confirmed_claim_ids=${!empty && material.confirmed_claim_ids?.length ? join(material.confirmed_claim_ids) : '-'}`,
    `undetermined_claim_ids=${!empty && material.undetermined_claim_ids?.length ? join(material.undetermined_claim_ids) : '-'}`,
    `support_evidence_refs=${!empty && material.support_evidence_refs?.length ? formatEvidenceRefList(material.support_evidence_refs) : '-'}`,
    `counter_evidence_refs=${!empty && material.counter_evidence_refs?.length ? formatEvidenceRefList(material.counter_evidence_refs) : '-'}`,
    `missing_evidence_refs=${!empty && material.missing_evidence_refs?.length ? formatMissingEvidenceRefList(material.missing_evidence_refs) : '-'}`
  ];
  if (!empty && material.policy_notes?.length) {
    lines.push(`Trade-off Policy: ${join(material.policy_notes)}`);
  }
  if (!empty && material.material_by_dimension && typeof material.material_by_dimension === 'object') {
    for (const [dimension, entry] of Object.entries(material.material_by_dimension)) {
      const value = typeof entry === 'string'
        ? entry
        : join(entry.observations || entry.conditions || []);
      lines.push(`${dimension}=${line(value)}`);
    }
  }
  return lines.join('\n');
}

function formatPerCandidateBlock(entry = {}) {
  return [
    'Per-candidate:',
    `label=${line(entry.label || entry.candidate_id)}`,
    `material_state=${line(entry.material_state)}`,
    `observations=${entry.observations?.length ? entry.observations.map((item) => line(item)).join(' / ') : '-'}`,
    `confirmed_claim_ids=${entry.confirmed_claim_ids?.length ? join(entry.confirmed_claim_ids) : '-'}`,
    `undetermined_claim_ids=${entry.undetermined_claim_ids?.length ? join(entry.undetermined_claim_ids) : '-'}`,
    `supported_scopes=${entry.supported_scopes?.length ? entry.supported_scopes.map(formatSupportedScopeEntry).join(' / ') : '-'}`,
    `evidence_refs=${entry.evidence_refs?.length ? formatEvidenceRefList(entry.evidence_refs) : '-'}`
  ].join('\n');
}

function formatCandidateMaterialBlock(entry = {}) {
  return [
    'Candidate Material:',
    `candidate_id=${line(entry.candidate_id)}`,
    `label=${line(entry.label)}`,
    `material_state=${line(entry.material_state)}`,
    `observations=${entry.observations?.length ? entry.observations.map((item) => line(item)).join(' / ') : '-'}`,
    `confirmed_claim_ids=${entry.confirmed_claim_ids?.length ? join(entry.confirmed_claim_ids) : '-'}`,
    `undetermined_claim_ids=${entry.undetermined_claim_ids?.length ? join(entry.undetermined_claim_ids) : '-'}`,
    `supported_scopes=${entry.supported_scopes?.length ? entry.supported_scopes.map(formatSupportedScopeEntry).join(' / ') : '-'}`,
    `evidence_refs=${entry.evidence_refs?.length ? formatEvidenceRefList(entry.evidence_refs) : '-'}`
  ].join('\n');
}

function formatTradeOffDifferenceBlock(entry = {}) {
  const lines = [
    'Trade-off Difference:',
    `dimension=${line(entry.dimension)}`,
    `comparison_state=${line(entry.comparison_state || entry.status)}`,
    `conditions=${entry.conditions?.length ? join(entry.conditions) : '-'}`
  ];
  for (const candidate of entry.per_candidate || []) {
    lines.push(formatPerCandidateBlock(candidate));
  }
  return lines.join('\n');
}

function formatSection05Pass(section) {
  const perspectives = section.expanded_perspectives?.length
    ? section.expanded_perspectives
    : (section.perspectives || []);
  if (!perspectives.length) return `- ${line(section.summary)}`;
  return perspectives.map((perspective) => {
    const focusText = Array.isArray(perspective.focus) ? join(perspective.focus) : line(perspective.focus);
    return [
      `Perspective: ${line(perspective.id || perspective.class)}`,
      `Focus: ${focusText}`,
      `Conditions: ${join(perspective.conditions)}`,
      `Failure Conditions: ${join(perspective.failure_conditions)}`,
      'Trade-off Material:',
      formatTradeOffMaterialText(perspective.trade_off_material)
    ].join('\n');
  }).join('\n\n');
}

function formatSection06Pass(section) {
  const candidates = (section.comparison_candidates || []).map((candidate) =>
    typeof candidate === 'string' ? candidate : (candidate.label || candidate.candidate_id || '-')
  );
  const candidateMaterialBlocks = (section.candidate_materials || []).map((entry) => formatCandidateMaterialBlock(entry));
  const tradeOffDiffBlocks = (section.trade_off_differences || []).map((entry) => formatTradeOffDifferenceBlock(entry));
  const conditionDiff = section.condition_differences || {};
  const contradictionBlocks = (section.contradiction_map || []).map((entry) => [
    'Contradiction:',
    `type=${line(entry.type)}`,
    `claim_id=${line(entry.claim_id)}`,
    `reasons=${join(entry.reasons)}`
  ].join('\n'));
  const supportedBlocks = (section.supported_scope || []).map((entry) => `Supported Scope: ${formatSupportedScopeEntry(entry)}`);
  const unsupportedBlocks = (section.unsupported_scope || []).map((entry) => `Unsupported Scope: ${formatUnsupportedScopeEntry(entry)}`);
  return [
    `Candidates: ${join(candidates)}`,
    `Dimensions: ${join(section.dimensions)}`,
    ...(candidateMaterialBlocks.length ? candidateMaterialBlocks : ['Candidate Material:', 'candidate_id=-', 'label=-', 'material_state=-', 'observations=-', 'confirmed_claim_ids=-', 'undetermined_claim_ids=-', 'supported_scopes=-', 'evidence_refs=-']),
    ...(tradeOffDiffBlocks.length ? tradeOffDiffBlocks : ['Trade-off Difference:', 'dimension=-', 'comparison_state=-', 'conditions=-']),
    `Condition Differences: constraints=${join(conditionDiff.constraints)}; prohibitions=${join(conditionDiff.prohibitions)}; preserve=${join(conditionDiff.preserve)}; replace=${join(conditionDiff.replace)}; conditions=${join(conditionDiff.conditions)}; exceptions=${join(conditionDiff.exceptions)}; dependencies=${join(conditionDiff.dependencies)}`,
    ...(contradictionBlocks.length ? contradictionBlocks : ['Contradiction:', 'type=-', 'claim_id=-', 'reasons=-']),
    ...(supportedBlocks.length ? supportedBlocks : ['Supported Scope: claim_id=-']),
    ...(unsupportedBlocks.length ? unsupportedBlocks : ['Unsupported Scope: claim_id=-'])
  ].join('\n');
}

function aggregateTaskResults(taskResults){
  const allRecords=taskResults.flatMap((result)=>(result.canonical.records||[]).map((record)=>({task_id:result.task.id,...record})));
  const confirmed=taskResults.flatMap((result)=>(result.lanes.fact.confirmed||[]).map((item)=>({task_id:result.task.id,...item})));
  const unconfirmed=taskResults.flatMap((result)=>(result.lanes.fact.unconfirmed||[]).map((item)=>({task_id:result.task.id,...item})));
  const facts={
    pillar:'fact',confirmed,unconfirmed,opinions:[],not_applicable:[],
    evidence_need:taskResults.flatMap((result)=>(result.lanes.fact.evidence_need||[]).map((item)=>({task_id:result.task.id,...item}))),
    evidence_gaps:taskResults.flatMap((result)=>(result.lanes.fact.evidence_gaps||[]).map((item)=>({task_id:result.task.id,...item}))),
    evidence_state:taskResults.length===1?taskResults[0].evidence:{state:'PER_TASK',per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.evidence]))},
    per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.fact]))
  };
  const riskItems=taskResults.flatMap((result)=>(result.lanes.risk.risks||[]).map((item)=>({task_id:result.task.id,...item}))).sort((a,b)=>Number(b.weight||0)-Number(a.weight||0)||String(a.key).localeCompare(String(b.key)));
  const risks={pillar:'risk',risk_count:riskItems.length,risks:riskItems,highest:riskItems[0]||null,level:riskItems.some((item)=>Number(item.weight||0)>=100)?'high':riskItems.length?'medium':'low',safety_gates:unique(taskResults.flatMap((result)=>result.lanes.risk.safety_gates||[])),hard_constraints:unique(taskResults.flatMap((result)=>result.lanes.risk.hard_constraints||[])),per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.risk]))};
  const multi={pillar:'multi',material_only:true,perspectives:taskResults.flatMap((result)=>(result.lanes.multi.perspectives||[]).map((item)=>({task_id:result.task.id,...item}))),trade_off_map:taskResults.flatMap((result)=>(result.lanes.multi.trade_off_map||[]).map((item)=>({task_id:result.task.id,...item}))),per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.multi]))};
  const inquiry={pillar:'inquiry',problem_health:{healthy:taskResults.every((result)=>result.lanes.inquiry.problem_health?.healthy),reason:taskResults.filter((result)=>!result.lanes.inquiry.problem_health?.healthy).map((result)=>`${result.task.id}:${result.lanes.inquiry.problem_health?.reason}`).join(' / ')||'All canonical claims are traceable.'},missing_fields:unique(taskResults.flatMap((result)=>(result.lanes.inquiry.missing_fields||[]).map((item)=>`${result.task.id}:${item}`))),missing_questions:unique(taskResults.flatMap((result)=>result.lanes.inquiry.missing_questions||[])),open_items:taskResults.flatMap((result)=>(result.lanes.inquiry.open_items||[]).map((item)=>({task_id:result.task.id,...item}))),per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.inquiry]))};
  const claims=allRecords.length,confirmedCount=allRecords.filter((record)=>record.confirmation.status==='CONFIRMED').length,undeterminedCount=claims-confirmedCount,conflictCount=allRecords.filter((record)=>(record.confirmation.reasons||[]).includes('G6_UNRESOLVED_CONFLICT')).length;
  const comparison={pillar:'compare',material_only:true,counts:{claims,confirmed:confirmedCount,undetermined:undeterminedCount,conflicts:conflictCount},coverage:claims?{numerator:confirmedCount,denominator:claims,ratio:confirmedCount/claims}:null,dimensions:unique(taskResults.flatMap((result)=>result.lanes.compare.dimensions||[])),comparison_candidates:uniqueComparisonCandidates(taskResults),candidate_materials:taskResults.flatMap((result)=>(result.lanes.compare.candidate_materials||[]).map((item)=>({task_id:result.task.id,...item}))),trade_off_differences:taskResults.flatMap((result)=>(result.lanes.compare.trade_off_differences||[]).map((item)=>({task_id:result.task.id,...item}))),scope_booleans:taskResults.flatMap((result)=>(result.lanes.compare.scope_booleans||[]).map((item)=>({task_id:result.task.id,...item}))),supported_scope:taskResults.flatMap((result)=>(result.lanes.compare.supported_scope||[]).map((item)=>({task_id:result.task.id,...item}))),unsupported_scope:taskResults.flatMap((result)=>(result.lanes.compare.unsupported_scope||[]).map((item)=>({task_id:result.task.id,...item}))),contradiction_map:taskResults.flatMap((result)=>(result.lanes.compare.contradiction_map||[]).map((item)=>({task_id:result.task.id,...item}))),condition_differences:mergeConditionDifferences(taskResults),selected_candidate:null,candidate_ranking:[],rejected_candidates:[],per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.compare])),verdict:{decision:'MATERIAL_ONLY',reason:'Astera does not select, rank, recommend, adopt, or reject candidates.',objective:'Expose deterministic comparison material only.'}};
  const perspectiveExpansion={engine:'Astera Deterministic Perspective Expansion',mode:'MATERIAL_ONLY',per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.perspective_expansion])),perspectives:taskResults.flatMap((result)=>(result.perspective_expansion.perspectives||[]).map((item)=>({task_id:result.task.id,...item}))),candidates:[],selected:null,rejected:[]};
  const canonical={schema_version:'astera.canonical-claim-records.aggregate.v1',records:allRecords,claim_count:claims,confirmed_count:confirmedCount,undetermined_count:undeterminedCount,status:claims&&undeterminedCount===0?'CONFIRMED':'UNDETERMINED',per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.canonical]))};
  return{facts,risks,multi,inquiry,comparison,perspectiveExpansion,canonical};
}

class CanonicalAsteraEngine extends CanonicalEngineSupport {
  prepareRequest(input={}){return analyzeRequest(input);}
  async resolveEvidenceForTask(){return null;}

  async process(input={},tenant={id:'unknown'},executionContext={}){
    const question=String(input.question||'').trim(),context=String(input.context||'').trim();
    const request=this.prepareRequest({question,context,language:input.language,locale:input.locale,output_language:input.output_language});
    const requestedOutput=String(request.output_language||request.language||input.output_language||input.language||'und'),renderLang=requestedOutput.split('-')[0]==='ja'?'ja':'en';
    if(!question)return{result:{type:'clarification_needed',non_ai:true,questions:[renderLang==='ja'?'質問本文を入力してください。':'Please provide the request body.']},material:this.clarify([],renderLang),prompt:'',runtime:{ai_used:false,llm_called:false,engine:'v8_canonical_global_rules'}};
    const packet=request.analysis_task_packet;
    if(!packet?.tasks?.length)return{result:{type:'clarification_needed',non_ai:true,request_model:request,questions:[renderLang==='ja'?'Analysis Taskを抽出できませんでした。対象・行為・完了条件を確認してください。':'No analysis task could be extracted.']},material:this.clarify([],renderLang),prompt:'',runtime:{ai_used:false,llm_called:false,engine:'v8_canonical_global_rules'}};

    const tasks=packet.tasks.map((baseTask)=>{
      const preliminary=buildCanonicalTaskPlan(baseTask,{});
      const domain=routeDomainTemplates({question:taskText(baseTask,preliminary.claims),context});
      const evidenceNeed=deriveEvidenceNeed(baseTask,domain);
      const task={...baseTask,evidence_need:evidenceNeed,domain};
      const canonicalPlan=buildCanonicalTaskPlan(task,domain);
      return{...task,canonical_plan:canonicalPlan};
    });
    request.analysis_task_packet={...packet,tasks:tasks.map(({canonical_plan,...task})=>task),execution_waves:packet.execution_waves};

    const signal=executionContext?.signal||null,evidenceRawByTask=new Map(),executor=this.getCanonicalTaskExecutor();
    const execution=await executeTaskWaves({
      tasks,
      executionWaves:packet.execution_waves,
      signal,
      runTask:async(task)=>{
        const searchRequired=task.canonical_plan.search_plan.queries.length>0;
        let evidenceRaw=searchRequired?null:notRequiredEvidence(task.id);
        if(searchRequired)evidenceRaw=await this.resolveEvidenceForTask({task,input,tenant,request,signal});
        if(!evidenceRaw)evidenceRaw=notProvidedEvidence(task.id);
        evidenceRawByTask.set(String(task.id),evidenceRaw);
        const projected=await executor.exec('PROJECT_CANONICAL_TASK',{task,evidenceRaw},{signal});
        const normalizedEvidence=normalizeEvidencePacket(evidenceRaw),evidence=Object.freeze({...normalizedEvidence,search_state:String(evidenceRaw?.search_state||(normalizedEvidence.source_status==='NOT_REQUIRED'?'NOT_REQUIRED':'NOT_EXECUTED'))}),canonical=projected.canonical,lanes=projected.lanes,perspectiveExpansion=projected.perspective_expansion;
        return{task,evidence,evidence_raw:evidenceRaw,canonical,lanes,perspective_expansion:perspectiveExpansion,facts:lanes.fact,risks:lanes.risk,multi:lanes.multi,inquiry:lanes.inquiry,comparison:lanes.compare};
      }
    });
    if(signal?.aborted){const error=new Error('Request cancelled');error.code='REQUEST_CANCELLED';error.status=499;throw error;}
    const taskResults=execution.ordered.map((entry)=>{
      if(entry.result)return entry.result;
      const error=entry.error||Object.assign(new Error('Task skipped because a dependency failed'),{code:'SKIPPED_DEPENDENCY',details:entry.skipped||null});
      const evidenceRaw=evidenceRawByTask.get(String(entry.task.id))||(entry.task.canonical_plan?.search_plan?.queries?.length?notProvidedEvidence(entry.task.id):notRequiredEvidence(entry.task.id));
      const normalizedEvidence=normalizeEvidencePacket(evidenceRaw),evidence=Object.freeze({...normalizedEvidence,search_state:String(evidenceRaw?.search_state||(normalizedEvidence.source_status==='NOT_REQUIRED'?'NOT_REQUIRED':'NOT_EXECUTED'))}),projected=projectCanonicalFailure({task:entry.task,error}),canonical=projected.canonical,lanes=projected.lanes,perspectiveExpansion=projected.perspective_expansion;
      return{task:entry.task,evidence,evidence_raw:evidenceRaw,canonical,lanes,perspective_expansion:perspectiveExpansion,facts:lanes.fact,risks:lanes.risk,multi:lanes.multi,inquiry:lanes.inquiry,comparison:lanes.compare,execution_failure:{code:error.code||'TASK_EXECUTION_FAILURE',message:error.message,skipped:entry.skipped||null}};
    });
    const executionSummary={mode:'WORKER_THREADS_WAVE_BOUNDED',pool_size:executor.size,waves:execution.waves,timings:execution.timings,failures:Object.fromEntries([...execution.failures].map(([taskId,error])=>[taskId,{code:error.code||'TASK_EXECUTION_FAILURE',message:error.message}])),skipped:Object.fromEntries(execution.skipped)};
    const materialExecutionSummary={...executionSummary,timings:(executionSummary.timings||[]).map(({duration_ms,...timing})=>timing)};

    const aggregate=aggregateTaskResults(taskResults),judgment=this.frame({request,context,taskResults,aggregate,lang:renderLang});
    judgment.requested_output_language=requestedOutput;
    judgment.localization={requested_language:requestedOutput,rendered_language:renderLang,status:['ja','en'].includes(requestedOutput.split('-')[0])?'NATIVE_CANONICAL_RENDER':'EXTERNAL_LOCALIZATION_REQUIRED'};
    const material=this.material(judgment),fiveStage={schema_version:'astera.five-stage.v2',order:[...FIVE_STAGE],execution_waves:packet.execution_waves,execution:materialExecutionSummary,tasks:taskResults.map((result)=>({task_id:result.task.id,lens_id:result.task.domain.primary?.id||null,claim_status:claimStatus(result.canonical),evidence_state:result.evidence.state,evidence_search_state:result.evidence.search_state,fact:result.lanes.fact,risk:result.lanes.risk,multi:result.lanes.multi,inquiry:result.lanes.inquiry,compare:result.lanes.compare}))};
    const result={type:'cognitive_map',mode:'deterministic_multi_parallel_decision_materials',decision_authority:'EXTERNAL_ONLY',non_ai:true,request_model:request,instruction_understanding:request.instruction_understanding||null,analysis_task_packet:request.analysis_task_packet,canonical_claims:aggregate.canonical,five_stage:fiveStage,task_results:taskResults.map((item)=>({task:item.task,evidence:item.evidence,canonical:item.canonical,facts:item.lanes.fact,risks:item.lanes.risk,multi:item.lanes.multi,inquiry:item.lanes.inquiry,comparison:item.lanes.compare,perspective_expansion:item.perspective_expansion})),facts:aggregate.facts,risks:aggregate.risks,multi:aggregate.multi,inquiry:aggregate.inquiry,perspective_expansion:aggregate.perspectiveExpansion,comparison:aggregate.comparison,parallel_execution:materialExecutionSummary,judgment};
    this.logger.write({tenantId:tenant.id,type:'process_completed',text:`Canonical claim materials completed: claims=${aggregate.canonical.claim_count} confirmed=${aggregate.canonical.confirmed_count} undetermined=${aggregate.canonical.undetermined_count}`,payload:{task_count:tasks.length,wave_count:execution.waves.length,task_failure_count:execution.failures.size,task_skipped_count:execution.skipped.size,claim_count:aggregate.canonical.claim_count,confirmed_claim_count:aggregate.canonical.confirmed_count,undetermined_claim_count:aggregate.canonical.undetermined_count,non_ai:true,input_language:request.language,input_script:request.script}});
    return{result,material,prompt:this.externalBrief(judgment),runtime:{ai_used:false,llm_called:false,engine:'v8_canonical_global_rules',task_count:tasks.length,wave_count:execution.waves.length,parallel_execution:executionSummary,input_language:request.language,input_script:request.script,requested_output_language:requestedOutput,localization:judgment.localization}};
  }

  frame({request,context,taskResults,aggregate,lang}){
    const packet=request.analysis_task_packet,taskIds=taskResults.map((result)=>result.task.id),lensIds=unique(taskResults.map((result)=>result.task.domain.primary?.id).filter(Boolean)),sourceSpans=packet.source_spans||[],constraints=unique([...(packet.constraints||[]),...(packet.prohibitions||[]),...(packet.preserve||[])]),evidenceRefs=evidenceBindingRefs(aggregate.canonical.records),factsUsed=(aggregate.facts.confirmed||[]).map((item)=>`${item.task_id}:${item.claim_id}:${item.text}`),risksUsed=(aggregate.risks.risks||[]).map((item)=>`${item.task_id}:${item.key}`),claimBlockers=unique(aggregate.canonical.records.filter((record)=>record.confirmation.status!=='CONFIRMED').flatMap((record)=>(record.confirmation.reasons||[]).map((reason)=>`${record.task_id}:${record.claim.claim_id}:${reason}`))),blockers=unique([...(packet.unresolved||[]),...(packet.conflicts||[]).map((item)=>item.type),...claimBlockers]);
    const trace=(ruleIds,extra={})=>({trace_schema:'astera.decision-trace.v2',rule_ids:ruleIds,task_ids:taskIds,lens_ids:lensIds,evidence_refs:evidenceRefs,facts_used:factsUsed,constraints_used:constraints,risks_used:risksUsed,candidates_compared:[],rejected_reasons:[],score_breakdown:[],uncertainty:{undetermined_claim_count:aggregate.canonical.undetermined_count},blocking_conditions:blockers,source_spans:sourceSpans,...extra});
    const contextPremises = unique([
      ...(packet.context_bindings || []).filter((item) => item.kind === 'premise').map((item) => item.value),
      ...taskResults.flatMap((result) => (result.task.premises || []))
    ]);
    const contextProhibitions = unique([
      ...(packet.prohibitions || []),
      ...(packet.context_bindings || []).filter((item) => item.kind === 'prohibition').map((item) => item.value)
    ]);
    const purposeItems=taskResults.map((result)=>`${result.task.id}[${result.task.action}] ${result.task.objective}`),premiseItems=unique([...(packet.unresolved||[]).map((item)=>`unresolved=${item}`),...(packet.conflicts||[]).map((item)=>`conflict=${item.type}:${item.note}`),...aggregate.inquiry.missing_fields.map((item)=>`missing=${item}`),...constraints.map((item)=>`hard_constraint=${item}`),...contextPremises.map((item)=>`premise=${item}`),...contextProhibitions.map((item)=>`prohibition=${item}`)]),factItems=unique([...(aggregate.facts.confirmed||[]).map((item)=>`${item.task_id}:${item.claim_id}:CONFIRMED:${item.text}`),...(aggregate.facts.unconfirmed||[]).map((item)=>`${item.task_id}:${item.claim_id}:UNDETERMINED:${item.text}`)]),riskItems=(aggregate.risks.risks||[]).map((item)=>`${item.task_id}:${item.key}[${item.weight}] ${item.impact}`),oppositionItems=taskResults.map((result)=>`${result.task.id}: counter query role=${result.canonical.search_plan.planned_query_roles.includes('COUNTER')?'PLANNED':'NOT_REQUIRED'} / unresolved=${result.canonical.undetermined_count}`),comparisonItems=taskResults.map((result)=>`${result.task.id}: claims=${result.lanes.compare.counts.claims}, confirmed=${result.lanes.compare.counts.confirmed}, undetermined=${result.lanes.compare.counts.undetermined}, coverage=${result.lanes.compare.coverage?.ratio??'-'}`),evidenceItems=taskResults.map((result)=>`${result.task.id}: SearchExecution=${result.evidence.search_state}; EvidenceQuality=${result.evidence.source_status||result.evidence.state}; quality=${result.evidence.quality_score_bp??'-'}bp; ClaimConfirmation=${claimStatus(result.canonical).status} (${result.canonical.confirmed_count}/${result.canonical.records.length})`),reinstructionItems=unique([`Task Wave順を保持: ${packet.execution_waves.map((wave,index)=>`W${index+1}[${wave.join(',')}]`).join(' -> ')}`,...packet.prohibitions.map((item)=>`禁止条件を破らない: ${item}`),...packet.preserve.map((item)=>`維持条件を保持: ${item}`),...taskResults.map((result)=>`${result.task.id}: Lens=${result.task.domain.primary?.id||'UNRESOLVED'} / Claim=${claimStatus(result.canonical).status} / SearchExecution=${result.evidence.search_state} / EvidenceQuality=${result.evidence.state}`),...(aggregate.canonical.undetermined_count?['UNDETERMINED ClaimをCONFIRMEDへ推測昇格しない。']:[]),...(blockers.length?[`Blocking条件を解消せず最終判断へ進めない: ${blockers.join(' / ')}`]:[]),'Astera自身は採用・棄却・Ranking・Recommendation・最終Decisionを行わない。']);
    const oppositionPerspectives=(aggregate.multi.perspectives||[]).filter((perspective)=>String(perspective.class||perspective.id||'').toUpperCase()!=='MAINLINE').map(mapMultiPerspective);
    const expandedPerspectives=(aggregate.perspectiveExpansion.perspectives||[]).map(mapExpandedPerspective);
    const tradeOffMap=(aggregate.multi.trade_off_map||[]).map((item)=>({...(item.task_id?{task_id:item.task_id}:{}),id:item.id,class:item.class,focus:item.focus,conditions:item.conditions,weaknesses:item.weaknesses,status:item.status,source:item.source}));
    const oppositionSummary=oppositionPerspectives.length?join(oppositionPerspectives.map((perspective)=>`${perspective.id||perspective.class}:${line(Array.isArray(perspective.focus)?perspective.focus.join(' / '):perspective.focus)}`)):join(oppositionItems);
    const sections={
      '01_purpose':{summary:join(purposeItems),items:purposeItems,decision_basis:trace(['MAIN8-01-TASK-GRAPH-OBJECTIVE'],{derivation:'Analysis Task Graphの目的を順序・依存と分離して保持する。'})},
      '02_premise':{summary:premiseItems.length?join(premiseItems):(lang==='en'?'No unresolved premise or hard-constraint gap.':'未解決の前提不足・Hard Constraint競合は検出されていない。'),items:premiseItems,decision_basis:trace(['MAIN8-02-UNRESOLVED-CONSTRAINT'],{derivation:'Unresolved/Conflict/Hard Constraintを列挙し、推測補完しない。'})},
      '03_facts':{summary:lang==='en'?`confirmed=${aggregate.canonical.confirmed_count}, undetermined=${aggregate.canonical.undetermined_count}`:`CONFIRMED ${aggregate.canonical.confirmed_count}件 / UNDETERMINED ${aggregate.canonical.undetermined_count}件`,items:factItems,confirmed:aggregate.facts.confirmed,unconfirmed:aggregate.facts.unconfirmed,decision_basis:trace(['MAIN8-03-G1-G7-CANONICAL-CLAIMS'],{derivation:'Evidence Search品質ではなくG1-G7全通過ClaimだけをCONFIRMEDとする。'})},
      '04_crisis':{summary:aggregate.risks.highest?`${aggregate.risks.level}: ${aggregate.risks.highest.task_id}:${aggregate.risks.highest.impact}`:(lang==='en'?'No material rule-derived risk detected.':'重大なRule由来Riskは検出されていない。'),items:riskItems,highest:aggregate.risks.highest,risks:aggregate.risks.risks,decision_basis:trace(['MAIN8-04-INDEPENDENT-RISK-PROJECTION'],{derivation:'Risk Laneは他Lane出力ではなくTask/Canonical Claim/Domain Ruleから独立投影する。'})},
      '05_opposition':{summary:oppositionSummary,items:oppositionPerspectives.length?oppositionPerspectives.map((perspective)=>`${perspective.id||perspective.class}:${line(Array.isArray(perspective.focus)?perspective.focus.join(' / '):perspective.focus)}`):oppositionItems,perspectives:oppositionPerspectives,expanded_perspectives:expandedPerspectives,trade_off_map:tradeOffMap,decision_basis:trace(['MAIN8-05-COUNTER-ROLE-MATERIAL'],{derivation:'Multi/Perspective Expansionの実体を保持し、MAINLINE以外の視点とTrade-off材料を失わない。'})},
      '06_comparison':{summary:`claims=${aggregate.comparison.counts.claims}, confirmed=${aggregate.comparison.counts.confirmed}, undetermined=${aggregate.comparison.counts.undetermined}, conflicts=${aggregate.comparison.counts.conflicts}`,items:comparisonItems,counts:aggregate.comparison.counts,coverage:aggregate.comparison.coverage,dimensions:aggregate.comparison.dimensions,scope_booleans:aggregate.comparison.scope_booleans,supported_scope:aggregate.comparison.supported_scope,unsupported_scope:aggregate.comparison.unsupported_scope,contradiction_map:aggregate.comparison.contradiction_map,condition_differences:aggregate.comparison.condition_differences,comparison_candidates:aggregate.comparison.comparison_candidates,candidate_materials:aggregate.comparison.candidate_materials,trade_off_differences:aggregate.comparison.trade_off_differences,selected_candidate:null,candidate_ranking:[],rejected_candidates:[],decision_basis:trace(['MAIN8-06-MATERIAL-ONLY-COMPARE'],{derivation:'Count/Coverage/Scope/Conflict/Dimension/Candidate/Trade-off材料のみ。加重Score・Ranking・Selected/Rejectedを生成しない。'})},
      '07_evidence_status':{summary:`Claim=${aggregate.canonical.status}: confirmed=${aggregate.canonical.confirmed_count}/${aggregate.canonical.claim_count}; Evidence Search quality is tracked separately.`,items:evidenceItems,claim_status:aggregate.canonical.status,confirmed_claim_count:aggregate.canonical.confirmed_count,undetermined_claim_count:aggregate.canonical.undetermined_count,evidence_search:Object.fromEntries(taskResults.map((result)=>[result.task.id,{search_state:result.evidence.search_state,state:result.evidence.state,source_status:result.evidence.source_status,quality_score_bp:result.evidence.quality_score_bp,coverage_state:result.evidence.coverage_state,conflict_detected:result.evidence.conflict_detected}])),decision_basis:trace(['MAIN8-07-EVIDENCE-STATUS-SEPARATION'],{derivation:'Evidence Searchは根拠候補品質、Claim ConfirmationはG1-G7成立状態として分離表示する。'})},
      '08_reinstruction':{summary:join(reinstructionItems),items:reinstructionItems,decision_basis:trace(['MAIN8-08-LOSSLESS-EXTERNAL-REINSTRUCTION'],{derivation:'Task順序・禁止・維持・Evidence/Claim状態・未確定を失わずExternal Consumerへ渡す。'})}
    };
    ORDER.forEach((key,index)=>{sections[key]={canonical_label:CANON[index],label:LABELS[lang][index],...sections[key]};});
    return{format:'astera_judgment_v4',canonical_language:'en',output_language:lang,order:[...ORDER],non_ai:true,decision_authority:'EXTERNAL_ONLY',task_graph:{task_count:taskResults.length,dependencies:packet.dependencies,execution_waves:packet.execution_waves},lens_routing:{per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,{primary:result.task.domain.primary||null,secondary:result.task.domain.secondary||[],overlays:result.task.domain.overlays||[],classification_basis:result.task.domain.classification_basis,confidence:result.task.domain.confidence}]))},claim_state:{status:aggregate.canonical.status,claim_count:aggregate.canonical.claim_count,confirmed_count:aggregate.canonical.confirmed_count,undetermined_count:aggregate.canonical.undetermined_count},evidence_state:{per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,{required:result.canonical.search_plan.queries.length>0,search_state:result.evidence.search_state,state:result.evidence.state,source_status:result.evidence.source_status,quality_score_bp:result.evidence.quality_score_bp,coverage_state:result.evidence.coverage_state,conflict_detected:result.evidence.conflict_detected}]))},...sections};
  }

  material(judgment){
    const heads=judgment.output_language==='en'?{one:'Judgment Material',basis:'Derivation Basis',pass:'Material for External Consumer'}:{one:'判断材料',basis:'導出根拠',pass:'External Consumerへ渡す内容'};
    const sections=ORDER.map((key)=>judgment[key]);
    const compact_text=sections.map((section)=>`${section.label}: ${line(section.summary)}`).join('\n');
    const text=ORDER.map((key)=>{
      const section=judgment[key];
      const basis=section.decision_basis||{};
      const basisLines=[`rules=${join(basis.rule_ids)}`,`tasks=${join(basis.task_ids)}`,`lenses=${join(basis.lens_ids)}`,`evidence_refs=${(basis.evidence_refs||[]).length}`,`blockers=${join(basis.blocking_conditions,'none')}`,`derivation=${line(basis.derivation)}`];
      let passContent;
      if(key==='05_opposition')passContent=formatSection05Pass(section);
      else if(key==='06_comparison')passContent=formatSection06Pass(section);
      else passContent=section.items?.length?section.items.map((item)=>`- ${line(item)}`).join('\n'):`- ${line(section.summary)}`;
      return`${section.label}\n${heads.one}\n${line(section.summary)}\n${heads.basis}\n${basisLines.map((item)=>`- ${item}`).join('\n')}\n${heads.pass}\n${passContent}`;
    }).join('\n---\n');
    return{mode:'judgment_material',target:'user_ai',raw_policy:'do_not_pass_raw_by_default',non_ai:true,decision_authority:'EXTERNAL_ONLY',format:judgment.format,text,compact_text,sections};
  }
  externalBrief(judgment){return['# Astera v8 Deterministic Judgment Materials',`TaskGraph: ${judgment.task_graph.task_count} tasks / waves=${judgment.task_graph.execution_waves.length}`,...ORDER.flatMap((key)=>{const section=judgment[key];return[`${section.canonical_label}: ${line(section.summary)}`,`  basis=${join(section.decision_basis?.rule_ids)}; blockers=${join(section.decision_basis?.blocking_conditions,'none')}`];}),'Consumer rule: preserve task order, hard constraints, evidence status, and UNDETERMINED claims. Astera does not make the final decision or recommendation.'].join('\n');}
}

module.exports=CanonicalAsteraEngine;
