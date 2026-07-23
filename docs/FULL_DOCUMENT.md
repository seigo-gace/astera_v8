# Astera v8 v1.1.1 完全ドキュメント

Status: 現行実装同期
対象: `quarantine/pre-drive-replacement-2026-07-21`
実装上の構成正本: `STRUCTURE.md`

## 第1部｜役割と境界

Astera v8は、主役AIや利用者へ渡す**判断材料を生成する外付けレイヤー**です。会話AI、生成AI、検索エンジン、Knowledge Baseそのものではありません。

入力された問いを固定RuleとNode.js V8上のWorker Threadsで処理し、38専門ジャンルLens、5本柱、5 Overlayを通して8段の判断材料へ整形します。外部LLMは任意であり、`null` Providerでも中核処理は実行できます。

Asteraが担当しないもの:

- 主役AIの置換
- 外部情報の真偽保証
- 医療・法律・投資等の専門家判断
- KBへの自動掲載
- 成果物の自動修正、Commit、Push、Deploy

## 第2部｜入力と出力

主な入力:

- `question`: 判断材料を作る問い
- `context`: 任意の補足情報
- `language` / `outputLanguage` / `locale`: 任意の出力言語指定
- `moodAnswers`: 急ぎ、精度要求、深い検討などの補助情報
- `llm`: 任意の外部LLM Chain

通常出力は`text/plain; charset=utf-8`の8段Markdownです。内部では認知Map、選択Lens、Evidence、Risk、比較候補、再指示を構成しますが、公開APIは利用者向けの判断材料Textを返します。

## 第3部｜38専門ジャンルLensと5 Overlay

Primary Lensは`G01`〜`G38`から1件を決定論的に選びます。Secondaryは最大3件、Overlayは必要なものだけを追加します。

```text
Input
  → Normalize
  → G01〜G38 Score
  → Primary / Secondary
  → Overlay
  → 5本柱
  → 8段の判断材料
```

Overlay:

- `high_stakes_legal`
- `medical_safety`
- `current_information`
- `evidence_strict`
- `safety_abuse`

全Lens ID、名称、4階層Anchor Pathは`docs/LENS_GENRE_INDEX.md`、実行正本は`src/all-domain-lens-catalog.js`です。

## 第4部｜5本柱と処理順

5本柱:

1. Fact: 確認済み、推測、未確認を分離する
2. Risk: 実行前に危険、失敗条件、Evidence不足を検出する
3. Multi: 攻め、守り、批判等の複数視点を作る
4. Inquiry: 目的、前提不足、反対視点、Human Reader情報を扱う
5. Compare: 候補を比較し、推奨判断へ統合する

完全同時実行ではありません。

```text
Inquiry preflight
  ├─ 前提不足が重大: clarification_neededで停止
  └─ 続行
      → Fact / Risk / Inquiryを並列
      → Multi
      → Dialectic候補
      → Compare
      → 8段出力
```

## 第5部｜8段の判断材料

| 番号 | 名称 | 役割 |
|---:|---|---|
| 01 | 本当の目的 | 表面的な依頼の奥にある達成目的と成功条件 |
| 02 | 前提不足 | 足りない条件、制約、確認事項 |
| 03 | 事実確認 | 事実、推測、未確認情報、Evidence gap |
| 04 | 危機察知 | Risk、失敗条件、先行対策 |
| 05 | 反対視点 | 反論、弱点、別の立場 |
| 06 | 比較案 | 主案、代替案、悪手、比較軸 |
| 07 | 推奨判断 | 推奨案、理由、条件、次の一手 |
| 08 | 主役AIへの再指示 | 判断材料を反映した再依頼文 |

01〜08の名称と順序は出力契約です。変更時はRuntime、Test、API文書を同時に更新します。

## 第6部｜利用入口

Astera本体（既定`127.0.0.1:7373`）:

- `GET /healthz`
- `POST /signup`
- `POST /process`
- `POST /v1/skill/process`
- `POST /billing/checkout`
- `POST /billing/webhook`

品質・完成度判定API（別Process、既定`127.0.0.1:7374`）:

- `GET /healthz`
- `POST /v1/evaluate`
- `POST /v1/skill/evaluate`

公開Tenant Keyと`ASTERA_SKILL_API_KEY`は別物です。Skill Keyは32文字以上かつ公開Global Keyと異なる必要があります。詳細は`docs/API_REFERENCE.md`を参照してください。

## 第7部｜QualityCompletionEvaluator

品質と完成度を別々に100点満点で固定Rule採点します。合格条件は次のすべてです。

- 品質`95`以上
- 完成度`95`以上
- Blocking `0`
- 必須Requirement未達`0`
- Evidence不整合`0`
- 評価処理完了

平均点での合格は禁止です。`KB_ELIGIBLE`は「掲載可能」の判定であり、KB保存完了ではありません。通常の評価EndpointはKBや`modular-catalog`へ書き込みません。

Artifact ProfileとDomain Lensは別責務です。

- Artifact Profile: 設計、実装、Test結果、運用文書等の成果物種別
- Domain Lens: `G01`〜`G38`の分野固有Risk、Evidence、Safety条件

## 第8部｜認証・安全・運用

- API KeyはPepper付きSHA-256 Hashで保存
- Payload上限は1 MiB
- `question`既定上限は100,000文字
- `context`既定上限は500,000文字
- CORS Allowlist、HTTPS強制、HSTSを環境変数で制御
- Stripe WebhookはRaw Bodyと署名で検証
- TGserver送信前にSecretを除去
- 未送信LogだけをOutboxへ保持し、成功時に削除
- 本番常駐はDocker Composeのみ

本番値、Secret、価格IDは文書へ書かず環境変数から注入します。

## 第9部｜利用方法

最短手順は`docs/QUICK_START.md`、用途別の流れは`docs/USER_GUIDE.md`を参照してください。

基本の利用順:

1. 問いに目的、対象、成功条件、制約を含める
2. Asteraへ入力する
3. 01〜08とEvidence gapを確認する
4. 不足前提があれば追加入力する
5. 08の再指示を主役AIへ渡す
6. 重要判断は一次情報や専門家で確認する

## 第10部｜エラーと再試行

- `400`: 入力形式を修正して再試行
- `401`: Keyを確認。自動再試行しない
- `403`: Origin設定を確認。自動再試行しない
- `413`: Payload、question、contextを縮小
- `426`: HTTPS経路へ切替
- `429`: Responseの`rate.resetAt`以降に再試行
- `500`: `X-Request-ID`を控え、同一入力の無制限連打を避ける
- `503`: Skill Key、Stripe価格等の必須設定を確認

## 第11部｜検証と完成条件

Repository定義の検証:

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

検証はNode.js 22以上で実行します。Documentだけの変更でも、Markdown内のPath・Endpoint・環境変数が実装と一致すること、および`RELEASE_MANIFEST.txt`のPathが存在することを確認します。

過去のTest件数を固定値として本文へ転記しません。Test追加で陳腐化するため、最新結果は実行Logと`src/quality-completion-evaluator/TEST_REPORT.md`で確認します。

## 第12部｜正本、制限、変更管理

正本の優先順位:

1. `STRUCTURE.md`: 責務、配置、依存方向、運用境界
2. 実装とSchema: 実際のRuntime契約
3. `docs/API_REFERENCE.md`: 外部HTTP契約
4. `docs/LENS_GENRE_INDEX.md`: Lens共有契約
5. 本書: 全体説明

既知の制限は`docs/LIMITATIONS.md`、変更履歴は`docs/CHANGELOG.md`を参照してください。料金、Credit減算、返金、解約、法務文書等の未確定事項は、本書から推測して確定仕様として扱いません。
