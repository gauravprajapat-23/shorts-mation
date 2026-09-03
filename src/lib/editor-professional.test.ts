import {describe,expect,it} from "vitest";
import type {EditorElement} from "./types";
import {alignElements,distributeElements,groupElements,selectionBounds} from "./editor-professional";
const e=(id:string,x:number,y:number,w=100,h=100)=>({id,type:"shape",shape:"rect",fill:"#fff",x,y,w,h,rotation:0,opacity:1} as EditorElement);
describe("V2.23 professional editor ops",()=>{
 it("computes multi-selection bounds",()=>expect(selectionBounds([e("a",0,10),e("b",200,50)])).toMatchObject({x:0,y:10,w:300,h:140}));
 it("aligns selected elements",()=>expect(alignElements([e("a",10,0),e("b",100,0)],"left",{w:1080,h:1920})[1]!.x).toBe(10));
 it("distributes three elements",()=>{const x=distributeElements([e("a",0,0),e("b",300,0),e("c",800,0)],"horizontal");expect(x[1]!.x).toBe(400);});
 it("groups selections",()=>expect(groupElements([e("a",0,0),e("b",1,1)],["a","b"],"g").every(x=>x.groupId==="g")).toBe(true));
});
