'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {fragmentInput}=require('../src/v4-canonical/fragmenter');
const {extractClaimsForTask}=require('../src/v4-canonical/claim-extractor');
const {detectPolarity,resolveRelativeTime}=require('../src/v4-canonical/core');
const {policyForClaim}=require('../src/v4-canonical/policy-registry');
const {planQueriesForClaim}=require('../src/v4-canonical/query-planner');
const {buildCanonicalTaskPlan,evaluateCanonicalTaskPlan,projectFiveLanes}=require('../src/canonical-claim-runtime');

const FIXED_TIME='2026-08-20T00:00:00.000Z';
const HEX64=/^[a-f0-9]{64}$/;

function task(text,{required=true}={}){return{id:'T01',source_span:{start:0,end:text.length,text},raw_text:text,source_role:'DIRECT_INPUT',action:'verify',target:'API',objective:'検証する',premises:[],constraints:[],prohibitions:[],preserve:[],conditions:[],exceptions:[],depends_on:[],hard_blockers:[],critical_target_ids:[],evidence_need:{required,reasons:required?['test']:[],queries:[]}};}
function candidate(id,role,family,claim){return{candidate_id:id,canonical_record_id:`${id}-record`,source_role:role,source_family_id:family,authority_id:`${family}-authority`,canonical_locator:{url:`https://${family}.test/${id}`,replayable:true},excerpt:claim,fields:{claim},content_hash:`${id}-hash`,updated_at:FIXED_TIME};}
function evidenceFor(plan,claim,{failedQueryId=null,omitQueryId=null,notFoundQueryId=null}={}){const queryRecords=plan.search_plan.queries.filter((query)=>query.query_id!==omitQueryId).map((query)=>{const status=query.query_id===failedQueryId?'RETRIEVAL_FAILED':query.query_id===notFoundQueryId?'NOT_FOUND':'FOUND';return{query_id:query.query_id,claim_id:query.claim_id,role:query.role,status,provider_records:[{provider_id:'official',status,candidate_record_ids:status==='FOUND'?['official-record']:[]},{provider_id:'independent',status,candidate_record_ids:status==='FOUND'?['independent-record']:[]}]};});return{schema_version:'astera.evidence-search.result.v1',status:'FINAL_VALID',evidence:[candidate('official','OFFICIAL','official-family',claim),candidate('independent','SECONDARY','independent-family',claim)],coverage:{discovery_scope_state:'COMPLETE_FOR_QUERY_SCOPE'},quality:{initial:{status:'REINFORCEMENT_REQUIRED',score_bp:8500},final:{status:'FINAL_VALID',score_bp:9700},reinforcement_attempt_count:1,new_corroboration_count:1},query_execution:{initial:queryRecords,reinforcement:[]},provider_execution:{initial:[{provider_id:'official',status:'FULFILLED'},{provider_id:'independent',status:'FULFILLED'}],reinforcement:[]},ai_used:false,payment_executed:false};}

test('v4 internal IDs are full 64-hex SHA-256 digests',()=>{
  const fragmented=fragmentInput({inputDocumentId:'doc-1',text:'APIはv2である。'});assert.ok(fragmented.fragments.length>=1);assert.match(fragmented.fragments[0].fragment_id,HEX64);
  const extracted=extractClaimsForTask(task('APIはv2である。'),{executionAt:FIXED_TIME});assert.match(extracted.claims[0].claim_id,HEX64);
  const policy=policyForClaim(extracted.claims[0]),queries=planQueriesForClaim(extracted.claims[0],policy,{primary:{id:'G01'}});assert.ok(queries.length>=1);for(const query of queries)assert.match(query.query_id,HEX64);
});

test('fragmentation keeps identifier dots intact and does not split punctuation inside quotes',()=>{
  const result=fragmentInput({inputDocumentId:'doc-2',text:'Node.jsは有効である。「a.b? c.d!」と記録した。次を確認する。'});const texts=result.fragments.map((fragment)=>fragment.normalized_fragment);
  assert.ok(texts.some((text)=>text.includes('Node.js')));assert.ok(texts.some((text)=>text.includes('a.b? c.d!')));assert.equal(texts.some((text)=>text==='a.'||text==='b?'),false);
});

test('quoted assertion creates outer attribution and inner proposition as separate Claims',()=>{
  const extracted=extractClaimsForTask(task('「今日はv2である」とAsteraが述べている。'),{executionAt:FIXED_TIME});
  const outer=extracted.claims.find((claim)=>claim.claim_origin==='ATTRIBUTED_ASSERTION'),inner=extracted.claims.find((claim)=>claim.source_axes?.quotation_role?.includes('INNER_PROPOSITION'));
  assert.ok(outer);assert.ok(inner);assert.equal(outer.subject,'Astera');assert.notEqual(outer.claim_id,inner.claim_id);assert.equal(inner.time_scope,'UNKNOWN');
});

test('relative time uses execution date only for DIRECT_INPUT; quoted/file content stays UNKNOWN without document reference date',()=>{
  const direct=resolveRelativeTime('今日は有効である',{sourceRole:'DIRECT_INPUT',executionDate:new Date(FIXED_TIME)});assert.equal(direct.time_scope,'2026-08-20');assert.match(direct.text,/2026-08-20/);
  const quoted=resolveRelativeTime('今日は有効である',{sourceRole:'QUOTED_CONTENT',executionDate:new Date(FIXED_TIME),documentReferenceDate:null});assert.equal(quoted.time_scope,'UNKNOWN');assert.match(quoted.text,/今日/);
  const file=resolveRelativeTime('今日は有効である',{sourceRole:'FILE_CONTENT',executionDate:new Date(FIXED_TIME),documentReferenceDate:null});assert.equal(file.time_scope,'UNKNOWN');
});

test('double negation is weak affirmative before generic negative matching',()=>{
  assert.equal(detectPolarity('動かないことはない。'),'AFFIRMATIVE');assert.equal(detectPolarity('利用できなくはない。'),'AFFIRMATIVE');assert.equal(detectPolarity('利用できない。'),'NEGATIVE');
});

test('VERSION and COUNTER queries use only the fixed v4 vocabulary and actual version scope',()=>{
  const extracted=extractClaimsForTask(task('APIはv2である。'),{executionAt:FIXED_TIME}),claim=extracted.claims[0],policy=policyForClaim(claim),queries=planQueriesForClaim(claim,policy,{primary:{id:'G01'}}),version=queries.find((query)=>query.role==='VERSION'),counter=queries.find((query)=>query.role==='COUNTER');
  assert.ok(version);assert.equal(version.text,`${claim.subject} ${claim.version_scope}`.trim());assert.doesNotMatch(version.text,/version current/i);assert.ok(counter);assert.equal(counter.text,`${claim.subject} ${claim.predicate} 否定形`.trim());
});

test('supported JS code requires parser/AST/source-location gates; unsupported language remains UNDETERMINED',()=>{
  const supported=buildCanonicalTaskPlan(task('```js\nconst answer = 42;\n```',{required:false}),{primary:{id:'G29'}},{executionAt:FIXED_TIME});const codeClaim=supported.claims.find((claim)=>claim.predicate==='DECLARES_SYMBOL');assert.ok(codeClaim);assert.equal(codeClaim.verification_line.passed,true);assert.equal(codeClaim.verification_line.gates.PARSER_SUPPORTED,true);assert.equal(codeClaim.verification_line.gates.AST_NODE_EXTRACTED,true);assert.equal(codeClaim.verification_line.gates.SOURCE_LOCATION_FIXED,true);
  const supportedResult=evaluateCanonicalTaskPlan(supported,{status:'NOT_REQUIRED',evidence:[],query_execution:{initial:[],reinforcement:[]},provider_execution:{initial:[],reinforcement:[]},quality:{final:{status:'NOT_REQUIRED',score_bp:null}},ai_used:false,payment_executed:false});assert.ok(supportedResult.records.some((record)=>record.claim.predicate==='DECLARES_SYMBOL'&&record.confirmation.status==='CONFIRMED'));
  const unsupported=buildCanonicalTaskPlan(task('```python\nx = 42\n```',{required:false}),{primary:{id:'G29'}},{executionAt:FIXED_TIME}),unsupportedResult=evaluateCanonicalTaskPlan(unsupported,{status:'NOT_REQUIRED',evidence:[],query_execution:{initial:[],reinforcement:[]},provider_execution:{initial:[],reinforcement:[]},quality:{final:{status:'NOT_REQUIRED',score_bp:null}},ai_used:false,payment_executed:false});assert.ok(unsupportedResult.records.every((record)=>record.confirmation.status==='UNDETERMINED'));
});

test('G5 accepts FOUND/NOT_FOUND terminal records and rejects missing or RETRIEVAL_FAILED records',()=>{
  const plan=buildCanonicalTaskPlan(task('APIはv2である。'),{primary:{id:'G01'}},{executionAt:FIXED_TIME}),claim=plan.claims[0],targetQuery=plan.search_plan.queries[0];
  const found=evaluateCanonicalTaskPlan(plan,evidenceFor(plan,claim.raw_text));assert.equal(found.records[0].confirmation.gates.G5,true);
  const notFound=evaluateCanonicalTaskPlan(plan,evidenceFor(plan,claim.raw_text,{notFoundQueryId:targetQuery.query_id}));assert.equal(notFound.records[0].confirmation.gates.G5,true);
  const failed=evaluateCanonicalTaskPlan(plan,evidenceFor(plan,claim.raw_text,{failedQueryId:targetQuery.query_id}));assert.equal(failed.records[0].confirmation.gates.G5,false);assert.equal(failed.records[0].confirmation.status,'UNDETERMINED');
  const missing=evaluateCanonicalTaskPlan(plan,evidenceFor(plan,claim.raw_text,{omitQueryId:targetQuery.query_id}));assert.equal(missing.records[0].confirmation.gates.G5,false);
});

test('Compare remains material-only after CONFIRMED/UNDETERMINED projection',()=>{
  const plan=buildCanonicalTaskPlan(task('APIはv2である。'),{primary:{id:'G01',compare_lens:['scope','coverage']}},{executionAt:FIXED_TIME}),canonical=evaluateCanonicalTaskPlan(plan,evidenceFor(plan,plan.claims[0].raw_text)),lanes=projectFiveLanes({task:task('APIはv2である。'),canonical,domain:{primary:{id:'G01',compare_lens:['scope','coverage']}}});
  assert.equal(lanes.compare.material_only,true);assert.equal(lanes.compare.selected_candidate,null);assert.deepEqual(lanes.compare.candidate_ranking,[]);assert.deepEqual(lanes.compare.rejected_candidates,[]);assert.equal(Object.hasOwn(lanes.compare,'score'),false);
});
