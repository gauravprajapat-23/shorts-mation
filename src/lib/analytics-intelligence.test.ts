import {describe,expect,it} from "vitest";
import {analyzeWinningContent,inferAttribution} from "./analytics-intelligence";
describe("V2.26 winning-template intelligence",()=>{
 it("ranks stronger templates",()=>{
  const result=analyzeWinningContent([
   {campaignItemId:"1",youtubeVideoId:"a",templateId:"t1",templateName:"Quiz",views:1000,likes:100,comments:10,hook:"Guess it",uploadTime:"2026-09-01T18:00:00Z"},
   {campaignItemId:"2",youtubeVideoId:"b",templateId:"t1",templateName:"Quiz",views:800,likes:70,comments:8,hook:"Guess it",uploadTime:"2026-09-02T18:00:00Z"},
   {campaignItemId:"3",youtubeVideoId:"c",templateId:"t2",templateName:"Facts",views:100,likes:2,comments:0,hook:"Fact",uploadTime:"2026-09-02T12:00:00Z"},
  ]);
  expect(result.bestTemplate?.key).toBe("t1");
  expect(result.bestHook?.key).toBe("Guess it");
  expect(result.recommendations.length).toBeGreaterThan(0);
 });
 it("extracts AI hook, CTA and word/topic attribution",()=>{
  expect(inferAttribution({word:"TIGER",_ai:{hook:"Can you solve it?",cta:"Subscribe"}},{})).toEqual({hook:"Can you solve it?",cta:"Subscribe",topic:"TIGER",variant:null});
 });
});
