'use strict';

const WorkerPool = require('./worker-pool');
const Logger = require('./logger');
const { routeDomainTemplates } = require('./domain-template-router');
const { analyzeRequest, normalizeEvidencePacket, unique } = require('./judgment-materials-analyzer');

const ORDER = ['01_purpose','02_premise','03_facts','04_crisis','05_opposition','06_comparison','07_recommendation','08_reinstruction'];
const LABELS = {
  ja: ['01 本当の目的','02 前提不足','03 事実確認','04 危機察知','05 反対視点','06 比較案','07 推奨判断','08 主役AIへの再指示'],
  en: ['01 True Objective','02 Missing Context','03 Fact Check','04 Risk Detection','05 Opposing View','06 Alternative Options','07 Recommendation','08 Re-instruction to Main AI']
};
const CANON = ['01 True Objective','02 Missing Context','03 Fact Check','04 Risk Detection','05 Opposing View','06 Alternative Options','07 Recommendation','08 Re-instruction to Main AI'];

const line = (v) => String(v ?? '-').replace(/\s+/g,' ').trim() || '-';
const join = (xs, fallback='-') => (xs||[]).map(line).filter(x=>x&&x!=='-').join(' / ') || fallback;
const langOf = (input,q) => /^(en|english)$/i.test(String(input.language||input.output_language||'')) ? 'en' : (/^(ja|jp|japanese)$/i.test(String(input.language||input.output_language||'')) ? 'ja' : (/[ぁ-んァ-ヶ一-龯]/.test(q)?'ja':'en'));

class KaguraEngine {
  constructor({ poolSize=4, logger=new Logger() }={}) { this.pool=new WorkerPool(poolSize); this.logger=logger; }

  async process(input={}, tenant={id:'unknown'}) {
    const question=String(input.question||'').trim();
    const context=String(input.context||'').trim();
    const lang=langOf(input,question);
    if (!question) return { result:{type:'clarification_needed',questions:[lang==='ja'?'質問本文を入力してください。':'Please provide the request body.']}, material:this.clarify([],lang), prompt:'' };

    const domain=routeDomainTemplates({question,context});
    const analysisQuestion=String(domain.analysis_text||question).trim();
    const request=analyzeRequest({question:domain.normalized?.core_request||question,context,domain});
    const evidence=normalizeEvidencePacket(input.evidencePacket||input.evidence_packet||null);
    const pre=await this.pool.exec('inquiry',{mode:'preflight',question:analysisQuestion,moodAnswers:input.moodAnswers||{},domain,task:request,evidence_packet:evidence});
    if (pre.clarification_needed) {
      const result={type:'clarification_needed',mode:pre.mood,human_reading:pre.human_reading,request_model:request,questions:pre.questions,rule:pre.rule};
      return {result,material:this.clarify(pre.questions,lang),prompt:''};
    }

    const [facts,risks,inquiry]=await Promise.all([
      this.pool.exec('fact',{question:analysisQuestion,domain,task:request,evidence_packet:evidence}),
      this.pool.exec('risk',{question:analysisQuestion,domain,task:request,evidence_packet:evidence}),
      this.pool.exec('inquiry',{mode:'analysis',question:analysisQuestion,moodAnswers:input.moodAnswers||{},domain,task:request,evidence_packet:evidence})
    ]);
    const multi=await this.pool.exec('multi',{question:analysisQuestion,facts,risks,inquiry,domain,task:request,evidence_packet:evidence});
    const dialectic=await this.pool.exec('dialectic',{question:analysisQuestion,facts,risks,inquiry,multi,domain,task:request,evidence_packet:evidence,mood:pre.mood,human:inquiry.human_reading||pre.human_reading||{}});
    const comparison=await this.pool.exec('compare',{question:analysisQuestion,facts,risks,multi,inquiry,dialectic,domain,task:request,evidence_packet:evidence,mood:pre.mood});
    const judgment=this.frame({request,context,facts,risks,inquiry,multi,dialectic,comparison,evidence,domain,lang});
    const material=this.material(judgment);
    const result={type:'cognitive_map',mode:'deterministic_decision_materials',non_ai:true,request_model:request,evidence_packet:evidence,mood:pre.mood,facts,risks,multi,inquiry,domain,hyperion:{engine:'Astera Deterministic Dialectic',mode:'decision_materials',human_reading:inquiry.human_reading||pre.human_reading||{},dialectic},comparison,judgment};
    this.logger.write({tenantId:tenant.id,type:'process_completed',text:`Decision materials completed: ${comparison.verdict?.decision||'unknown'}`,payload:{target:request.target,action:request.action,evidence_state:evidence.state,score:comparison.score,non_ai:true}});
    return {result,material,prompt:this.externalBrief(judgment),runtime:{ai_used:false,llm_called:false}};
  }

  frame({request,context,facts,risks,inquiry,multi,dialectic,comparison,evidence,domain,lang}) {
    const labels=LABELS[lang];
    const selected=comparison.selected_candidate;
    const opposition=(comparison.candidate_ranking||[]).find(x=>x.id==='opposition')||(dialectic.candidates||[]).find(x=>x.id==='opposition');
    const premise=unique([...(inquiry.missing_fields||[]).map(x=>`missing=${x}`),...(inquiry.missing_questions||[]).slice(0,4),...(request.constraints||[]).map(x=>`constraint=${x}`),context?`context_length=${context.length}`:'',`evidence=${evidence.state}`]);
    const factText = lang==='en'
      ? `supported=${facts.confirmed?.length||0}, unresolved=${facts.unconfirmed?.length||0}, opinions=${facts.opinions?.length||0}; ${line(facts.confirmed?.[0]?.text||facts.unconfirmed?.[0]?.text||'No factual claim extracted.')}`
      : `根拠支持${facts.confirmed?.length||0}件 / 未確認${facts.unconfirmed?.length||0}件 / 意見${facts.opinions?.length||0}件。${line(facts.confirmed?.[0]?.text||facts.unconfirmed?.[0]?.text||'Fact候補なし。')}`;
    const riskText = risks.highest ? `${risks.level}: ${line(risks.highest.impact||risks.highest.why)}` : (lang==='en'?'No material risk detected.':'重大Riskは検出されていない。');
    const comparisonText=(comparison.candidate_ranking||[]).slice(0,4).map(x=>`${x.label}=${x.score}`).join(' / ') || '-';
    const recommendation=selected ? `${selected.label}: ${selected.thesis}｜${comparison.verdict?.reason||selected.rationale||''}` : (lang==='en'?'No recommendation; resolve missing evidence/premises.':'推奨不能。前提またはEvidenceを補う。');
    const reinstruction=lang==='en'
      ? unique([`Stay aligned with the objective: ${request.objective}`,'Keep supported and unresolved claims separate; never promote unresolved claims to fact.',risks.highest?`Preserve the top risk: ${line(risks.highest.impact||risks.highest.why)}`:'Do not invent risks that were not detected.',...(request.constraints||[]).map(x=>`Preserve constraint: ${x}`),selected?`Start from ${selected.label} and retain rejection rationale for alternatives.`:'Resolve missing conditions first.'])
      : unique([`目的「${request.objective}」から逸れない。`,'確認済みと未確認を分離し、未確認を事実化しない。',risks.highest?`最上位Risk「${line(risks.highest.impact||risks.highest.why)}」を消さずに扱う。`:'検出されていないRiskを捏造しない。',...(request.constraints||[]).map(x=>`継続条件「${x}」を破らない。`),selected?`推奨は「${selected.label}」を起点にし、不採用案の理由を残す。`:'不足条件を先に解消する。']);

    const sections={
      '01_purpose':{summary:request.objective,target:request.target,action:request.action},
      '02_premise':{summary:premise.length?join(premise):(lang==='en'?'No material premise gap extracted.':'重大な前提不足は抽出されていない。'),items:premise,missing_questions:inquiry.missing_questions||[],success_criteria:request.success_criteria||[],constraints:request.constraints||[]},
      '03_facts':{summary:factText,evidence_to_collect:domain.primary?.evidence_to_collect||[],confirmed:facts.confirmed||[],unconfirmed:facts.unconfirmed||[],opinions:facts.opinions||[],evidence_need:facts.evidence_need||facts.evidence_gaps||[],warnings:facts.warnings||[]},
      '04_crisis':{summary:riskText,highest:risks.highest||null,risks:risks.risks||[],domain_checks:risks.domain_checks||[],safety_gates:risks.safety_gates||[]},
      '05_opposition':{summary:opposition?.thesis||(lang==='en'?'No valid opposing candidate.':'有効な反対候補なし。'),candidate:opposition||null,contradictions:comparison.contradictions||[],bad_hand_lessons:dialectic.bad_hand_lessons||[],domain_perspectives:domain.primary?.multi_lens||[]},
      '06_comparison':{summary:comparisonText,selected_candidate:selected||null,candidate_ranking:comparison.candidate_ranking||[],rejected_candidates:comparison.rejected_candidates||[],uncertainty:comparison.uncertainty||null,compare_lens:domain.primary?.compare_lens||[],domain_compare_lens:domain.primary?.compare_lens||[]},
      '07_recommendation':{summary:recommendation,decision:comparison.verdict?.decision||null,rationale:comparison.verdict?.reason||null,selected_candidate:selected||null},
      '08_reinstruction':{summary:join(reinstruction),items:reinstruction}
    };
    ORDER.forEach((key,i)=>{ sections[key]={canonical_label:CANON[i],label:labels[i],...sections[key]}; });
    return {format:'astera_judgment_v3',canonical_language:'en',output_language:lang,order:[...ORDER],domain_template:{router:domain.router||'auto_domain_template_v1',user_selection_required:false,primary:domain.primary||null,secondary:domain.secondary||[],overlays:domain.overlays||[],normalized:domain.normalized||null},evidence_state:{state:evidence.state,source_status:evidence.source_status,quality_score_bp:evidence.quality_score_bp,coverage_state:evidence.coverage_state,conflict_detected:evidence.conflict_detected},...sections};
  }

  material(judgment) {
    const sections=ORDER.map(k=>judgment[k]);
    const compact_text=sections.map(s=>`${s.label}: ${line(s.summary)}`).join('\n');
    const heads=judgment.output_language==='en'?{one:'One-Line Explanation',pass:'Material for External Consumer'}:{one:'一言説明',pass:'主役AIへ渡す内容'};
    const text=sections.map(s=>`${s.label}\n${heads.one}\n${line(s.summary)}\n${heads.pass}\n${s.items?.length?s.items.map(x=>`- ${line(x)}`).join('\n'):`- ${line(s.summary)}`}`).join('\n---\n');
    return {mode:'judgment_material',target:'user_ai',raw_policy:'do_not_pass_raw_by_default',non_ai:true,format:judgment.format,text,compact_text,sections};
  }

  externalBrief(judgment) { return ['# Astera v8 Decision Materials',`Evidence: ${judgment.evidence_state.state}`,...ORDER.map(k=>`${judgment[k].canonical_label}: ${line(judgment[k].summary)}`),'Consumer rule: unresolved claims remain unresolved.'].join('\n'); }

  clarify(questions,lang='ja') {
    const label=lang==='en'?'Clarification required':'前提確認が必要です';
    const sub=lang==='en'?'Items to confirm':'確認したいこと';
    const qs=(questions||[]).length?questions:[lang==='en'?'What is the target and success condition?':'対象と成功条件は何ですか？'];
    return {mode:'clarification',target:'user_ai',raw_policy:'do_not_pass_raw_by_default',non_ai:true,text:`${label}\n${sub}\n${qs.map(x=>`- ${line(x)}`).join('\n')}`,compact_text:`${label}: ${join(qs)}`,sections:[]};
  }

  async destroy(){ await this.pool.destroy(); }
}

module.exports=KaguraEngine;
