import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CdpConnection {
  constructor(url) { this.url=url; this.ws=null; this.nextId=1; this.pending=new Map(); this.ready=null; }
  async connect() {
    this.ws = new WebSocket(this.url);
    this.ready = new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});
    this.ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(String(ev.data));}catch{return;}if(m.id&&this.pending.has(m.id)){const {resolve,reject}=this.pending.get(m.id);this.pending.delete(m.id);m.error?reject(new Error(m.error.message||'CDP error')):resolve(m.result||{});}});
    await this.ready;
  }
  async send(method,params={},sessionId){const id=this.nextId++;const payload={id,method,params,...(sessionId?{sessionId}:{})};return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify(payload));});}
  close(){try{this.ws?.close();}catch{}}
}

async function launchChromium() {
  const userDataDir=join(tmpdir(),`shorts-mation-chromium-${randomUUID()}`); await mkdir(userDataDir,{recursive:true});
  const executable=process.env.CHROMIUM_PATH||'chromium';
  const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--hide-scrollbars','--mute-audio','--remote-debugging-port=0',`--user-data-dir=${userDataDir}`,'about:blank'];
  const proc=spawn(executable,args,{stdio:['ignore','ignore','pipe']});
  let stderr='';
  const wsUrl=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`Chromium DevTools endpoint timeout: ${stderr.slice(-1500)}`)),15000);
    proc.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-12000);const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
    proc.once('error',e=>{clearTimeout(timer);reject(e)});proc.once('exit',c=>{clearTimeout(timer);reject(new Error(`Chromium exited before ready (${c}): ${stderr.slice(-1500)}`));});
  });
  return {proc,userDataDir,wsUrl,stderr:()=>stderr};
}

function documentHtml(body,w,h,fontStylesheetUrl){
  if(!fontStylesheetUrl)throw new Error("Deterministic font stylesheet URL is required");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><link rel="stylesheet" href="${fontStylesheetUrl}"><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}body{position:relative;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}*,*::before,*::after{animation-play-state:paused!important;caret-color:transparent!important}img,video{display:block}
</style></head><body><div id="frame" style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${body}</div></body></html>`;
}

export class ChromiumFrameRenderer {
  constructor(opts={}){this.w=opts.width;this.h=opts.height;this.assetTimeoutMs=opts.assetTimeoutMs||15000;this.fontStylesheetUrl=opts.fontStylesheetUrl;this.browser=null;this.cdp=null;this.sessionId=null;this.targetId=null;}
  async start(){
    this.browser=await launchChromium(); this.cdp=new CdpConnection(this.browser.wsUrl); await this.cdp.connect();
    const {targetId}=await this.cdp.send('Target.createTarget',{url:'about:blank'}); this.targetId=targetId;
    const attached=await this.cdp.send('Target.attachToTarget',{targetId,flatten:true}); this.sessionId=attached.sessionId;
    await this.cdp.send('Page.enable',{},this.sessionId); await this.cdp.send('Runtime.enable',{},this.sessionId);
    await this.cdp.send('Emulation.setDeviceMetricsOverride',{width:this.w,height:this.h,deviceScaleFactor:1,mobile:false,screenWidth:this.w,screenHeight:this.h},this.sessionId);
    await this.cdp.send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}},this.sessionId);
    return this;
  }
  async renderFrame(body,outputPath){
    if(!this.cdp||!this.sessionId)throw new Error('ChromiumFrameRenderer not started');
    const html=documentHtml(body,this.w,this.h,this.fontStylesheetUrl);
    await this.cdp.send('Page.setDocumentContent',{frameId:(await this.cdp.send('Page.getFrameTree',{},this.sessionId)).frameTree.frame.id,html},this.sessionId);
    const waitScript=`(async()=>{const timeout=${this.assetTimeoutMs};const deadline=Date.now()+timeout;try{if(document.fonts?.ready)await Promise.race([document.fonts.ready,new Promise((_,r)=>setTimeout(()=>r(new Error('font preload timeout')),timeout))]);}catch(e){throw e}const imgs=[...document.images];await Promise.all(imgs.map(async img=>{if(img.complete){if(img.decode)try{await img.decode()}catch{};return;}await new Promise((resolve,reject)=>{const left=Math.max(1,deadline-Date.now());const t=setTimeout(()=>reject(new Error('image preload timeout: '+img.src)),left);img.addEventListener('load',()=>{clearTimeout(t);resolve()},{once:true});img.addEventListener('error',()=>{clearTimeout(t);reject(new Error('image failed: '+img.src))},{once:true});});if(img.decode)try{await img.decode()}catch{}}));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return {fonts:document.fonts?.status||'unknown',images:imgs.length};})()`;
    const result=await this.cdp.send('Runtime.evaluate',{expression:waitScript,awaitPromise:true,returnByValue:true},this.sessionId);
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||'Chromium asset preload failed');
    const shot=await this.cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,clip:{x:0,y:0,width:this.w,height:this.h,scale:1}},this.sessionId);
    await import('node:fs/promises').then(fs=>fs.writeFile(outputPath,Buffer.from(shot.data,'base64')));
    return result.result?.value||{};
  }
  async close(){
    try{if(this.cdp&&this.targetId)await this.cdp.send('Target.closeTarget',{targetId:this.targetId});}catch{}
    this.cdp?.close();
    if(this.browser?.proc){this.browser.proc.kill('SIGTERM');await Promise.race([new Promise(r=>this.browser.proc.once('exit',r)),sleep(1500)]).catch(()=>{});if(this.browser.proc.exitCode===null)this.browser.proc.kill('SIGKILL');}
    if(this.browser?.userDataDir)await rm(this.browser.userDataDir,{recursive:true,force:true}).catch(()=>{});
    this.browser=null;this.cdp=null;this.sessionId=null;this.targetId=null;
  }
}

export { documentHtml };
