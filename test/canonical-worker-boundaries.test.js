'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const multi=require('../src/pillars/multi-worker');
const dialectic=require('../src/pillars/dialectic-worker');
const compare=require('../src/pillars/compare-worker');

const baseTask={id:'T01',source_span:{text:'Verify API compatibility.'},target:'API compatibility',objective:'Verify API compatibility.',success_criteria:['preserve compatibility'],constraints:['rollback'],prohibitions:[],preserve:[],depends_on:[],hard_blockers:[],evidence_need:{required:false}};
const evidence={state:'NOT_REQUIRED',source_status:'NOT_REQUIRED',quality_score_bp:null,quality_gate_bp:9500,coverage_state:'NOT_REQUIRED',distinct_authority_count:0,distinct_source_family_count:0,reinforcement_attempt_count:0,new_corroboration_count:0,eligibility_reasons:[],role_counts:{},conflict_detected:false};

test('Multi exposes perspectives and tradeoffs only',async()=>{
 const out=await multi.run({task:baseTask,facts:{confirmed:[{text:'x'}],unconfirmed:[]},risks:{risk_count:0,risks:[],safety_gates:[]},inquiry:{missing_questions:[],problem_health:{healthy:true}},domain:{},evidence_packet:evidence});
 assert.ok(out.perspectives.length>=3);
 for(const key of ['recommended','selected','selected_perspective','ranking','candidate_ranking']) assert.equal(key in out,false,key);
});

test('Dialectic emits fixed canonical candidate order with raw metrics only',async()=>{
 const out=await dialectic.run({task:baseTask,facts:{confirmed:[],unconfirmed:[]},risks:{risk_count:0,risks:[]},inquiry:{missing_questions:[]},multi:{perspectives:[]},domain:{},evidence_packet:evidence});
 assert.deepEqual(out.candidates.map(x=>x.id),['mainline','bad_hand','opposition','third_way','human_fit']);
 assert.equal('selected' in out,false);
 assert.equal('ranking' in out,false);
 assert.ok(out.candidates.every(x=>x.metrics&&typeof x.metrics==='object'));
 assert.ok(out.candidates.every(x=>!('score' in x)&&!('answer_line_distance' in x)&&!('weights' in x)));
});

test('Compare alone owns scoring ranking and selection',async()=>{
 const d=await dialectic.run({task:baseTask,facts:{confirmed:[],unconfirmed:[]},risks:{risk_count:0,risks:[]},inquiry:{missing_questions:[]},multi:{perspectives:[]},domain:{},evidence_packet:evidence});
 const out=await compare.run({task:baseTask,facts:{confirmed:[],unconfirmed:[]},risks:{risk_count:0,risks:[],level:'low'},inquiry:{missing_fields:[],problem_health:{healthy:true}},multi:{perspectives:[]},dialectic:d,domain:{},evidence_packet:evidence});
 assert.ok(out.selected_candidate);
 assert.ok(out.candidate_ranking.length===5);
 assert.ok(out.candidate_ranking.every(x=>Number.isInteger(x.score)));
 assert.notEqual(out.selected_candidate.id,'bad_hand');
});

test('required evidence failure is a Compare hard gate',async()=>{
 const task={...baseTask,evidence_need:{required:true}};
 const rejected={...evidence,state:'REJECTED',source_status:'FINAL_VALID',quality_score_bp:9900,eligibility_reasons:['REINFORCEMENT_COUNT_INVALID']};
 const d=await dialectic.run({task,facts:{confirmed:[],unconfirmed:[]},risks:{risk_count:0,risks:[]},inquiry:{missing_questions:[]},multi:{perspectives:[]},domain:{},evidence_packet:rejected});
 const out=await compare.run({task,facts:{confirmed:[],unconfirmed:[]},risks:{risk_count:0,risks:[],level:'low'},inquiry:{missing_fields:[],problem_health:{healthy:true}},multi:{perspectives:[]},dialectic:d,domain:{},evidence_packet:rejected});
 assert.equal(out.verdict.decision,'hold_and_clarify');
});
