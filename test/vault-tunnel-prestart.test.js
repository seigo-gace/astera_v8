"use strict";
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, symlink, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { prepareTunnelSecret } = require("../scripts/prepare-vault-tunnel-secret.js");

test("Vault Tunnel pre-start does not send API request with unsafe or missing configuration", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error("must not send"); };
  await assert.rejects(prepareTunnelSecret({authFile: "", targetFile:"/run/token", fetchImpl}), /TUNNEL_SECRET_CONFIG_MISSING_OR_UNSAFE/);
  await assert.rejects(prepareTunnelSecret({authFile: "/tmp/file", targetFile:"/tmp/token", fetchImpl}), /TUNNEL_SECRET_CONFIG_MISSING_OR_UNSAFE/);
  assert.equal(calls, 0);
});

test("Vault Tunnel pre-start refuses world-readable internal authentication file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "astera-vault-api-test-"));
  try {
    const file = join(dir, "token");
    await writeFile(file, "never-send-this-secret", {mode:0o644});
    let calls = 0;
    await assert.rejects(prepareTunnelSecret({
      authFile:file, targetFile:"/run/user/1000/astera_v8_cloudflare_tunnel_token",
      fetchImpl:async () => { calls++; throw Error("must not send"); }
    }), /VAULT_API_AUTH_FILE_UNSAFE/);
    assert.equal(calls, 0);
  } finally { await rm(dir, {recursive:true, force:true}); }
});

test("Vault Tunnel pre-start rejects symbolic-link API credentials without making a request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "astera-vault-symlink-test-"));
  try {
    const source = join(dir, "real-credential");
    const link = join(dir, "alias");
    await writeFile(source, "long-private-credential-value", { mode: 0o600 });
    await symlink(source, link);
    let calls = 0;
    await assert.rejects(prepareTunnelSecret({
      authFile: link,
      targetFile: "/run/user/1000/astera_v8_cloudflare_tunnel_token",
      fetchImpl: async () => { calls++; throw Error("must not send"); }
    }), /VAULT_API_AUTH_FILE_UNSAFE/);
    assert.equal(calls, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
