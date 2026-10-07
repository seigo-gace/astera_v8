'use strict';

// Verification authority for the universal judgment-material redesign.
// This corpus is intentionally broader than the two live failures that exposed the redesign need.
// It is not a scenario-template implementation source. Runtime code must not import this file.

const NOISY_JA_1K = `いまの画面なんだけど全体的には前より使えるようにはなってるけどまだ利用者からみたら何を押せばいいのか分からない場所があるので、まず投稿フォーム周りをもう一回確認してほしいのと、ただ見た目をきれいにするだけじゃなくて操作した時に何が起きるかまで含めて見なおして、特に＋ボタンを押した時にオプションがOFFなら何も起きないのは困るから「○○をオンにしてください」みたいにそのオプション名が分かるように出してほしい。ただし毎回でかい警告を出すのは邪魔なのでそこも考えて。それと画像をつけた後にフォーム内へ変な線が出ることがあるけど、あれがどのCSSかコンポネントか分からないので原因をみつけて消して、でも必要な区切り線まで消すのはやめてほしい。あと履歴がページ更新すると一部きえるように見えるので本当に保存されているのか確認して、もし表示だけの問題なら表示を直す、保存自体がされてないなら保存側を直す。ただしDBを新しく増やすとかは勝手にしないこと。投稿後にそのまま次の質問ができるようにしたいのに、たまに入力欄が変な状態で残るので連続投稿を10回ぐらいやって再現するか見て、長文も短文も混ぜて確認する。コピーはできるけど編集ボタンが反応しないことがあったので編集開始、編集キャンセル、再送信まで一連で確認してほしい。それからユーザーに見せるエラーと見せなくていい内部エラーがごちゃまぜになってる感じがするので、system側の通信失敗とか内部API名とかstack traceみたいなのは見せず、利用回数上限、クレジット不足、購入失敗、権限不足みたいにユーザー自身が対処できるものだけ分かる文章にしてほしい。あとPurposeの選択は今だと見つけにくいので＋の中だけじゃなく投稿欄の近くで今何が選ばれてるか分かるようにしたい、通常はautoでいいが自由入力した目的も反映できるようにして、目的を変えたあと新しい会話に移ったら前の目的が勝手についてこないことも確認する。スマホだと横幅せまいのでPixelくらいの幅で横スクロールが出ないか見て、画面回転も一応みてほしいけどPCレイアウトを壊してまでスマホ優先にはしないで。ファイル投稿はzipや画像でエラーになることがあるから、対応してる形式と対応してない形式を分けて、対応外なら内部エラーじゃなく普通に利用者へ案内を出すようにする。それと回答はAsteraが判断材料を作るだけで最終決定を勝手にしない設計のはずだから「これが最適です」と断定してないかも確認して、根拠が無い時は根拠なしのまま出して、適当に外部根拠を補完しないようにする。最後にこれらを直したあと、1000文字くらいのぐちゃぐちゃした入力と5000文字以上の長文と、きれいに整理された文章の3種類で投稿testして、要求が消えてないか、勝手に別タスクが増えてないか、同じ内容を何度も言い換えて水増ししてないか、人間が読んでもAIに渡しても判断材料として使えるかを確認してほしい。なお途中で関係ない機能追加とか新しい画面をつくる必要はないし、今ある構造をなるべく使って直して、作業したつもりじゃなくて実際の結果で判断してほしぃ。`;

const NOISY_EN_1K = `The screen is better than before but users still don't always know what to press so review the posting form again, not only how it looks but what actually happens after an action, and when the plus button is touched while an option is OFF don't do nothing, show something like “turn <option name> on”, but don't throw a huge modal every time because that would be annoying. After an image is attached a strange line sometimes appears inside the form; find whether it comes from CSS, a component, pseudo element, focus border or divider and remove only the unwanted line without deleting a necessary attachment boundary. History also seems to partly disapear after reload so verify whether persistence is broken or only rendering is broken, fix the correct side, but do not invent a new DB. Do ten consecutive posts mixing long and short messages because sometimes the input stays in a weird state. Copy works but Edit sometimes does nothing, so verify edit start, cancel and resend. Separate user-actionable errors from internal failures: limits, credits, purchase failure, permission and unsupported file types can be explained, but internal API names, service hosts and stack traces must not leak. Purpose is hard to discover, so make the selected purpose visible near the form, default to AUTO, allow free text, and make sure a manual purpose from one conversation does not silently carry into a new one. Check Pixel-sized portrait and landscape without horizontal scrolling but don't break desktop. Zip and images sometimes fail; distinguish supported and unsupported formats and show a normal user message for unsupported ones. Astera must only provide judgment material and must not say “this is optimal”; if evidence does not exist keep it as no evidence instead of filling the gap. Finally test a messy ~1000 character input, a 5000+ character document, and a clean structured input and verify no request disappears, no phantom task is added, no repetition is used as fake depth, and the result is usable by both a human and another AI. Don't add unrelated screens and prefer the existing structure; judge completion by actual results not by saying work was done.`;

const CLEAN_JA_5K = `件名: Universal Conversation / AI Handoff Pipeline 改修設計および検証依頼

現在のAstera Appでは利用者またはAIが一回の投稿に複数の依頼、条件、観測、禁止事項、比較条件、Evidence要求を含める場合がある。今回の目的は単なる長文対応ではなく、入力の意味を失わず後段のHuman/Main AIへ判断材料を渡すためのHandoff Pipelineを設計・検証することである。

第一の目的は、一投稿を一Taskとみなさず、独立した判断結果を必要とする要求をRequest Unitとして保持すること。句点単位ではなく、調査、修正、確認、変更禁止、条件付き挙動などの意味関係を保つ。Requestにはsource span、objective、conditions、prohibitions、observations、expected state、acceptance criteria、evidence requirement、dependenciesを保持し、分類に失敗しても原文から復元できること。

第二の目的はPurposeをConversation全体の一値だけで扱わず、Conversation PurposeとRequest Purposeを分けること。UIでcompareが指定されていても後半にimplementation planningがあれば後半をcompareへ強制しない。AUTO推定と利用者明示値のAuthorityも混同しない。新規Conversationへ旧manual purposeを勝手に継承しない。

第三の目的はAI Handoff Payloadをstructured payloadとhuman-readable materialに分けること。request units、observations、facts、unresolved items、evidence state、risk items、prohibitions、task graphはmachine-readableに保持する一方、Public Main8へinternal task id、parser status、stack trace、provider internal errorを漏らさない。

第四の目的はObservation、Fact、Assumptionを混同しないこと。利用者が画像投稿後に線が出ると書いても、それはObservationでありCSS borderが原因というFactではない。外部Evidenceが0なら根拠なしのまま返し、近い一般論で穴埋めしない。Evidenceが見つかってもClaimを直接supportしているか確認する。Asteraは最終Decisionやwinnerを出さない。

第五の目的はError Boundaryである。利用回数上限、Credit不足、権限不足、未対応形式などUserが対処できる状態と、Parser timeout、内部Service通信、DB connection、stack traceなど内部失敗を分離する。Option OFF時の+操作は無反応にせず対象Option名を明示する軽量案内を出し、そのためだけに新Global State libraryを追加しない。

第六の目的はConversation Continuityである。短文、長文、画像、通常Text、Purpose変更、File添付を最低10回連続しても前Messageのstateが次を汚染しないこと。Page reload後に履歴が復元されるかも確認する。ただし今回のために新規Server DBを勝手に導入しない。

第七の目的はMessage Edit Flowである。編集開始、Cancel、再送信を確認し、再送信が新Requestか既存更新かCurrent contractを確認して決める。契約がなければ推測で決めず未確定として保持する。

第八の目的はFile Handlingである。zip、画像、text等の対応形式を分離し、未対応形式をInternal Errorへしない。Size limit、Upload失敗、security check、temporary storage failureも同一Errorに潰さない。画像後の不要線は生成元を特定して必要な境界まで消さない。

第九の目的はResponsive UIである。PC、Tablet、Mobileを対象にPixel 7相当のPortrait/Landscapeで横スクロールやForm逸脱がないか確認し、Desktopを破壊しない。

第十の目的はTesting Strategyである。短い単一要求、3件の複数要求、約1000文字の崩れた入力、5000文字以上のAI生成設計文、誤字あり、指示語多数、Evidence要求あり/なし、Option ON/OFF、Fileあり/なし、Conversation連続10投稿を試す。長文ではRequest数を固定値で水増しせず独立要求が消えていないかを確認する。

第十一の目的はSecurityである。AI Handoff PayloadへSecret、API Key、Authorization Header、内部Host、Server absolute pathを出さない。Debug Logに存在してもPublic responseへ出さない。

第十二の目的はPerformanceである。品質を落として速度だけを取らないが、Parser、Task decomposition、Evidence Search、Canonical processing、Five Lane、Main8 renderingの時間を分離して測れるようにし、Total timeだけで最適化しない。

Compatibilityとして既存短文と単一Requestを壊さない。Multi-Request対応のために単純な入力へ大量の説明を付けない。今回のScope外はPayment、Account registration、Cloudflare Access、Production deployment、Database migration、MCP本体変更であり、必要性を見つけても勝手に変更せず別材料として示す。

Acceptance Criteriaは、一投稿内の複数要求の目的・制約・禁止条件が保持されること、ObservationがFactへ昇格しないこと、根拠なしを根拠ありにしないこと、別RequestのEvidenceを流用しないこと、Main8が8節であるだけでなく各節が質問固有の判断材料を含むこと、内部Debug構造がPublicへ漏れないこと、長文先頭だけへCollapseしないこと、人間とAIがそのまま利用できること、そしてSource Testだけでなく実HTTP経路でも確認できることとする。

最終的に欲しい状態は、AIまたは人間が整理されていない長文を投稿しても、Asteraが短い要約へ潰すのではなく、元の要求、条件、観測、Evidence境界を保持し、未確認は未確認のまま、成立したEvidenceだけを結び、Main8で判断に必要な材料を返すことである。既存Case Model、Task Graph、Evidence、Main8を再利用できるなら再利用し、特定Test文章専用の分岐やhard-codeは禁止する。`;

const CLEAN_EN_5K = `Title: Universal Conversation and AI Handoff Pipeline redesign and verification request.

Astera must handle posts authored by either humans or AIs that combine multiple requests, objectives, observations, prohibitions, conditions, comparisons and evidence requirements. The goal is not merely “support long text”; the goal is to preserve meaning and deliver decision-ready material to a downstream Human or Main AI.

Objective one: stop assuming one post equals one Task. Preserve each source-backed judgment request as a Request Unit with source span, objective, conditions, prohibitions, observations, expected state, acceptance criteria, evidence requirement and dependencies. Sentence splitting is not enough; investigation, modification, verification, do-not-change clauses and conditional behaviors must retain their ownership.

Objective two: separate Conversation Purpose from Request Purpose. A conversation manually tagged compare may still contain a later implementation-planning request. AUTO inference must not have the same authority as an explicit user purpose, and a manual purpose must not silently leak into a new conversation.

Objective three: define an AI Handoff Payload with both structured and human-readable forms. Structured data may include request units, observations, facts, unresolved items, evidence state, risks, prohibitions and a task graph. Public Main8 must not leak internal task ids, parser statuses, stack traces or provider implementation errors.

Objective four: never merge Observation, Fact and Assumption. A report that a line appears after an image upload is an observation, not proof that a CSS border is the cause. If external evidence is absent, preserve “no evidence” rather than filling the gap with nearby general information. Evidence must support the actual Claim. Astera must not pick a winner or issue the final decision.

Objective five: separate user-actionable errors from internal system failures. Limits, credits, permissions and unsupported formats may be explained. Parser timeout, service communication details, database connection data and stack traces must remain internal. When an option is OFF and the user touches +, show a lightweight enable-option message rather than doing nothing, without adding a new global state library just for that message.

Objective six: Conversation Continuity. Ten consecutive posts mixing short text, long text, images, normal text, purpose changes and files must not leak previous state into the next message. History must recover after reload if the existing persistence contract supports it. Do not invent a new server database for this task.

Objective seven: Message Edit Flow. Verify edit start, cancel and resend. Determine whether resend is a new Request or an update from the current product contract; if the contract is absent, keep the issue unresolved rather than making up behavior.

Objective eight: File Handling. Separate supported and unsupported zip/image/text cases and distinguish size limit, upload failure, security check and temporary storage failure. For the image-line defect, identify the generating source and preserve necessary boundaries.

Objective nine: Responsive UI. Verify desktop, tablet and mobile including Pixel-sized portrait and landscape, no horizontal overflow, and no desktop regression.

Objective ten: Testing Strategy. Cover a short single request, three requests, noisy ~1k input, clean AI-authored 5k+ design text, typo-heavy text, reference-heavy text, evidence requested/not requested, option ON/OFF, file/no file and ten-message continuity. Long-input verification must detect lost requests and phantom public requests, not merely enforce a fixed request count.

Objective eleven: Security. Never expose secrets, API keys, Authorization headers, internal hosts or server absolute paths in AI handoff or public responses.

Objective twelve: Performance. Do not trade away semantic quality for speed. Measure Parser, Task decomposition, Evidence Search, Canonical processing, Five Lanes and Main8 separately rather than optimizing only total time.

Compatibility requires that short and single-request inputs stay concise. Scope excludes payment, registration, Cloudflare Access, production deployment, database migration and MCP-project mutation. Acceptance requires preserved request ownership, no Observation-to-Fact promotion, no fabricated evidence, no evidence leakage between Requests, useful question-specific material in all eight Main8 sections, no internal diagnostic leakage, no long-input collapse, usability by both humans and AIs, and real HTTP verification in addition to source tests. Hard-coded branches for this test document are forbidden.`;

const DOMAINS = [
  ['G01','general','百科情報の改訂判断','encyclopedic information revision',['source authority','freshness','conflict','情報源','鮮度','矛盾']],
  ['G02','ethics','公共AI方針の倫理判断','ethics of a public AI policy',['stakeholder','values','trade-off','利害関係者','価値','トレードオフ']],
  ['G03','behavior','行動介入の採用判断','behavioral intervention adoption',['population','effect','bias','対象集団','効果','バイアス']],
  ['G04','history','歴史的主張の妥当性判断','historical claim validity',['primary source','provenance','chronology','一次資料','出所','年代']],
  ['G05','geography','地域計画候補の判断','regional planning choice',['population','location','time period','人口','位置','時点']],
  ['G06','social','福祉施策変更の判断','social welfare policy change',['affected group','equity','access','対象者','公平','アクセス']],
  ['G07','policy','公共政策案の判断','public policy option',['jurisdiction','implementation','public impact','管轄','実施','公共影響']],
  ['G08','legal','契約条項の適用判断','contract clause applicability',['jurisdiction','effective date','exception','管轄','施行日','例外']],
  ['G09','economics','貿易施策の影響判断','trade policy impact',['baseline','counterfactual','distribution','基準','反実仮想','分配']],
  ['G10','business','新規事業計画の判断','new business plan',['market','unit economics','execution risk','市場','収益構造','実行リスク']],
  ['G11','finance','投資案件の比較判断','investment comparison',['cash flow','downside','liquidity','Cash Flow','Downside','流動性']],
  ['G12','workforce','採用計画の判断','workforce hiring plan',['skills','labor market','retention','技能','労働市場','定着']],
  ['G13','education','教育プログラム導入判断','education program adoption',['learner population','outcome','assessment','学習者','成果','評価']],
  ['G14','language','翻訳方針の判断','translation policy',['source meaning','terminology','locale','原意','用語','ロケール']],
  ['G15','publishing','資料公開方針の判断','publication/archive decision',['version','rights','preservation','版','権利','保存']],
  ['G16','culture','文化事業企画の判断','cultural project proposal',['audience','context','rights','対象者','文脈','権利']],
  ['G17','sports','大会運営案の判断','sports event plan',['participants','schedule','safety','参加者','日程','安全']],
  ['G18','math','統計的結論の妥当性判断','statistical conclusion validity',['assumption','method','uncertainty','仮定','手法','不確実性']],
  ['G19','physics','観測解釈の判断','physics observation interpretation',['measurement','model','uncertainty','測定','モデル','不確実性']],
  ['G20','chemistry','材料選定判断','material selection',['composition','property','test condition','組成','特性','試験条件']],
  ['G21','climate','災害対策案の判断','disaster mitigation option',['hazard','exposure','time horizon','ハザード','曝露','期間']],
  ['G22','biology','生態管理案の判断','ecosystem management',['species','ecosystem','evidence quality','種','生態系','根拠品質']],
  ['G23','medical','医療プログラム方針の判断','health program policy',['population','benefit','harm','対象集団','便益','害']],
  ['G24','agriculture','農業施策の判断','agricultural policy',['yield','environment','food safety','収量','環境','食品安全']],
  ['G25','engineering','設備設計変更の判断','engineering design change',['requirement','failure mode','verification','要求','故障モード','検証']],
  ['G26','construction','建設計画変更の判断','construction plan change',['code','site condition','lifecycle','基準','現場条件','ライフサイクル']],
  ['G27','energy','電源構成案の判断','energy mix option',['demand','reliability','cost assumption','需要','信頼性','費用前提']],
  ['G28','transport','物流経路変更の判断','logistics route change',['capacity','time','resilience','容量','時間','レジリエンス']],
  ['G29','software','System設計変更の判断','software architecture change',['interface','dependency','regression','インターフェース','依存','回帰']],
  ['G30','ai','AI評価方式の判断','AI evaluation design',['dataset','metric','failure mode','データセット','指標','失敗モード']],
  ['G31','cyber','Security対策案の判断','cybersecurity control',['threat','asset','control effectiveness','脅威','資産','対策効果']],
  ['G32','compliance','規格適合方針の判断','standards compliance',['applicable requirement','evidence','exception','適用要求','証拠','例外']],
  ['G33','consumer','製品安全変更の判断','consumer product safety',['user exposure','failure','recall/mitigation','利用者曝露','故障','是正']],
  ['G34','public-safety','緊急対応計画の判断','emergency response plan',['hazard','response capacity','escalation','危険','対応能力','エスカレーション']],
  ['G35','defense','非機密の装備調達方針の判断','non-sensitive defense procurement policy',['mission need','lifecycle','governance','任務要求','ライフサイクル','統治']],
  ['G36','telecom','通信方式変更の判断','telecom architecture change',['capacity','latency','interoperability','容量','遅延','相互運用']],
  ['G37','research','研究計画の判断','research plan',['hypothesis','method','reproducibility','仮説','手法','再現性']],
  ['G38','personal','家庭の大きな購入判断','major household purchase',['need','total cost','constraint','必要性','総費用','制約']]
];

function makeDomainCases() {
  return DOMAINS.flatMap(([genre, slug, jaTopic, enTopic, materialTerms]) => {
    const ja = `【${genre}】${jaTopic}について判断材料が欲しい。結論を決めず、現在分かっている事実、未確認事項、主要な危険、反対側から確認すべき条件、比較に必要な軸、必要な根拠とその成立状態、次に確認する材料を8段で示して。`;
    const en = `[${genre}] I need decision material for ${enTopic}. Do not make the final decision. Separate known facts from unresolved items, identify material risks and disconfirming conditions, state comparison dimensions, evidence requirements and evidence status, and say what should be verified next in the eight-section material.`;
    const expected = {
      min_requests: 1,
      material_terms: materialTerms,
      min_material_concepts: 3,
      forbidden_material_terms: genre === 'G11' ? ['前受管理','利用時認識','返金対応','失効Policy','未使用残高管理','refund liability','breakage policy'] : [],
      evidence_requested: true,
      genre
    };
    return [
      { id: `${genre}-${slug}-ja`, pair: `${genre}-${slug}`, language: 'ja', kind: 'domain', input: ja, expected },
      { id: `${genre}-${slug}-en`, pair: `${genre}-${slug}`, language: 'en', kind: 'domain', input: en, expected }
    ];
  });
}

function makeStress(language) {
  const jaSections = [
    '目的Aは既存Systemの要求を失わず処理すること。',
    '目的Bは根拠がない場合に推測で補完しないこと。',
    '条件として新規Databaseを追加しない。',
    '例外として既存契約で必須なMigrationは別判断材料として示す。',
    '観測として長文時に一部要求が消えることがあった。',
    '検証ではRequestと内部Taskを混同しない。',
    '比較では速度だけでなく品質と回帰を同条件で見る。',
    'SecurityではSecretや内部PathをPublicへ出さない。',
    'PerformanceではParser待ちとEvidence待ちとCPU処理を分離計測する。',
    '最終判断は外部のHumanまたはMain AIに残す。',
    '日本語と英語で意味上同じ判断材料を得られることを確認する。',
    '38ジャンルの分類だけでなく各質問に必要な材料が揃うことを確認する。'
  ];
  const enSections = [
    'Objective A is to preserve all system requirements without semantic loss.',
    'Objective B is to avoid filling missing evidence with guesses.',
    'Do not add a new database as a shortcut.',
    'If an existing contract truly requires migration, report that as separate decision material rather than silently changing scope.',
    'An observed failure is that some requests disappear in long inputs.',
    'Verification must not confuse public Requests with internal Tasks.',
    'Comparison must evaluate quality and regression under the same conditions, not speed alone.',
    'Security must keep secrets and internal paths out of public output.',
    'Performance measurement must separate parser wait, evidence wait and CPU processing.',
    'Final decision authority remains with the Human or Main AI.',
    'Japanese and English should preserve equivalent semantic judgment material.',
    'All 38 domains require useful material, not classification-only success.'
  ];
  const units = language === 'ja' ? jaSections : enSections;
  const repeated = [];
  while (repeated.join('\n').length < 10000) repeated.push(...units.map((x, i) => `${i + 1}. ${x}`));
  return repeated.join('\n').slice(0, 10500);
}

function loadUniversalCorpus() {
  const cases = [
    {
      id: 'known-noisy-multi-ja-1k', pair: 'known-noisy-multi-1k', language: 'ja', kind: 'known_failure', input: NOISY_JA_1K,
      expected: { min_requests: 12, anchors: ['オプション','画像','履歴','連続投稿','編集','エラー','Purpose','Pixel','ファイル','根拠','1000文字','5000文字'], forbidden_material_terms: ['資金流動性','会計誤分類','返金負債','未使用残高管理','前受管理','利用時認識','失効Policy'], evidence_requested: false }
    },
    {
      id: 'known-noisy-multi-en-1k', pair: 'known-noisy-multi-1k', language: 'en', kind: 'known_failure', input: NOISY_EN_1K,
      expected: { min_requests: 12, anchors: ['option','image','history','consecutive','Edit','errors','Purpose','Pixel','Zip','evidence','1000','5000'], forbidden_material_terms: ['refund liability','breakage policy','prepaid accounting','deferred revenue'], evidence_requested: false }
    },
    {
      id: 'known-clean-ai-ja-5k', pair: 'known-clean-ai-5k', language: 'ja', kind: 'known_failure', input: CLEAN_JA_5K,
      expected: { min_requests: 12, anchors: ['第一の目的','第二の目的','第三の目的','第四の目的','第五の目的','第六の目的','第七の目的','第八の目的','第九の目的','第十の目的','第十一の目的','第十二の目的'], evidence_requested: true }
    },
    {
      id: 'known-clean-ai-en-5k', pair: 'known-clean-ai-5k', language: 'en', kind: 'known_failure', input: CLEAN_EN_5K,
      expected: { min_requests: 12, anchors: ['Objective one','Objective two','Objective three','Objective four','Objective five','Objective six','Objective seven','Objective eight','Objective nine','Objective ten','Objective eleven','Objective twelve'], evidence_requested: true }
    },
    {
      id: 'stress-ja-10k', pair: 'stress-10k', language: 'ja', kind: 'stress', input: makeStress('ja'),
      expected: { min_requests: 8, anchors: ['目的A','目的B','Database','長文','Request','速度','Security','Performance','最終判断','日本語','38ジャンル'], evidence_requested: false }
    },
    {
      id: 'stress-en-10k', pair: 'stress-10k', language: 'en', kind: 'stress', input: makeStress('en'),
      expected: { min_requests: 8, anchors: ['Objective A','Objective B','database','long inputs','Requests','speed','Security','Performance','Final decision','Japanese','38 domains'], evidence_requested: false }
    },
    ...makeDomainCases()
  ];
  return cases;
}

module.exports = { loadUniversalCorpus, DOMAINS };
