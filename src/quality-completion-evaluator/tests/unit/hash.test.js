"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const{sha256Text,sha256Json}=require("../../utils/hash");test("hash is deterministic",()=>{assert.equal(sha256Text("abc"),sha256Text("abc"));assert.equal(sha256Json({b:2,a:1}),sha256Json({a:1,b:2}));});
