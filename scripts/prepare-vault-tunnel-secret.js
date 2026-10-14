"use strict";
const { readFile, lstat } = require("node:fs/promises");

const ACTION_PATH = "/internal/v1/actions/astera-tunnel/materialize";
const FIXED_ORIGIN = "http://127.0.0.1:8791";

/**
 * Explicit API-first pre-start operation. No Token values in logs, arguments
 * or HTTP replies. The Vault API materializes a fixed ACL-authorized secret.
 */
async function prepareTunnelSecret({
  authFile = process.env.LIBRAL_VAULT_INTERNAL_TOKEN_FILE_HOST,
  targetFile = process.env.CLOUDFLARE_TUNNEL_TOKEN_FILE,
  fetchImpl = fetch,
} = {}) {
  if (!authFile || !authFile.startsWith("/") || !targetFile ||
      !/^\/run\/[a-zA-Z0-9/_-]+$/.test(targetFile)) {
    throw new Error("TUNNEL_SECRET_CONFIG_MISSING_OR_UNSAFE");
  }
  const authStat = await lstat(authFile);
  if (!authStat.isFile() || authStat.isSymbolicLink() || (authStat.mode & 0o077) !== 0) {
    throw new Error("VAULT_API_AUTH_FILE_UNSAFE");
  }
  const tokenBytes = await readFile(authFile);
  try {
    const token = tokenBytes.toString("utf8").trim();
    if (token.length < 24) throw new Error("VAULT_API_AUTH_INVALID");
    const response = await fetchImpl(FIXED_ORIGIN + ACTION_PATH, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error("VAULT_API_TUNNEL_MATERIALIZE_FAILED");
    const receipt = await response.json();
    if (!receipt || receipt.materialized !== true) throw new Error("VAULT_API_TUNNEL_RECEIPT_INVALID");
  } finally {
    tokenBytes.fill(0);
  }
  const secretStat = await lstat(targetFile);
  if (!secretStat.isFile() || secretStat.isSymbolicLink() || secretStat.size === 0 ||
      (secretStat.mode & 0o077) !== 0) {
    throw new Error("TUNNEL_RUNTIME_SECRET_FILE_INVALID");
  }
  return { ready: true };
}
module.exports = { prepareTunnelSecret };

if (require.main === module) {
  prepareTunnelSecret().then(
    () => { process.stdout.write("ASTERA_V8_VAULT_TUNNEL_SECRET_READY=YES\n"); },
    (error) => {
      process.stderr.write(`ASTERA_V8_VAULT_TUNNEL_SECRET_READY=NO reason=${error.code || error.message}\n`);
      process.exitCode = 1;
    }
  );
}
