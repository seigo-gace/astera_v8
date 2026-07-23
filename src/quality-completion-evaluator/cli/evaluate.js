#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { evaluate, evaluateAndPublish, createHttpKbSystemAdapter } = require("..");

async function readInput() {
  const fileArg = process.argv.find((arg) => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]);
  if (fileArg) return fs.readFileSync(path.resolve(fileArg), "utf8");
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

(async () => {
  try {
    const raw = await readInput();
    if (!raw.trim()) throw new Error("JSON input is required via STDIN or file path");
    const request = JSON.parse(raw);
    const publish = process.argv.includes("--publish-http");
    const result = publish
      ? await evaluateAndPublish(request, createHttpKbSystemAdapter())
      : await evaluate(request);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = ["INVALID_INPUT", "EVALUATION_FAILED"].includes(result.status) ? 2 : result.judgment?.kb_eligible ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "CLI_FAILED", message: error.message }, null, 2)}\n`);
    process.exitCode = 2;
  }
})();
