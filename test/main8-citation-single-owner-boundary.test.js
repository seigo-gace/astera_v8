'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {attachEvidenceCitations}=require('../src/runtime/evidence-citation-material');

const KEYS=['01_purpose','02_premise','03_facts','04_crisis','05_opposition','06_comparison','07_evidence_status','08_reinstruction'];
const sourceText=KEYS.map((key,i)=>
  `SECTION_${i+1}\n- SOURCE_ONLY_${key}_SEMANTIC_MARKER`).join('\n---\n');

function input() {
  const caseModel={
    multi_judgment:true,request_count:2,judgment_requests:[
      {id:'R01',action:'verify',request_text:'Inspect an unverified archive ledger',parser_task_ids:['T01']},
      {id:'R02',action:'compare',request_text:'Compare two disputed site maps',parser_task_ids:['T02']}
    ],request_task_ids:{R01:['T01'],R02:['T02']},
    global_context:{conditions:[],prohibitions:[],preserve:[],unresolved:[],deadlines:[]}
  };
  return {
    material:{
      text:sourceText,
      sections:KEYS.map((key,i)=>({key,label:'SECTION_'+(i+1),text:'- SOURCE_ONLY_'+key+'_SEMANTIC_MARKER'})),
      consumer_scope:'HUMAN_AND_AI_SAME_MATERIAL'
    },
    result:{
      judgment:{output_language:'en',observable_material:{case_model:caseModel}},
      task_results:[{task:{id:'T01',request_id:'R01'}},{task:{id:'T02',request_id:'R02'}}]
    },prompt:sourceText
  };
}

test('citation augmentation is append-only for multi-request Main8; never renders again from raw Case Graph',()=>{
  const out=input();
  const cited=attachEvidenceCitations(out);
  assert.equal(cited.material.main8_text,out.material.text,
    'no source-backed semantics may be regenerated or replaced during citation');
  assert.equal(cited.material.text.split('===ASTERA_EVIDENCE===')[0].trim(),out.material.text);
  assert.deepEqual(cited.material.sections,out.material.sections,
    'all eight sections remain byte-equivalent when there are no adopted citations');
  assert.equal(cited.material.sources.length,0);
  assert.equal(cited.result.evidence_citations.source_count,0);
  assert.equal(cited.prompt,cited.material.text);
});
