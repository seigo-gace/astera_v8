"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const{mapRequirements}=require("../../requirement-mapper");
test("explicit fulfilled mapping is high confidence",()=>{const result=mapRequirements([{requirement_id:"R1",text:"x",mandatory:true,fulfillment:{status:"fulfilled",locations:["section:x"]}}],"x");assert.equal(result.totals.mandatory_failures,0);assert.equal(result.explicit_fulfillment_ratio,1);});
test("inferred mapping cannot be fulfilled",()=>{const result=mapRequirements([{requirement_id:"R1",text:"x",mandatory:true}],"x");assert.equal(result.items[0].status,"partial");assert.equal(result.totals.mandatory_failures,1);});
