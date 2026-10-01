# Evidence Citation Contract

Astera v8 の判断材料は、人間向けとAI向けで別の意味内容を生成しない。Main8 と Evidence は同一結果の2つの表示層として扱う。

## Public `/process` response

`/process` は `text/plain` を返す。本文は必ず次の順序とする。

1. Main8: 8 section / `---` separator 7本
2. `===ASTERA_EVIDENCE===` marker
3. `astera.evidence-citation.v1` JSON

Evidence JSONをMain8の9番目のsectionとして扱ってはならない。

## Evidence inclusion rule

Public citationに採用できるBinding relationは以下だけ。

- `SUPPORTS`
- `CONTRADICTS`
- `PARTIALLY_SUPPORTS`

`NO_MATCH` や未採用Candidateを「使用した根拠」として表示してはならない。

外部根拠が成立しない場合は `source_count=0` を正しく返す。URLやSourceを捏造して空欄を埋めてはならない。

## Source identity

各Evidenceは再確認可能なSource Identityを保持する。

- `id`: Result内の表示ID (`E01`, `E02`, ...)
- `candidate_id`
- `canonical_record_id`
- `title`
- `url`: HTTP(S) URLが存在する場合
- `canonical_locator`: URLがない場合でも再取得可能なLocator
- `provider_id`
- `source_class`
- `source_role`
- `source_family_id`
- `authority_id`
- `publisher`
- `excerpt`: 実際にEvidence Candidateから観測した内容
- `published_at`
- `updated_at`
- `retrieved_at`
- `content_hash`
- `revision_id`

URLが存在するSourceはURLを保持する。URLが存在しない法令Record、Dataset Record、File/Page、API Record等ではCanonical Locatorを保持し、URLを捏造しない。

## Answer-to-Evidence mapping

各Evidenceは `claim_links` を持つ。

- `task_id`
- `claim_id`
- `claim_text`
- `confirmation_status`
- `relation`
- `binding_id`

Main8側は `section_source_ids` によりSection単位でも根拠を追跡できる。Main8本文中では、根拠を実際に使用したSectionだけに `[E##]` を表示する。

同じEvidenceを複数Claimが利用する場合、Evidence一覧を複製せず `claim_links` を増やす。

## Human / AI invariant

- 人間: Main8の `[E##]` からAPPの `Source / 根拠` 一覧を確認できる。
- AI: 同じEvidence JSONからURL/Locator、Claim relation、Excerpt、Authority、時点を取得し、必要なら再確認できる。
- 人間向けとAI向けで別のSourceや別の結論を生成しない。

## App contract

Astera AppはEvidence trailerをMain8から分離し、

- `sections[*].source_ids`
- `result.sources`

へマッピングする。

APPは既存の回答8項目とSource一覧を別表示できる。詳細表示ではSource URL/Locator、Authority、確認内容、Claim relationを表示可能にする。

## Fail-closed

以下はBroken Citationとして扱い、推測補完しない。

- 不明なEvidence IDをSection/Claimが参照
- HTTP(S)以外の不正URL
- Claim link relationが契約外
- SourceにURLもCanonical Record/Locatorもない
- Trailer JSONが壊れている
- Schema versionが未知

Evidence Contractの失敗を、根拠が存在したことにして通過させてはならない。
