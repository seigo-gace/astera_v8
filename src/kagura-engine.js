'use strict';

const WorkerPool = require('./worker-pool');
const Logger = require('./logger');
const { routeDomainTemplates } = require('./domain-template-router');
const { analyzeRequest, normalizeEvidencePacket, deriveEvidenceNeed, unique, buildExecutionWaves } = require('./judgment-materials-analyzer');
const { JapaneseParserMCPClient, needsJapaneseParser, isExternalActionHint } = require('./japanese-parser-mcp-client');

const ORDER = ['01_purpose','02_premise','03_facts','04_crisis','05_opposition','06_comparison','07_recommendation','08_reinstruction'];
const LABELS = {
  ja: ['01 本当の目的','02 前提不足','03 事実確認','04 危機察知','05 反対視点','06 比較案','07 推奨判断','08 主役AIへの再指示'],
  en: ['01 True Objective','02 Missing Context','03 Fact Check','04 Risk Detection','05 Opposing View','06 Alternative Options','07 Recommendation','08 Re-instruction to Main AI']
};
const CANON = ['01 True Objective','02 Missing Context','03 Fact Check','04 Risk Detection','05 Opposing View','06 Alternative Options','07 Recommendation','08 Re-instruction to Main AI'];
const FIVE_STAGE = Object.freeze(['fact', 'risk', 'multi', 'inquiry', 'compare']);
const ACTION_BY_INTENT = Object.freeze({
  preserve: 'preserve', modify: 'improve', remove: 'remove', comparison: 'compare', decision: 'decide',
  question: 'analyze', request: 'analyze', action: 'implement', prohibition: 'analyze', condition: 'analyze',
  sequence: 'analyze', exception: 'analyze', priority: 'analyze', correction: 'improve', scope: 'analyze',
  out_of_scope: 'analyze', dependency: 'analyze', completion_criteria: 'analyze', verification_criteria: 'verify',
  premise: 'analyze', reference: 'analyze'
});

const line = (v) => String(v ?? '-').replace(/\s+/g,' ').trim() || '-';
const join = (xs, fallback='-') => (xs||[]).map(line).filter(x=>x&&x!=='-').join(' / ') || fallback;
const langOf = (input,q) => /^(en|english)$/i.test(String(input.language||input.output_language||'')) ? 'en' : (/^(ja|jp|japanese)$/i.test(String(input.language||input.output_language||'')) ? 'ja' : (/[ぁ-んァ-ヶ一-龯]/.test(q)?'ja':'en'));
const objectList = (items) => Array.isArray(items) ? items : [];

function notRequiredEvidence(taskId) {
  return { schema_version: 'astera.evidence-search.result.v1', status: 'NOT_REQUIRED', task_id: taskId, evidence: [], coverage: { discovery_scope_state: 'NOT_REQUIRED' }, quality: { final: { status: 'NOT_REQUIRED', score_bp: null } }, provider_execution: { initial: [], reinforcement: [] }, ai_used: false, payment_executed: false };
}

function canonicalObjective(task, lang='ja') {
  const target = task.target || (lang === 'ja' ? '対象' : 'target');
  const action = task.action || 'analyze';
  if (lang === 'en') {
    const map = {
      preserve:`Preserve ${target} as a hard constraint while related tasks proceed.`, improve:`Improve ${target} without violating parser-derived constraints and dependencies.`, remove:`Remove ${target} without violating preserved scope or dependencies.`, compare:`Compare options for ${target} under the same explicit criteria.`, decide:`Decide ${target} from explicit evidence, risk, constraints, and unresolved state.`, implement:`Implement ${target} while preserving dependencies, hard constraints, and verification gates.`, verify:`Verify ${target} without promoting unresolved claims to facts.`, analyze:`Structure ${target} into deterministic decision material.`
    };
    return map[action] || map.analyze;
  }
  const map = {
    preserve:`${target}をHard Constraintとして維持し、関連Taskの変更で破壊しない。`, improve:`${target}をParser由来の制約・依存・維持条件を守って改善する。`, remove:`${target}を維持範囲・依存を破壊せず除去する。`, compare:`${target}の候補を同一の明示基準で比較する。`, decide:`${target}をEvidence・Risk・Constraint・未解決状態から機械的に判断する。`, implement:`${target}を依存・Hard Constraint・検証Gateを守って実装する。`, verify:`${target}を未確認の事実化なしで検証する。`, analyze:`${target}を決定論的な判断材料へ構造化する。`
  };
  return map[action] || map.analyze;
}

function safeSpan(span, originalText) {
  const start = Number(span?.start);
  const end = Number(span?.end);
  const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= originalText.length;
  if (!valid) return { start: 0, end: originalText.length, text: originalText, valid: false };
  const actual = originalText.slice(start, end);
  const claimed = String(span?.source_text ?? actual);
  return { start, end, text: actual, valid: actual === claimed };
}

function structuredValues(task, type) {
  return objectList(task.structured_constraints).filter((item) => item?.constraint_type === type).map((item) => String(item.value || '').trim()).filter(Boolean);
}

function parserTaskToAstera(task, originalText, parserResult, index, lang) {
  const span = safeSpan(task.original_span, originalText);
  const intent = String(task.intent_type || 'request');
  const action = ACTION_BY_INTENT[intent] || 'analyze';
  const constraints = unique([...(task.constraints || []), ...objectList(task.structured_constraints).map((item) => `${item.constraint_type}:${item.value}`)]);
  const prohibitions = unique([
    ...structuredValues(task, 'prohibition'),
    ...(intent === 'prohibition' && task.target ? [`${task.target}を禁止する`] : [])
  ]);
  const preserve = unique([
    ...structuredValues(task, 'preserve'),
    ...(intent === 'preserve' && task.target ? [`${task.target}を維持する`] : [])
  ]);
  const replace = unique([
    ...(intent === 'modify' && task.target ? [`${task.target}を変更する`] : []),
    ...(intent === 'remove' && task.target ? [`${task.target}を除去する`] : [])
  ]);
  const completion = unique([...(task.completion_criteria || []), ...structuredValues(task, 'completion_criteria')]);
  const verification = unique([...(task.verification_criteria || []), ...structuredValues(task, 'verification_criteria')]);
  const hardBlockers = parserResult.execution_allowed === false && task.external_action === true
    ? unique(['PARSER_ACTION_GUARD_BLOCKED', ...(parserResult.blocked_reasons || [])]) : [];
  const unresolved = [];
  if (String(task.status || 'RESOLVED') !== 'RESOLVED') unresolved.push(`parser_task_status:${task.status}`);
  if (!span.valid) unresolved.push('parser_source_span_mismatch');
  if (!task.target && !['question','request','action'].includes(intent)) unresolved.push('target');
  return {
    id: String(task.task_id || `A-${String(index + 1).padStart(3,'0')}`),
    source_span: { start: span.start, end: span.end, text: span.text },
    raw_text: span.text,
    clause_type: intent,
    actionable: true,
    action,
    target: task.target || (lang === 'ja' ? '入力対象' : 'input target'),
    objective: canonicalObjective({ target: task.target, action }, lang),
    deliverables: [],
    premises: structuredValues(task, 'premise'),
    constraints,
    prohibitions,
    preserve,
    replace,
    conditions: structuredValues(task, 'condition'),
    exceptions: structuredValues(task, 'exception'),
    deadlines: [],
    priority: structuredValues(task, 'priority')[0] || 'normal',
    order: Number(task.execution_order || index + 1),
    depends_on: unique(task.dependencies || []),
    parallelizable: !(task.dependencies || []).length,
    success_criteria: completion,
    verification,
    completion_criteria: completion,
    unresolved,
    evidence_need: { required:false, reasons:[], queries:[] },
    external_action: task.external_action === true,
    hard_blockers: hardBlockers,
    parser_metadata: { proposition_id: task.proposition_id || null, status: task.status || null, intent_type: intent, execution_order: Number(task.execution_order || index + 1), original_action: task.action || null }
  };
}

function parserConflict(item, index) {
  if (typeof item === 'string') return { type:'PARSER_CONTRADICTION', note:item, parser_index:index };
  return { type:String(item?.type || item?.code || 'PARSER_CONTRADICTION'), note:JSON.stringify(item), parser_index:index };
}

function requestFromParser(fastRequest, parserResult, originalText, lang) {
  const parserTasks = objectList(parserResult.task_graph?.tasks);
  const tasks = parserTasks.map((task,index) => parserTaskToAstera(task, originalText, parserResult, index, lang));
  const dependencies = [];
  for (const task of tasks) for (const dependency of task.depends_on) dependencies.push({ from:dependency, to:task.id, type:'PARSER_DEPENDENCY', reason:'parser_task_graph' });
  for (const edge of objectList(parserResult.task_graph?.edges)) {
    const from = String(edge?.source || ''); const to = String(edge?.target || '');
    if (from && to && !dependencies.some((item)=>item.from===from&&item.to===to)) dependencies.push({ from, to, type:String(edge?.relation || 'PARSER_EDGE'), reason:'parser_task_graph_edge' });
  }
  const graphConstraints = objectList(parserResult.task_graph?.constraints);
  const globalByType = (type) => unique(graphConstraints.filter((item)=>item?.constraint_type===type).map((item)=>String(item.value||'')).filter(Boolean));
  const preserve = unique([...tasks.flatMap((task)=>task.preserve), ...globalByType('preserve')]);
  const prohibitions = unique([...tasks.flatMap((task)=>task.prohibitions), ...globalByType('prohibition')]);
  const replace = unique(tasks.flatMap((task)=>task.replace));
  const constraints = unique([...tasks.flatMap((task)=>task.constraints), ...graphConstraints.map((item)=>`${item.constraint_type}:${item.value}`)]);
  const completion = unique(tasks.flatMap((task)=>task.completion_criteria));
  const verification = unique(tasks.flatMap((task)=>task.verification));
  const unresolved = unique([
    ...tasks.flatMap((task)=>task.unresolved.map((item)=>`${task.id}:${item}`)),
    ...objectList(parserResult.meaning_graph?.unresolved).map((item,index)=>`meaning_unresolved:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.ambiguities).map((item,index)=>`ambiguity:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.missing_information).map((item,index)=>`missing_information:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.unsupported_elements).map((item,index)=>`unsupported:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.timeouts).map((item,index)=>`timeout:${index}:${JSON.stringify(item)}`),
    ...(parserResult.overall_status !== 'COMPLETE' ? [`parser_overall_status:${parserResult.overall_status}`] : []),
    ...(!tasks.length ? ['parser_task_graph_empty'] : [])
  ]);
  const conflicts = objectList(parserResult.contradictions).map(parserConflict);
  if (parserResult.execution_allowed === false) conflicts.push({ type:'PARSER_ACTION_GUARD_BLOCKED', note:join(parserResult.blocked_reasons || [], 'execution_allowed=false') });
  const hardBlockers = parserResult.execution_allowed === false ? unique(['PARSER_ACTION_GUARD_BLOCKED', ...(parserResult.blocked_reasons || [])]) : [];
  const executionWaves = buildExecutionWaves(tasks, dependencies);
  const packet = {
    schema_version:'astera.analysis-task-packet.v1',
    intent:tasks[0]?.action || fastRequest.action || 'analyze', tasks, dependencies, execution_waves:executionWaves,
    constraints, prohibitions, preserve, replace, verification, completion_criteria:completion,
    unresolved, conflicts, hard_blockers:hardBlockers,
    source_spans:tasks.map((task)=>({ task_id:task.id, ...task.source_span }))
  };
  return {
    ...fastRequest,
    schema_version:'astera.request-model.v2',
    target:tasks[0]?.target || fastRequest.target,
    action:tasks[0]?.action || fastRequest.action,
    objective:tasks[0]?.objective || fastRequest.objective,
    success_criteria:completion,
    constraints, prohibitions, preserve, replace, verification,
    analysis_task_packet:packet,
    instruction_understanding:{
      mode:'DEEP_PATH', parser:'Deterministic-Japanese-Parser-MCP', overall_status:parserResult.overall_status,
      analysis_path:parserResult.analysis_path, execution_allowed:parserResult.execution_allowed,
      blocked_reasons:parserResult.blocked_reasons || [], semantic_hash:parserResult.meaning_graph?.semantic_hash || null,
      meaning_graph_version:parserResult.meaning_graph?.graph_version || null, task_graph_version:parserResult.task_graph?.graph_version || null,
      versions:parserResult.versions || {}, metrics:parserResult.metrics || {}, transport:parserResult.astera_mcp_transport || null
    }
  };
}

function degradedRequest(fastRequest, error) {
  const code = String(error?.code || 'PARSER_UNAVAILABLE');
  const note = `${code}:${String(error?.message || 'Japanese Parser MCP unavailable').slice(0,500)}`;
  const packet = fastRequest.analysis_task_packet;
  const tasks = packet.tasks.map((task)=>({
    ...task,
    hard_blockers: unique([...(task.hard_blockers || []), ...(isExternalActionHint(task.source_span?.text || '', {analysis_task_packet:{tasks:[task]}}) ? ['JAPANESE_PARSER_DEGRADED'] : [])]),
    unresolved: unique([...(task.unresolved || []), 'japanese_parser_degraded'])
  }));
  return {
    ...fastRequest,
    analysis_task_packet:{
      ...packet, tasks,
      unresolved:unique([...(packet.unresolved || []), `JAPANESE_PARSER_DEGRADED:${code}`]),
      conflicts:[...(packet.conflicts || []), { type:'JAPANESE_PARSER_DEGRADED', note }],
      hard_blockers:unique([...(packet.hard_blockers || []), 'JAPANESE_PARSER_DEGRADED'])
    },
    instruction_understanding:{ mode:'DEGRADED', parser:'Deterministic-Japanese-Parser-MCP', execution_allowed:false, blocked_reasons:['JAPANESE_PARSER_DEGRADED', code], error_code:code }
  };
}

function taskRouteText(task) {
  return unique([task.target || '', ...(task.premises || []), task.source_span?.text || '']).join('\n');
}

function evidenceRefsFromFacts(facts) {
  const refs=[]; for(const item of facts.confirmed||[]) for(const evidence of item.evidence||[]) refs.push(evidence);
  return [...new Map(refs.map((item)=>[item.id||item.url||JSON.stringify(item),item])).values()];
}

function aggregateTaskResults(taskResults) {
  const facts={ pillar:'fact', confirmed:taskResults.flatMap((r)=>(r.facts.confirmed||[]).map((x)=>({task_id:r.task.id,...x}))), unconfirmed:taskResults.flatMap((r)=>(r.facts.unconfirmed||[]).map((x)=>({task_id:r.task.id,...x}))), opinions:taskResults.flatMap((r)=>(r.facts.opinions||[]).map((x)=>({task_id:r.task.id,...x}))), not_applicable:taskResults.flatMap((r)=>(r.facts.not_applicable||[]).map((x)=>({task_id:r.task.id,...x}))), evidence_need:taskResults.flatMap((r)=>(r.facts.evidence_need||[]).map((x)=>({task_id:r.task.id,...x}))), evidence_state:taskResults.length===1?taskResults[0].facts.evidence_state:{state:'PER_TASK',per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,r.facts.evidence_state]))}, per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,r.facts])) };
  const allRisks=taskResults.flatMap((r)=>(r.risks.risks||[]).map((x)=>({task_id:r.task.id,...x}))).sort((a,b)=>b.weight-a.weight||a.key.localeCompare(b.key));
  const riskWeight=allRisks.reduce((sum,item)=>sum+Number(item.weight||0),0);
  const risks={ pillar:'risk',risk_count:allRisks.length,risks:allRisks,highest:allRisks[0]||null,level:riskWeight>=55?'high':riskWeight>=20?'medium':'low',safety_gates:unique(taskResults.flatMap((r)=>r.risks.safety_gates||[])),domain_checks:taskResults.flatMap((r)=>r.risks.domain_checks||[]),per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,r.risks])) };
  const inquiry={ pillar:'inquiry',problem_health:{healthy:taskResults.every((r)=>r.inquiry.problem_health?.healthy),reason:join(taskResults.filter((r)=>!r.inquiry.problem_health?.healthy).map((r)=>`${r.task.id}:${r.inquiry.problem_health?.reason}`),'全Taskの前提条件は追跡可能')},missing_fields:unique(taskResults.flatMap((r)=>(r.inquiry.missing_fields||[]).map((x)=>`${r.task.id}:${x}`))),missing_questions:unique(taskResults.flatMap((r)=>r.inquiry.missing_questions||[])),per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,r.inquiry])) };
  const multi={ pillar:'multi',per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,r.multi])),perspectives:taskResults.flatMap((r)=>(r.multi.perspectives||[]).map((x)=>({task_id:r.task.id,...x}))),recommended:taskResults.map((r)=>`${r.task.id}:${r.multi.recommended}`).join(' / ') };
  const dialectic={ pillar:'dialectic',engine:'Astera Deterministic Dialectic',mode:'decision_materials',per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,r.dialectic])),candidates:taskResults.flatMap((r)=>(r.dialectic.candidates||[]).map((x)=>({task_id:r.task.id,...x}))),selected:taskResults.length===1?taskResults[0].dialectic.selected:null,bad_hand_lessons:unique(taskResults.flatMap((r)=>r.dialectic.bad_hand_lessons||[])) };
  const taskComparisons=taskResults.map((r)=>({task_id:r.task.id,...r.comparison}));
  const bottleneck=[...taskComparisons].sort((a,b)=>a.score-b.score||a.task_id.localeCompare(b.task_id))[0]||null;
  const decisions=taskComparisons.map((c)=>c.verdict?.decision).filter(Boolean);
  const globalDecision=decisions.includes('hold_and_clarify')?'hold_and_clarify':decisions.includes('recommend_with_caution')?'recommend_with_caution':'recommend';
  const comparison={ pillar:'compare',score:bottleneck?.score||0,answer_line_distance:100-(bottleneck?.score||0),score_model:{aggregation:'MIN_TASK_SCORE_BOTTLENECK',reason:'弱いTaskを平均値で隠さず、多重Task全体を最弱成立TaskでGateする。'},score_breakdown:taskComparisons.map((c)=>({task_id:c.task_id,score:c.score,decision:c.verdict?.decision,breakdown:c.score_breakdown})),contradictions:taskComparisons.flatMap((c)=>(c.contradictions||[]).map((x)=>({task_id:c.task_id,...x}))),selected_candidate:bottleneck?.selected_candidate?{task_id:bottleneck.task_id,...bottleneck.selected_candidate}:null,candidate_ranking:taskComparisons.flatMap((c)=>(c.candidate_ranking||[]).map((x)=>({task_id:c.task_id,...x}))),rejected_candidates:taskComparisons.flatMap((c)=>(c.rejected_candidates||[]).map((x)=>({task_id:c.task_id,...x}))),uncertainty:{per_task:Object.fromEntries(taskComparisons.map((c)=>[c.task_id,c.uncertainty||{}])),bottleneck_task_id:bottleneck?.task_id||null},per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,r.comparison])),verdict:{decision:globalDecision,angle:bottleneck?.verdict?.angle||'task_graph',reason:`全TaskをMIN_TASK_SCORE_BOTTLENECKで統合。bottleneck=${bottleneck?.task_id||'-'} score=${bottleneck?.score||0}。`,objective:'Analysis Task Graph全体をHard Constraint・Dependency・Evidence Gate付きで成立させる。'} };
  return {facts,risks,inquiry,multi,dialectic,comparison};
}

class KaguraEngine {
  constructor({ poolSize=4, logger=new Logger(), japaneseParserClient=undefined, japaneseParserOptions={} }={}) {
    this.pool=new WorkerPool(poolSize); this.logger=logger;
    this.japaneseParserClient = japaneseParserClient === undefined ? new JapaneseParserMCPClient(japaneseParserOptions) : japaneseParserClient;
  }

  async prepareRequest(input={}) {
    const question=String(input.question||'');
    const context=String(input.context||'');
    const fast=analyzeRequest({question,context});
    fast.instruction_understanding={mode:'FAST_PATH',parser:null,execution_allowed:true,blocked_reasons:[]};
    if (!needsJapaneseParser(question, fast)) return fast;
    if (!this.japaneseParserClient || typeof this.japaneseParserClient.analyze !== 'function') return degradedRequest(fast,{code:'PARSER_CLIENT_NOT_CONFIGURED',message:'Japanese Parser MCP client is not configured.'});
    try {
      const parserResult=await this.japaneseParserClient.analyze({
        originalText:question,
        conversationContext:context ? [context] : [],
        executionMode:isExternalActionHint(question,fast)?'external_action':'analysis',
        runDeepAnalysis:true,
        deadlineMs:50
      });
      return requestFromParser(fast,parserResult,question,langOf(input,question));
    } catch(error) {
      this.logger.write({tenantId:'system',type:'japanese_parser_degraded',severity:'warn',text:'Deterministic Japanese Parser MCP unavailable or invalid; fail-closed degraded analysis used.',payload:{error_code:error?.code||'PARSER_ERROR'}});
      return degradedRequest(fast,error);
    }
  }

  async process(input={}, tenant={id:'unknown'}) {
    const question=String(input.question||'').trim(); const context=String(input.context||'').trim(); const lang=langOf(input,question);
    if (!question) return {result:{type:'clarification_needed',questions:[lang==='ja'?'質問本文を入力してください。':'Please provide the request body.']},material:this.clarify([],lang),prompt:'',runtime:{ai_used:false,llm_called:false}};
    const request=input.preparedRequest?.analysis_task_packet ? input.preparedRequest : await this.prepareRequest({question,context,language:input.language,output_language:input.output_language});
    const packet=request.analysis_task_packet;
    if (!packet.tasks.length) return {result:{type:'clarification_needed',request_model:request,questions:[lang==='ja'?'Analysis Taskを確定できません。Parserの未解決・Conflict・不足条件を確認してください。':'Analysis tasks could not be resolved.']},material:this.clarify([],lang),prompt:'',runtime:{ai_used:false,llm_called:false,instruction_mode:request.instruction_understanding?.mode||'UNKNOWN'}};

    const tasks=packet.tasks.map((baseTask)=>{const domain=routeDomainTemplates({question:taskRouteText(baseTask),context});return {...baseTask,evidence_need:deriveEvidenceNeed(baseTask,domain),domain};});
    request.analysis_task_packet={...packet,tasks,execution_waves:packet.execution_waves?.length?packet.execution_waves:buildExecutionWaves(tasks,packet.dependencies||[])};
    const taskEvidence=input.taskEvidencePackets||input.task_evidence_packets||{}; const globalEvidence=input.evidencePacket||input.evidence_packet||null;
    const completed=new Map(); const taskById=new Map(tasks.map((task)=>[task.id,task]));

    for (const wave of request.analysis_task_packet.execution_waves) {
      const runnable=wave.map((id)=>taskById.get(id)).filter(Boolean);
      const waveResults=await Promise.all(runnable.map(async(task)=>{
        let evidenceRaw=task.evidence_need.required?(taskEvidence[task.id]||(tasks.length===1?globalEvidence:null)):notRequiredEvidence(task.id);
        if(!evidenceRaw&&globalEvidence&&tasks.length>1&&input.allow_shared_legacy_evidence===true)evidenceRaw=globalEvidence;
        const evidence=normalizeEvidencePacket(evidenceRaw);
        const dependencyState=Object.fromEntries((task.depends_on||[]).map((id)=>[id,completed.get(id)?.comparison?.verdict||{decision:'missing'}]));
        const pre=await this.pool.exec('inquiry',{mode:'preflight',question:task.source_span.text,human_text:question,moodAnswers:input.moodAnswers||{},domain:task.domain,task,evidence_packet:evidenceRaw});
        const [facts,risks,inquiry]=await Promise.all([
          this.pool.exec('fact',{question:task.source_span.text,domain:task.domain,task,evidence_packet:evidenceRaw}),
          this.pool.exec('risk',{question:task.source_span.text,domain:task.domain,task,evidence_packet:evidenceRaw}),
          this.pool.exec('inquiry',{mode:'analysis',question:task.source_span.text,human_text:question,moodAnswers:input.moodAnswers||{},domain:task.domain,task,evidence_packet:evidenceRaw})
        ]);
        const multi=await this.pool.exec('multi',{question:task.source_span.text,facts,risks,inquiry,domain:task.domain,task,evidence_packet:evidenceRaw});
        const dialectic=await this.pool.exec('dialectic',{question:task.source_span.text,facts,risks,inquiry,multi,domain:task.domain,task,evidence_packet:evidenceRaw,mood:pre.mood,human:inquiry.human_reading||pre.human_reading||{}});
        const comparison=await this.pool.exec('compare',{question:task.source_span.text,facts,risks,multi,inquiry,dialectic,domain:task.domain,task,evidence_packet:evidenceRaw,mood:pre.mood,dependency_state:dependencyState});
        return {task,evidence,preflight:pre,facts,risks,inquiry,multi,dialectic,comparison};
      }));
      for(const result of waveResults)completed.set(result.task.id,result);
    }

    const taskResults=tasks.map((task)=>completed.get(task.id)).filter(Boolean); const aggregate=aggregateTaskResults(taskResults);
    const judgment=this.frame({request,context,taskResults,aggregate,lang}); const material=this.material(judgment);
    const fiveStage={schema_version:'astera.five-stage.v1',order:[...FIVE_STAGE],execution_waves:request.analysis_task_packet.execution_waves,tasks:taskResults.map((r)=>({task_id:r.task.id,lens_id:r.task.domain.primary?.id||null,evidence_state:r.evidence.state,evidence_quality:{score_bp:r.evidence.quality_score_bp,gate_bp:r.evidence.quality_gate_bp,authorities:r.evidence.distinct_authority_count||0,source_families:r.evidence.distinct_source_family_count||0,reinforcement:r.evidence.reinforcement_attempt_count||0,corroboration:r.evidence.new_corroboration_count||0},fact:r.facts,risk:r.risks,multi:r.multi,inquiry:r.inquiry,compare:r.comparison,dialectic:r.dialectic}))};
    const result={type:'cognitive_map',mode:'deterministic_multi_parallel_decision_materials',non_ai:true,request_model:request,analysis_task_packet:request.analysis_task_packet,five_stage:fiveStage,task_results:taskResults.map((r)=>({task:r.task,evidence:r.evidence,preflight:r.preflight,facts:r.facts,risks:r.risks,inquiry:r.inquiry,multi:r.multi,dialectic:r.dialectic,comparison:r.comparison})),facts:aggregate.facts,risks:aggregate.risks,multi:aggregate.multi,inquiry:aggregate.inquiry,hyperion:{engine:'Astera Deterministic Dialectic',mode:'decision_materials',dialectic:aggregate.dialectic},comparison:aggregate.comparison,judgment};
    this.logger.write({tenantId:tenant.id,type:'process_completed',text:`Decision graph completed: ${aggregate.comparison.verdict.decision}`,payload:{task_count:tasks.length,wave_count:request.analysis_task_packet.execution_waves.length,bottleneck_score:aggregate.comparison.score,decision:aggregate.comparison.verdict.decision,instruction_mode:request.instruction_understanding?.mode||'UNKNOWN',non_ai:true}});
    return {result,material,prompt:this.externalBrief(judgment),runtime:{ai_used:false,llm_called:false,engine:'v8_deterministic_rules',instruction_mode:request.instruction_understanding?.mode||'UNKNOWN',task_count:tasks.length,wave_count:request.analysis_task_packet.execution_waves.length}};
  }

  frame({request,context,taskResults,aggregate,lang}) {
    const labels=LABELS[lang]; const packet=request.analysis_task_packet; const taskIds=taskResults.map((r)=>r.task.id); const lensIds=unique(taskResults.map((r)=>r.task.domain.primary?.id).filter(Boolean)); const sourceSpans=packet.source_spans||[];
    const allConstraints=unique([...(packet.constraints||[]),...(packet.prohibitions||[]),...(packet.preserve||[])]); const evidenceRefs=evidenceRefsFromFacts(aggregate.facts);
    const factsUsed=(aggregate.facts.confirmed||[]).map((x)=>`${x.task_id}:${x.text}`); const risksUsed=(aggregate.risks.risks||[]).slice(0,16).map((x)=>`${x.task_id}:${x.key}`); const candidatesCompared=(aggregate.comparison.candidate_ranking||[]).map((x)=>`${x.task_id}:${x.id}:${x.score}`); const rejectedReasons=(aggregate.comparison.rejected_candidates||[]).map((x)=>`${x.task_id}:${x.id}:${x.reason}`);
    const blockers=unique([...(packet.hard_blockers||[]),...(packet.unresolved||[]),...(packet.conflicts||[]).map((x)=>x.type),...(aggregate.comparison.contradictions||[]).map((x)=>`${x.task_id}:${x.key}`),...taskResults.flatMap((r)=>r.task.hard_blockers||[]),...taskResults.filter((r)=>r.comparison.verdict.decision==='hold_and_clarify').map((r)=>`${r.task.id}:hold_and_clarify`)]);
    const trace=(ruleIds,extra={})=>({trace_schema:'astera.decision-trace.v1',rule_ids:ruleIds,task_ids:taskIds,lens_ids:lensIds,evidence_refs:evidenceRefs,facts_used:factsUsed,constraints_used:allConstraints,risks_used:risksUsed,candidates_compared:candidatesCompared,rejected_reasons:rejectedReasons,score_breakdown:aggregate.comparison.score_breakdown||[],uncertainty:aggregate.comparison.uncertainty||{},blocking_conditions:blockers,source_spans:sourceSpans,instruction_understanding:request.instruction_understanding||null,...extra});

    const purposeItems=taskResults.map((r)=>`${r.task.id}[${r.task.action}] ${r.task.objective}`);
    const premiseItems=unique([...(packet.unresolved||[]).map((x)=>`unresolved=${x}`),...(packet.conflicts||[]).map((x)=>`conflict=${x.type}:${x.note}`),...(packet.hard_blockers||[]).map((x)=>`hard_blocker=${x}`),...aggregate.inquiry.missing_fields.map((x)=>`missing=${x}`),...allConstraints.map((x)=>`hard_constraint=${x}`),...(context?[`context_length=${context.length}`]:[])]);
    const factItems=unique([...(aggregate.facts.confirmed||[]).map((x)=>`${x.task_id}:SUPPORTED:${x.text}`),...(aggregate.facts.unconfirmed||[]).map((x)=>`${x.task_id}:${x.status}:${x.text}`),...(aggregate.facts.opinions||[]).map((x)=>`${x.task_id}:OPINION:${x.text}`)]);
    const riskItems=(aggregate.risks.risks||[]).map((x)=>`${x.task_id}:${x.key}[${x.weight}] ${x.impact}`);
    const oppositionItems=taskResults.map((r)=>{const op=(r.comparison.candidate_ranking||[]).find((x)=>x.id==='opposition')||(r.dialectic.candidates||[]).find((x)=>x.id==='opposition');return op?`${r.task.id}:${op.thesis}`:`${r.task.id}:反対候補なし`;});
    const comparisonItems=taskResults.map((r)=>`${r.task.id}: ${join((r.comparison.candidate_ranking||[]).filter((x)=>x.id!=='bad_hand').slice(0,4).map((x)=>`${x.label}=${x.score}`))} / decision=${r.comparison.verdict.decision}`);
    const recommendationItems=taskResults.map((r)=>`${r.task.id}: ${r.comparison.selected_candidate?.label||'選択なし'} / ${r.comparison.verdict.reason}`);
    const reinstructionItems=unique([`Task Wave順を保持: ${packet.execution_waves.map((wave,i)=>`W${i+1}[${wave.join(',')}]`).join(' -> ')}`,...packet.prohibitions.map((x)=>`禁止条件を破らない: ${x}`),...packet.preserve.map((x)=>`維持条件を保持: ${x}`),...taskResults.map((r)=>`${r.task.id}はLens=${r.task.domain.primary?.id||'UNRESOLVED'}、Evidence=${r.evidence.state}/${r.evidence.quality_score_bp??'-'}bp、corroboration=${r.evidence.new_corroboration_count||0}、decision=${r.comparison.verdict.decision}を維持して処理する。`),...(aggregate.facts.unconfirmed.length?['未確認Factを確認済みFactへ昇格しない。']:[]),...(blockers.length?[`Blocking条件を解消せず最終確定しない: ${blockers.join(' / ')}`]:[])]);
    const sections={
      '01_purpose':{summary:join(purposeItems),items:purposeItems,decision_basis:trace(['MAIN8-01-TASK-GRAPH-OBJECTIVE'],{derivation:'Parser/Fast PathのAnalysis Task objectiveを依存とSource Spanを保持して統合する。'})},
      '02_premise':{summary:premiseItems.length?join(premiseItems):(lang==='en'?'No unresolved premise or hard-constraint gap.':'未解決の前提不足・Hard Constraint競合は検出されていない。'),items:premiseItems,decision_basis:trace(['MAIN8-02-UNRESOLVED-CONFLICT-HARD-GATE'],{derivation:'Parser unresolved/conflicts/Guard/Inquiry/Hard Constraintを列挙し、推測補完しない。'})},
      '03_facts':{summary:lang==='en'?`supported=${aggregate.facts.confirmed.length}, unresolved=${aggregate.facts.unconfirmed.length}, opinions=${aggregate.facts.opinions.length}`:`根拠支持${aggregate.facts.confirmed.length}件 / 未確認${aggregate.facts.unconfirmed.length}件 / 意見${aggregate.facts.opinions.length}件`,items:factItems,confirmed:aggregate.facts.confirmed,unconfirmed:aggregate.facts.unconfirmed,opinions:aggregate.facts.opinions,decision_basis:trace(['MAIN8-03-EVIDENCE-GATED-FACT'],{derivation:'Evidence Gate通過命題だけSUPPORTED、それ以外は未確認/意見に保持する。'})},
      '04_crisis':{summary:aggregate.risks.highest?`${aggregate.risks.level}: ${aggregate.risks.highest.task_id}:${aggregate.risks.highest.impact}`:(lang==='en'?'No material risk detected.':'重大Riskは検出されていない。'),items:riskItems,highest:aggregate.risks.highest,risks:aggregate.risks.risks,decision_basis:trace(['MAIN8-04-RISK-WEIGHT-HARD-GATE'],{derivation:'Task別Risk Rule・Parser Guard・禁止条件をHard Gateとして統合する。'})},
      '05_opposition':{summary:join(oppositionItems),items:oppositionItems,decision_basis:trace(['MAIN8-05-DIALECTIC-OPPOSITION'],{derivation:'各Taskで同一Metricから生成したopposition候補を保持する。'})},
      '06_comparison':{summary:`global=${aggregate.comparison.score} / decision=${aggregate.comparison.verdict.decision} / ${join(comparisonItems)}`,items:comparisonItems,selected_candidate:aggregate.comparison.selected_candidate,candidate_ranking:aggregate.comparison.candidate_ranking,rejected_candidates:aggregate.comparison.rejected_candidates,decision_basis:trace(['MAIN8-06-WEIGHTED-CANDIDATE-COMPARE','MAIN8-06-MIN-TASK-BOTTLENECK'],{derivation:'Task内は同一5Metric加重Score、Task間は最弱TaskをBottleneckとして弱点を平均で隠さない。'})},
      '07_recommendation':{summary:`${aggregate.comparison.verdict.decision}: ${join(recommendationItems)}`,items:recommendationItems,decision:aggregate.comparison.verdict.decision,decision_basis:trace(['MAIN8-07-NON-BAD-HAND-SELECTION','MAIN8-07-EVIDENCE-CONSTRAINT-DEPENDENCY-GUARD'],{derivation:'悪手を除外し、Evidence/Hard Constraint/Dependency/Parser Guard/Risk GateでTask別推奨と全体Decisionを確定する。'})},
      '08_reinstruction':{summary:join(reinstructionItems),items:reinstructionItems,decision_basis:trace(['MAIN8-08-LOSSLESS-REINSTRUCTION'],{derivation:'Task順序・禁止・維持・Parser状態・Evidence品質・未確認・Blocking条件を失わず外部Consumerへ再指示する。'})}
    };
    ORDER.forEach((key,i)=>{sections[key]={canonical_label:CANON[i],label:labels[i],...sections[key]};});
    return {format:'astera_judgment_v4',canonical_language:'en',output_language:lang,order:[...ORDER],non_ai:true,instruction_understanding:request.instruction_understanding||null,task_graph:{task_count:taskResults.length,dependencies:packet.dependencies,execution_waves:packet.execution_waves,hard_blockers:packet.hard_blockers||[]},lens_routing:{per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,{primary:r.task.domain.primary||null,secondary:r.task.domain.secondary||[],overlays:r.task.domain.overlays||[],classification_basis:r.task.domain.classification_basis,confidence:r.task.domain.confidence}]))},evidence_state:{per_task:Object.fromEntries(taskResults.map((r)=>[r.task.id,{required:r.task.evidence_need.required,state:r.evidence.state,source_status:r.evidence.source_status,quality_score_bp:r.evidence.quality_score_bp,quality_gate_bp:r.evidence.quality_gate_bp,coverage_state:r.evidence.coverage_state,conflict_detected:r.evidence.conflict_detected,authorities:r.evidence.distinct_authority_count||0,source_families:r.evidence.distinct_source_family_count||0,reinforcement:r.evidence.reinforcement_attempt_count||0,corroboration:r.evidence.new_corroboration_count||0}]))},...sections};
  }

  material(judgment) {
    const sections=ORDER.map((k)=>judgment[k]); const compact_text=sections.map((s)=>`${s.label}: ${line(s.summary)}`).join('\n'); const heads=judgment.output_language==='en'?{one:'Decision Material',basis:'Decision Basis',pass:'Material for External Consumer'}:{one:'判断材料',basis:'判断基準',pass:'主役AIへ渡す内容'};
    const text=sections.map((s)=>{const basis=s.decision_basis||{};const basisLines=[`rules=${join(basis.rule_ids)}`,`tasks=${join(basis.task_ids)}`,`lenses=${join(basis.lens_ids)}`,`instruction_mode=${basis.instruction_understanding?.mode||'UNKNOWN'}`,`semantic_hash=${basis.instruction_understanding?.semantic_hash||'none'}`,`evidence_refs=${(basis.evidence_refs||[]).length}`,`blockers=${join(basis.blocking_conditions,'none')}`,`derivation=${line(basis.derivation)}`];return `${s.label}\n${heads.one}\n${line(s.summary)}\n${heads.basis}\n${basisLines.map((x)=>`- ${x}`).join('\n')}\n${heads.pass}\n${s.items?.length?s.items.map((x)=>`- ${line(x)}`).join('\n'):`- ${line(s.summary)}`}`;}).join('\n---\n');
    return {mode:'judgment_material',target:'user_ai',raw_policy:'do_not_pass_raw_by_default',non_ai:true,format:judgment.format,text,compact_text,sections};
  }

  externalBrief(judgment) { return ['# Astera v8 Deterministic Decision Materials',`Instruction=${judgment.instruction_understanding?.mode||'UNKNOWN'} / TaskGraph=${judgment.task_graph.task_count} / waves=${judgment.task_graph.execution_waves.length}`,...ORDER.flatMap((k)=>{const s=judgment[k];return [`${s.canonical_label}: ${line(s.summary)}`,`  basis=${join(s.decision_basis?.rule_ids)}; blockers=${join(s.decision_basis?.blocking_conditions,'none')}`];}),'Consumer rule: preserve task order, hard constraints, parser/guard state, evidence state, and unresolved claims. Never infer missing facts.'].join('\n'); }
  clarify(questions,lang='ja') { const label=lang==='en'?'Clarification required':'前提確認が必要です'; const sub=lang==='en'?'Items to confirm':'確認したいこと'; const qs=(questions||[]).length?questions:[lang==='en'?'What is the target, action, and completion condition?':'対象・行為・完了条件は何ですか？']; return {mode:'clarification',target:'user_ai',raw_policy:'do_not_pass_raw_by_default',non_ai:true,text:`${label}\n${sub}\n${qs.map((x)=>`- ${line(x)}`).join('\n')}`,compact_text:`${label}: ${join(qs)}`,sections:[]}; }
  async destroy(){await this.pool.destroy(); if(this.japaneseParserClient&&typeof this.japaneseParserClient.destroy==='function')await this.japaneseParserClient.destroy();}
}

module.exports=KaguraEngine;