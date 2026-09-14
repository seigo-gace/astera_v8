'use strict';

/**
 * Hand-authored unseen effect stories (not copied from v1 templates).
 * Minimum coverage tags map to scenario_kind metadata.
 */
function buildStories() {
  return [
    {
      story_id: 'US-001',
      user_input: '来週の面接、緊張で眠れない。短く落ち着くための準備の順番だけ教えて。',
      coverage_domain: 'G13',
      scenario_kind: 'short_natural'
    },
    {
      story_id: 'US-002',
      user_input: 'あの件、向こうが言うには「問題ない」らしいけど、こちらの感覚と合わない。何を聞き返すべきか迷う。',
      coverage_domain: 'G07',
      scenario_kind: 'ambiguous_target'
    },
    {
      story_id: 'US-003',
      user_input: '引っ越しの見積もり取得、荷物の梱包リスト作成、旧居の解約通知を全部今月中に終わらせたい。優先順位と依存関係を整理したい。',
      coverage_domain: 'G22',
      scenario_kind: 'multi_task'
    },
    {
      story_id: 'US-004',
      user_input: '社内FAQを更新してほしい。ただし公開済みの返金ポリシー条文は変えず、新しい問い合わせ例だけ追記して。',
      coverage_domain: 'G32',
      scenario_kind: 'condition_exception',
      context: '法務確認=未'
    },
    {
      story_id: 'US-005',
      user_input: '顧客データのエクスポート機能は追加したいが、個人情報の二次利用は禁止のまま維持して。両立する設計の論点を洗い出して。',
      coverage_domain: 'G33',
      scenario_kind: 'forbid_maintain'
    },
    {
      story_id: 'US-006',
      user_input: '展示会ブースの装飾を3/20までに仕上げたい。予算は税込45万以内。候補業者はまだ未選定。',
      coverage_domain: 'G11',
      scenario_kind: 'deadline_budget'
    },
    {
      story_id: 'US-007',
      user_input: 'まず在庫棚卸し、その結果を見てから発注数を決め、最後に倉庫へ連絡する順で進めたい。手順の抜けがないか確認して。',
      coverage_domain: 'G09',
      scenario_kind: 'task_order'
    },
    {
      story_id: 'US-008',
      user_input: 'さっき「来週火曜納品」と言ったけど訂正で来週金曜。それ以外の条件はそのまま。影響範囲を整理して。',
      coverage_domain: 'G05',
      scenario_kind: 'correction'
    },
    {
      story_id: 'US-009',
      user_input: '当初はオフィス移転前提だったが、リモート継続に方針変更。すでに出した内装見積もりをどう扱うか整理したい。',
      coverage_domain: 'G15',
      scenario_kind: 'premise_change'
    },
    {
      story_id: 'US-010',
      user_input: 'メールに「至急対応」と書いてある一方、同じスレッドで「様子見で」とも書いてあった。実際に今やるべきことを切り分けて。',
      coverage_domain: 'G34',
      scenario_kind: 'quote_mixed_command'
    },
    {
      story_id: 'US-011',
      user_input: '次の設定断片を見て、本番反映前に確認すべき点を挙げて。\n```yaml\nreplicas: 2\nmaxUnavailable: 0\n```',
      coverage_domain: 'G29',
      scenario_kind: 'code_quote'
    },
    {
      story_id: 'US-012',
      user_input: '子どもの習い事と親の介護の送迎が同じ週に重なった。仕事の稼働日は変えられない。両方の制約を崩さずに調整案を考えたい。',
      coverage_domain: 'G18',
      scenario_kind: 'multi_domain',
      context: 'secondary_domain=G17'
    },
    {
      story_id: 'US-013',
      user_input: '新しい会計ソフトに乗り換えたいが、候補はまだ1社しか見ていない。比較のために足りない観点を教えて。',
      coverage_domain: 'G21',
      scenario_kind: 'compare_insufficient_candidates'
    },
    {
      story_id: 'US-014',
      user_input: '中古車と新車で迷っている。燃費と維持費はざっくり分かるが、安全面の比較軸が足りない気がする。',
      coverage_domain: 'G28',
      scenario_kind: 'compare_insufficient_axes'
    },
    {
      story_id: 'US-015',
      user_input: 'SNSで「近所の工場が規制違反」と拡散されている。公式発表はまだ見つからない。確定情報と未確認を分けて整理して。',
      coverage_domain: 'G27',
      scenario_kind: 'unverified_facts'
    },
    {
      story_id: 'US-016',
      user_input: 'チーム解散の噂でモチベーションが下がっている。事実関係は未確認だが、落ち込まずに次の行動を考えたい。',
      coverage_domain: 'G10',
      scenario_kind: 'emotional_consult'
    },
    {
      story_id: 'US-017',
      user_input: 'ペットの食欲低下が続く。病院は来週しか空いていない。今日できる観察ポイントだけ知りたい。',
      coverage_domain: 'G19',
      scenario_kind: 'short_natural'
    },
    {
      story_id: 'US-018',
      user_input: '「あれ」を早めに直したいと言われたが、対象システム名が曖昧。確認質問のリストを作って。',
      coverage_domain: 'G30',
      scenario_kind: 'ambiguous_target'
    },
    {
      story_id: 'US-019',
      user_input: '契約書レビュー、価格表の更新、サポートFAQ改訂を並行したい。リソースは一人分。どれから着手すべきか。',
      coverage_domain: 'G06',
      scenario_kind: 'multi_task'
    },
    {
      story_id: 'US-020',
      user_input: 'キャンペーン画像は差し替えてよいが、ロゴの位置と色指定は現行ガイドどおり維持。例外なく守るべき点を確認したい。',
      coverage_domain: 'G37',
      scenario_kind: 'forbid_maintain'
    },
    {
      story_id: 'US-021',
      user_input: '海外取引の支払い通貨を決めたい。為替レートは毎日変わる前提で、確定できない情報は確定できないと明示して整理して。',
      coverage_domain: 'G36',
      scenario_kind: 'unverified_facts'
    },
    {
      story_id: 'US-022',
      user_input: '先にユーザー通知を出してからメンテ画面を公開し、最後に監視アラート閾値を戻す。順序を入れ替えないで。',
      coverage_domain: 'G31',
      scenario_kind: 'task_order'
    },
    {
      story_id: 'US-023',
      user_input: '旅行保険は不要と思っていたが、同行者の体調を考えると加入したい。前提が変わったので判断材料を出し直して。',
      coverage_domain: 'G20',
      scenario_kind: 'premise_change'
    },
    {
      story_id: 'US-024',
      user_input: '上司メモ「コスト最優先」、現場メモ「品質最優先」。引用部分と、こちらが今決める必要のない部分を分けて。',
      coverage_domain: 'G04',
      scenario_kind: 'quote_mixed_command'
    },
    {
      story_id: 'US-025',
      user_input: '次のSQLは検索用。本番では実行しないで。論理削除フラグの扱いだけ確認したい。\n```sql\nSELECT id FROM items WHERE deleted_at IS NULL;\n```',
      coverage_domain: 'G03',
      scenario_kind: 'code_quote'
    },
    {
      story_id: 'US-026',
      user_input: '店舗のレジ不整合調査と、同じ日のシフト欠員対応が重なった。売上確定日は動かせない。両方の制約を整理して。',
      coverage_domain: 'G34',
      scenario_kind: 'multi_domain',
      context: 'secondary_domain=G15'
    },
    {
      story_id: 'US-027',
      user_input: '頭痛が続く。市販薬を試したが効きが弱い。受診判断の前に、記録すべき症状項目を教えて。',
      coverage_domain: 'G23',
      scenario_kind: 'emotional_consult'
    },
    {
      story_id: 'US-028',
      user_input: '来月末までに菜園の土壌改良を終えたい。費用は1万5千円以内。ただし収穫時期は遅らせたくない。',
      coverage_domain: 'G25',
      scenario_kind: 'deadline_budget'
    },
    {
      story_id: 'US-029',
      user_input: 'API v2移行は進めたい。v1クライアント向けの互換レイヤは残す。例外としてv1の非推奨エンドポイントだけ先に閉じる案のリスクを見たい。',
      coverage_domain: 'G29',
      scenario_kind: 'condition_exception'
    },
    {
      story_id: 'US-030',
      user_input: '「A案だけで十分」と言われたが、比較軸（運用コスト・障害復旧時間）がまだ足りない。何を追加調査すべきか。',
      coverage_domain: 'G12',
      scenario_kind: 'compare_insufficient_axes'
    },
    {
      story_id: 'US-031',
      user_input: '数値訂正: 先ほどの見込み売上120万は誤りで95万。それ以外の仮定は同じ。差分の影響だけ整理して。',
      coverage_domain: 'G16',
      scenario_kind: 'correction'
    },
    {
      story_id: 'US-032',
      user_input: '宇宙関連のニュース記事が複数あるが、一次情報は未確認。煽り見出しと事実っぽい記述を分けて読みたい。',
      coverage_domain: 'G38',
      scenario_kind: 'unverified_facts'
    }
  ];
}

module.exports = { buildStories };
