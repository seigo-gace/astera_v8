"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const path=require("node:path");const{spawnSync}=require("node:child_process");const{baseDesignRequest}=require("../fixtures/factory");
test("CLI accepts STDIN and exits 0 for eligible sample",()=>{const root=path.resolve(__dirname,"../..");const evaluation=spawnSync(process.execPath,[path.join(root,"cli/evaluate.js")],{input:`${JSON.stringify(baseDesignRequest())}\n`,encoding:"utf8"});assert.equal(evaluation.status,0,evaluation.stderr);assert.equal(JSON.parse(evaluation.stdout).status,"PASSED");});
