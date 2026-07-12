# ASTERAへの配置・デプロイ手順

## 1\. 配置前検証

【サーバー側・Ubuntu Bash】

cd /path/to/astera_v8/src/quality-completion-evaluator

./scripts-verify.sh

正常表示:

Verification passed

## 2\. ASTERAへ安全に配置

【サーバー側・Ubuntu Bash】

./scripts-install.sh --astera-root /path/to/ASTERA

既存Moduleがある場合は処理を停止します。内容を確認後、入替時だけ次を使用します。

./scripts-install.sh --astera-root /path/to/ASTERA --replace

`--replace`時は旧Moduleを次の形式で退避します。

quality-completion-evaluator.backup-YYYYMMDD-HHMMSS

## 3\. ASTERA本体からImport

const { evaluate } = require("./src/quality-completion-evaluator");

const result = await evaluate(packet);

## 4\. KB System連携

既存KB Systemの正式APIへ接続する場合だけ、環境変数を設定します。

export KB_SYSTEM_URL="http://kb-system:8080"

export KB_SYSTEM_ENDPOINT="/v1/kb/records"

export KB_SYSTEM_TOKEN="<secret managerから注入>"

SecretをファイルやKB本文へ書き込みません。

## 5\. 本番反映前Gate

次をすべて確認します。

scripts-verify.sh 合格

Unit Test 合格

Boundary Test 合格

Integration Test 合格

Regression Test 合格

Sampleが KB_ELIGIBLE

95未満が REVISION_REQUIRED

Blockingありで BLOCKED

Hash不一致が INVALID_INPUT

同一Recordが重複登録されない

## 6\. Docker単体検証

内部Moduleとして組み込む前の隔離確認用です。

docker build \-t astera-quality-completion-evaluator:1.0.0 .

node examples/create-sample-request.js | docker run --rm \-i astera-quality-completion-evaluator:1.0.0

Docker版はSTDIN評価専用です。ASTERA本体では `src/quality-completion-evaluator` に配置し、既存Dockerfileの `COPY src ./src` で本番コンテナへ含めます。  
