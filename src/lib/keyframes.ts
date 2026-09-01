import type { EaseName, EditorElement, ElementKeyframe, KeyframeProperty } from "@/lib/types";

export type KeyframeValues = Record<KeyframeProperty, number>;

const PROPS: KeyframeProperty[] = ["x","y","scale","rotation","opacity","blur","cropX","cropY","cropScale"];

export function defaultKeyframeValues(el: EditorElement): KeyframeValues {
  return { x: el.x, y: el.y, scale: 1, rotation: el.rotation, opacity: el.opacity, blur: 0, cropX: 0, cropY: 0, cropScale: 1 };
}

function easingProgress(t: number, easing: EaseName = "easeInOut") {
  if (easing === "easeIn") return t * t * t;
  if (easing === "bounce") {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1/d1) return n1*t*t;
    if (t < 2/d1) { const x=t-1.5/d1; return n1*x*x+.75; }
    if (t < 2.5/d1) { const x=t-2.25/d1; return n1*x*x+.9375; }
    const x=t-2.625/d1; return n1*x*x+.984375;
  }
  if (easing === "linear") return t;
  if (easing === "easeOut") return 1 - Math.pow(1 - t, 3);
  if (easing === "spring") return Math.max(0, Math.min(1.08, 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 3)));
  return t < 0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
}

export function evaluateKeyframes(el: EditorElement, timeMs: number): Partial<KeyframeValues> {
  const frames = [...(el.keyframes ?? [])].sort((a,b) => a.timeMs-b.timeMs);
  if (!frames.length) return {};
  const out: Partial<KeyframeValues> = {};
  for (const prop of PROPS) {
    const relevant = frames.filter((f) => f.values[prop] !== undefined);
    if (!relevant.length) continue;
    const first = relevant[0]!, last = relevant[relevant.length-1]!;
    if (timeMs <= first.timeMs) { out[prop] = first.values[prop]!; continue; }
    if (timeMs >= last.timeMs) { out[prop] = last.values[prop]!; continue; }
    const rightIndex = relevant.findIndex((f) => f.timeMs >= timeMs);
    const right = relevant[rightIndex]!, left = relevant[rightIndex-1]!;
    const span = Math.max(1, right.timeMs-left.timeMs);
    const p = easingProgress((timeMs-left.timeMs)/span, right.easing ?? "easeInOut");
    out[prop] = left.values[prop]! + (right.values[prop]!-left.values[prop]!) * p;
  }
  return out;
}

export type MotionPresetId = "zoom-punch" | "whip-in" | "float-up" | "micro-zoom" | "shake-hit" | "ken-burns";
export const MOTION_PRESETS: Array<{id: MotionPresetId; label: string; keyframes: (el: EditorElement, durationMs: number) => ElementKeyframe[]}> = [
  { id:"zoom-punch", label:"Zoom Punch", keyframes:(el,d)=>[
    {id:`kf-${Date.now()}-1`,timeMs:0,easing:"easeOut",values:{scale:.72,opacity:0}},
    {id:`kf-${Date.now()}-2`,timeMs:Math.min(220,d*.18),easing:"spring",values:{scale:1.12,opacity:1}},
    {id:`kf-${Date.now()}-3`,timeMs:Math.min(420,d*.3),easing:"easeOut",values:{scale:1,opacity:1}},
  ]},
  { id:"whip-in", label:"Whip In", keyframes:(el,d)=>[
    {id:`kf-${Date.now()}-1`,timeMs:0,easing:"easeOut",values:{x:el.x+Math.max(160,el.w*.45),blur:18,opacity:0}},
    {id:`kf-${Date.now()}-2`,timeMs:Math.min(360,d*.25),easing:"easeOut",values:{x:el.x,blur:0,opacity:1}},
  ]},
  { id:"float-up", label:"Float Up", keyframes:(el,d)=>[
    {id:`kf-${Date.now()}-1`,timeMs:0,easing:"easeInOut",values:{y:el.y+24}},
    {id:`kf-${Date.now()}-2`,timeMs:d,easing:"easeInOut",values:{y:el.y-24}},
  ]},
  { id:"micro-zoom", label:"Micro Zoom", keyframes:(el,d)=>[
    {id:`kf-${Date.now()}-1`,timeMs:0,easing:"linear",values:{scale:1}},
    {id:`kf-${Date.now()}-2`,timeMs:d,easing:"linear",values:{scale:1.08}},
  ]},
  { id:"shake-hit", label:"Shake Hit", keyframes:(el,d)=>[
    {id:`kf-${Date.now()}-1`,timeMs:0,easing:"linear",values:{x:el.x,rotation:el.rotation}},
    {id:`kf-${Date.now()}-2`,timeMs:70,easing:"linear",values:{x:el.x-16,rotation:el.rotation-2}},
    {id:`kf-${Date.now()}-3`,timeMs:140,easing:"linear",values:{x:el.x+14,rotation:el.rotation+2}},
    {id:`kf-${Date.now()}-4`,timeMs:220,easing:"easeOut",values:{x:el.x,rotation:el.rotation}},
  ].filter(k=>k.timeMs<=d)},
  { id:"ken-burns", label:"Ken Burns", keyframes:(el,d)=>[
    {id:`kf-${Date.now()}-1`,timeMs:0,easing:"linear",values:{cropScale:1,cropX:-2,cropY:0}},
    {id:`kf-${Date.now()}-2`,timeMs:d,easing:"linear",values:{cropScale:1.18,cropX:3,cropY:-2}},
  ]},
];

export function applyMotionPreset(el: EditorElement, preset: MotionPresetId, durationMs: number): ElementKeyframe[] {
  return MOTION_PRESETS.find((p)=>p.id===preset)?.keyframes(el, Math.max(100,durationMs)) ?? [];
}
