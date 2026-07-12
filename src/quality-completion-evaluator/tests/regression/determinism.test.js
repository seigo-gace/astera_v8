"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const{evaluate}=require("../../index");const{baseDesignRequest}=require("../fixtures/factory");
test("same input produces same scores, criteria and judgment",async()=>{const request=baseDesignRequest();const a=await evaluate(request);const b=await evaluate(request);assert.deepEqual(a.scores,b.scores);assert.deepEqual(a.criteria,b.criteria);assert.deepEqual(a.blocking,b.blocking);assert.deepEqual(a.judgment,b.judgment);});
