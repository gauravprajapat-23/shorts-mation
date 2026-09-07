import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { R2ObjectStore, r2ConfigFromEnv } from './r2-store.mjs';

test('R2 config and presigned URL are deterministic S3-compatible',async()=>{
  const cfg=r2ConfigFromEnv({R2_ACCOUNT_ID:'acct',R2_BUCKET:'bucket',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret',R2_RENDER_PREFIX:'render/v1'});
  assert.equal(cfg.endpoint,'https://acct.r2.cloudflarestorage.com');
  const store=new R2ObjectStore(cfg);const url=await store.presignGet('jobs/a/output/output.mp4',{expiresSeconds:600});
  assert.match(url,/X-Amz-Algorithm=AWS4-HMAC-SHA256/);assert.match(url,/X-Amz-Signature=/);assert.match(url,/bucket\/render\/v1\/jobs\/a\/output\/output.mp4/);
});

test('large files use multipart path',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r2-multipart-'));const path=join(dir,'large.bin');await writeFile(path,Buffer.alloc(6*1024*1024,7));
  const store=new R2ObjectStore({endpoint:'https://example.invalid',bucket:'b',accessKeyId:'k',secretAccessKey:'s',prefix:'p',multipartThreshold:5*1024*1024,partSize:5*1024*1024});
  const calls=[];store.createMultipart=async()=>{calls.push('create');return 'upload-1';};store.uploadPart=async(_k,_u,n,b)=>{calls.push(`part:${n}:${b.length}`);return `\"etag-${n}\"`;};store.completeMultipart=async(_k,_u,parts)=>{calls.push(`complete:${parts.length}`);return {key:'x'};};
  const result=await store.putFile('x',path);assert.equal(result.multipart,true);assert.deepEqual(calls,['create','part:1:5242880','part:2:1048576','complete:2']);
});
