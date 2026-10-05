'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMultiJudgmentPublicMaterial } = require('../src/runtime/multi-judgment-public-material-normalizer');

function fixture() {
  const model = {
    multi_judgment: true,
    request_count: 2,
    observations: [],
    judgment_requests: [
      {
        id: 'R01',
        action: 'verify',
        request_text: '2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。',
        external_evidence_requested: true,
        local_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] }
      },
      {
        id: 'R02',
        action: 'compare',
        request_text: 'A案とB案を作業時間と法務リスクで比較してください。',
        external_evidence_requested: false,
        local_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] }
      }
    ]
  };
  const sections = [
    '01 本当の目的\n- 今回の入力には2件の判断要求がある。',
    '02 前提不足\n- 共通条件なし。',
    '03 事実確認\n  - R01: 確認済み事実として追加できる材料はまだない。\n  - R02: 確認済み事実として追加できる材料はまだない。',
    '04 危機察知\n- 未確認事項を断定しない。',
    [
      '05 反対視点',
      '- 各判断要求について反証・失敗側の材料を別々に保持する:',
      '  - R01: 2026年10月1日時点のNode.js 22の公式サポート状況を確認する。',
      '    - 反証・失敗条件: Data Loss / Downtime / 互換性破壊 / Security Regression / Rollback不能',
      '  - R02: A案とB案を比較する。',
      '    - 反証・失敗条件: 単一指標だけで優劣を決めない'
    ].join('\n'),
    [
      '06 比較案',
      '- 判断要求ごとに現在分かること・まだ言えないこと・追加で必要な材料を分ける:',
      '  - R01 [検証]',
      '    - 要求: Node.js 22の公式サポート状況を確認する',
      '    - 候補: 現行維持 / 段階移行 / 全面置換',
      '    - 比較観点: Build vs Buy / 保守性 / Risk / Cost',
      '    - 追加で必要な材料: 互換条件・依存関係・Rollbackは？ / Migration対象は何か / Test結果',
      '  - R02 [比較]',
      '    - 要求: A案とB案を比較する',
      '    - 候補: A案 / B案',
      '    - 比較観点: 作業時間 / 法務リスク',
      '    - 追加で必要な材料: 候補ごとの作業時間 / 法務確認結果'
    ].join('\n'),
    '07 根拠成立状態\n  - R01: 外部確認は未実行。\n  - R02: 外部検索を必要としない。',
    '08 主役AI／利用者への再指示\n  - R01: 公式根拠を確認する。\n  - R02: 比較材料を確認する。'
  ];
  return {
    judgment: { output_language: 'ja', case_model: model, observable_material: { case_model: model } },
    material: {
      text: sections.join('\n---\n'),
      sections: sections.map((value, index) => ({ key: String(index + 1), text: value.split('\n').slice(1).join('\n') }))
    }
  };
}

test('verify projection removes unrelated domain lens while explicit compare material remains', () => {
  const { material, judgment } = fixture();
  const out = normalizeMultiJudgmentPublicMaterial(material, judgment);
  const sections = out.text.split('\n---\n');
  const opposition = sections[4];
  const comparison = sections[5];
  const verifyBlock = comparison.split('  - R01 [')[1].split('  - R02 [')[0];
  const compareBlock = comparison.split('  - R02 [')[1];

  assert.match(opposition, /R01[\s\S]*バージョン[\s\S]*時点[\s\S]*対象範囲/);
  assert.doesNotMatch(opposition, /Data Loss|Downtime|Security Regression|Rollback不能/);
  assert.doesNotMatch(verifyBlock, /現行維持|段階移行|全面置換|Build vs Buy|保守性|Migration対象|Rollback/);
  assert.match(verifyBlock, /検証対象[\s\S]*Source[\s\S]*反証・例外/);
  assert.match(compareBlock, /候補: A案 \/ B案/);
  assert.match(compareBlock, /比較観点: 作業時間 \/ 法務リスク/);
});
