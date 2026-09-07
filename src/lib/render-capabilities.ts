import type { CanonicalComposition } from "@/lib/canonical-composition";
import type { EditorElement, ShapeElement } from "@/lib/types";

export const NATIVE_RENDERER_CAPABILITY_VERSION = 3 as const;
export type RenderFidelity = "exact" | "approximate" | "unsupported";
export type RenderCapabilityIssue = { code:string; fidelity:Exclude<RenderFidelity,"exact">; path:string; message:string; remediation?:string };
export type RenderCapabilityFeature = { feature:string; fidelity:RenderFidelity; notes:string };
export type NativeRendererCapabilityReport = {
  renderer:"native-chromium-ffmpeg-v3"; capabilityVersion:typeof NATIVE_RENDERER_CAPABILITY_VERSION; compositionId:string;
  supported:boolean; issues:RenderCapabilityIssue[]; blockingIssues:RenderCapabilityIssue[]; warnings:RenderCapabilityIssue[]; inventory:RenderCapabilityFeature[];
};

export const NATIVE_RENDERER_FEATURE_INVENTORY: RenderCapabilityFeature[] = [
  { feature:"Scene timing/backgrounds", fidelity:"exact", notes:"Visual state is materialized at output-frame cadence." },
  { feature:"Text/image/rect/ellipse HTML layers", fidelity:"exact", notes:"Rasterized by headless Chromium with the same CSS model as browser preview; fonts/images are awaited before capture." },
  { feature:"Element keyframes/animations", fidelity:"exact", notes:"Evaluated at every output frame and rasterized by Chromium." },
  { feature:"Camera moves/transitions/effects", fidelity:"exact", notes:"Evaluated at output-frame cadence and rendered by Chromium CSS." },
  { feature:"Professional captions", fidelity:"exact", notes:"Caption/word state is evaluated every output frame and rasterized in the same Chromium scene." },
  { feature:"Multiple video layers/segments", fidelity:"exact", notes:"Native FFmpeg V2 composites overlapping video inputs with timeline enable windows." },
  { feature:"Video trim/timing/playback/position/scale/rotation/opacity", fidelity:"exact", notes:"Manifest emits frame-cadence descriptors; FFmpeg applies source trim, speed and transforms." },
  { feature:"Video filters/color adjustments", fidelity:"approximate", notes:"Common presets, brightness/contrast/saturation and blur map to FFmpeg equivalents; browser CSS and FFmpeg math can differ slightly." },
  { feature:"Timeline audio clips/mixer/fades/ducking", fidelity:"exact", notes:"Logical clips are mixed by FFmpeg with 20ms gain-envelope samples derived from the shared audio engine." },
  { feature:"Single external soundtrack", fidelity:"exact", notes:"Mixed as an additional AAC input." },
  { feature:"Triangle/star/line vector shapes", fidelity:"unsupported", notes:"Current HTML serializer still emits only rectangle/ellipse shape geometry." },
];

function push(issues:RenderCapabilityIssue[],issue:RenderCapabilityIssue){if(!issues.some(i=>i.code===issue.code&&i.path===issue.path))issues.push(issue)}
function inspectElement(el:EditorElement,path:string,issues:RenderCapabilityIssue[]){
  if(el.hidden)return;
  if(el.type==="shape"){
    const s=el as ShapeElement;
    if(s.shape!=="rect"&&s.shape!=="ellipse") push(issues,{code:"unsupported-shape-kind",fidelity:"unsupported",path:`${path}.shape`,message:`Native renderer V2 cannot yet reproduce '${s.shape}' shape geometry.`,remediation:"Convert the shape to SVG/image or use rect/ellipse."});
    if((s.strokeWidth??0)>0||s.fillOpacity!==undefined) push(issues,{code:"unsupported-shape-style",fidelity:"unsupported",path,message:"Shape stroke/fillOpacity semantics are not yet serialized by the native renderer."});
  }
}

export function certifyNativeRendererCapabilities(composition:CanonicalComposition):NativeRendererCapabilityReport{
  const doc=composition.document,issues:RenderCapabilityIssue[]=[];
  doc.scenes.forEach((scene,si)=>scene.elements.forEach((el,ei)=>inspectElement(el,`document.scenes.${si}.elements.${ei}`,issues)));
  const blockingIssues=issues.filter(i=>i.fidelity==="unsupported"),warnings=issues.filter(i=>i.fidelity==="approximate");
  return {renderer:"native-chromium-ffmpeg-v3",capabilityVersion:NATIVE_RENDERER_CAPABILITY_VERSION,compositionId:composition.compositionId,supported:blockingIssues.length===0,issues,blockingIssues,warnings,inventory:NATIVE_RENDERER_FEATURE_INVENTORY};
}
export function assertNativeRendererSupported(composition:CanonicalComposition){const report=certifyNativeRendererCapabilities(composition);if(!report.supported)throw new Error(`Native renderer preflight failed before submission: ${report.blockingIssues.map(i=>`${i.code}: ${i.message}`).join("; ")}`);return report}
