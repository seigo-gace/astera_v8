# Cloudflare Tunnel Secret: Vault Migration

The `astera-v8-cloudflared` service consumes a Docker Compose secret file, configured by `CLOUDFLARE_TUNNEL_TOKEN_FILE`. Keep the existing container command (`tunnel run --token-file /run/secrets/astera_v8_cloudflare_tunnel_token`) unchanged.

The retired GPG-Core `secure_up.sh` previously decrypted the Tunnel Token from `.env.gpg` and created a mode-0600 runtime file. Replace only that supplier with Libral-Vault's ACL-checked runtime materialization; do not embed the Token in Git, Compose, CLI arguments or logs.

Migration contract: https://github.com/seigo-gace/Libral-Vault/pull/6

Production cutover prerequisites: the Token must be securely imported to Vault under consumer `astera-v8-cloudflared`; Vault and Astera Compose must share an existing Host tmpfs file through a safe mount; Vault must generate it on startup/restart before cloudflared needs it; file ownership must allow cloudflared uid 1000 to read without exposing it to other users; read-only Host verification, Tunnel health and rollback must pass. Existing GPG-Core must remain until no project, Docker mount or boot task needs it. Secrets, keys and encrypted backups must be preserved.

This document does not authorize a production cutover or assert that runtime migration has happened.

## API-controlled pre-start action

With the existing Vault internal bearer credential stored in a Host private file (mode 0600), invoke `node scripts/prepare-vault-tunnel-secret.js` as the authorized Host pre-start step. Set `LIBRAL_VAULT_INTERNAL_TOKEN_FILE_HOST` to the verified private credential file and `CLOUDFLARE_TUNNEL_TOKEN_FILE` to the Host tmpfs file configured by Vault. The helper calls only `http://127.0.0.1:8791/internal/v1/actions/astera-tunnel/materialize` using Vault API authorization, checks the acknowledgement and mode 0600 file metadata without reading the Tunnel Token, and fails closed before Docker Compose starts. Never output the internal bearer token or Cloudflare Token. Do not call it on production until the prerequisite permissions, mounts, Vault secret ACL, and boot order are verified. This is not a daemon or alternative Secret system.

## API-only consumer boundary (2026-10-17)

Astera v8 MUST consume Libral Vault solely through the authenticated loopback Internal API. Do not import `@libral/vault`, `materializeRuntimeSecret`, or any GPG/Vault implementation into the consumer. `scripts/prepare-vault-tunnel-secret.js` is a client for the fixed authenticated HTTP operation, not a second secret implementation. Its runtime file check is metadata-only and must target the exact Cloudflare token filename. The Vault's private server may use an internal tmpfs adapter to satisfy cloudflared's unchanged `--token-file` interface; that adapter must not be exported as a public module API. No production cutover or GPG-Core deletion is authorized by this source change.
