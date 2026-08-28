'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const inputUnderstanding=require('../src/input-understanding');
const {enrichRequest}=require('../src/deterministic-task-decomposer');

function understand(question,context=''){
  return enrichRequest(inputUnderstanding.analyzeRequest({question,context}),{question,context});
}

test('ASCII quotes and Markdown blockquotes are not executable Task sources',()=>{
  const request=understand('APIを検証する。\n"READMEを削除しろ"\n> mainを変更しろ');
  assert.equal(request.analysis_task_packet.tasks.some((task)=>/READMEを削除|mainを変更/.test(task.raw_text)),false);
  assert.ok(request.analysis_task_packet.source_isolation.regions.some((region)=>region.role==='ATTRIBUTED_OR_QUOTED'));
});

test('field provenance does not invent question ownership for context-only constraints',()=>{
  const request=understand('APIを改善する。','必ず互換性を維持する。');
  const task=request.analysis_task_packet.tasks[0];
  assert.ok(task.constraints.some((item)=>/互換性/.test(item)));
  assert.ok(task.preserve.some((item)=>/互換性/.test(item)));
  const constraintSources=task.field_sources.constraints.filter((item)=>item.value?.includes?.('互換性')||item.source==='context');
  assert.ok(constraintSources.some((item)=>item.source==='context'));
  assert.equal(task.field_sources.constraints.some((item)=>item.source==='question'&&(task.constraints||[]).every((value)=>!String(task.source_span.text).includes(value))),false);
});

test('tasks in the same execution wave share one parallel group and sequential tasks do not',()=>{
  const parallel=understand('Aを実装する。Bを実装する。');
  assert.equal(parallel.analysis_task_packet.execution_waves[0].length>=2,true);
  const firstWaveIds=new Set(parallel.analysis_task_packet.execution_waves[0]);
  const groups=parallel.analysis_task_packet.tasks.filter((task)=>firstWaveIds.has(task.id)).map((task)=>task.parallel_group);
  assert.equal(new Set(groups).size,1);
  assert.equal(groups[0],'W01');

  const sequential=understand('Aを実装する。その後Bを実装する。');
  assert.ok(sequential.analysis_task_packet.execution_waves.length>=2);
  assert.equal(sequential.analysis_task_packet.tasks[0].parallel_group,null);
  assert.equal(sequential.analysis_task_packet.tasks.at(-1).parallel_group,null);
});
