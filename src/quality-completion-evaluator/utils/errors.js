"use strict";
class EvaluationError extends Error{constructor(code,message,details=[]){super(message);this.name="EvaluationError";this.code=code;this.details=details;}}
module.exports={EvaluationError};
