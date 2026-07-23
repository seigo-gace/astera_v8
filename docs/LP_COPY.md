# Astera v8 — Landing Page Copy

Status: 現行実装同期

## Hero

# 問いを星図に変える。

あなたのAIを、あなたのAIのまま強くする。

Astera v8は、主役AIを置き換えず、判断に必要な材料を外側から加える判断材料生成レイヤーです。

## Why

AIの答えは速い。
しかし重要な判断には、目的、前提、事実、Risk、反対視点、比較材料が必要です。

Asteraは、問いを38専門ジャンルLensと5本柱で整理し、主役AIへ渡せる8段の判断材料へ変えます。

## Flow

1. 主役AIまたは利用者が問いを入力
2. AsteraがLens、5本柱、Overlayで判断材料化
3. 01〜08のJudgment Materialを生成
4. 主役AIが材料を受け取り最終回答を再構成

## 8 Sections

- 01 本当の目的
- 02 前提不足
- 03 事実確認
- 04 危機察知
- 05 反対視点
- 06 比較案
- 07 推奨判断
- 08 主役AIへの再指示

## Features

- 38専門ジャンルLens
- Legal / Medical / Current / Evidence / Safety Overlay
- Node.js V8 Worker Threadsによる処理
- 外部LLM任意、`null` Provider対応
- QualityCompletionEvaluator
- 一般APIと所有者Skill PRIVATE API
- TGserver Log集約

## Boundaries

AsteraはAI本体、検索エンジン、専門家、KB保存Systemではありません。`KB_ELIGIBLE`は保存済みではなく掲載可能判定です。

## CTA

問いを、答えの前に整える。
Asteraを通し、主役AIへ判断の星図を渡す。
