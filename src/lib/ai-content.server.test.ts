import {describe,expect,it} from "vitest";
import {blankDocument} from "./editor-defaults";
import {buildCampaignDatasetSchema,buildGenerationPrompt,providerBase} from "./ai-content.server";

describe("V2.22 AI content layer",()=>{
  it("builds bounded campaign dataset schemas",()=>{
    const doc=blankDocument("9:16");
    doc.automationVariables=[{name:"word",label:"Word",type:"text",required:true,defaultValue:"CAT"}];
    const schema=buildCampaignDatasetSchema(doc,30) as any;
    expect(schema.schema.properties.rows.minItems).toBe(30);
    expect(schema.schema.properties.rows.maxItems).toBe(30);
    expect(schema.schema.properties.rows.items.properties.word.type).toBe("string");
    expect(schema.schema.properties.rows.items.properties.hook).toBeTruthy();
  });
  it("grounds generation prompt in template and audience",()=>{
    const prompt=buildGenerationPrompt({prompt:"Create animal letter match videos",count:30,market:"US",audience:"kids",templateName:"Letter Match",doc:blankDocument("9:16")});
    expect(prompt).toContain("exactly 30");
    expect(prompt).toContain("US");
    expect(prompt).toContain("kids");
    expect(prompt).toContain("letter/word-match");
  });
  it("uses official provider API bases",()=>{
    expect(providerBase("openai")).toBe("https://api.openai.com/v1");
    expect(providerBase("openrouter")).toBe("https://openrouter.ai/api/v1");
  });
});
