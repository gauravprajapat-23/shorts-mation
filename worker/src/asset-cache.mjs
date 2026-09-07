import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join } from 'node:path';

const URL_RE=/https?:\/\/[^\s"'<>\\)]+/g;
const hash=s=>createHash('sha256').update(s).digest('hex');
const clone=v=>structuredClone(v);

export function discoverRenderUrls(manifest){
  const urls=new Set();
  const walk=v=>{
    if(typeof v==='string'){
      for(const m of v.matchAll(URL_RE))urls.add(m[0].replaceAll('&amp;','&'));
      return;
    }
    if(Array.isArray(v)){for(const x of v)walk(x);return;}
    if(v&&typeof v==='object')for(const x of Object.values(v))walk(x);
  };
  walk(manifest);
  return [...urls];
}

function contentTypeFor(path){const e=extname(path).toLowerCase();return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.woff2':'font/woff2','.woff':'font/woff','.css':'text/css'})[e]||'application/octet-stream';}

export async function prefetchRenderAssets(manifest,{dir,fetchTo,maxConcurrency=6,reuse=true}){
  await mkdir(dir,{recursive:true});
  const urls=discoverRenderUrls(manifest);
  const map=new Map(); const missing=[];
  for(const url of urls){
    const u=new URL(url);const suffix=extname(u.pathname).slice(0,10);const path=join(dir,`${hash(url)}${suffix}`);
    let valid=false;if(reuse){try{const s=await stat(path);valid=s.isFile()&&s.size>0;}catch{}}
    if(valid)map.set(url,path);else missing.push([url,path]);
  }
  let cursor=0;
  const workers=Array.from({length:Math.max(1,Math.min(maxConcurrency,missing.length||1))},async()=>{
    while(cursor<missing.length){const [url,path]=missing[cursor++];await fetchTo(url,path);map.set(url,path);}
  });
  await Promise.all(workers);
  const index={version:2,createdAt:new Date().toISOString(),reused:urls.length-missing.length,downloaded:missing.length,assets:[...map].map(([url,path])=>({url,file:path.split('/').pop(),sha256:null}))};
  for(const row of index.assets){const b=await readFile(join(dir,row.file));row.sha256=createHash('sha256').update(b).digest('hex');row.bytes=b.length;}
  await writeFile(join(dir,'asset-index.json'),JSON.stringify(index,null,2));
  return {map,index};
}

export async function startAssetServer({assetMap,fontCss,fontFilePath}){
  const reverse=new Map(); for(const [url,path] of assetMap)reverse.set(`/asset/${hash(url)}`,path);
  const server=http.createServer(async(req,res)=>{try{
    const u=new URL(req.url||'/','http://127.0.0.1');
    if(u.pathname==='/__fonts__/catalog.css'){res.writeHead(200,{'content-type':'text/css; charset=utf-8','cache-control':'public,max-age=31536000,immutable'});return res.end(fontCss);}
    const fp=fontFilePath?.(u.pathname); if(fp){const s=await stat(fp);res.writeHead(200,{'content-type':contentTypeFor(fp),'content-length':String(s.size),'cache-control':'public,max-age=31536000,immutable','access-control-allow-origin':'*'});return createReadStream(fp).pipe(res);}
    const path=reverse.get(u.pathname);if(path){const s=await stat(path);res.writeHead(200,{'content-type':contentTypeFor(path),'content-length':String(s.size),'cache-control':'public,max-age=31536000,immutable','access-control-allow-origin':'*'});return createReadStream(path).pipe(res);}
    res.writeHead(404);res.end('not found');
  }catch(e){res.writeHead(500);res.end(String(e));}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const address=server.address();const base=`http://127.0.0.1:${address.port}`;
  return {base,urlFor:(url)=>`${base}/asset/${hash(url)}`,close:()=>new Promise(r=>server.close(()=>r()))};
}

export function rewriteManifestUrls(manifest,assetMap,server){
  const out=clone(manifest);
  const rewrite=v=>{
    if(typeof v==='string'){let s=v;for(const url of assetMap.keys())s=s.split(url).join(server.urlFor(url));return s;}
    if(Array.isArray(v))return v.map(rewrite);
    if(v&&typeof v==='object'){for(const k of Object.keys(v))v[k]=rewrite(v[k]);}
    return v;
  };
  return rewrite(out);
}
