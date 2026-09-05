import {describe,expect,it} from "vitest";
import {STARTER_TEMPLATES} from "./starter-templates";

const names=[
  "Explainer Pro — 3 Key Points",
  "Myth vs Fact — Evidence Reveal",
  "Before & After — Transformation Story",
  "Versus Pro — A vs B Comparison",
  "Mini Documentary — Story Arc",
  "Quiz Ladder — 5 Levels",
  "Product Review Pro — Proof & Verdict",
];

describe("high-production YouTube marketplace templates",()=>{
  it("ships all new templates in the built-in catalog",()=>{
    for(const name of names)expect(STARTER_TEMPLATES.some(t=>t.name===name)).toBe(true);
  });
  it("uses multi-scene production structures",()=>{
    for(const name of names){
      const template=STARTER_TEMPLATES.find(t=>t.name===name)!;
      expect(template.doc.scenes.length).toBeGreaterThanOrEqual(4);
      expect(template.doc.variables.length).toBeGreaterThanOrEqual(6);
    }
  });
  it("includes retention-oriented scene roles and media/motion elements",()=>{
    const selected=STARTER_TEMPLATES.filter(t=>names.includes(t.name));
    for(const template of selected){
      const scenes=template.doc.scenes;
      expect(scenes.some(s=>s.role==="hook")).toBe(true);
      expect(scenes.some(s=>s.role==="payoff"||s.role==="cta"||s.role==="value")).toBe(true);
      expect(scenes.flatMap(s=>s.elements).some(e=>e.type==="image"||e.type==="video")).toBe(true);
      expect(scenes.flatMap(s=>s.elements).some(e=>!!e.animations)).toBe(true);
    }
  });
});