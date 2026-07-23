# Astera v8 FAQ

## AsteraはAIですか

いいえ。主役AIの外側で判断材料を生成するRuntimeです。外部LLMは任意であり、中核は固定RuleとNode.js V8 Workerで動きます。

## ChatGPT、Claude、Geminiを置き換えますか

置き換えません。Asteraの08「主役AIへの再指示」を主役AIへ渡して使います。

## なぜ5本柱と8段が両方あるのですか

5本柱は内部の検査観点、8段は利用者と主役AIへ渡す出力契約です。

## Lensはいくつありますか

Primary候補は`G01`〜`G38`の38専門ジャンルです。別に5種類のOverlayがあります。

## 用途を手動選択しますか

現行Runtimeは入力から決定論的に分類します。Primary、Secondary、Overlayの結果を確認できます。

## 情報検索も自動で行いますか

Astera本体は検索エンジンではありません。03は事実、推測、未確認、Evidence gapを整理しますが、外部情報の取得・正しさを自動保証しません。

## 前提不足時はどうなりますか

HTTP 200のTextで`確認が必要です`を返す場合があります。不足条件を追加して再実行します。

## `KB_ELIGIBLE`は掲載済みですか

違います。QualityCompletionEvaluatorが掲載可能と判定した状態です。通常APIはKBや`modular-catalog`へ保存しません。

## 品質と完成度は平均95点でよいですか

いいえ。品質95以上、完成度95以上、Blocking 0、必須Requirement未達0、Evidence不整合0がすべて必要です。

## Skill APIは一般利用できますか

所有者のアプリGPT用PRIVATE入口です。`ASTERA_SKILL_API_KEY`を公開配布しません。

## API Keyを再表示できますか

できません。`/signup` Responseで一度だけ表示されます。現行APIに失効・再発行・Rotation専用Endpointはありません。

## 本番で`node start.js`を常駐できますか

Repository運用規則ではできません。短時間検証に限り、本番常駐はDocker Composeを使用します。

## Webhookで問いを送れますか

現行の`/billing/webhook`はStripe専用です。判断材料生成用の汎用Webhookは未実装です。

## 料金表はどこですか

RuntimeにはPlan別Rate LimitとStripe接続境界がありますが、公開料金、Credit減算、返金、解約等の商用条件は本Repository文書だけでは確定しません。
