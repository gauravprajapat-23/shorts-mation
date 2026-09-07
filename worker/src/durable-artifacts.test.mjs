import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DurableRenderArtifacts } from './durable-artifacts.mjs';

class MemoryStore{
  constructor(){this.prefix='test';this.map=new Map();}
  async putBuffer(k,b){this.map.set(k,Buffer.from(b));return {key:k,bytes:b.length};}
  async putJson(k,v){return this.putBuffer(k,Buffer.from(JSON.stringify(v)));}
  async getBuffer(k){return this.map.get(k)??null;}
  async getJson(k){const b=await this.getBuffer(k);return b?JSON.parse(b):null;}
  async head(k){const b=this.map.get(k);return b?{bytes:b.length}:null;}
  async putFile(k,p){const b=await readFile(p);this.map.set(k,b);return {key:k,bytes:b.length};}
  async downloadFile(k,p){const b=this.map.get(k);if(!b)return false;await mkdir(p.slice(0,p.lastIndexOf('/')),{recursive:true});await writeFile(p,b);return true;}
  async list(prefix){return [...this.map].filter(([k])=>k.startsWith(prefix)).map(([key,b])=>({key,size:b.length}));}
  async presignGet(k){return `https://signed.invalid/${k}`;}
}

test('content-addressed assets are reused across jobs',async()=>{
  const store=new MemoryStore(),a=new DurableRenderArtifacts(store);const root=await mkdtemp(join(tmpdir(),'durable-assets-'));const d1=join(root,'a'),d2=join(root,'b');await mkdir(d1);await mkdir(d2);await writeFile(join(d1,'one.png'),'same-bytes');await writeFile(join(d2,'two.png'),'same-bytes');
  const i1=await a.syncAssetCache('job1',d1,{assets:[{url:'https://a/1',file:'one.png'}]});const countAfterFirst=store.map.size;const i2=await a.syncAssetCache('job2',d2,{assets:[{url:'https://b/2',file:'two.png'}]});
  assert.equal(i1.assets[0].sha256,i2.assets[0].sha256);assert.equal(i1.assets[0].objectKey,i2.assets[0].objectKey);assert.equal([...store.map.keys()].filter(k=>k.startsWith('assets/sha256/')).length,1);assert.equal(store.map.size,countAfterFirst+2); // second job adds job index + URL index, but no duplicate content object
});

test('frame segments restore onto a fresh worker scratch directory',async()=>{
  const store=new MemoryStore(),a=new DurableRenderArtifacts(store);const root=await mkdtemp(join(tmpdir(),'durable-frames-'));const source=join(root,'source'),fresh=join(root,'fresh');await mkdir(source);for(let i=1;i<=3;i++)await writeFile(join(source,`${String(i).padStart(6,'0')}.png`),`frame-${i}`);
  await a.uploadFrameSegment('job1',source,1,3);const restored=await a.restoreFrameSegments('job1',fresh);assert.equal(restored.maxFrame,3);assert.equal((await readFile(join(fresh,'000003.png'),'utf8')),'frame-3');
});
