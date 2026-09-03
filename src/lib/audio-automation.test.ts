import {describe,expect,it} from "vitest";
import {blankDocument} from "./editor-defaults";
import {migrateDocumentV1ToV2} from "./editor-document-v2";
import {applyPronunciation} from "./tts.server";
import {beatDurationMs,fitSceneToNarration,snapTimeToBeat} from "./audio-automation";

describe("V2.24 audio and voice automation",()=>{
 it("applies pronunciation replacements deterministically",()=>{
  expect(applyPronunciation("CR7 scores",[{find:"CR7",sayAs:"C R seven"}])).toBe("C R seven scores");
 });
 it("computes and snaps to beat grids",()=>{
  expect(beatDurationMs(120)).toBe(500);
  expect(snapTimeToBeat(760,120,0)).toBe(1000);
 });
 it("fits scene duration to generated narration and shifts later project audio",()=>{
  const doc=migrateDocumentV1ToV2(blankDocument("9:16"));
  doc.scenes=[{...doc.scenes[0]!,id:"s1",durationMs:2000},{...doc.scenes[0]!,id:"s2",durationMs:2000}];
  doc.audioClips=[{id:"a",name:"later",src:"x",role:"sfx",startMs:2200,durationMs:500,volume:1}];
  const next=fitSceneToNarration(doc,"s1",3000,250);
  expect(next.scenes[0]!.durationMs).toBe(3250);
  expect(next.audioClips[0]!.startMs).toBe(3450);
 });
});
