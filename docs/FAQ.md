# Astera v8 FAQ

## Astera v8はAIですか

いいえ。固定RuleとScriptで入力を分類・検査・比較し、判断材料へ再構成する非AI Runtimeです。

## AIがないと使えませんか

使えます。01〜07は人間やApplicationが直接利用できます。08は主役AIへ渡す場合の再指示です。

## ChatGPT、Claude、Geminiを置き換えますか

置き換えません。接続する場合は、AIの外側で目的、前提、事実、Risk、反対視点、比較案を整えます。

## MCP専用ですか

違います。Web Form、CLI、API、業務System、MCP、文書、検索結果、他AI出力など、入力経路を限定しません。

## 5本柱と8段の違いは何ですか

5本柱は内部処理、8段は利用者・Application・主役AIへ渡す出力契約です。

## Lensはいくつありますか

現行Coreは`G01`〜`G38`の38 Domain Lensを持ち、必要に応じてSecondaryと5 Overlayを追加します。

## 情報検索を自動で行いますか

Astera Coreは検索エンジンではありません。外部検索ToolやServiceから受け取った結果を構造化できますが、取得や真偽を自動保証しません。

## 翻訳AIやHF Modelを内蔵していますか

内蔵していません。翻訳が必要な場合は外部Serviceの原文、翻訳文、Engine情報、検証情報を入力として受け取る境界です。

## `確認が必要です`は故障ですか

必ずしも故障ではありません。重大な前提不足を検出して処理を止めた状態です。

## Quality Completion Evaluatorは常に動きますか

いいえ。Runtime本体と独立して明示的に呼び出します。

## `KB_ELIGIBLE`はKB保存済みですか

違います。掲載条件を満たした判定であり、保存完了ではありません。

## Account、Login、Square、CreditはAstera v8の機能ですか

Astera全体には必要ですが、Astera v8 Coreの責務ではありません。Astera App / Commerce側が所有します。

## RepositoryにStripe Codeがあるのはなぜですか

旧実装の互換Code・移行負債として残っています。現行Codeの事実ですが、現在のCommerce正本やCore機能として宣伝しません。

## Tenant KeyやSkill Keyは現行APIにありますか

現行Codeにはあります。ただし、完成責務ではAccount / Gateway側へ移管する対象です。一般向けの製品価値説明には使用しません。

## 外部LLM AdapterがあるならAIではないのですか

Adapterを呼べることと、Astera自身がAIであることは別です。Coreは`null` Providerでも固定Rule処理を実行します。

## 医療・法律・投資判断を任せられますか

任せられません。Overlayは確認を強化しますが、専門家判断や外部事実の正しさを保証しません。

## 現在の既知Defectはありますか

`KB-HB-016`をEngineが使用する一方、Blocking Rule Registryが`KB-HB-015`までしか持たない不一致が確認されています。修正・再検証前に完成扱いしません。

## 料金はどこで確認しますか

Astera App側の最新プラン・料金ページを参照します。本Repositoryへ料金・Credit契約を重複保持しません。
