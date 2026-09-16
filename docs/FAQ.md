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

## QCE の `PASSED` はKB保存済みですか

違います。品質・完成度の採点合格であり、Astera canonical 外のKB保存完了ではありません。

## Account、Login、Square、CreditはAstera v8の機能ですか

Astera全体には必要ですが、Astera v8 Coreの責務ではありません。Astera App / Commerce側が所有します。

## Commerce（決済・課金）はこのRepositoryにありますか

いいえ。Commerce は Astera App が所有します。Core HTTP は account、billing、subscription、signup を提供しません。

## API key と Skill key は誰が所有しますか

`/process` は `ASTERA_API_KEY`（または loopback 開発の `ASTERA_LOCAL_NO_AUTH`）。Skill 経路は `ASTERA_SKILL_API_KEY` です。これらは Core HTTP の transport 認証であり、Account lifecycle や Plan の正本は Astera App / Gateway です。

## 外部LLM AdapterがあるならAIではないのですか

Adapterを呼べることと、Astera自身がAIであることは別です。Coreは`null` Providerでも固定Rule処理を実行します。

## 医療・法律・投資判断を任せられますか

任せられません。Overlayは確認を強化しますが、専門家判断や外部事実の正しさを保証しません。

## 現在の既知Defectはありますか

README の Open Items を参照してください。Domain Lens completeness is not a QCE blocking stage です。

## 料金はどこで確認しますか

Astera App側の最新プラン・料金ページを参照します。本Repositoryへ料金・Credit契約を重複保持しません。
