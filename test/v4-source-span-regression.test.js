'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {extractClaimsForTask}=require('../src/v4-canonical/claim-extractor');

const FIXED_TIME='2026-08-20T00:00:00.000Z';

function makeTask(text,start=120){return{id:'T07',source_span:{start,end:start+text.length,text},raw_text:text,source_role:'DIRECT_INPUT',target:'API',evidence_need:{required:false,reasons:[],queries:[]}};}

test('fragment and claim spans remain absolute to the original question',()=>{
  const text='APIはv2である。',task=makeTask(text,120),result=extractClaimsForTask(task,{executionAt:FIXED_TIME});
  assert.ok(result.fragments.length>=1);assert.equal(result.fragments[0].span.start,120);assert.equal(result.fragments[0].span.end,120+text.length);assert.equal(result.claims[0].source_span.start,120);assert.equal(result.claims[0].source_span.end,120+text.length);assert.match(result.fragments[0].canonical_source_position,/^120:/);
});

test('quoted inner proposition receives its own absolute span',()=>{
  const text='「APIはv2である」とAsteraが述べている。',task=makeTask(text,250),result=extractClaimsForTask(task,{executionAt:FIXED_TIME}),inner=result.claims.find((claim)=>claim.source_axes?.quotation_role?.includes('INNER_PROPOSITION'));
  assert.ok(inner);assert.ok(inner.source_span.start>=250);assert.ok(inner.source_span.end<=250+text.length);assert.ok(inner.source_span.end>inner.source_span.start);
});

test('supported code structure retains AST-like node and absolute source location evidence',()=>{
  const text='```js\nconst answer = 42;\n```',task=makeTask(text,400),result=extractClaimsForTask(task,{executionAt:FIXED_TIME}),claim=result.claims.find((item)=>item.predicate==='DECLARES_SYMBOL');
  assert.ok(claim);assert.equal(claim.verification_line.passed,true);assert.equal(claim.structure_evidence.ast_node.type,'VariableDeclaration');assert.ok(claim.structure_evidence.source_location.start>=400);assert.equal(Number.isInteger(claim.structure_evidence.source_location.line),true);assert.equal(Number.isInteger(claim.structure_evidence.source_location.column),true);
});
