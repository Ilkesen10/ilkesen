#!/usr/bin/env node
/*
  Fetch full Turkey province/district list and write to data/districts_tr.json
  - Normalizes to { "Ankara": ["Çankaya", ...], ... }
  - Run with: node tools/fetch-districts.js
*/

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.resolve(__dirname, '..', 'data', 'districts_tr.json');
const SOURCES = [
  'https://raw.githubusercontent.com/furkanonder/turkiye-iller-ve-ilceler/master/il_ilce.json',
  'https://raw.githubusercontent.com/caglaryalcin/tr-turkiye-iller-ilceler/main/il-ilce.json'
];

function fetchJson(url){
  return new Promise((resolve, reject)=>{
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', ()=>{
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch(e){ reject(e); }
      });
    }).on('error', reject);
  });
}

function normalize(src){
  // Case A: already a map
  if (src && typeof src === 'object' && !Array.isArray(src)){
    const ok = Object.keys(src).every(k => Array.isArray(src[k]));
    if (ok) return src;
  }
  // Case B: array of objects { il, ilceler }
  if (Array.isArray(src)){
    const out = {};
    for (const it of src){
      const il = it?.il || it?.province || it?.name;
      const arr = it?.ilceler || it?.districts || it?.ilce;
      if (il && Array.isArray(arr)) out[String(il)] = arr.map(String);
    }
    if (Object.keys(out).length) return out;
  }
  return null;
}

(async function(){
  let map = null, used = null;
  for (const url of SOURCES){
    try{
      const data = await fetchJson(url);
      const norm = normalize(data);
      if (norm && Object.keys(norm).length){ map = norm; used = url; break; }
    }catch(e){ /* try next */ }
  }
  if (!map) throw new Error('No source could be fetched/normalized');

  // Sort provinces and districts alphabetically
  const provs = Object.keys(map).sort((a,b)=> a.localeCompare(b,'tr'));
  const out = {};
  for (const p of provs){
    const arr = Array.from(new Set(map[p])) // unique
      .sort((a,b)=> a.localeCompare(b,'tr'));
    out[p] = arr;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log('districts_tr.json written from', used, '\nPath:', OUT);
})();
