"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const{evaluate}=require("../../index");const{baseDesignRequest}=require("../fixtures/factory");
test("content hash mismatch returns INVALID_INPUT",async()=>{const request=baseDesignRequest();request.target.content_hash=`sha256:${"0".repeat(64)}`;const result=await evaluate(request);assert.equal(result.status,"INVALID_INPUT");assert.equal(result.evaluation_complete,false);});
