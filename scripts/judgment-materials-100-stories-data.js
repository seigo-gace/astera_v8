'use strict';

const { GENRE_LENSES } = require('../src/all-domain-lens-catalog');

function pickTerms(genre, count = 3) {
  const terms = (genre.terms || []).filter((t) => String(t).length >= 2);
  const out = [];
  for (let i = 0; i < terms.length && out.length < count; i += 1) {
    const t = terms[i];
    if (!out.includes(t)) out.push(t);
  }
  while (out.length < count) out.push(genre.name);
  return out;
}

function storiesForGenre(genre) {
  const [a, b, c] = pickTerms(genre, 3);
  const id = genre.id;
  const medicalSafe = id === 'G23';
  const crimeSafe = id === 'G34';
  const defenseSafe = id === 'G35';

  let q1;
  let q2;
  if (medicalSafe) {
    q1 = `70歳の父が30分前から胸の強い痛みと冷や汗を訴えています。自宅で様子を見るか救急要請かの判断材料を、Red Flagと既往・薬剤を軸に構造化したい。`;
    q2 = `慢性腰痛の母が新しい市販の湿布と既存の降圧薬を併用しようとしています。相互作用リスクと確認すべき事実を比較列挙し、断定診断は出さず材料だけ整理したい。`;
  } else if (crimeSafe) {
    q1 = `店舗内で現金がなくなった事案について、映像・レジログ・立会人の記述をどう保全・照合すべきか判断材料を構造化したい。逮捕や有罪断定はせず、Evidence chain を整理したい。`;
    q2 = `デジタル端末から削除された可能性のあるログについて、鑑識上の取得順序と保全条件を比較したい。実行指示ではなく、未確定要素と公式手続の観点を列挙したい。`;
  } else if (defenseSafe) {
    q1 = `海上での偶発接触リスクが報告されています。Mission、Threat、民間保護、撤退条件を比較し、作戦命令ではなく判断材料を構造化したい。`;
    q2 = `防衛と国家安全保障の文脈で、国境近傍の監視強化案と外交調整案を、法的制約と補給制約で比較したい。武力行使の実行指示は出さず、未確定とHard blocker候補だけ整理したい。`;
  } else {
    q1 = `${genre.name}の文脈で、${a}と${b}を複数の出典で比較し判断材料を構造化したい。成功条件は出典・制約・未確定を明示することである。`;
    q2 = `${genre.anchor_title}を題材に、${b}と${c}の観点で前提・リスク・比較軸を整理したい。断定結論は出さず、材料だけを列挙したい。`;
  }

  return [
    {
      id: `${id}-01`,
      expected_domain: id,
      question: q1,
      tags: ['genre-pair', id, 'compare', 'material-only']
    },
    {
      id: `${id}-02`,
      expected_domain: id,
      question: q2,
      tags: ['genre-pair', id, 'constraints', 'material-only']
    }
  ];
}

const BOUNDARY_STORIES = [
  {
    id: 'BND-01-hard-blocker',
    expected_domain: 'G29',
    question: 'APIを変更する。APIを変更するな。成功条件は互換性を維持することである。',
    tags: ['boundary', 'hard_blocker', 'prohibition']
  },
  {
    id: 'BND-02-compare-ab',
    expected_domain: 'G10',
    question: '事業戦略の新規事業A案とB案を、初期投資・回収期間・ブランドリスクで比較する。勝者は決めず判断材料だけ欲しい。',
    tags: ['boundary', 'compare', 'material-only']
  },
  {
    id: 'BND-03-preserve-prohibit',
    expected_domain: 'G29',
    question: 'READMEは残す。mainブランチは変更するな。API契約を確認し、互換性を維持して改善する。',
    tags: ['boundary', 'preserve', 'prohibition']
  },
  {
    id: 'BND-04-condition-branch',
    expected_domain: 'G29',
    question: 'API仕様を公式根拠で検証する。検証が成功した場合にのみ段階移行を計画する。Rollback可能を成功条件とする。',
    tags: ['boundary', 'condition']
  },
  {
    id: 'BND-05-cve-today',
    expected_domain: 'G31',
    question: '使用中のLibraryに重大なCVEが見つかった。停止せず今日行う対策と恒久対策を分けて判断材料を比較したい。',
    tags: ['boundary', 'security', 'compare']
  },
  {
    id: 'BND-06-credit-accounting',
    expected_domain: 'G11',
    question: '月額課金に加え前払いクレジットを販売する。売上計上、未使用残高、返金、失効の扱いを比較して材料整理したい。',
    tags: ['boundary', 'finance', 'compare']
  },
  {
    id: 'BND-07-balcony-garden',
    expected_domain: 'G38',
    question: '初心者がベランダで食べられる野菜を育てたい。手間、費用、失敗しにくさを比較し、最初の一種類を決める材料が欲しい。',
    tags: ['boundary', 'home', 'compare']
  },
  {
    id: 'BND-08-medical-emergency',
    expected_domain: 'G23',
    question: '70歳の父が30分前から胸の強い痛みと冷や汗を訴えています。自宅で様子を見るべきか、救急車を呼ぶべきか判断したい。',
    tags: ['boundary', 'medical', 'real-example']
  },
  {
    id: 'BND-09-api-migration-en',
    expected_domain: 'G29',
    question: 'Compare two API migration options for a Node.js service. Success means compatibility, rollback, and zero downtime.',
    language: 'en',
    tags: ['boundary', 'english', 'software']
  },
  {
    id: 'BND-10-mixed-it-security',
    expected_domain: 'G31',
    question: '本番APIにCVEが報告された。Patch適用とWAFルール追加を、ダウンタイムとロールバック可能性で比較し材料を整理したい。',
    tags: ['boundary', 'mixed', 'G29', 'G31']
  },
  {
    id: 'BND-11-transport-logistics',
    expected_domain: 'G28',
    question: '鉄道とトラックの長距離物流を、コスト・遅延リスク・CO2で比較する。契約更新の判断材料だけ欲しい。',
    tags: ['boundary', 'transport']
  },
  {
    id: 'BND-12-legal-contract',
    expected_domain: 'G08',
    question: 'SaaS契約の解約通知期限と損害賠償条項を、法域が日本である前提で比較整理したい。勝訴断定はせず材料だけ。',
    tags: ['boundary', 'legal']
  },
  {
    id: 'BND-13-policy-pilot',
    expected_domain: 'G07',
    question: '子育て支援給付のPilot案と全面導入案を、予算・公平性・事務負荷で比較したい。政策決定は外部に委ねる。',
    tags: ['boundary', 'policy']
  },
  {
    id: 'BND-14-ai-human-review',
    expected_domain: 'G30',
    question: 'LLMを顧客問い合わせの一次回答に使う案と、Human Review必須案を、幻覚リスクとLatencyで比較したい。',
    tags: ['boundary', 'ai']
  },
  {
    id: 'BND-15-research-repro',
    expected_domain: 'G37',
    question: '査読済み論文の再現実験が失敗した。Sample、Code、Limitationを比較し、引用更新の判断材料を構造化したい。',
    tags: ['boundary', 'research']
  },
  {
    id: 'BND-16-environment-flood',
    expected_domain: 'G21',
    question: '河川氾濫警報下で、避難指示と在宅待機の条件を、地域の標高と過去の浸水深で比較整理したい。',
    tags: ['boundary', 'environment']
  },
  {
    id: 'BND-17-education-curriculum',
    expected_domain: 'G13',
    question: '大学のプログラミング基礎科目を、Project型と試験中心型で比較する。学習目標達成の判断材料が欲しい。',
    tags: ['boundary', 'education']
  },
  {
    id: 'BND-18-translation-tone',
    expected_domain: 'G14',
    question: '技術Whitepaperを英日で公開する。直訳と意訳を、用語統一と読者層の観点で比較し材料だけ整理したい。',
    tags: ['boundary', 'language']
  },
  {
    id: 'BND-19-product-recall',
    expected_domain: 'G33',
    question: '特定Lotの電池パックで発熱報告がある。Recall範囲の広げ方と販売停止の条件を、証拠の確度別に比較したい。',
    tags: ['boundary', 'product']
  },
  {
    id: 'BND-20-telecom-5g',
    expected_domain: 'G36',
    question: '5G基地局の新設候補地AとBを、周波数干渉とバックホaulコストで比較する。設置決定はしない。',
    tags: ['boundary', 'telecom']
  },
  {
    id: 'BND-21-energy-grid',
    expected_domain: 'G27',
    question: '太陽光追加と蓄電池追加を、Peak shavingと送電契約の観点で比較したい。投資判断材料だけ欲しい。',
    tags: ['boundary', 'energy']
  },
  {
    id: 'BND-22-construction-seismic',
    expected_domain: 'G26',
    question: '耐震補強案XとYを、工期・コスト・利用者避難条件で比較する。採用案は決めず材料整理。',
    tags: ['boundary', 'construction']
  },
  {
    id: 'BND-23-agriculture-food',
    expected_domain: 'G24',
    question: '有機栽培と慣行栽培のトマトを、収量・食品安全・コストで比較し、出荷判断材料を構造化したい。',
    tags: ['boundary', 'agriculture']
  },
  {
    id: 'BND-24-philosophy-ethics',
    expected_domain: 'G02',
    question: '生成AIの学習データ利用について、応用倫理の観点で功利主義と義務論の論点を比較し、断定せず整理したい。',
    tags: ['boundary', 'philosophy', 'compare']
  }
];

function buildCorpus() {
  const fromGenres = GENRE_LENSES.flatMap(storiesForGenre);
  return [...fromGenres, ...BOUNDARY_STORIES];
}

module.exports = { buildCorpus, BOUNDARY_STORIES, storiesForGenre };
