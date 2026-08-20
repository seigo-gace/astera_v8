'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const CanonicalAsteraEngine=require('../src/canonical-astera-engine');
const legacyMulti=require('../src/pillars/multi-worker');
const legacyDialectic=require('../src/pillars/dialectic-worker');
const legacyCompare=require('../src/pillars/compare-worker');
const {buildCanonicalTaskPlan,evaluateCanonicalTaskPlan,projectFiveLanes}=require('../src/canonical-claim-runtime');

const silentLogger={write(){}};
const tenant={id:'worker-boundary',is_global:true,plan:'admin'};
const baseTask={id:'T01',source_span:{start:0,end:25,text:'API compatibility is preserved.'},raw_text:'API compatibility is preserved.',target:'API compatibility',objective:'Verify API compatibility.',action:'verify',success_criteria:['preserve compatibility'],completion_criteria:[],constraints:['rollback'],prohibitions:[],preserve:[],premises:[],conditions:[],exceptions:[],depends_on:[],hard_blockers:[],evidence_need:{required:false}};

test('legacy Multi/Dialectic/Compare modules remain importable only as compatibility components',()=>{
  assert.equal(typeof legacyMulti.run,'function');
  assert.equal(typeof legacyDialectic.run,'function');
  assert.equal(typeof legacyCompare.run,'function');
});

test('Canonical five lanes are projected without legacy candidate scoring or selection',()=>{
  const task={...baseTask,evidence_need:{required:false}};
  const plan=buildCanonicalTaskPlan(task,{primary:{id:'G29',multi_lens:['compatibility','rollback'],compare_lens:['scope','coverage']}});
  const canonical=evaluateCanonicalTaskPlan(plan,{schema_version:'astera.evidence-search.result.v1',status:'NOT_REQUIRED',evidence:[],provider_execution:{initial:[],reinforcement:[]},quality:{final:{status:'NOT_REQUIRED',score_bp:null}},ai_used:false,payment_executed:false});
  const lanes=projectFiveLanes({task,canonical,domain:{primary:{id:'G29',multi_lens:['compatibility','rollback'],compare_lens:['scope','coverage']}}});
  assert.equal(lanes.compare.material_only,true);
  assert.equal(lanes.compare.selected_candidate,null);
  assert.deepEqual(lanes.compare.candidate_ranking,[]);
  assert.deepEqual(lanes.compare.rejected_candidates,[]);
  assert.equal(Object.hasOwn(lanes.compare,'score'),false);
  assert.ok(lanes.multi.perspectives.length>=2);
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
