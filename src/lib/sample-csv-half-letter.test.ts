import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { generateSampleCsv } from "@/lib/sample-csv";

describe("Half Letter Match sample CSV", () => {
  it("ships concrete three-letter challenges starting with ANT", () => {
    const template = STARTER_TEMPLATES.find((item) => item.type === "half_letter_match");
    if (!template) throw new Error("Half Letter Match starter is missing");
    const csv = generateSampleCsv(template.doc, template.name);
    expect(csv).toContain("word");
    expect(csv).toContain("letter1");
    expect(csv).toContain("letter2");
    expect(csv).toContain("letter3");
    expect(csv).toContain("ANT,A,N,T");
    expect(csv).toContain("Half Letter Match: ANT");
  });
});
