# Astera 共通レンズ・ジャンル一覧

Status: 共有運用基準  
Document ID: `astera-lens-genre-index`  
Schema Version: `2.0`  
Taxonomy Version: `1.0.0`

## 1. 目的

この文書は、Astera v8本体とASTERA-KBが共通参照する38専門ジャンルの固定IDと接続境界を管理します。READMEへ一覧本文を展開せず、両RepositoryのREADMEから本ファイルを参照します。

## 2. 責務

| 対象 | 責務 |
|---|---|
| Astera v8 | 入力を38専門ジャンルへ決定論的に分類し、Fact / Risk / Multi / Inquiry / CompareのLensを適用する |
| ASTERA-KB | Knowledgeの4階層TaxonomyとEvidenceを保存・検索し、Asteraへ分類情報を返す |
| 共通ID | `G01`〜`G38`をRuntime、KB Crosswalk、Log、Testの共通Keyとして使用する |

KB Taxonomyは「情報が何に属するか」、Astera Lensは「何を重点確認するか」であり、同じ責務にはしません。

## 3. 現行Runtime

- Primary Lens: 38専門ジャンルから1件
- Secondary Lens: Score上位3件
- Overlay Lens: Primaryを上書きせず追加
- 分類優先: `CONTROLLED_TERM_MATCH → TEXT_SCORE_MATCH → HYPOTHESIS_LAST_RESORT`
- 空入力: 誤分類せずInput Error
- 弱い分類: 低Confidenceと`taxonomy_review_required=true`
- 各Genreは、元Taxonomyとの整合確認用に4階層の`lens_anchor_path`を持つ
- 4階層全Pathの検索結果は、将来ASTERA-KB接続時も同じ`G01`〜`G38`を入口として扱う

## 4. Primary Lens一覧

| ID | 専門ジャンル | 検証Anchor Path |
|---|---|---|
| G01 | 一般知識・百科・情報資源 | `G01/G01-L03/G01-L03-M01/G01-L03-M01-S03` |
| G02 | 哲学・倫理・宗教・思想 | `G02/G02-L03/G02-L03-M02/G02-L03-M02-S06` |
| G03 | 心理・認知・行動科学 | `G03/G03-L02/G03-L02-M01/G03-L02-M01-S03` |
| G04 | 歴史・考古・系譜 | `G04/G04-L04/G04-L04-M03/G04-L04-M03-S05` |
| G05 | 地理・地図・人口・地域 | `G05/G05-L03/G05-L03-M02/G05-L03-M02-S04` |
| G06 | 社会・人権・福祉・家族 | `G06/G06-L02/G06-L02-M01/G06-L02-M01-S01` |
| G07 | 政治・行政・公共政策・国際関係 | `G07/G07-L03/G07-L03-M03/G07-L03-M03-S04` |
| G08 | 法律・司法・規制 | `G08/G08-L04/G08-L04-M02/G08-L04-M02-S02` |
| G09 | 経済・開発・貿易 | `G09/G09-L02/G09-L02-M03/G09-L02-M03-S05` |
| G10 | Business・経営・Marketing・Entrepreneurship | `G10/G10-L02/G10-L02-M03/G10-L02-M03-S03` |
| G11 | 金融・会計・税務・保険 | `G11/G11-L01/G11-L01-M01/G11-L01-M01-S04` |
| G12 | 労働・職業・人材・Skill | `G12/G12-L03/G12-L03-M02/G12-L03-M02-S02` |
| G13 | 教育・学習・資格 | `G13/G13-L04/G13-L04-M01/G13-L04-M01-S04` |
| G14 | 言語・言語学・辞書・翻訳 | `G14/G14-L01/G14-L01-M02/G14-L01-M02-S02` |
| G15 | 文学・出版・図書館・Archive | `G15/G15-L01/G15-L01-M01/G15-L01-M01-S02` |
| G16 | 芸術・文化・音楽・Media | `G16/G16-L02/G16-L02-M01/G16-L02-M01-S02` |
| G17 | Sports・Recreation・観光・Game | `G17/G17-L01/G17-L01-M01/G17-L01-M01-S02` |
| G18 | 数学・統計・Logic | `G18/G18-L04/G18-L04-M01/G18-L04-M01-S02` |
| G19 | 物理・天文・宇宙 | `G19/G19-L03/G19-L03-M03/G19-L03-M03-S03` |
| G20 | 化学・物質・材料 | `G20/G20-L01/G20-L01-M01/G20-L01-M01-S04` |
| G21 | 地球・環境・気候・災害 | `G21/G21-L03/G21-L03-M01/G21-L03-M01-S01` |
| G22 | 生物・生命科学・生態 | `G22/G22-L04/G22-L04-M02/G22-L04-M02-S03` |
| G23 | 医学・健康・薬学・医療 | `G23/G23-L01/G23-L01-M03/G23-L01-M03-S03` |
| G24 | 農業・林業・水産・食品・獣医 | `G24/G24-L04/G24-L04-M02/G24-L04-M02-S03` |
| G25 | 工学・製造・産業技術 | `G25/G25-L04/G25-L04-M02/G25-L04-M02-S05` |
| G26 | 建築・建設・土木・BIM・都市 | `G26/G26-L04/G26-L04-M03/G26-L04-M03-S02` |
| G27 | Energy・資源・Utility | `G27/G27-L01/G27-L01-M02/G27-L01-M02-S01` |
| G28 | 交通・物流・Mobility | `G28/G28-L03/G28-L03-M01/G28-L03-M01-S04` |
| G29 | IT・Computer・System・Application開発 | `G29/G29-L03/G29-L03-M03/G29-L03-M03-S04` |
| G30 | AI・Data Science・Robot | `G30/G30-L03/G30-L03-M01/G30-L03-M01-S01` |
| G31 | Cybersecurity・Privacy・暗号 | `G31/G31-L02/G31-L02-M03/G31-L02-M03-S05` |
| G32 | 標準・特許・知的財産・Compliance・計量 | `G32/G32-L01/G32-L01-M01/G32-L01-M01-S04` |
| G33 | 商品・Commerce・Consumer・製品安全 | `G33/G33-L04/G33-L04-M01/G33-L04-M01-S05` |
| G34 | 公共安全・犯罪・Forensics・Emergency | `G34/G34-L02/G34-L02-M02/G34-L02-M02-S05` |
| G35 | 防衛・軍事・海事・国家安全保障 | `G35/G35-L01/G35-L01-M02/G35-L01-M02-S06` |
| G36 | 通信・Telecom・Internet・Broadcast | `G36/G36-L02/G36-L02-M03/G36-L02-M03-S02` |
| G37 | 科学研究・Innovation・Knowledge Production | `G37/G37-L04/G37-L04-M01/G37-L04-M01-S01` |
| G38 | 家庭・生活・Personal・Hobby | `G38/G38-L04/G38-L04-M01/G38-L04-M01-S05` |

Primary Lens総数: **38**

## 5. Overlay Lens

| ID | 用途 |
|---|---|
| `high_stakes_legal` | 訴訟、解雇、逮捕、損害賠償など重大な法的条件 |
| `medical_safety` | 胸痛、呼吸異常、意識障害、自傷など緊急性の高い医療条件 |
| `current_information` | 現在価格、法改正、最新仕様など時間で変化する情報 |
| `evidence_strict` | 根拠、証拠、正確性、検証、引用を強く要求する処理 |
| `safety_abuse` | 攻撃、Malware、詐欺、侵入、回避など悪用可能性がある処理 |

## 6. 共通出力契約

```json
{
  "router": "all_domain_lens_router_v1",
  "taxonomy_version": "1.0.0",
  "primary": {
    "id": "G29",
    "name": "IT・Computer・System・Application開発",
    "classification": {
      "specialized_genre": {"id": "G29", "name": "IT・Computer・System・Application開発"},
      "lens_anchor_path": {
        "path_key": "G29/G29-L03/G29-L03-M03/G29-L03-M03-S04"
      },
      "path_resolution": "GENRE_LENS_ANCHOR"
    }
  },
  "classification_basis": "CONTROLLED_TERM_MATCH",
  "confidence": 0.95,
  "taxonomy_review_required": false
}
```

## 7. 更新規則

1. 両RepositoryのDocument ID、Schema Version、38 IDを一致させる。
2. Runtime変更時は`src/all-domain-lens-catalog.js`、`src/domain-template-router.js`、Test、本文書を同時更新する。
3. KBの4階層Pathを38 Lensへ潰さず、`Gxx`と完全Pathを併記する。
4. `other`、`unknown`、`unclassified`、`未分類`、`その他`を新設しない。
5. READMEには本文を複製せず、本ファイルへの参照だけを置く。
