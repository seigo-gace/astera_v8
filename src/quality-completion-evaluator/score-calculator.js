"use strict";
const { normalizeScore100 }=require("./utils/scoring");
function calculateAxis(axisResult,axisName){if(!axisResult||!Array.isArray(axisResult.criteria)||axisResult.criteria.length===0)throw new TypeError(`${axisName} criteria are missing`);const totalWeight=axisResult.criteria.reduce((sum,item)=>sum+item.weight,0);if(totalWeight!==100)throw new RangeError(`${axisName} weights must total 100`);for(const item of axisResult.criteria){if(!Number.isFinite(item.score_0_to_5)||item.score_0_to_5<0||item.score_0_to_5>5)throw new RangeError(`${item.criterion_id} score must be between 0 and 5`);}return normalizeScore100(axisResult.criteria.reduce((sum,item)=>sum+item.weighted_score,0));}
function calculateScores(qualityResult,completionResult){const quality=calculateAxis(qualityResult,"quality");const completion=calculateAxis(completionResult,"completion");return{quality,completion,minimum:Math.min(quality,completion)};}
module.exports={calculateAxis,calculateScores};
