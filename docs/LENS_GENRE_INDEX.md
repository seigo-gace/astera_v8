# Astera v8 レンズ・ジャンル一覧

Status: 運用基準

## 1. 目的

この文書は、Astera v8のDomain Router / Template Lensで使用するジャンルを、固定ID付きで一覧管理するための索引です。

READMEへ全レンズ定義を展開せず、READMEから本ファイルを参照します。各レンズの5本柱別の詳細定義、判定観点、収集Evidence、安全条件は `DOMAIN_TEMPLATE_CATALOG.md` で管理します。

## 2. 正本と役割分担

| 対象 | 正本 |
|---|---|
| 実行時のレンズID・判定語・処理内容 | `src/domain-template-router.js` |
| レンズ・ジャンルの固定一覧と運用境界 | `docs/LENS_GENRE_INDEX.md` |
| 各レンズの詳細仕様 | `docs/DOMAIN_TEMPLATE_CATALOG.md` |
| KB側の全分野Taxonomy | Astera-KB側のTaxonomy文書・データ |

本ファイルはKBの分類Taxonomyそのものではありません。KBの分類結果をAstera v8の判断レンズへ接続するための、固定された接続先一覧です。

## 3. 運用ルール

- Primary Lensは原則1件を選択します。
- 専門ジャンルが確定しない場合は `general_judgment` を使用します。
- Overlay LensはPrimary Lensを置き換えず、必要な安全・Evidence条件を追加します。
- 1回の処理でOverlay Lensは0件以上を併用できます。
- Lens IDは検索Script、KB Crosswalk、ログ、テストの共通キーとして使用するため、名称変更時も既存IDを安易に変更しません。
- 新規ジャンル追加時は、本ファイル、`DOMAIN_TEMPLATE_CATALOG.md`、`src/domain-template-router.js`、関連テストを同時に更新します。
- 本ファイルには検索Score、Keyword重み、Crosswalkロジックを記載しません。それらは後続の検索・接続実装で分離管理します。

## 4. Primary Lens一覧

| No. | Lens ID | 表示名 | 主な対象 |
|---:|---|---|---|
| 00 | `general_judgment` | 一般判断 / Default | 専門分野が支配的でない相談、判断、総合検討 |
| 01 | `business_strategy` | 経営・事業戦略 | 経営判断、事業モデル、価格、提携、市場参入 |
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

## 5. Overlay Lens一覧

| Overlay ID | 表示名 | 追加条件 |
|---|---|---|
| `high_stakes_legal` | High-Stakes Legal | 権利、責任、訴訟、解雇、刑事、重大な契約判断 |
| `medical_safety` | Medical Safety | 救急、自傷、胸痛、呼吸、意識障害など緊急性の高い医療条件 |
| `current_information` | Current Information | 最新情報、現在価格、法改正、現職者、変動する公開情報 |
| `evidence_strict` | Evidence Strict | 根拠、証拠、正確性、検証、Fact Checkを強く要求する処理 |
| `safety_abuse` | Safety / Abuse | 攻撃、Malware、詐欺、回避、侵入など悪用可能性のある処理 |

Overlay Lens総数: **5**

## 6. KB・検索Scriptとの接続契約

後続のKB Crosswalkまたは検索Scriptは、最終的に少なくとも次の形へ正規化します。

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

- `primary_lens_id` は本ファイルのPrimary Lens IDから1件を返します。
- `overlay_lens_ids` は本ファイルのOverlay Lens IDだけを返します。
- 該当なしを表す独自IDや `other`、`unknown`、`unclassified` は作りません。
- 判断材料が不足する場合は `general_judgment` を返し、Confidenceと理由を明示します。
- KBのTaxonomy IDとLens IDを同一化しません。Taxonomyは「情報が何か」、Lensは「何を重点確認するか」で責務が異なります。

## 7. 更新時チェック

1. Lens IDが重複していないこと。
2. Runtime実装と本一覧のID・件数が一致すること。
3. 詳細Catalogに対応する定義が存在すること。
4. Primary LensとOverlay Lensを混同していないこと。
5. KB Taxonomyを直接Lens一覧へ複製していないこと。
6. READMEには本ファイルへの参照だけを置き、一覧本文を重複掲載していないこと。
