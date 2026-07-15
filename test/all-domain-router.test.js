'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { routeDomainTemplates, TEMPLATES } = require('../src/domain-template-router');

const CASES = [
['G01','MeSHメタデータと図書館カタログ','G01/G01-L03/G01-L03-M01/G01-L03-M01-S03'],
['G02','応用倫理と宗教思想','G02/G02-L03/G02-L03-M02/G02-L03-M02-S06'],
['G03','認知心理学の記憶研究','G03/G03-L02/G03-L02-M01/G03-L02-M01-S03'],
['G04','中世史の考古資料','G04/G04-L04/G04-L04-M03/G04-L04-M03-S05'],
['G05','GISによる人口地理分析','G05/G05-L03/G05-L03-M02/G05-L03-M02-S04'],
['G06','障害者福祉と人権','G06/G06-L02/G06-L02-M01/G06-L02-M01-S01'],
['G07','公共政策と行政評価','G07/G07-L03/G07-L03-M03/G07-L03-M03-S04'],
['G08','不法行為の損害賠償請求','G08/G08-L04/G08-L04-M02/G08-L04-M02-S02'],
['G09','国際貿易と経済成長','G09/G09-L02/G09-L02-M03/G09-L02-M03-S05'],
['G10','事業戦略とマーケティング','G10/G10-L02/G10-L02-M03/G10-L02-M03-S03'],
['G11','銀行決済と会計監査','G11/G11-L01/G11-L01-M01/G11-L01-M01-S04'],
['G12','職業Skillと労働市場','G12/G12-L03/G12-L03-M02/G12-L03-M02-S02'],
['G13','大学教育のカリキュラム','G13/G13-L04/G13-L04-M01/G13-L04-M01-S04'],
['G14','日本語の形態論と翻訳','G14/G14-L01/G14-L01-M02/G14-L01-M02-S02'],
['G15','近代小説の文学批評','G15/G15-L01/G15-L01-M01/G15-L01-M01-S02'],
['G16','音楽と映画の文化研究','G16/G16-L02/G16-L02-M01/G16-L02-M01-S02'],
['G17','サッカー大会と観光','G17/G17-L01/G17-L01-M01/G17-L01-M01-S02'],
['G18','確率統計と最適化','G18/G18-L04/G18-L04-M01/G18-L04-M01-S02'],
['G19','量子物理と宇宙観測','G19/G19-L03/G19-L03-M03/G19-L03-M03-S03'],
['G20','有機化学と高分子材料','G20/G20-L01/G20-L01-M01/G20-L01-M01-S04'],
['G21','気候変動と洪水災害','G21/G21-L03/G21-L03-M01/G21-L03-M01-S01'],
['G22','遺伝子と細胞生物学','G22/G22-L04/G22-L04-M02/G22-L04-M02-S03'],
['G23','急性心筋梗塞の診断','G23/G23-L01/G23-L01-M03/G23-L01-M03-S03'],
['G24','作物栽培と食品安全','G24/G24-L04/G24-L04-M02/G24-L04-M02-S03'],
['G25','機械製造と品質工学','G25/G25-L04/G25-L04-M02/G25-L04-M02-S05'],
['G26','BIMによる耐震建築設計','G26/G26-L04/G26-L04-M03/G26-L04-M03-S02'],
['G27','再生可能エネルギーと送電網','G27/G27-L01/G27-L01-M02/G27-L01-M02-S01'],
['G28','鉄道物流と公共交通','G28/G28-L03/G28-L03-M01/G28-L03-M01-S04'],
['G29','APIサーバーのシステム開発','G29/G29-L03/G29-L03-M03/G29-L03-M03-S04'],
['G30','LLMエージェントの機械学習','G30/G30-L03/G30-L03-M01/G30-L03-M01-S01'],
['G31','CVE脆弱性とマルウェア攻撃','G31/G31-L02/G31-L02-M03/G31-L02-M03-S05'],
['G32','ISO規格と特許コンプライアンス','G32/G32-L01/G32-L01-M01/G32-L01-M01-S04'],
['G33','消費者向け製品リコール','G33/G33-L04/G33-L04-M01/G33-L04-M01-S05'],
['G34','犯罪捜査とデジタル鑑識','G34/G34-L02/G34-L02-M02/G34-L02-M02-S05'],
['G35','防衛戦略と海軍作戦','G35/G35-L01/G35-L01-M02/G35-L01-M02-S06'],
['G36','5G通信とインターネットルーティング','G36/G36-L02/G36-L02-M03/G36-L02-M03-S02'],
['G37','研究論文の査読と引用分析','G37/G37-L04/G37-L04-M01/G37-L04-M01-S01'],
['G38','家庭料理と園芸の趣味','G38/G38-L04/G38-L04-M01/G38-L04-M01-S05']
];

test('38ジャンルのID・件数・Anchor Pathが固定される', () => {
  assert.equal(TEMPLATES.length, 38);
  assert.equal(new Set(TEMPLATES.map((item) => item.id)).size, 38);
  for (const [id, title, path] of CASES) {
    const result = routeDomainTemplates({ question: title });
    assert.equal(result.primary.id, id, `${title}: ${result.primary.id}`);
    assert.equal(result.primary.classification.lens_anchor_path.path_key, path);
    assert.equal(result.router, 'all_domain_lens_router_v1');
    assert.equal(result.taxonomy_version, '1.0.0');
  }
});

test('同一入力を100回処理して分類・候補・Overlay順が変化しない', () => {
  const input = { question: 'CVE脆弱性の影響Versionを調査し、現在の公式情報を根拠付きで検証する' };
  const expected = routeDomainTemplates(input);
  for (let i = 0; i < 100; i += 1) {
    const actual = routeDomainTemplates(input);
    assert.equal(actual.primary.id, expected.primary.id);
    assert.deepEqual(actual.secondary.map((x) => x.id), expected.secondary.map((x) => x.id));
    assert.deepEqual(actual.overlays.map((x) => x.id), expected.overlays.map((x) => x.id));
    assert.equal(actual.lens_text, expected.lens_text);
  }
});

test('空入力は誤分類せずInput Error状態になる', () => {
  const result = routeDomainTemplates({ question: '  ', context: '\n' });
  assert.equal(result.input_valid, false);
  assert.equal(result.input_error, 'ASTERA_LENS_INPUT_REQUIRED');
  assert.equal(result.primary, null);
  assert.deepEqual(result.secondary, []);
});

test('短いASCII分類語を単語途中で誤発火させない', () => {
  const result = routeDomainTemplates({ question: 'Maintenance procedure and reliability review for industrial equipment' });
  assert.notEqual(result.primary.id, 'G30');
  assert.equal(result.primary.matched_signals.map((x) => String(x).toLowerCase()).includes('ai'), false);
});

test('OverlayはPrimaryを上書きせず必要条件だけ追加する', () => {
  const result = routeDomainTemplates({ question: '現在のCVE脆弱性とマルウェア攻撃を公式Sourceで検証する' });
  assert.equal(result.primary.id, 'G31');
  assert.deepEqual(result.overlays.map((x) => x.id), ['current_information', 'evidence_strict', 'safety_abuse']);
  assert.match(result.lens_text, /primary=G31/);
  assert.match(result.lens_text, /overlay\.evidence_strict/);
});
