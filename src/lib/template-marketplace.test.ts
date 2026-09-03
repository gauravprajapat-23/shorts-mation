import { describe, expect, it } from "vitest";
import { blankDocument } from "./editor-defaults";
import { generateTemplateDocumentation, normalizeTemplateTags, validateTemplateProduct } from "./template-marketplace";

describe("V2.20 template marketplace helpers", () => {
  it("normalizes searchable tags", () => expect(normalizeTemplateTags("Quiz, Kids, quiz, Word Game!")).toEqual(["quiz","kids","word game"]));
  it("scores and documents a template", () => {
    const doc = blankDocument("9:16");
    const result = validateTemplateProduct(doc, { name:"Demo", description:"A demo", documentation:"Use it", tags:["demo"] });
    expect(result.score).toBeGreaterThan(0);
    expect(generateTemplateDocumentation(doc, "Demo")).toContain("# Demo");
  });
});
