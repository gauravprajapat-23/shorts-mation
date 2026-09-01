import { describe, expect, it } from "vitest";
import { evaluateKeyframes, applyMotionPreset } from "@/lib/keyframes";
import type { TextElement } from "@/lib/types";

const el: TextElement = { id:"t",type:"text",text:"Hi",fontFamily:"Inter",fontSize:80,fontWeight:800,color:"#fff",align:"center",x:100,y:200,w:500,h:160,rotation:0,opacity:1 };

describe("V2.8 keyframes", () => {
  it("interpolates clip-local properties", () => {
    const keyed = { ...el, keyframes:[
      {id:"a",timeMs:0,easing:"linear" as const,values:{x:100,scale:1,opacity:0}},
      {id:"b",timeMs:1000,easing:"linear" as const,values:{x:300,scale:2,opacity:1}},
    ]};
    const mid = evaluateKeyframes(keyed, 500);
    expect(mid.x).toBeCloseTo(200);
    expect(mid.scale).toBeCloseTo(1.5);
    expect(mid.opacity).toBeCloseTo(.5);
  });

  it("creates reusable motion preset keyframes", () => {
    const frames = applyMotionPreset(el, "zoom-punch", 2000);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(frames.some((f) => f.values.scale !== undefined)).toBe(true);
  });
});
