# Astera 共通レンズ・ジャンル一覧

Status: 共有運用基準
Document ID: `astera-lens-genre-index`
Schema Version: `1.0`

## 1. 目的

この文書は、Astera v8とASTERA-KBの間で使用するレンズ・ジャンルの固定ID、役割、接続境界を共通管理するための索引です。

READMEへ全ジャンル本文を展開せず、両RepositoryのREADMEから本ファイルを参照します。

## 2. 両Repositoryでの役割

| Repository | 使用目的 |
|---|---|
| `astera_v8` | 入力内容に対して何を重点確認するかを選ぶ実行側Lens |
| `astera-kb` | KB Taxonomy・検索結果をAsteraのLens IDへ接続するCrosswalk契約 |

KB TaxonomyとLensは同一ではありません。

- KB Taxonomy: 情報が何に属するか
- Astera Lens: その情報をどの観点で検証・比較するか

## 3. 正本と同期

- 実行時の判定語・処理内容: `astera_v8/src/domain-template-router.js`
- 各Lensの詳細仕様: `astera_v8/docs/DOMAIN_TEMPLATE_CATALOG.md`
- 共通ジャンル索引: 両Repositoryの `docs/LENS_GENRE_INDEX.md`
- KB側の全分野Taxonomy: ASTERA-KBのTaxonomy文書・Data

両Repositoryの本ファイルは、`Document ID`と`Schema Version`を一致させます。Lens IDの追加・変更時は双方を同時更新します。

## 4. 運用ルール

- Primary Lensは原則1件を選択します。
- 専門ジャンルが確定しない場合は `general_judgment` を使用します。
- Overlay LensはPrimary Lensを置き換えず、安全・Evidence条件を追加します。
- Lens IDは検索Script、KB Crosswalk、Log、Testの共通Keyとして使用します。
- 既存Lens IDは名称変更時も安易に変更しません。
- `other`、`unknown`、`unclassified`などの逃げ分類は作りません。
- KB Taxonomyの全NodeをLens一覧へ複製しません。
- 検索Score、Keyword重み、分類Logicは本ファイルへ記載しません。

## 5. Primary Lens一覧

| No. | Lens ID | 表示名 | 主な対象 |
|---:|---|---|---|
| 00 | `general_judgment` | 一般判断 / Default | 専門分野が支配的でない相談、判断、総合検討 |
| 01 | `business_strategy` | 経営・事業戦略 | 経営判断、事業Model、価格、提携、市場参入 |
| 02 | `finance_capital` | 金融・投資・資本配分 | 予算、投資評価、資金調達、収益性、資本配分 |
| 03 | `legal_compliance` | 法律・Compliance・契約 | 法令、契約、紛争、知的財産、規制対応 |
| 04 | `medical_health` | 医療・健康・Clinical | 症状、治療選択、医療情報、公衆衛生 |
| 05 | `marketing_growth` | Marketing・成長・Brand | 集客、広告、Positioning、Conversion、Brand |
| 06 | `product_ux` | Product・UX・Roadmap | 要件、機能優先順位、UX、Onboarding、Roadmap |
| 07 | `engineering_architecture` | Engineering・Architecture・実装 | Software設計、API、DB、移行、性能、実装計画 |
| 08 | `cybersecurity_privacy` | Cybersecurity・Privacy・Trust | 認証、認可、Secret、脅威、Privacy、Incident対応 |
| 09 | `ai_ml_governance` | AI・ML・LLM Governance | AI採用、Model選定、評価、安全、Bias、運用統制 |
| 10 | `project_operations` | Project・Program・Operations | 工程、納期、担当、依存関係、運用改善 |
| 11 | `hr_organization` | HR・Organization・People | 採用、評価、報酬、Team設計、労務、組織運営 |
| 12 | `sales_customer_success` | Sales・Customer Success・交渉 | 商談、提案、更新、解約、顧客対応、交渉 |
| 13 | `research_evidence` | Research・Academic・Evidence Review | 論文、調査設計、仮説、引用、Evidence統合 |
| 14 | `education_training` | Education・Training・Learning Design | 教育、研修、教材、Curriculum、Assessment |
| 15 | `procurement_vendor` | Procurement・Vendor・Build-vs-Buy | Tool選定、SaaS、外注、調達、内製比較 |
| 16 | `crisis_reputation` | Crisis・Reputation・Public Communication | 事故、炎上、謝罪、声明、緊急広報、信頼回復 |
| 17 | `policy_public_sector` | Policy・Public Sector・Nonprofit | 公共政策、行政、非営利、Community、Governance |
| 18 | `creative_writing` | Creative・Writing・Content | 文書、Mail、Speech、記事、Script、Tone設計 |
| 19 | `personal_decision` | Personal Decision・Coaching・Life Planning | Career、習慣、進路、個人判断、生活設計 |
| 20 | `data_analytics` | Data・Analytics・Experimentation | KPI、Dashboard、A/B Test、予測、因果、Data品質 |

Primary Lens総数: **21**

## 6. Overlay Lens一覧

| Overlay ID | 表示名 | 追加条件 |
|---|---|---|
| `high_stakes_legal` | High-Stakes Legal | 権利、責任、訴訟、解雇、刑事、重大な契約判断 |
| `medical_safety` | Medical Safety | 救急、自傷、胸痛、呼吸、意識障害など緊急性の高い医療条件 |
| `current_information` | Current Information | 最新情報、現在価格、法改正、現職者、変動する公開情報 |
| `evidence_strict` | Evidence Strict | 根拠、証拠、正確性、検証、Fact Checkを強く要求する処理 |
| `safety_abuse` | Safety / Abuse | 攻撃、Malware、詐欺、回避、侵入など悪用可能性のある処理 |

Overlay Lens総数: **5**

## 7. KB・検索Scriptとの接続契約

KB Crosswalkまたは検索Scriptは、最終的に次の形へ正規化します。

```json
{
  "primary_lens_id": "engineering_architecture",
  "overlay_lens_ids": ["evidence_strict", "current_information"],
  "classification_source": "kb_taxonomy_crosswalk",
  "confidence": 0.92,
  "reason_codes": ["software_architecture", "current_specification"]
}
```

### 必須条件

- `primary_lens_id` はPrimary Lens IDから1件を返します。
- `overlay_lens_ids` はOverlay Lens IDだけを返します。
- 判断材料不足時は `general_judgment` を返し、Confidenceと理由を残します。
- KB側はLensの判断処理を実行せず、Taxonomy結果とEvidenceを返します。
- Astera側はKB Taxonomyを保存分類として上書きせず、Lens選択材料として使用します。

## 8. 更新時チェック

1. 両RepositoryのDocument IDとSchema Versionが一致していること。
2. Lens ID、件数、表示名が一致していること。
3. Astera Runtime実装に対応するIDが存在すること。
4. 詳細Catalogに対応する定義が存在すること。
5. Primary LensとOverlay Lensを混同していないこと。
6. KB Taxonomyを直接複製していないこと。
7. 両READMEには本ファイルへの参照だけを置くこと。
