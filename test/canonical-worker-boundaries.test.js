'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const CanonicalAsteraEngine=require('../src/canonical-astera-engine');
const legacyMulti=require('../src/pillars/multi-worker');
const legacyDialectic=require('../src/pillars/dialectic-worker');
const legacyCompare=require('../src/pillars/compare-worker');
const {buildCanonicalTaskPlan,evaluateCanonicalTaskPlan,projectFiveLanes,deterministicPerspectiveExpansion}=require('../src/canonical-claim-runtime');

const silentLogger={write(){}};
const tenant={id:'worker-boundary',is_global:true,plan:'admin'};
const baseTask={id:'T01',source_span:{start:0,end:25,text:'API compatibility is preserved.'},raw_text:'API compatibility is preserved.',target:'API compatibility',objective:'Verify API compatibility.',action:'verify',success_criteria:['preserve compatibility'],completion_criteria:[],constraints:['rollback'],prohibitions:[],preserve:[],premises:[],conditions:[],exceptions:[],depends_on:[],hard_blockers:[],evidence_need:{required:false}};

function notRequiredEvidence(){
  return{schema_version:'astera.evidence-search.result.v1',status:'NOT_REQUIRED',evidence:[],provider_execution:{initial:[],reinforcement:[]},quality:{final:{status:'NOT_REQUIRED',score_bp:null}},ai_used:false,payment_executed:false};
}

function canonicalFor(task,domain){
  const plan=buildCanonicalTaskPlan(task,domain);
  return{plan,canonical:evaluateCanonicalTaskPlan(plan,notRequiredEvidence())};
}

test('legacy Multi/Dialectic/Compare modules remain importable only as compatibility components',()=>{
  assert.equal(typeof legacyMulti.run,'function');
  assert.equal(typeof legacyDialectic.run,'function');
  assert.equal(typeof legacyCompare.run,'function');
});

test('Canonical five lanes are projected without legacy candidate scoring or selection',()=>{
  const task={...baseTask,evidence_need:{required:false}};
  const domain={primary:{id:'G29',multi_lens:['compatibility','rollback'],compare_lens:['scope','coverage']}};
  const {canonical}=canonicalFor(task,domain);
  const lanes=projectFiveLanes({task,canonical,domain});
  assert.equal(lanes.compare.material_only,true);
  assert.equal(lanes.compare.selected_candidate,null);
  assert.deepEqual(lanes.compare.candidate_ranking,[]);
  assert.deepEqual(lanes.compare.rejected_candidates,[]);
  assert.equal(Object.hasOwn(lanes.compare,'score'),false);
  assert.ok(lanes.multi.perspectives.length>=2);
});

test('Canonical deterministic lanes restore risk, inquiry, multi and compare material without restoring decision authority',()=>{
  const text='API tokenを本番deployで公開する。';
  const task={
    ...baseTask,
    source_span:{start:0,end:text.length,text},raw_text:text,target:'API token',objective:'API tokenの本番変更条件を検証する',action:'implement',
    success_criteria:[],completion_criteria:[],constraints:['rollback可能であること'],prohibitions:['secretを公開しない'],preserve:[],replace:['API token'],conditions:['検証成功時のみ実行'],exceptions:['互換性がない場合は停止'],hard_blockers:[]
  };
  const domain={primary:{id:'G29',risk_lens:['secret exposure','rollback failure'],multi_lens:['compatibility','rollback'],inquiry_lens:['Testと合格条件は何？'],compare_lens:['scope','coverage']}};
  const {canonical}=canonicalFor(task,domain);
  const lanes=projectFiveLanes({task,canonical,domain});

  assert.ok(lanes.risk.rule_ids.includes('RISK-SECURITY'));
  assert.ok(lanes.risk.rule_ids.includes('RISK-PRODUCTION'));
  assert.ok(lanes.risk.failure_conditions.length>=2);
  assert.ok(lanes.inquiry.missing_fields.includes('completion_criteria'));
  assert.ok(lanes.inquiry.missing_questions.some((item)=>/完了|合格条件/.test(item)));
  assert.ok(['forward','defensive','critical','counter'].every((id)=>lanes.multi.perspectives.some((item)=>item.id===id)));
  assert.ok(Array.isArray(lanes.compare.contradiction_map));
  assert.ok(lanes.compare.condition_differences.conditions.includes('検証成功時のみ実行'));
  assert.equal(Object.hasOwn(lanes.compare,'score'),false);
  assert.equal(lanes.compare.selected_candidate,null);
  assert.deepEqual(lanes.compare.candidate_ranking,[]);
  assert.deepEqual(lanes.compare.rejected_candidates,[]);
  assert.equal(lanes.compare.verdict.decision,'MATERIAL_ONLY');
});

test('Deterministic Perspective Expansion restores fixed five material classes with no scoring, ranking or selection',()=>{
  const task={...baseTask,conditions:['検証成功時のみ実行'],exceptions:['互換性がない場合は停止'],depends_on:['T00'],prohibitions:['mainは変更しない']};
  const domain={primary:{id:'G29',risk_lens:['rollback failure'],multi_lens:['compatibility'],compare_lens:['scope','coverage']}};
  const {canonical}=canonicalFor(task,domain);
  const first=deterministicPerspectiveExpansion({task,canonical,domain});
  const second=deterministicPerspectiveExpansion({task,canonical,domain});

  assert.deepEqual(first.policy.fixed_classes,['mainline','opposition','failure_reference','third_way','human_fit']);
  assert.deepEqual(first.perspectives.map((item)=>item.id),first.policy.fixed_classes);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  assert.equal(first.policy.ranking_allowed,false);
  assert.equal(first.policy.selection_allowed,false);
  assert.equal(first.policy.recommendation_allowed,false);
  assert.equal(first.policy.final_decision_allowed,false);
  assert.deepEqual(first.candidates,[]);
  assert.equal(first.selected,null);
  assert.deepEqual(first.rejected,[]);
  for(const item of first.perspectives){
    assert.equal(Object.hasOwn(item,'metrics'),false);
    assert.equal(Object.hasOwn(item,'score'),false);
    assert.ok(Array.isArray(item.conditions));
    assert.ok(Array.isArray(item.failure_conditions));
  }
});

test('Canonical Engine never exposes legacy scoring/selection even while compatibility workers exist',async()=>{
  const engine=new CanonicalAsteraEngine({poolSize:2,logger:silentLogger});
  try{
    const out=await engine.process({question:'API互換性を比較する。'},tenant);
    assert.equal(out.result.decision_authority,'EXTERNAL_ONLY');
    assert.equal(out.result.comparison.material_only,true);
    assert.equal(out.result.comparison.selected_candidate,null);
    assert.deepEqual(out.result.comparison.candidate_ranking,[]);
    assert.deepEqual(out.result.comparison.rejected_candidates,[]);
    assert.equal(Object.hasOwn(out.result.comparison,'score'),false);
    assert.equal(out.result.hyperion.mode,'MATERIAL_ONLY');
    assert.deepEqual(out.result.hyperion.candidates,[]);
    assert.equal(out.result.hyperion.selected,null);
    assert.deepEqual(out.result.hyperion.rejected,[]);
    assert.equal(out.result.judgment.order[6],'07_evidence_status');
    assert.equal(Object.hasOwn(out.result.judgment,'07_recommendation'),false);
  }finally{
    await engine.destroy();
  }
});
