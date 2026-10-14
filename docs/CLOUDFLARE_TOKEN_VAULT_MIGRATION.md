# Cloudflare Tunnel Secret: Vault Migration

The `astera-v8-cloudflared` service consumes a Docker Compose secret file, configured by `CLOUDFLARE_TUNNEL_TOKEN_FILE`. Keep the existing container command (`tunnel run --token-file /run/secrets/astera_v8_cloudflare_tunnel_token`) unchanged.

The retired GPG-Core `secure_up.sh` previously decrypted the Tunnel Token from `.env.gpg` and created a mode-0600 runtime file. Replace only that supplier with Libral-Vault's ACL-checked runtime materialization; do not embed the Token in Git, Compose, CLI arguments or logs.

Migration contract: https://github.com/seigo-gace/Libral-Vault/pull/6

Production cutover prerequisites: the Token must be securely imported to Vault under consumer `astera-v8-cloudflared`; Vault and Astera Compose must share an existing Host tmpfs file through a safe mount; Vault must generate it on startup/restart before cloudflared needs it; file ownership must allow cloudflared uid 1000 to read without exposing it to other users; read-only Host verification, Tunnel health and rollback must pass. Existing GPG-Core must remain until no project, Docker mount or boot task needs it. Secrets, keys and encrypted backups must be preserved.

This document does not authorize a production cutover or assert that runtime migration has happened.
