import { useMemo,useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic2,Music,Save,Sparkles,Volume2,WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateSceneNarration,getTtsSettings } from "@/lib/tts.functions";
import type { EditorAudioClip,EditorScene } from "@/lib/types";
import { estimateNarrationMs,snapTimeToBeat } from "@/lib/audio-automation";

type VoicePreset={id:string;name:string;provider:"openai"|"elevenlabs";model:string;voice_id:string;speed:number;style_instructions:string|null;pronunciation_json:Array<{find:string;sayAs:string}>;is_default:boolean};
type AudioPreset={id:string;name:string;role:string;volume:number;fade_in_ms:number;fade_out_ms:number;ducking:boolean;loop:boolean;bpm:number|null;beat_offset_ms:number};
type LibraryItem={id:string;asset_id:string;role:"music"|"sfx";name:string;tags:string[];bpm:number|null;beat_offset_ms:number;storage_path:string;file_name:string};

export function AudioAutomationPanel({templateId,scene,selectedAudio,onNarration,onAddLibrary,onApplyPreset,onUpdateSceneNarration}:{templateId:string;scene:EditorScene;selectedAudio:EditorAudioClip|null;onNarration:(result:any,input:{text:string;preset:VoicePreset;autoDuration:boolean;paddingMs:number})=>Promise<void>|void;onAddLibrary:(item:LibraryItem)=>Promise<void>|void;onApplyPreset:(preset:AudioPreset)=>void;onUpdateSceneNarration:(patch:NonNullable<EditorScene["narration"]>)=>void}){
 const qc=useQueryClient();
 const gen=useServerFn(generateSceneNarration),fetchTts=useServerFn(getTtsSettings);
 const [text,setText]=useState(scene.narration?.text??"");
 const [autoDuration,setAutoDuration]=useState(scene.narration?.autoDuration??true);
 const [paddingMs,setPaddingMs]=useState(scene.narration?.endPaddingMs??250);
 const [presetId,setPresetId]=useState(scene.narration?.voicePresetId??"");
 const [pronunciation,setPronunciation]=useState((scene.narration?.pronunciation??[]).map(r=>`${r.find}=${r.sayAs}`).join("\n"));
 const [libTab,setLibTab]=useState<"music"|"sfx">("music");

 const tts=useQuery({queryKey:["tts-settings"],queryFn:()=>fetchTts({data:{} as never})});
 const voices=useQuery({queryKey:["voice-presets"],queryFn:async()=>{const {data,error}=await (supabase as any).from("voice_presets").select("*").order("is_default",{ascending:false}).order("created_at");if(error)throw error;return (data??[]) as VoicePreset[];}});
 const audioPresets=useQuery({queryKey:["audio-presets"],queryFn:async()=>{const {data,error}=await (supabase as any).from("audio_presets").select("*").order("created_at",{ascending:false});if(error)throw error;return (data??[]) as AudioPreset[];}});
 const library=useQuery({queryKey:["audio-library"],queryFn:async()=>{const {data,error}=await (supabase as any).from("audio_library_items").select("id,asset_id,role,name,tags,bpm,beat_offset_ms").order("created_at",{ascending:false});if(error)throw error;const rows=data??[];if(!rows.length)return[] as LibraryItem[];const {data:assets}=await (supabase as any).from("assets").select("id,storage_path,file_name").in("id",rows.map((r:any)=>r.asset_id)).eq("lifecycle_status","active");const map=new Map((assets??[]).map((a:any)=>[a.id,a]));return rows.flatMap((r:any)=>{const a=map.get(r.asset_id);return a?[{...r,storage_path:a.storage_path,file_name:a.file_name}]:[];}) as LibraryItem[];}});

 const selectedPreset=voices.data?.find(v=>v.id===presetId)??voices.data?.[0]??null;
 const rules=useMemo(()=>pronunciation.split("\n").map(line=>{const i=line.indexOf("=");return i>0?{find:line.slice(0,i).trim(),sayAs:line.slice(i+1).trim()}:null;}).filter(Boolean) as Array<{find:string;sayAs:string}>,[pronunciation]);
 const generate=useMutation({
  mutationFn:async()=>{
   if(!selectedPreset)throw new Error("Create a voice preset first");
   onUpdateSceneNarration({text,voicePresetId:selectedPreset.id,autoDuration,endPaddingMs:paddingMs,pronunciation:rules});
   return gen({data:{templateId,sceneId:scene.id,text,provider:selectedPreset.provider,voice:selectedPreset.voice_id,model:selectedPreset.model,speed:Number(selectedPreset.speed??1),instructions:selectedPreset.style_instructions??undefined,pronunciation:rules,presetId:selectedPreset.id}});
  },
  onSuccess:async(result)=>{await onNarration(result,{text,preset:selectedPreset!,autoDuration,paddingMs});toast.success("Scene narration generated");},
  onError:(e:Error)=>toast.error(e.message),
 });

 const saveVoice=async()=>{
  const name=prompt("Voice preset name","Narrator");if(!name)return;
  const provider=(prompt("Provider: openai or elevenlabs","openai")||"openai") as "openai"|"elevenlabs";
  const model=prompt("Model",provider==="openai"?"gpt-4o-mini-tts":"eleven_multilingual_v2")||"";
  const voice=prompt(provider==="openai"?"Voice (alloy, ash, etc.)":"ElevenLabs voice ID",provider==="openai"?"alloy":"")||"";
  const {error}=await (supabase as any).from("voice_presets").insert({name,provider,model,voice_id:voice,speed:1,style_instructions:"Warm, concise narration",pronunciation_json:[]});
  if(error)toast.error(error.message);else{toast.success("Voice preset saved");qc.invalidateQueries({queryKey:["voice-presets"]});}
 };
 const saveAudioPreset=async()=>{
  if(!selectedAudio)return toast.error("Select an audio clip first");
  const name=prompt("Audio preset name",`${selectedAudio.role} preset`);if(!name)return;
  const {error}=await (supabase as any).from("audio_presets").insert({name,role:selectedAudio.role,volume:selectedAudio.volume,fade_in_ms:selectedAudio.fadeInMs??0,fade_out_ms:selectedAudio.fadeOutMs??0,ducking:selectedAudio.ducking??false,loop:selectedAudio.loop??false,bpm:selectedAudio.bpm??null,beat_offset_ms:selectedAudio.beatOffsetMs??0});
  if(error)toast.error(error.message);else{toast.success("Audio preset saved");qc.invalidateQueries({queryKey:["audio-presets"]});}
 };

 return <div className="space-y-3 pb-3 border-b border-border">
  <div className="rounded-lg border border-brand/30 bg-brand/5 p-2.5 space-y-2">
   <div className="flex items-center gap-2"><Mic2 className="size-3.5 text-brand"/><div className="text-xs font-bold">Scene voice-over</div><span className="ml-auto text-[9px] text-zinc-500">~{(estimateNarrationMs(text)/1000).toFixed(1)}s estimate</span></div>
   <textarea value={text} onChange={e=>setText(e.target.value)} className="w-full min-h-20 rounded bg-zinc-950 border border-border p-2 text-xs" placeholder="Narration for this scene…"/>
   <div className="grid grid-cols-2 gap-1.5"><select value={selectedPreset?.id??""} onChange={e=>setPresetId(e.target.value)} className="h-8 bg-zinc-950 border border-border rounded px-2 text-[10px]"><option value="">Voice preset…</option>{(voices.data??[]).map(v=><option key={v.id} value={v.id}>{v.name} · {v.provider}</option>)}</select><button onClick={saveVoice} className="h-8 border border-border rounded text-[10px]"><Save className="size-3 inline mr-1"/>New voice preset</button></div>
   <textarea value={pronunciation} onChange={e=>setPronunciation(e.target.value)} className="w-full min-h-14 rounded bg-zinc-950 border border-border p-2 text-[10px] font-mono" placeholder={"Pronunciation rules\nCR7=C R seven\nGIF=jiff"}/>
   <div className="flex items-center gap-3 text-[10px]"><label><input type="checkbox" checked={autoDuration} onChange={e=>setAutoDuration(e.target.checked)}/> Auto-fit scene duration</label><label>Padding <input type="number" value={paddingMs} onChange={e=>setPaddingMs(Math.max(0,Number(e.target.value)))} className="w-16 bg-zinc-950 border border-border rounded px-1"/> ms</label></div>
   <button disabled={!text.trim()||!selectedPreset||generate.isPending||!(tts.data??[]).some((r:any)=>r.provider===selectedPreset?.provider&&r.configured)} onClick={()=>generate.mutate()} className="w-full h-9 rounded bg-brand text-white text-xs font-bold disabled:opacity-40"><Sparkles className="size-3.5 inline mr-1"/>{generate.isPending?"Generating voice…":"Generate scene voice-over"}</button>
  </div>

  <div className="rounded-lg border border-border p-2.5 space-y-2">
   <div className="flex items-center justify-between"><div className="text-xs font-bold">Music & SFX library</div><div className="flex"><button onClick={()=>setLibTab("music")} className={`px-2 py-1 text-[9px] rounded ${libTab==="music"?"bg-brand text-white":""}`}>Music</button><button onClick={()=>setLibTab("sfx")} className={`px-2 py-1 text-[9px] rounded ${libTab==="sfx"?"bg-brand text-white":""}`}>SFX</button></div></div>
   <div className="space-y-1 max-h-36 overflow-auto">{(library.data??[]).filter(i=>i.role===libTab).map(item=><button key={item.id} onClick={()=>onAddLibrary(item)} className="w-full border border-border rounded p-2 text-left hover:border-brand/50"><div className="text-[10px] font-semibold truncate">{item.name}</div><div className="text-[9px] text-zinc-600">{item.bpm?`${item.bpm} BPM · `:""}{item.tags?.join(", ")}</div></button>)}{!(library.data??[]).some(i=>i.role===libTab)&&<div className="text-[10px] text-zinc-600">Add uploaded audio assets to the library from Assets in a future catalog pass, or continue using Upload below.</div>}</div>
  </div>

  <div className="rounded-lg border border-border p-2.5 space-y-2">
   <div className="flex items-center justify-between"><div className="text-xs font-bold">Reusable audio presets</div><button onClick={saveAudioPreset} className="text-[9px] border border-border rounded px-2 py-1">Save selected clip</button></div>
   <div className="flex flex-wrap gap-1">{(audioPresets.data??[]).map(p=><button key={p.id} onClick={()=>onApplyPreset(p)} className="text-[9px] rounded border border-border px-2 py-1 hover:border-brand/50">{p.name}</button>)}</div>
   {selectedAudio?.bpm&&<button onClick={()=>onApplyPreset({id:"beat",name:"Beat sync",role:selectedAudio.role,volume:selectedAudio.volume,fade_in_ms:selectedAudio.fadeInMs??0,fade_out_ms:selectedAudio.fadeOutMs??0,ducking:selectedAudio.ducking??false,loop:selectedAudio.loop??false,bpm:selectedAudio.bpm,beat_offset_ms:selectedAudio.beatOffsetMs??0})} className="text-[9px] text-brand">Beat grid: {selectedAudio.bpm} BPM · nearest beat {Math.round(snapTimeToBeat(selectedAudio.startMs,selectedAudio.bpm,selectedAudio.beatOffsetMs??0))}ms</button>}
  </div>
 </div>;
}
