'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const inputUnderstanding = require('../src/input-understanding');
const { enrichRequest } = require('../src/deterministic-task-decomposer');
const {
  QUERY_ROLES,
  buildCanonicalTaskPlan,
  evaluateCanonicalTaskPlan,
  projectFiveLanes,
  deterministicPerspectiveExpansion,
  fragmentText
} = require('../src/canonical-claim-runtime');
const { searchRequestFor } = require('../src/canonical-evidence-resolver');
const { planQueriesForClaim } = require('../src/v4-canonical/query-planner');

const silentLogger={write(){}};
const tenant={id:'test',is_global:true,plan:'admin'};

function evidenceCandidate({id,role,family,authority,claim,url}){
  return{candidate_id:id,canonical_record_id:`${id}-record`,content_hash:`${id}-hash`,source_role:role,source_family_id:family,source_id:`${id}-source`,provider_id:`${id}-provider`,authority_id:authority,canonical_locator:{url,replayable:true},updated_at:'2026-08-20T00:00:00.000Z',fields:{claim},excerpt:claim};
}
function queryExecution(queries=[]){
  return{
    initial:queries.map((query)=>({
      query_id:query.query_id,
      claim_id:query.claim_id,
      role:query.role,
      status:'FOUND',
      provider_records:[
        {provider_id:'ev-official-provider',status:'FOUND',candidate_record_ids:['ev-official-record']},
        {provider_id:'ev-independent-provider',status:'FOUND',candidate_record_ids:['ev-independent-record']}
      ]
    })),
    reinforcement:[]
  };
}
function validEvidence(claim,queries=[]){
  return{
    schema_version:'astera.evidence-search.result.v1',request_id:'ev-test',tenant_id:'test',status:'FINAL_VALID',effective_as_of:'2026-08-20T00:00:00.000Z',result_hash:'test-result-hash',planning_authority:'UPSTREAM_CANONICAL',planned_query_roles:Object.values(QUERY_ROLES),
    evidence:[
      evidenceCandidate({id:'ev-official',role:'OFFICIAL',family:'official-family',authority:'official-authority',claim,url:'https://official.test/evidence'}),
      evidenceCandidate({id:'ev-independent',role:'SECONDARY',family:'independent-family',authority:'independent-authority',claim,url:'https://independent.test/evidence'})
    ],
    coverage:{discovery_scope_state:'COMPLETE_FOR_QUERY_SCOPE',registry_coverage_state:'COMPLETE_FOR_ACTIVE_REGISTRY'},
    quality:{initial:{status:'REINFORCEMENT_REQUIRED',phase:'INITIAL',score_bp:8500,gates:{initial_minimum_bp:8000,final_minimum_bp:9500},blocking_reasons:[]},reinforcement_attempt_count:1,new_corroboration_count:1,final:{status:'FINAL_VALID',phase:'FINAL',score_bp:9700,gates:{initial_minimum_bp:8000,final_minimum_bp:9500},blocking_reasons:[]}},
    query_execution:queryExecution(queries),
    provider_execution:{initial:[{provider_id:'ev-official-provider',status:'FULFILLED'}],reinforcement:[{provider_id:'ev-independent-provider',status:'FULFILLED'}]},
    ai_used:false,payment_executed:false
  };
}
function taskForClaim(text='Node.js 22ã¯æœ¬ç•ªå¯¾å¿œã—ã¦ã„ã‚‹ã€‚'){
  return{id:'T01',source_span:{start:0,end:text.length,text},raw_text:text,clause_type:'statement',actionable:true,action:'verify',target:'Node.js 22',objective:'å¯¾å¿œçŠ¶æ³ã‚’æ¤œè¨¼ã™ã‚‹',deliverables:[],premises:[],constraints:[],prohibitions:[],preserve:[],replace:[],conditions:[],exceptions:[],deadlines:[],priority:'normal',order:1,depends_on:[],parallelizable:true,success_criteria:[],verification:[],completion_criteria:[],unresolved:[],evidence_need:{required:true,reasons:['test'],queries:[]},external_action:false,hard_blockers:[]};
}
function understand(question,context=''){
  return enrichRequest(inputUnderstanding.analyzeRequest({question,context}),{question,context});
}

async function withEngine(fn){const engine=new CanonicalAsteraEngine({poolSize:2,logger:silentLogger});try{await fn(engine);}finally{await engine.destroy();}}

test('Task and Claim are distinct stages and every external Claim has a COUNTER search role',()=>{
  const task=taskForClaim();
  const plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}});
  assert.equal(plan.task_id,task.id);
  assert.ok(plan.claims.length>=1);
  assert.notEqual(plan.claims[0].claim_id,task.id);
  assert.ok(plan.search_plan.planned_query_roles.includes('COUNTER'));
  for(const claim of plan.claims){const policy=plan.policy_by_claim_id[claim.claim_id];if(policy.external_search_required)assert.ok(policy.planned_query_roles.includes('COUNTER'));}
});

test('upstream Search Plan is authoritative and the production Evidence boundary forwards it without inventing semantic query roles',()=>{
  const baseTask=taskForClaim('APIã¯ç¾è¡Œv2ã§ã‚ã‚‹ã€‚');
  const canonicalPlan=buildCanonicalTaskPlan(baseTask,{primary:{id:'G01'}});
  const upstream=canonicalPlan.search_plan;
  const task={...baseTask,canonical_plan:canonicalPlan,domain:{primary:{id:'G01'}}};
  const request=searchRequestFor(task,{context:''},tenant,'ev-request');
  assert.equal(upstream.planning_authority,'ASTERA_DECISION_MATERIALS_V4');
  assert.ok(upstream.planned_query_roles.includes('COUNTER'));
  assert.deepEqual(request.upstream_search_plan,upstream);
  assert.deepEqual(request.preplanned_queries,upstream.queries);
  assert.deepEqual(
    request.preplanned_queries.map((query)=>({query_id:query.query_id,claim_id:query.claim_id,role:query.role,text:query.text})),
    upstream.queries.map((query)=>({query_id:query.query_id,claim_id:query.claim_id,role:query.role,text:query.text}))
  );
});

test('upstream Canonical query planning rejects an external-search policy without COUNTER before retrieval',()=>{
  const task=taskForClaim('APIã¯ç¾è¡Œv2ã§ã‚ã‚‹ã€‚');
  const plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}});
  const claim=plan.claims[0];
  const policy={
    ...plan.policy_by_claim_id[claim.claim_id],
    external_search_required:true,
    planned_query_roles:[QUERY_ROLES.OFFICIAL]
  };
  assert.throws(
    ()=>planQueriesForClaim(claim,policy,{primary:{id:'G01'}}),
    /counter query role is mandatory/i
  );
});

test('G1-G7 are the only confirmation boundary; high Evidence quality alone is not truth',()=>{
  const task=taskForClaim(),plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}}),claim=plan.claims[0],good=validEvidence(claim.raw_text,plan.search_plan.queries),confirmed=evaluateCanonicalTaskPlan(plan,good);
  assert.equal(confirmed.confirmed_count,1);
  assert.equal(confirmed.records[0].confirmation.status,'CONFIRMED');
  assert.deepEqual(confirmed.records[0].confirmation.gates,{G1:true,G2:true,G3:true,G4:true,G5:true,G6:true,G7:true});
  const missingRetrieval={...good,query_execution:{initial:[],reinforcement:[]}};
  const undetermined=evaluateCanonicalTaskPlan(plan,missingRetrieval);
  assert.equal(undetermined.records[0].confirmation.status,'UNDETERMINED');
  assert.equal(undetermined.records[0].confirmation.gates.G5,false);
  assert.ok(undetermined.records[0].confirmation.reasons.includes('RETRIEVAL_FAILED'));
});

test('REJECTED Evidence Search result cannot pass G5 even when planned roles, query records and bindings exist',()=>{
  const task=taskForClaim(),plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}}),claim=plan.claims[0],rejected=validEvidence(claim.raw_text,plan.search_plan.queries);
  rejected.status='REJECTED_BLOCKING';
  rejected.quality.final={status:'REJECTED_BLOCKING',phase:'FINAL',score_bp:9700,gates:{initial_minimum_bp:8000,final_minimum_bp:9500},blocking_reasons:[]};
  c²È="25•áÐÁÉ½¡¥‰¥Ñ¥½¸½ÁÉ•Í•ÉÙ”½½¹ÍÑÉ…¥¹Ð¥Ì‰½Õ¹Ñ¼Q…Í¬™¥•±‘ÌÝ¥Ñ Í½ÕÉ”ÁÉ½Ù•¹…¹”œ° ¤ôùì(€½¹ÍÐÉ•ÅÕ•ÍÐõÕ¹‘•ÉÍÑ…¹ A'Ž
KšRç–ZŽgŽ
/Žœ°µ…¥»Ž¿–’'šnÓŽgŽ
/Ž«Ž	I5Ž¿šº/ŽgŽ–þŽk’êKš>ošŸŽ
KžÚ·š2ŽgŽ
/Žœ¤ì(€½¹ÍÐÑ…Í¬õÉ•ÅÕ•ÍÐ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Ñ…Í­ÍlÁtì(€…ÍÍ•ÉÐ¹½¬¡Ñ…Í¬¹ÁÉ½¡¥‰¥Ñ¥½¹Ì¹Í½µ” ¡¥Ñ•´¤ôø½µ…¥¸¼¹Ñ•ÍÐ¡¥Ñ•´¤¤¤ì(€…ÍÍ•ÉÐ¹½¬¡Ñ…Í¬¹ÁÉ•Í•ÉÙ”¹Í½µ” ¡¥Ñ•´¤ôø½I5¼¹Ñ•ÍÐ¡¥Ñ•´¤¤¤ì(€…ÍÍ•ÉÐ¹½¬¡Ñ…Í¬¹½¹ÍÑÉ…¥¹ÑÌ¹Í½µ” ¡¥Ñ•´¤ôø¿’êKš>ošœ¼¹Ñ•ÍÐ¡¥Ñ•´¤¤¤ì(€…ÍÍ•ÉÐ¹½¬¡Ñ…Í¬¹™¥•±‘}Í½ÕÉ•Ì¹ÁÉ½¡¥‰¥Ñ¥½¹Ì¹Í½µ” ¡¥Ñ•´¤ôù¥Ñ•´¹Í½ÕÉ”ôôô½¹Ñ•áÐœ¤¤ì)ô¤ì()Ñ•ÍÐ ‘•±¥Ù•É…‰±•Ì…É”•áÁ±¥¥Ð…¹¥µÁ±•µ•¹Ñ…Ñ¥½¸Ñ…Í­Ì‘¼¹½ÐÍ¥±•¹Ñ±äÁ…ÍÌÝ¥Ñ¡½ÕÐ½¹”œ° ¤ôùì(€½¹ÍÐÝ¥Ñ¡I•…‘µ”õÕ¹‘•ÉÍÑ…¹ A'Ž
K–º¢ŽŽ_Ž™I5Ž
K–’'šnÓŽgŽ
/Žœ¤ì(€…ÍÍ•ÉÐ¹½¬¡Ý¥Ñ¡I•…‘µ”¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Ñ…Í­Ì¹Í½µ” ¡Ñ…Í¬¤ôùÑ…Í¬¹‘•±¥Ù•É…‰±•Ì¹¥¹±Õ‘•Ì I5œ¤¤¤ì(€½¹ÍÐµ¥ÍÍ¥¹œõÕ¹‘•ÉÍÑ…¹ A'Ž
K–º¢ŽŽgŽ
/Žœ¤ì(€…ÍÍ•ÉÐ¹½¬¡µ¥ÍÍ¥¹œ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Õ¹É•Í½±Ù•¹Í½µ” ¡¥Ñ•´¤ôø¼é‘•±¥Ù•É…‰±”¼¹Ñ•ÍÐ¡¥Ñ•´¤¤¤ì)ô¤ì()Ñ•ÍÐ •áÁ±¥¥ÐµÕ±Ñ¤µÁ…É•¹Ð‘•Á•¹‘•¹¥•Ì…É”ÁÉ•Í•ÉÙ•…¹å±•Ì‰•½µ”¡…É‰±½­•ÉÌœ° ¤ôùì(€½¹ÍÐµÕ±Ñ¤õÕ¹‘•ÉÍÑ…¹ Ž
K–º¢ŽŽgŽ
/Ž	Ž
K–º¢ŽŽgŽ
/Ž	PÀÇŽ¡PÀË–º3’ê–ú3Ž­Ž
K–º¢ŽŽgŽ
/Žœ¤ì(€½¹ÍÐ±…ÍÐõµÕ±Ñ¤¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Ñ…Í­Ì¹…Ð ´Ä¤ì(€…ÍÍ•ÉÐ¹½¬¡±…ÍÐ¹‘•Á•¹‘Í}½¸¹¥¹±Õ‘•Ì PÀÄœ¤¤ì(€…ÍÍ•ÉÐ¹½¬¡±…ÍÐ¹‘•Á•¹‘Í}½¸¹¥¹±Õ‘•Ì PÀÈœ¤¤ì(€½¹ÍÐå±”õÕ¹‘•ÉÍÑ…¹ PÀË–º3’ê–ú3Ž­Ž
K–º¢ŽŽgŽ
/Ž	PÀÇ–º3’ê–ú3Ž­Ž
K–º¢ŽŽgŽ
/Žœ¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡å±”¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Ñ…Í­}É…Á¡}Ù…±¥‘…Ñ¥½¸¹Ù…±¥±™…±Í”¤ì(€…ÍÍ•ÉÐ¹½¬¡å±”¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹¡…É‘}‰±½­•ÉÌ¹Í½µ” ¡¥Ñ•´¤ôø½yQM-}IA!}e1è¼¹Ñ•ÍÐ¡¥Ñ•´¤¤¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡å±”¹¥¹ÍÑÉÕÑ¥½¹}Õ¹‘•ÉÍÑ…¹‘¥¹œ¹•á•ÕÑ¥½¹}…±±½Ý•±™…±Í”¤ì)ô¤ì()Ñ•ÍÐ ½¹‘¥Ñ¥½¹Ì½•á•ÁÑ¥½¹Ì‰•½µ”É…Á ‰É…¹¡•ÌÉ…Ñ¡•ÈÑ¡…¸‘¥Í…ÁÁ•…É¥¹œ¥¹Ñ¼ÁÉ½Í”œ° ¤ôùì(€½¹ÍÐÉ•ÅÕ•ÍÐõÕ¹‘•ÉÍÑ…¹ Ÿš’s¢¢óŽ3š"C–*Ž_Ž–‚Ó–B#Ž­A'Ž
K–º¢ŽŽgŽ
/ŽŽŽƒŽ_’êKš>ošŸŽ3Ž«Ž–‚Ó–B#Ž¿–sš¶‹ŽgŽ
/Žœ¤ì(€…ÍÍ•ÉÐ¹½¬¡É•ÅÕ•ÍÐ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹‰É…¹¡•Ì¹Í½µ” ¡‰É…¹ ¤ôù‰É…¹ ¹ÑåÁ”ôôô%œ¤¤ì(€…ÍÍ•ÉÐ¹½¬¡É•ÅÕ•ÍÐ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹‰É…¹¡•Ì¹Í½µ” ¡‰É…¹ ¤ôù‰É…¹ ¹ÑåÁ”ôôôaAQ%=8œ¤¤ì)ô¤ì()Ñ•ÍÐ ½ÉÉ•Ñ¥½¹ÌÁÉ•Í•ÉÙ”ÍÕÁ•ÉÍ•ÍÍ¥½¸¡¥ÍÑ½Éä¥¹ÍÑ•…½˜‘•±•Ñ¥¹œÑ¡”½±Q…Í¬œ° ¤ôùì(€½¹ÍÐÉ•ÅÕ•ÍÐõÕ¹‘•ÉÍÑ…¹ Ž
K–º¢ŽŽgŽ
/Ž¢¢š¶ŽŽŸŽ¿Ž«Ž=Ž
K–º¢ŽŽgŽ
/Žœ¤ì(€…ÍÍ•ÉÐ¹½¬¡É•ÅÕ•ÍÐ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹ÍÕÁ•ÉÍ•ÍÍ¥½¹}É•±…Ñ¥½¹Ì¹±•¹Ñ øôÄ¤ì(€½¹ÍÐÉ•±…Ñ¥½¸õÉ•ÅÕ•ÍÐ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹ÍÕÁ•ÉÍ•ÍÍ¥½¹}É•±…Ñ¥½¹ÍlÁtì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•±…Ñ¥½¸¹ÍÕÁ•ÉÍ•‘•Ì°PÀÄœ¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•±…Ñ¥½¸¹ÍÕÁ•ÉÍ•‘•‘}‰ä°PÀÈœ¤ì(€…ÍÍ•ÉÐ¹½¬¡É•ÅÕ•ÍÐ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Ñ…Í­ÍlÁt¹ÍÕÁ•ÉÍ•‘•‘}‰ä¹¥¹±Õ‘•Ì PÀÈœ¤¤ì(€…ÍÍ•ÉÐ¹½¬¡É•ÅÕ•ÍÐ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Ñ…Í­ÍlÅt¹ÍÕÁ•ÉÍ•‘•Ì¹¥¹±Õ‘•Ì PÀÄœ¤¤ì)ô¤ì()Ñ•ÍÐ Í…µ”Q…Í¬¥¹ÁÕÐÁÉ½‘Õ•Ì‘•Ñ•Éµ¥¹¥ÍÑ¥ŒÉ…Á °±…¥´%Ì…¹M•…É A±…¸%Ìœ° ¤ôùì(€½¹ÍÐÅÕ•ÍÑ¥½¸ôŸž>û–r£Ž¹A'’îWšžcŽ
K–³–ò?š‚çš.ƒŽŸš’s¢¢óŽgŽ
/ŽŽwŽ»–ú1I5Ž
K–’'šnÓŽgŽ
/Ž	µ…¥»Ž¿–’'šnÓŽgŽ
/Ž«Žœ±„õÕ¹‘•ÉÍÑ…¹¡ÅÕ•ÍÑ¥½¸¤±ˆõÕ¹‘•ÉÍÑ…¹¡ÅÕ•ÍÑ¥½¸¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡)M=8¹ÍÑÉ¥¹¥™ä¡„¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¤±)M=8¹ÍÑÉ¥¹¥™ä¡ˆ¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¤¤ì(€½¹ÍÐÑ…Í¬õÑ…Í­½É±…¥´ Ÿž>û–r£Ž¹A'Ž½ØËŽŸŽŽ
/Žœ¤±ÀÄõ‰Õ¥±‘…¹½¹¥…±Q…Í­A±…¸¡Ñ…Í¬±íÁÉ¥µ…Éäéí¥èÀÄõô¤±ÀÈõ‰Õ¥±‘…¹½¹¥…±Q…Í­A±…¸¡Ñ…Í¬±íÁÉ¥µ…Éäéí¥èÀÄõô¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡)M=8¹ÍÑÉ¥¹¥™ä¡ÀÄ¤±)M=8¹ÍÑÉ¥¹¥™ä¡ÀÈ¤¤ì)ô¤ì()Ñ•ÍÐ …¹½¹¥…°¹¥¹”•áÁ½Í•ÌÙ¥‘•¹”MÑ…ÑÕÌ…Ì5…¥¸à€ŒÜ…¹¹•Ù•ÈÍ•±•ÑÌ½É•½µµ•¹‘Ìœ±…Íå¹Œ ¤ôùì(€±…ÍÌÙ¥‘•¹•	…­•‘¹¥¹”•áÑ•¹‘Ì…¹½¹¥…±ÍÑ•É…¹¥¹”ì(€€€½¹ÍÑÉÕÑ½È¡½ÁÑ¥½¹Ì¥íÍÕÁ•È¡½ÁÑ¥½¹Ì¤íÑ¡¥Ì¹}™¥áÑÕÉ•Ù¥‘•¹”õ¹Õ±°íô(€€€Í•Ñ¥áÑÕÉ•Ù¥‘•¹”¡Á…­•Ð¥íÑ¡¥Ì¹}™¥áÑÕÉ•Ù¥‘•¹”õÁ…­•Ðíô(€€€…Íå¹ŒÉ•Í½±Ù•Ù¥‘•¹•½ÉQ…Í¬ ¥íÉ•ÑÕÉ¸Ñ¡¥Ì¹}™¥áÑÕÉ•Ù¥‘•¹”íô(€ô(€½¹ÍÐ•¹¥¹”õ¹•ÜÙ¥‘•¹•	…­•‘¹¥¹”¡íÁ½½±M¥é”èÈ±±½•ÈéÍ¥±•¹Ñ1½•Éô¤ì(€ÑÉåì(€€€½¹ÍÐ±…¥´ô9½‘”¹©Ì€ÈËŽ¿šr³žV«–¾û–þsŽ_Ž›ŽŽ
/Žœì(€€€½¹ÍÐÁÉ•Á…É•õ•¹¥¹”¹ÁÉ•Á…É•I•ÅÕ•ÍÐ¡íÅÕ•ÍÑ¥½¸é±…¥µô¤ì(€€€½¹ÍÐÑ…Í¬õÁÉ•Á…É•¹…¹…±åÍ¥Í}Ñ…Í­}Á…­•Ð¹Ñ…Í­ÍlÁtì(€€€½¹ÍÐÁ±…¸õ‰Õ¥±‘…¹½¹¥…±Q…Í­A±…¸¡Ñ…Í¬±íÁÉ¥µ…Éäéí¥èÀÄõô¤ì(€€€½¹ÍÐ•Ù¥‘•¹”õÙ…±¥‘Ù¥‘•¹”¡±…¥´±Á±…¸¹Í•…É¡}Á±…¸¹ÅÕ•É¥•Ì¤ì(€€€•¹¥¹”¹Í•Ñ¥áÑÕÉ•Ù¥‘•¹”¡•Ù¥‘•¹”¤ì(€€€½¹ÍÐ•Ù…±Õ…Ñ•õ•Ù…±Õ…Ñ•…¹½¹¥…±Q…Í­A±…¸¡Á±…¸±•Ù¥‘•¹”¤ì(€€€…ÍÍ•ÉÐ¹½¬¡•Ù…±Õ…Ñ•¹½¹™¥Éµ•‘}½Õ¹ÐøôÄ¤ì(€€€½¹ÍÐ½ÕÐõ…Ý…¥Ð•¹¥¹”¹ÁÉ½•ÍÌ¡íÅÕ•ÍÑ¥½¸é±…¥µô±Ñ•¹…¹Ð¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹¹½¹}…¤±ÑÉÕ”¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹‘•¥Í¥½¹}…ÕÑ¡½É¥Ñä°aQI91}=91dœ¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹ÉÕ¹Ñ¥µ”¹•¹¥¹”°Øá}…¹½¹¥…±}±½‰…±}ÉÕ±•Ìœ¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹©Õ‘µ•¹Ð¹½É‘•ÉlÙt°œÀÝ}•Ù¥‘•¹•}ÍÑ…ÑÕÌœ¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡=‰©•Ð¹¡…Í=Ý¸¡½ÕÐ¹É•ÍÕ±Ð¹©Õ‘µ•¹Ð°œÀÝ}É•½µµ•¹‘…Ñ¥½¸œ¤±™…±Í”¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹½µÁ…É¥Í½¸¹µ…Ñ•É¥…±}½¹±ä±ÑÉÕ”¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹½µÁ…É¥Í½¸¹Í•±•Ñ•‘}…¹‘¥‘…Ñ”±¹Õ±°¤ì(€€€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹½µÁ…É¥Í½¸¹…¹‘¥‘…Ñ•}É…¹­¥¹œ±mt¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡=‰©•Ð¹¡…Í=Ý¸¡½ÕÐ¹É•ÍÕ±Ð¹½µÁ…É¥Í½¸°Í½É”œ¤±™…±Í”¤ì(€€€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹Á•ÉÍÁ•Ñ¥Ù•}•áÁ…¹Í¥½¸¹…¹‘¥‘…Ñ•Ì±mt¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹Á•ÉÍÁ•Ñ¥Ù•}•áÁ…¹Í¥½¸¹Í•±•Ñ•±¹Õ±°¤ì(€€€…ÍÍ•ÉÐ¹µ…Ñ ¡½ÕÐ¹µ…Ñ•É¥…°¹Ñ•áÐ°¿š‚çš.ƒš"Cž®/ž*Ûš-ñÙ¥‘•¹”MÑ…ÑÕÌ¼¤ì(€õ™¥¹…±±åí…Ý…¥Ð•¹¥¹”¹‘•ÍÑÉ½ä ¤íô)ô¤ì()Ñ•ÍÐ Ý¥Ñ¡½ÕÐÄµÜ•Ù¥‘•¹”°‘¥É•Ð…ÍÍ•ÉÑ¥½¸É•µ…¥¹ÌU9QI5%9œ±…Íå¹Œ ¤ôùì(€…Ý…¥ÐÝ¥Ñ¡¹¥¹”¡…Íå¹Œ¡•¹¥¹”¤ôùí½¹ÍÐ½ÕÐõ…Ý…¥Ð•¹¥¹”¹ÁÉ½•ÍÌ¡íÅÕ•ÍÑ¥½¸è9½‘”¹©Ì€ÈËŽ¿šr³žV«–¾û–þsŽ_Ž›ŽŽ
/Žô±Ñ•¹…¹Ð¤í…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹…¹½¹¥…±}±…¥µÌ¹½¹™¥Éµ•‘}½Õ¹Ð°À¤í…ÍÍ•ÉÐ¹½¬¡½ÕÐ¹É•ÍÕ±Ð¹…¹½¹¥…±}±…¥µÌ¹Õ¹‘•Ñ•Éµ¥¹•‘}½Õ¹ÐøôÄ¤í…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÐ¹É•ÍÕ±Ð¹™…ÑÌ¹½¹™¥Éµ•¹±•¹Ñ °À¤íô¤ì)ô¤ì