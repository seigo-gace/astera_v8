'use strict';

const SIGNALS = [
  { key: 'urgency', re: /急ぎ|至急|今すぐ|早く|期限|今日中|urgent|asap|deadline/i, weight: 2, meaning: '急ぎ・時間圧がある。判断を短く具体化する。' },
  { key: 'anger', re: /ふざけ|怒|むかつ|舐め|使え|イラ|angry|mad/i, weight: 2, meaning: '怒り・不満がある。問い返しを減らし、即修正優先。' },
  { key: 'fatigue', re: /疲|だる|しんど|つら|限界|寝不足|tired|exhausted/i, weight: 2, meaning: '疲労がある。手順を短く、迷わせない。' },
  { key: 'confusion', re: /わから|不明|迷|混乱|どれ|何を|どうす|confused|unknown/i, weight: 2, meaning: '混乱がある。選択肢を絞り、次の一手を明確にする。' },
  { key: 'precision', re: /正確|検証|根拠|ロジック|事実|嘘|hallucination|verify/i, weight: 2, meaning: '正確性要求が高い。推測を分離し、根拠を明示する。' },
  { key: 'scope_pressure', re: /全部|完璧|最大|一式|抜け漏れ|端折るな|all|complete|perfect/i, weight: 1, meaning: '範囲拡大圧がある。核と追加を分けて破綻を防ぐ。' },
  { key: 'build_mode', re: /コード|実装|DL|zip|起動|テスト|server|runtime|deploy/i, weight: 1, meaning: '成果物要求がある。説明より動作物・検証を優先する。' }
];

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function readHumanState(question = '', mood = {}) {
  const text = String(question || '');
  const hits = SIGNALS.filter((s) => s.re.test(text));
  const keys = hits.map((x) => x.key);
  const load = hits.reduce((sum, x) => sum + x.weight, 0) + Math.max(0, -(mood.score || 0));

  const state = {
    mode: 'stable',
    load,
    signals: hits.map((x) => ({ key: x.key, meaning: x.meaning })),
    likely_needs: [],
    response_policy: [],
    drift_watch: []
  };

  if (load >= 5 || keys.includes('anger')) state.mode = 'high_pressure';
  else if (keys.includes('confusion') || keys.includes('fatigue')) state.mode = 'supportive';
  else if (keys.includes('precision')) state.mode = 'audit';
  else if (keys.includes('build_mode')) state.mode = 'builder';

  if (keys.includes('urgency')) state.likely_needs.push('最短で動く結論', '後戻りしない手順');
  if (keys.includes('anger')) state.likely_needs.push('謝罪より修正', '問い返し最小化');
  if (keys.includes('confusion')) state.likely_needs.push('選択肢の削減', '一式化');
  if (keys.includes('precision')) state.likely_needs.push('推測分離', '検証結果');
  if (keys.includes('build_mode')) state.likely_needs.push('実行ファイル', 'テスト済み成果物');
  if (!state.likely_needs.length) state.likely_needs.push('要点整理', '次の一手');

  state.response_policy = unique([
    state.mode === 'high_pressure' ? '問い返しを最大1個までに抑え、まず前進する。' : null,
    keys.includes('precision') ? '未検証・推測・確定を分離する。' : null,
    keys.includes('scope_pressure') ? '全部入りに見せず、核・追加・保留を分ける。' : null,
    keys.includes('build_mode') ? '成果物と検証結果を優先して返す。' : null,
    '次の一手を明記する。'
  ]);

  if (keys.includes('scope_pressure')) state.drift_watch.push('最大火力要求で範囲が膨らみ、完成が遅れるリスク。');
  if (keys.includes('urgency') && keys.includes('precision')) state.drift_watch.push('急ぎと正確性が衝突している。検証済み範囲を明示する。');

  return state;
}

module.exports = { readHumanState };
