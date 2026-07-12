"use strict";
const fs=require("node:fs");const path=require("node:path");function loadJson(relativePath){const fullPath=path.join(__dirname,"..",relativePath);return JSON.parse(fs.readFileSync(fullPath,"utf8"));}module.exports={loadJson};
