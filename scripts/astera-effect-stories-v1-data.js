'use strict';

/** Natural scenario anchors per coverage_domain (not from GENRE_LENSES). */
const DOMAIN_SCENE = Object.freeze({
  G01: ['市立図書館の貸出通知メール', '地域アーカイブの検索画面'],
  G02: ['県立博物館の常設展', '企画展の音声ガイド'],
  G03: ['大学研究室の論文管理', '学会発表のスライド構成'],
  G04: ['小売店の在庫アラート', 'ECサイトのカート離脱'],
  G05: ['製造ラインの品質検査', '部品サプライヤーの納期'],
  G06: ['SaaSの解約率', '新機能のオンボーディング'],
  G07: ['自治体の窓口混雑', 'オンライン申請のエラー率'],
  G08: ['病院の予約変更', '診療科間の紹介フロー'],
  G09: ['物流拠点のピッキング', '配送遅延のクレーム'],
  G10: ['新規事業の参入判断', '既存事業の撤退タイミング'],
  G11: ['広告予算の配分', 'SNSキャンペーンの反応'],
  G12: ['中古マンション購入', '固定金利と変動金利の選択'],
  G13: ['個人の転職', '副業と本業の時間配分'],
  G14: ['高校生の進路', '部活と受験勉強の両立'],
  G15: ['チームのリモート運用', '出社日のルール'],
  G16: ['結婚式の規模', '両家の費用分担'],
  G17: ['高齢の親の介護', '施設と在宅の選択'],
  G18: ['子どもの習い事', '学習と運動のバランス'],
  G19: ['ペットの健康管理', '動物病院の通院頻度'],
  G20: ['旅行先の天候リスク', 'キャンセル保険の要否'],
  G21: ['フリーランスの確定申告', '経費計上の範囲'],
  G22: ['賃貸契約の更新', '家賃値上げへの対応'],
  G23: ['慢性的な頭痛', '市販薬と受診の判断'],
  G24: ['フィットネスの目標', '筋トレと有酸素の配分'],
  G25: ['家庭菜園の害虫', '農薬を使わない対策'],
  G26: ['マンションの騒音', '管理組合への相談'],
  G27: ['近隣のゴミ置き場', 'ルール違反への対応'],
  G28: ['車の買い替え', 'EVとガソリン車の比較'],
  G29: ['自社APIの互換性', '段階的リリース計画'],
  G30: ['クラウド移行', 'オンプレとの併用期間'],
  G31: ['データベースのバックアップ', '復旧テストの頻度'],
  G32: ['社内Wikiの情報整理', '古い手順書の扱い'],
  G33: ['セキュリティインシデント', 'パスワード漏えいの疑い'],
  G34: ['店舗のレジ不整合', '現金差異の調査'],
  G35: ['災害時の避難経路', '高齢者への声かけ'],
  G36: ['国際取引の為替', '支払い通貨の選び方'],
  G37: ['AI生成画像の利用', '著作権の確認方法'],
  G38: ['宇宙関連ニュースの信頼性', '民間ロケットの失敗報道']
});

const SCENARIO_KINDS = Object.freeze([
  'short',
  'ambiguous',
  'complex',
  'compare',
  'fact_check',
  'plan',
  'improve',
  'trouble',
  'contradiction',
  'insufficient_premise',
  'multi_condition',
  'emotional'
]);

function domainForIndex(i) {
  const n = (i % 38) + 1;
  return `G${String(n).padStart(2, '0')}`;
}

function sceneFor(domain, i) {
  const list = DOMAIN_SCENE[domain] || ['日常の判断'];
  return list[i % list.length];
}

function buildUserInput(kind, scene, i) {
  const tail = i % 3;
  switch (kind) {
    case 'short':
      return tail === 0
        ? `${scene}、どこから手を付ければいい？`
        : tail === 1
          ? `${scene}で困ってる。助けて。`
          : `${scene}の件、整理したい。`;
    case 'ambiguous':
      return `${scene}がなんかおかしい。詳しくはまだ言えないけど、早めに方向性が欲しい。`;
    case 'complex':
      return `${scene}を進めたい。関係者が複数いて、予算・期限・品質のどれも譲れない。まず何を確認すべきか知りたい。`;
    case 'compare':
      return `${scene}でコストを抑える案と品質を優先する案がある。どちらも一長一短で、今は決めきれない。`;
    case 'fact_check':
      return `${scene}についてネット上で矛盾する説明を見た。どこが確かでどこが未確認か切り分けたい。`;
    case 'plan':
      return `来月までに${scene}を改善したい。途中で手戻りしない進め方を考えたい。`;
    case 'improve':
      return `${scene}の精度を上げたい。ただし今動いている運用は止めたくない。`;
    case 'trouble':
      return `${scene}で昨日からエラーが増えた。ログはまだ全部見れてない。`;
    case 'contradiction':
      return `${scene}は「急ぎ」と言われたが、同じ会議で「慎重に」とも言われた。両方の意図を壊さず整理したい。`;
    case 'insufficient_premise':
      return `${scene}を変えた方がいい気はする。根拠は薄いけど、リスクだけ先に洗い出したい。`;
    case 'multi_condition':
      return `${scene}は予算10%以内、納期は来週金曜、既存ユーザーの操作は変えない、が条件。`;
    case 'emotional':
      return `${scene}で上司とぶつかって疲れた。感情的にならずに次の打ち手を考えたい。`;
    default:
      return `${scene}について相談したい。`;
  }
}

function optionalContext(kind, scene) {
  if (kind === 'trouble') return `直近の変更: ${scene}の設定を触った可能性あり`;
  if (kind === 'multi_condition') return '関係部署=開発・法務・サポート';
  if (kind === 'emotional') return '今日は残業3時間';
  return undefined;
}

function buildStories() {
  const stories = [];
  for (let i = 0; i < 100; i += 1) {
    const coverage_domain = domainForIndex(i);
    const scenario_kind = SCENARIO_KINDS[i % SCENARIO_KINDS.length];
    const scene = sceneFor(coverage_domain, Math.floor(i / SCENARIO_KINDS.length));
    const user_input = buildUserInput(scenario_kind, scene, i);
    const context = optionalContext(scenario_kind, scene);
    const story = {
      story_id: `EF-${String(i + 1).padStart(3, '0')}`,
      user_input,
      coverage_domain,
      scenario_kind
    };
    if (context) story.context = context;
    stories.push(story);
  }
  return stories;
}

module.exports = { buildStories, DOMAIN_SCENE, SCENARIO_KINDS };
