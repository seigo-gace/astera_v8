'use strict';

const {normalizeText,deepFreeze}=require('./core');

const SUPPORTED_LANGUAGES=new Set(['js','javascript','cjs','mjs','ts','typescript','tsx','jsx']);

function unwrapFence(text){const raw=String(text||''),match=raw.match(/^(```|~~~)([^\n]*)\n([\s\S]*?)\n?\1\s*$/u);if(!match)return{language:'',body:raw,offset:0};return{language:normalizeText(match[2]).toLowerCase(),body:match[3],offset:match[0].indexOf(match[3])};}
function lineLocation(body,index,baseOffset=0){const before=body.slice(0,index),line=before.split('\n').length,column=index-(before.lastIndexOf('\n')+1)+1;return{line,column,start:baseOffset+index};}
function add(records,{predicate,subject,objectOrValue,nodeType,index,body,baseOffset,raw}){records.push(deepFreeze({predicate,subject:normalizeText(subject),object_or_value:objectOrValue??'UNKNOWN',ast_node:{type:nodeType,raw:normalizeText(raw)},source_location:lineLocation(body,index,baseOffset)}));}
function parseSupportedCode(text){
  const {language,body,offset}=unwrapFence(text),records=[];
  if(language&&!SUPPORTED_LANGUAGES.has(language))return deepFreeze({supported:false,language,records:[],diagnostics:['PARSER_LANGUAGE_UNSUPPORTED']});
  const declaration=/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;for(const match of body.matchAll(declaration))add(records,{predicate:'DECLARES_SYMBOL',subject:match[1],objectOrValue:normalizeText(match[2]),nodeType:'VariableDeclaration',index:match.index??0,body,baseOffset:offset,raw:match[0]});
  const imports=/\bimport\s+(?:[^'"\n]+?\s+from\s+)?['"]([^'"]+)['"]/g;for(const match of body.matchAll(imports))add(records,{predicate:'IMPORTS_MODULE',subject:'CURRENT_MODULE',objectOrValue:match[1],nodeType:'ImportDeclaration',index:match.index??0,body,baseOffset:offset,raw:match[0]});
  const requires=/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;for(const match of body.matchAll(requires))add(records,{predicate:'IMPORTS_MODULE',subject:'CURRENT_MODULE',objectOrValue:match[1],nodeType:'CallExpression',index:match.index??0,body,baseOffset:offset,raw:match[0]});
  const exports=/\b(?:module\.exports\s*=|export\s+(?:default\s+)?(?:const|let|var|function|class)?\s*([A-Za-z_$][\w$]*)?)/g;for(const match of body.matchAll(exports))add(records,{predicate:'EXPORTS_SYMBOL',subject:'CURRENT_MODULE',objectOrValue:match[1]||'DEFAULT_OR_OBJECT',nodeType:'ExportDeclaration',index:match.index??0,body,baseOffset:offset,raw:match[0]});
  const routes=/\b(?:app|router)\.(get|post|put|patch|delete|options|head)\(\s*['"]([^'"]+)['"]/gi;for(const match of body.matchAll(routes))add(records,{predicate:'DEFINES_ROUTE',subject:match[2],objectOrValue:match[1].toUpperCase(),nodeType:'CallExpression',index:match.index??0,body,baseOffset:offset,raw:match[0]});
  return deepFreeze({supported:true,language:language||'javascript-subset',records:records.sort((a,b)=>a.source_location.start-b.source_location.start||a.predicate.localeCompare(b.predicate)),diagnostics:records.length?[]:['AST_NODE_NOT_EXTRACTED']});
}

module.exports={SUPPORTED_LANGUAGES,unwrapFence,parseSupportedCode};
