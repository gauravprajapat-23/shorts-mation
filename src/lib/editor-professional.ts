import type { EditorElement, EditorScene } from "@/lib/types";

export type AlignMode="left"|"hcenter"|"right"|"top"|"vcenter"|"bottom";
export type DistributeMode="horizontal"|"vertical";

export function selectionBounds(elements:EditorElement[]){
  if(!elements.length)return null;
  const left=Math.min(...elements.map(e=>e.x)),top=Math.min(...elements.map(e=>e.y));
  const right=Math.max(...elements.map(e=>e.x+e.w)),bottom=Math.max(...elements.map(e=>e.y+e.h));
  return {x:left,y:top,w:right-left,h:bottom-top,right,bottom,cx:(left+right)/2,cy:(top+bottom)/2};
}

export function alignElements(elements:EditorElement[],mode:AlignMode,canvas:{w:number;h:number},toCanvas=false):EditorElement[]{
  if(!elements.length)return elements;
  const b=selectionBounds(elements)!;
  const anchor=toCanvas?{x:0,y:0,w:canvas.w,h:canvas.h,right:canvas.w,bottom:canvas.h,cx:canvas.w/2,cy:canvas.h/2}:b;
  return elements.map(el=>{
    if(mode==="left")return {...el,x:anchor.x};
    if(mode==="hcenter")return {...el,x:anchor.cx-el.w/2};
    if(mode==="right")return {...el,x:anchor.right-el.w};
    if(mode==="top")return {...el,y:anchor.y};
    if(mode==="vcenter")return {...el,y:anchor.cy-el.h/2};
    return {...el,y:anchor.bottom-el.h};
  });
}

export function distributeElements(elements:EditorElement[],mode:DistributeMode):EditorElement[]{
  if(elements.length<3)return elements;
  const out=elements.map(e=>({...e}));
  const sorted=[...out].sort((a,b)=>mode==="horizontal"?a.x-b.x:a.y-b.y);
  const first=sorted[0]!,last=sorted[sorted.length-1]!;
  if(mode==="horizontal"){
    const available=(last.x+last.w)-first.x-sorted.reduce((s,e)=>s+e.w,0);
    const gap=available/(sorted.length-1);
    let cursor=first.x+first.w+gap;
    for(let i=1;i<sorted.length-1;i++){sorted[i]!.x=cursor;cursor+=sorted[i]!.w+gap;}
  }else{
    const available=(last.y+last.h)-first.y-sorted.reduce((s,e)=>s+e.h,0);
    const gap=available/(sorted.length-1);
    let cursor=first.y+first.h+gap;
    for(let i=1;i<sorted.length-1;i++){sorted[i]!.y=cursor;cursor+=sorted[i]!.h+gap;}
  }
  return out;
}

export function duplicateElements(scene:EditorScene,ids:string[],makeId:(prefix?:string)=>string,offset=24){
  const selected=scene.elements.filter(e=>ids.includes(e.id));
  const groups=new Map<string,string>();
  const copies=selected.map(e=>({
    ...e,id:makeId(e.type),x:e.x+offset,y:e.y+offset,
    groupId:e.groupId?(groups.get(e.groupId)??(()=>{const id=makeId("grp");groups.set(e.groupId!,id);return id;})()):undefined,
  } as EditorElement));
  return {scene:{...scene,elements:[...scene.elements,...copies]},ids:copies.map(e=>e.id)};
}

export function serializeElementClipboard(elements:EditorElement[]):string{
  return JSON.stringify({format:"shortsforge-elements",version:1,elements});
}
export function parseElementClipboard(text:string):EditorElement[]{
  try{
    const data=JSON.parse(text);
    if(data?.format!=="shortsforge-elements"||!Array.isArray(data.elements))return [];
    return data.elements.filter((e:any)=>e&&typeof e==="object"&&typeof e.id==="string"&&typeof e.type==="string");
  }catch{return [];}
}

export function groupElements(elements:EditorElement[],ids:string[],groupId:string):EditorElement[]{
  return elements.map(e=>ids.includes(e.id)?{...e,groupId}:e);
}
export function ungroupElements(elements:EditorElement[],ids:string[]):EditorElement[]{
  const groups=new Set(elements.filter(e=>ids.includes(e.id)&&e.groupId).map(e=>e.groupId));
  return elements.map(e=>e.groupId&&groups.has(e.groupId)?{...e,groupId:undefined}:e);
}

export function moveSelection(elements:EditorElement[],ids:string[],dx:number,dy:number):EditorElement[]{
  return elements.map(e=>ids.includes(e.id)&&!e.locked?{...e,x:e.x+dx,y:e.y+dy}:e);
}

export function selectionWithGroup(scene:EditorScene,id:string,additive=false,current:string[]=[]):string[]{
  const el=scene.elements.find(e=>e.id===id);
  const groupIds=el?.groupId?scene.elements.filter(e=>e.groupId===el.groupId).map(e=>e.id):[id];
  if(!additive)return groupIds;
  const next=new Set(current);
  for(const gid of groupIds)next.has(gid)?next.delete(gid):next.add(gid);
  return [...next];
}
