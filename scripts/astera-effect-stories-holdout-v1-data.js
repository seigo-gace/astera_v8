'use strict';

const { GENRE_LENSES } = require('../src/all-domain-lens-catalog');

const SCENARIO_KINDS = Object.freeze([
  'simple',
  'complex',
  'multi_stage',
  'ambiguous',
  'contradiction',
  'prohibition',
  'deadline',
  'compare',
  'evidence_need'
]);

/** Original holdout prompts — not derived from EF/US corpora. */
const HOLDOUT_PROMPTS = Object.freeze([
  {
    kind: 'simple',
    user_input: '地域の図書館カードで、所蔵検索と貸出履歴の画面が分かれていて、初めて来た利用者向けにどこから案内すべきか整理したい。',
    context: '窓口は午後だけ有人。'
  },
  {
    kind: 'ambiguous',
    user_input: '研究室の倫理委員会提出書類が「なんとなく弱い」と言われた。何を足せばよいかまだ特定できていない。',
    context: ''
  },
  {
    kind: 'complex',
    user_input: '認知負荷の高いUIを直す提案があるが、高齢被験者のデータは少ない。実験計画とリスクを同時に整理したい。',
    context: '次の学会まで10週間。'
  },
  {
    kind: 'evidence_need',
    user_input: '中世の地方文書コレクションで、写本年代の記載が文献間で食い違う。一次史料を当たる前に論点を分けたい。',
    context: '県立アーカイブ閲覧予約は来週火曜。'
  },
  {
    kind: 'compare',
    user_input: 'GISで見る人口推計、国勢調査ベースと住民票ベースで数字が違う。どちらを主軸に説明すべきか決めきれない。',
    context: '用途は商店街の再開発説明会。'
  },
  {
    kind: 'prohibition',
    user_input: '障害者支援の申請フローを短縮したいが、本人同意の記録方式は変えたくない。改善案の論点だけ欲しい。',
    context: ''
  },
  {
    kind: 'deadline',
    user_input: '子育て支援のPilot施策、来月末までに評価指標のたたき台が必要。予算は確定していない。',
    context: '議会答弁用の草案ではない。'
  },
  {
    kind: 'contradiction',
    user_input: '契約書ドラフトでは解約通知は30日前なのに、口頭では14日と説明されていた。損害賠償条項を触る前に事実関係を整理したい。',
    context: '相手方弁護士との初回面談前。'
  },
  {
    kind: 'multi_stage',
    user_input: '新興国向け輸出の為替ヘッジ、段階的に試す案と一括ヘッジ案がある。政策変更リスクの読み方が分からない。',
    context: '社内では最終決定は取締役会。'
  },
  {
    kind: 'simple',
    user_input: 'D2Cブランドの広告ROASが落ちている。クリエイティブ刷新と配信面の見直し、どちらから手を付けるか迷っている。',
    context: ''
  },
  {
    kind: 'evidence_need',
    user_input: '前受け収益の返金条件が四半期ごとに変わった。会計上いつ認識するか、契約条項と実績ログを突き合わせたい。',
    context: '監査法人への質問リスト作成前。'
  },
  {
    kind: 'complex',
    user_input: 'エンジニア採用で、即戦力重視と育成枠拠点の新設が同時に議論されている。労務上の論点も含めて整理したい。',
    context: '人事部長は「来週中に論点メモ」と言っている。'
  },
  {
    kind: 'ambiguous',
    user_input: '大学のオンライン授業評価が低い原因が、教材なのかTA運用なのかまだ分からない。改善の当たりを付けたい。',
    context: ''
  },
  {
    kind: 'compare',
    user_input: '技術Whitepaperを英語化する。直訳だと用語が硬いが、意訳だと条件のニュアンスが抜ける恐れがある。',
    context: '固定用語集はまだない。'
  },
  {
    kind: 'prohibition',
    user_input: '近代小説の引用を論文に入れたいが、版によってページが違う。勝手に一つの版を「正」と決めたくない。',
    context: '査読前の下書き。'
  },
  {
    kind: 'deadline',
    user_input: '地域の音楽祭、雨天時の代替プログラムを来週の運営会議までに候補出ししたい。会場契約の例外条項は読み直していない。',
    context: ''
  },
  {
    kind: 'multi_stage',
    user_input: 'アマチュアサッカー大会の遠征と、観光パックを組む案がある。安全基準と費用分担を段階的に詰めたい。',
    context: '主催は市のスポーツ協会。'
  },
  {
    kind: 'contradiction',
    user_input: '統計の演習で、母平均の信頼区間の求め方を2通り教わった。前提が違うのか計算ミスなのか切り分けたい。',
    context: '試験は再来週。'
  },
  {
    kind: 'evidence_need',
    user_input: '観測衛星の公開データで太陽フレア予報をしたいが、最新フレアの確認が取れていない。何を先に確認すべきか。',
    context: ''
  },
  {
    kind: 'simple',
    user_input: '研究室の触媒実験、温度を上げると反応は速いが副生成物が増える。条件のトレードオフを整理したい。',
    context: '換気設備の上限あり。'
  },
  {
    kind: 'complex',
    user_input: '河川流域の洪水リスクマップと、自治体の避難指示タイミングが一致しない。住民説明用に論点を揃えたい。',
    context: '豪雨の季節前。'
  },
  {
    kind: 'ambiguous',
    user_input: '細胞培養の汚染が再発した。プロトコル漏れか試薬ロットか、まだ断定できない。',
    context: 'BSL-2ラボ。'
  },
  {
    kind: 'prohibition',
    user_input: '慢性的な頭痛で市販の湿布と既存の降圧薬を併用している。新しい市販薬を自分で選ぶ前に確認したい。最終判断は医師に任せる。',
    context: '来週の定期受診予定。'
  },
  {
    kind: 'deadline',
    user_input: '有機トマトの栽培で、来週までに防除方針を決めたい。有機認証の要件は外せない。',
    context: '直近の病害虫調査は未実施。'
  },
  {
    kind: 'compare',
    user_input: '量産部品の材料をアルミからマグネシウム合金に変える案がある。重量は減るが加工工程が増える。',
    context: '安全係数1.5は維持。'
  },
  {
    kind: 'multi_stage',
    user_input: '耐震補強とBIM更新を同時進行したいが、図面Versionが現場と食い違う。段階的な確認順を決めたい。',
    context: '建築確認申請は来月。'
  },
  {
    kind: 'evidence_need',
    user_input: '工場の自家発と系統連系、ピーク時の逆潮流が発生しているかログをまだ見ていない。調査項目を立てたい。',
    context: ''
  },
  {
    kind: 'contradiction',
    user_input: '長距離トラックの配送を鉄道に部分移行する案で、CO2削減見込みの試算が2チームで符号が逆になった。',
    context: '来週の経営会議資料。'
  },
  {
    kind: 'complex',
    user_input: 'APIサーバーをNodeから別Runtimeへ段階移行したい。互換性テストとロールバック手順を同時に設計したい。',
    context: '本番トラフィックは止められない。'
  },
  {
    kind: 'simple',
    user_input: '社内チャットボットに社外PDFを学習させる案がある。個人情報とPrompt Injectionの論点を先に整理したい。',
    context: ''
  },
  {
    kind: 'deadline',
    user_input: '公開WebアプリにCVEが出た。パッチ適用とWAFルール追加、どちらを先にするか金曜までに方針が欲しい。',
    context: '本番は24時間稼働。'
  },
  {
    kind: 'prohibition',
    user_input: 'ISO9001監査で、旧版の手順書を現場が使っている。監査員に「是正は来月まで」と言われたが、現場の稼働を止めたくない。',
    context: ''
  },
  {
    kind: 'ambiguous',
    user_input: '電動工具のリコール候補Lotがあるが、発熱報告がSNS中心で公式件数がまだ少ない。調査の当たりを付けたい。',
    context: '小売店からの問い合わせ増。'
  },
  {
    kind: 'evidence_need',
    user_input: 'コンビニ強盗の防犯カメラ映像とPOSログの時刻が数分ずれている。鑑識に渡す前に整合性の確認項目を知りたい。',
    context: '警察には未通報。'
  },
  {
    kind: 'compare',
    user_input: '離島防衛の訓練頻度を上げる案と、外交チャネル強化案がある。どちらも予算とリスクの読み方が違う。',
    context: '最終判断は上層部。'
  },
  {
    kind: 'multi_stage',
    user_input: '5G基地局の周波数割当変更で、既存ルータ設定と放送干渉の可能性が同時に指摘された。段階的な確認順が欲しい。',
    context: ''
  },
  {
    kind: 'contradiction',
    user_input: '査読付き論文とプレプリントで、同じデータセットの効果量が逆になっている。再現性チェックの論点を整理したい。',
    context: '引用はまだしていない。'
  },
  {
    kind: 'simple',
    user_input: 'ベランダ菜園で、夏の強日射と隣家への遮光クレームの両方がある。品種と配置の論点を整理したい。',
    context: '来月から夏本番。'
  }
]);

function buildStories() {
  if (HOLDOUT_PROMPTS.length !== 38) {
    throw new Error(`Expected 38 holdout prompts, got ${HOLDOUT_PROMPTS.length}`);
  }
  const byId = Object.fromEntries(GENRE_LENSES.map((g) => [g.id, g]));
  const stories = [];
  for (let i = 0; i < 38; i += 1) {
    const domainId = `G${String(i + 1).padStart(2, '0')}`;
    const genre = byId[domainId];
    if (!genre) throw new Error(`Missing genre ${domainId}`);
    const prompt = HOLDOUT_PROMPTS[i];
    const story = {
      story_id: `HO-${String(i + 1).padStart(3, '0')}`,
      user_input: prompt.user_input,
      coverage_domain: domainId,
      scenario_kind: prompt.kind,
      domain_label: genre.name
    };
    if (prompt.context) story.context = prompt.context;
    stories.push(story);
  }
  return stories;
}

module.exports = { buildStories, SCENARIO_KINDS, HOLDOUT_PROMPTS };
