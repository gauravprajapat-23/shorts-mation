import {describe,expect,it} from "vitest";
import {normalizeHashtags,recommendedPublishHours,renderPublishTemplate} from "./youtube-intelligence.server";
describe("V2.25 YouTube intelligence",()=>{
 it("renders publishing templates",()=>expect(renderPublishTemplate("🔥 {{title}} — {{fileName}}",{title:"Quiz",fileName:"01.mp4"})).toBe("🔥 Quiz — 01.mp4"));
 it("normalizes, deduplicates and limits hashtags",()=>expect(normalizeHashtags(["#foryou","for you","quiz","#foryou"],2)).toEqual(["#foryou","#quiz"]));
 it("uses balanced fallback without enough observations",()=>expect(recommendedPublishHours([])).toEqual([12,15,18,21]));
});
