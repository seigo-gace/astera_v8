'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const createEvidenceSearchModule = require('../src/evidence-search');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const base = [
  '仮想事例の目的は、既存予約情報を保持したまま応答遅延の原因と改善案を検討するための判断材料を作ることである。原因そのものは未確認である。',
  '前提として、候補Aは読取キャッシュ、候補Bは検索索引の調整である。双方について同じ負荷条件、データ整合性、復旧手順、月額費用で比較する必要がある。',
  '守る条件として、既存の予約データを削除せず、追加の月額費用を発生させず、利用者に対する予約機能を省略してはならない。',
  '現状の担当者報告はピーク時に画面が遅いという観測にすぎない。処理時間と競合率の計測がなく、根拠が得られるまで原因を確定してはならない。',
  '根拠を得るには、公式仕様、一次資料、実測ログ、反例を調査し、出典と取得時点を残すことが必要である。見つからない情報は未解決として保持する。',
  '反対視点には、古いキャッシュによる二重予約、索引更新による書込遅延、復旧失敗時の利用者影響、データ移行の条件不一致を含める。',
  '出力には判断基準、危険条件、事実確認、不足情報、反対意見、候補比較、根拠成立状況、次の確認事項を含め、最終的な候補の選定は行わない。'
];
function documentOf(target) {
  const segments = ['運用負荷', '記録品質', '安全上の条件', '変更手順', '利用者影響', '測定方法', '例外対応', '責務分離', '障害復旧', '監査証跡'];
  const parts = ['【仮想事例：予約管理の改善調査】',...base];
  let i = 0;
  while (parts.join('\n').length < target - 300) {
    const area = segments[i % segments.length];
    const ref = base[(i + 3) % base.length];
    parts.push('【検討項目 ' + (i + 1) + '：' + area + '】' +
      'この項目は別条件として扱う。' + ref +
      '確認する対象は' + area + 'であり、記録が欠けていれば成立していないと扱う。');
    i += 1;
  }
  parts.push('【最終条件】公式資料と独立資料の両方を調べ、未確認事項を確定したと書かない。既存予約データの維持、費用増加の禁止、候補Aと候補Bの共通条件比較を守り、選定せず判断材料を示す。');
  return parts.join('\n');
}
function noResultProvider(id, sourceClass) {
  return {
    provider_id:id, source_class:sourceClass,source_family_id:id,certified:true,
    priority:5, domains:[],routing_terms:['予約','比較','根拠'], capabilities:['NO_REINFORCEMENT'],
    search: async plan => ({
      coverage_state:'COMPLETE_FOR_QUERY_SCOPE',candidates:[],
      query_results:plan.query_set.map(q=>({
        query_id:q.query_id,retrieval_status:'NOT_FOUND',candidate_record_ids:[]
      }))
    })
  };
}
const logger = {write(){},async flush(){}};
for (const [label,size] of [['1k',1000],['5k',5000],['10k',10000]]) {
  test('real in-process Evidence Search dual-route to public Main8: '+label,{timeout:120000},async()=>{
    const module = createEvidenceSearchModule({
      providers:[noResultProvider('authoritative','FREE_PROJECTION'),noResultProvider('general','FREE_GENERAL_WEB')],
      informationQualityEvaluator: async req => ({
        schema_version:'astera.information-quality-result.v1',phase:req.phase,
        status:'REJECTED_BLOCKING',score_bp:0,criterion_scores:{},blocking_reasons:['NO_ACCEPTABLE_EVIDENCE']
      })
    });
    const results = [];
    const engine = new AsteraEngine({
      logger,poolSize:2,japaneseParserClient:defaultMockJapaneseParserClient(),
      evidenceSearchClient:{search:async(payload,ctx)=>{
        const response=await module.execute({
          schema_version:'astera.evidence-search.module-request.v1',
          operation:'SEARCH_EVIDENCE',
          context:{request_id:ctx.requestId,caller_id:ctx.callerId,
            execution_time:'2026-10-14T00:00:00.000Z',effective_as_of:'2026-10-14T00:00:00.000Z'},
          payload:{...payload,deadline_ms:4000}
        });
        results.push(response.result);
        return response.result;
      }}
    });
    try {
      const question=documentOf(size);
      assert.ok(Math.abs(question.length-size)<400,'actual Japanese input size');
      // All two-route fake providers are explicitly eligible for this isolated
      // wiring test. Default registry routing eligibility is tested separately.
      const out=await engine.process({
        question,evidence_search:{provider_allowlist:['authoritative','general']}
      },{id:'real-evidence-module-'+label,is_global:true,plan:'admin'});
      assert.equal(out.result?.type,'cognitive_map');
      assert.ok(results.length>0,'Task plan reaches real Evidence Search Module');
      assert.ok(results.every(x=>x.route_execution?.dual_route_complete===true),'both routes attempted');
      assert.ok(results.every(x=>x.provider_execution.initial.length===2),'two real provider execution paths');
      assert.ok(out.result.five_stage.tasks.length>0,'five-stage completed');
      assert.equal(out.material?.sections?.length,8);
      assert.equal(out.result.canonical_claims.confirmed_count,0,'no evidence is not confirmed');
      assert.match(String(out.material.text),/根拠|未確認|未検索|未確定|確認/u);
      assert.match(String(out.material.text),/予約|データ/u);
      assert.equal(out.result.no_normative_decision_generated,true);
      console.log(JSON.stringify({case:label,characters:question.length,
        module_requests:results.length,dual_route_attempts:results.length,
        tasks:out.result.five_stage.tasks.length,section_count:8,
        adopted:0,confirmed:0}));
    } finally { await engine.destroy(); }
  });
}
