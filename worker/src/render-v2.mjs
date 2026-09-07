import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const q=(v)=>Math.max(0,Math.min(1,n(v,1)));
const esc=(s)=>String(s).replaceAll("'","\\'");

export function flattenManifest(manifest){
  const tracks=Array.isArray(manifest?.timeline?.tracks)?manifest.timeline.tracks:[];
  const clips=tracks.flatMap((track,trackIndex)=>(Array.isArray(track?.clips)?track.clips:[]).map((clip,clipIndex)=>({...clip,trackIndex,clipIndex})));
  return {
    html:clips.filter(c=>c?.asset?.type==='html'),
    videos:clips.filter(c=>c?.asset?.type==='video'&&c?.asset?.src),
    images:clips.filter(c=>c?.asset?.type==='image'&&c?.asset?.src),
    audio:clips.filter(c=>c?.asset?.type==='audio'&&c?.asset?.src),
  };
}

export function manifestDuration(manifest){
  const {html,videos,images,audio}=flattenManifest(manifest); const all=[...html,...videos,...images,...audio];
  return Math.max(0.001,...all.map(c=>n(c.start)+n(c.length)), n(manifest?.timeline?.duration));
}

function atempoChain(speed){
  let x=Math.max(.05,n(speed,1)),parts=[];
  while(x>2){parts.push('atempo=2');x/=2} while(x<.5){parts.push('atempo=0.5');x*=2}
  if(Math.abs(x-1)>.0001)parts.push(`atempo=${x.toFixed(6)}`); return parts;
}

function visualFilter(c,input,w,h,label){
  const width=Math.max(1,Math.round(n(c.width,w))),height=Math.max(1,Math.round(n(c.height,h)));
  const fit=c.fit==='contain'?'decrease':'increase';
  const speed=Math.max(.01,n(c.asset?.speed,1));
  const filters=[`[${input}:v]trim=start=${Math.max(0,n(c.asset?.trim)).toFixed(6)}:duration=${Math.max(.001,n(c.length)*speed).toFixed(6)}`,`setpts=(PTS-STARTPTS)/${speed.toFixed(8)}+${Math.max(0,n(c.start)).toFixed(6)}/TB`];
  filters.push(`scale=${width}:${height}:force_original_aspect_ratio=${fit}`);
  if(c.fit!=='contain')filters.push(`crop=${width}:${height}`); else filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`);
  const preset=c.filter||c.asset?.filter; if(preset==='greyscale')filters.push('hue=s=0'); else if(preset==='contrast')filters.push('eq=contrast=1.25'); else if(preset==='boost')filters.push('eq=contrast=1.12:saturation=1.18'); else if(preset==='muted')filters.push('eq=saturation=.72:contrast=.96');
  const adj=c.adjustments||{}; const brightness=n(adj.brightness,1),contrast=n(adj.contrast,1),saturation=n(adj.saturation,1); if(Math.abs(brightness-1)>.001||Math.abs(contrast-1)>.001||Math.abs(saturation-1)>.001)filters.push(`eq=brightness=${(brightness-1).toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`); if(n(adj.blur)>0.01)filters.push(`gblur=sigma=${Math.max(.1,n(adj.blur)).toFixed(3)}`);
  if(n(c.blurPx)>0.01)filters.push(`gblur=sigma=${Math.max(.1,n(c.blurPx)).toFixed(3)}`);
  const rot=n(c.rotation,0); if(Math.abs(rot)>.01)filters.push(`rotate=${rot.toFixed(4)}*PI/180:ow=rotw(iw):oh=roth(ih):c=none`);
  const opacity=q(c.opacity); if(opacity<.999)filters.push('format=rgba',`colorchannelmixer=aa=${opacity.toFixed(6)}`);
  return `${filters.join(',')}[${label}]`;
}

function audioFilter(c,input,label){
  const filters=[`[${input}:a]atrim=start=${Math.max(0,n(c.asset?.trim)).toFixed(6)}:duration=${Math.max(.001,n(c.length)*Math.max(.01,n(c.asset?.speed,1))).toFixed(6)}`,'asetpts=PTS-STARTPTS',...atempoChain(c.asset?.speed)];
  const points=Array.isArray(c.asset?.gainPoints)?c.asset.gainPoints.filter(p=>Number.isFinite(Number(p?.t))&&Number.isFinite(Number(p?.gain))):[];
  if(points.length>1){const clauses=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dt=Math.max(.000001,n(b.t)-n(a.t));clauses.push(`if(between(t,${n(a.t).toFixed(4)},${n(b.t).toFixed(4)}),${n(a.gain).toFixed(6)}+(${(n(b.gain)-n(a.gain)).toFixed(6)})*(t-${n(a.t).toFixed(4)})/${dt.toFixed(4)},`)}const tail=Math.max(0,n(points.at(-1)?.gain));filters.push(`volume='${clauses.join('')}${tail.toFixed(6)}${')'.repeat(clauses.length)}':eval=frame`)}else{const vol=Math.max(0,n(c.asset?.volume,1));filters.push(`volume=${vol.toFixed(6)}`);}
  if(n(c.fadeIn)>0)filters.push(`afade=t=in:st=0:d=${n(c.fadeIn).toFixed(6)}`);
  if(n(c.fadeOut)>0)filters.push(`afade=t=out:st=${Math.max(0,n(c.length)-n(c.fadeOut)).toFixed(6)}:d=${n(c.fadeOut).toFixed(6)}`);
  filters.push(`adelay=${Math.max(0,Math.round(n(c.start)*1000))}|${Math.max(0,Math.round(n(c.start)*1000))}`);
  return `${filters.join(',')}[${label}]`;
}

export function buildFfmpegPlan(manifest,inputMap,{framePattern,total,w,h,fps,out}){
  const flat=flattenManifest(manifest); const visuals=[...flat.videos,...flat.images].sort((a,b)=>b.trackIndex-a.trackIndex||a.clipIndex-b.clipIndex),audio=flat.audio; const filters=[];
  filters.push(`[0:v]fps=${fps},scale=${w}:${h},format=rgba[base0]`);
  let current='base0';
  visuals.forEach((c,i)=>{
    const input=inputMap.get(c.asset.src)?.index; const vl=`v${i}`; filters.push(visualFilter(c,input,w,h,vl));
    const x=Number.isFinite(Number(c.x))?n(c.x):Number.isFinite(Number(c.offsetPx?.x))?n(c.offsetPx.x):Math.round(n(c.offset?.x)*w);
    const y=Number.isFinite(Number(c.y))?n(c.y):Number.isFinite(Number(c.offsetPx?.y))?n(c.offsetPx.y):Math.round(-n(c.offset?.y)*h);
    const next=`base${i+1}`; const start=n(c.start),end=start+n(c.length);
    filters.push(`[${current}][${vl}]overlay=x=${Math.round(x)}:y=${Math.round(y)}:enable='between(t,${start.toFixed(6)},${end.toFixed(6)})':eof_action=pass[${next}]`); current=next;
  });
  const audioLabels=[];
  audio.forEach((c,i)=>{const input=inputMap.get(c.asset.src)?.index;const al=`a${i}`;filters.push(audioFilter(c,input,al));audioLabels.push(`[${al}]`)});
  if(manifest?.timeline?.soundtrack?.src){const src=manifest.timeline.soundtrack.src,input=inputMap.get(src)?.index,al='soundtrack'; const vol=Math.max(0,n(manifest.timeline.soundtrack.volume,.7));filters.push(`[${input}:a]atrim=duration=${total.toFixed(6)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(6)}[${al}]`);audioLabels.push(`[${al}]`)}
  if(audioLabels.length)filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,atrim=duration=${total.toFixed(6)}[aout]`);
  const args=['-y','-framerate',String(fps),'-i',framePattern];
  const sorted=[...inputMap.values()].sort((a,b)=>a.index-b.index); for(const item of sorted){if(item.kind==='image')args.push('-loop','1');args.push('-i',item.path);}
  args.push('-filter_complex',filters.join(';'),'-map',`[${current}]`); if(audioLabels.length)args.push('-map','[aout]','-c:a','aac','-b:a','192k');
  args.push('-t',String(total),'-c:v','libx264','-preset',process.env.FFMPEG_PRESET||'medium','-crf',process.env.FFMPEG_CRF||'21','-pix_fmt','yuv420p','-movflags','+faststart',out);
  return {args,filters};
}

export async function downloadMedia({manifest,dir,fetchTo}){
  await mkdir(dir,{recursive:true}); const {videos,images,audio}=flattenManifest(manifest); const entries=[...videos.map(c=>[c.asset.src,'video']),...images.map(c=>[c.asset.src,'image']),...audio.map(c=>[c.asset.src,'audio'])]; if(manifest?.timeline?.soundtrack?.src)entries.push([manifest.timeline.soundtrack.src,'audio']);
  const unique=[]; const seen=new Set(); for(const entry of entries){if(!seen.has(entry[0])){seen.add(entry[0]);unique.push(entry)}} const map=new Map(); let idx=1;
  for(const [url,kind] of unique){const path=join(dir,`media-${idx}`);let ok=false;try{const s=await stat(path);ok=s.isFile()&&s.size>0;}catch{}if(!ok)await fetchTo(url,path);map.set(url,{index:idx++,path,kind});} return map;
}

export async function runFfmpeg(args,onStderr){const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});p.stderr.on('data',d=>onStderr?.(String(d)));await new Promise((resolve,reject)=>{p.on('exit',c=>c===0?resolve():reject(new Error(`ffmpeg exited ${c}`)));p.on('error',reject)});return p;}
