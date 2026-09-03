import type { EditorAudioClip, EditorDocumentV2 } from "@/lib/types";
import { getTimelineSceneRanges } from "@/lib/timeline-engine";
import { syncV2Timeline } from "@/lib/editor-document-v2";

export type AudioPresetValue={
  volume:number;fadeInMs:number;fadeOutMs:number;ducking:boolean;loop:boolean;bpm?:number;beatOffsetMs?:number;
};

export function beatDurationMs(bpm:number){return 60_000/Math.max(1,bpm);}
export function snapTimeToBeat(timeMs:number,bpm:number,offsetMs=0,division=1){
  const beat=beatDurationMs(bpm)/Math.max(1,division);
  return Math.max(0,Math.round((timeMs-offsetMs)/beat)*beat+offsetMs);
}
export function beatGrid(durationMs:number,bpm:number,offsetMs=0,division=1){
  const step=beatDurationMs(bpm)/Math.max(1,division);
  const out:number[]=[];
  for(let t=offsetMs;t<=durationMs;t+=step)if(t>=0)out.push(Math.round(t));
  return out;
}
export function applyAudioPreset(clip:EditorAudioClip,preset:AudioPresetValue):EditorAudioClip{
  return {...clip,volume:preset.volume,fadeInMs:preset.fadeInMs,fadeOutMs:preset.fadeOutMs,ducking:preset.ducking,loop:preset.loop,bpm:preset.bpm,beatOffsetMs:preset.beatOffsetMs??0};
}
export function syncClipToBeat(clip:EditorAudioClip,bpm:number,offsetMs=0,division=1):EditorAudioClip{
  return {...clip,startMs:snapTimeToBeat(clip.startMs,bpm,offsetMs,division),bpm,beatOffsetMs:offsetMs};
}
export function fitSceneToNarration(doc:EditorDocumentV2,sceneId:string,narrationDurationMs:number,paddingMs=250):EditorDocumentV2{
  const index=doc.scenes.findIndex(s=>s.id===sceneId);
  if(index<0)return doc;
  const oldRanges=getTimelineSceneRanges(doc);
  const oldStart=oldRanges[index]?.startMs??0;
  const oldDuration=doc.scenes[index]!.durationMs;
  const nextDuration=Math.max(500,Math.round(narrationDurationMs+Math.max(0,paddingMs)));
  const delta=nextDuration-oldDuration;
  const scenes=doc.scenes.map((s,i)=>i===index?{...s,durationMs:nextDuration}:s);
  const boundary=oldStart+oldDuration;
  const audioClips=doc.audioClips.map(c=>{
    if(c.sceneId===sceneId)return c;
    return c.startMs>=boundary?{...c,startMs:Math.max(0,c.startMs+delta)}:c;
  });
  const captionClips=doc.captionClips.map(c=>c.startMs>=boundary?{...c,startMs:Math.max(0,c.startMs+delta)}:c);
  const effectClips=doc.effectClips.map(c=>c.startMs>=boundary?{...c,startMs:Math.max(0,c.startMs+delta)}:c);
  return syncV2Timeline({...doc,scenes,audioClips,captionClips,effectClips});
}
export function estimateNarrationMs(text:string,wordsPerMinute=150){
  const words=text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(500,Math.round(words/Math.max(60,wordsPerMinute)*60_000));
}
