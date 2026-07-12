"use strict";
function stableStringify(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stableStringify).join(",")}]`;const keys=Object.keys(value).sort();return`{${keys.map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;}
module.exports={stableStringify};
