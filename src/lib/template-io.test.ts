import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { createPortableTemplate, parseTemplateImport, serializePortableTemplate, templateFileName } from "@/lib/template-io";

const starter = STARTER_TEMPLATES.find((item) => item.type === "half_cut_word_match")!;

describe("portable template import/export", () => {
  it("exports a versioned canonical V2 package and imports it again", () => {
    const exported = createPortableTemplate({ name: starter.name, type: starter.type, document: starter.doc });
    expect(exported.format).toBe("shorts-mation-template");
    expect(exported.formatVersion).toBe(1);
    expect(exported.document.version).toBe(2);
    expect(exported.document.scenes.length).toBeGreaterThan(0);

    const imported = parseTemplateImport(JSON.parse(serializePortableTemplate({ name: starter.name, type: starter.type, document: starter.doc })));
    expect(imported.name).toBe(starter.name);
    expect(imported.type).toBe(starter.type);
    expect(imported.document.version).toBe(2);
  });

  it("accepts raw EditorDocument JSON for backward compatibility", () => {
    const imported = parseTemplateImport(starter.doc, "my-custom-template.json");
    expect(imported.name).toBe("my-custom-template");
    expect(imported.type).toBe("custom");
    expect(imported.document.version).toBe(2);
  });

  it("accepts database row style exports containing template_json", () => {
    const imported = parseTemplateImport({ name: "Row export", type: "quiz", template_json: starter.doc });
    expect(imported.name).toBe("Row export");
    expect(imported.type).toBe("quiz");
  });

  it("rejects unsupported portable versions and invalid documents", () => {
    expect(() => parseTemplateImport({ format: "shorts-mation-template", formatVersion: 99, document: starter.doc })).toThrow(/Unsupported template format/);
    expect(() => parseTemplateImport({ version: 2, scenes: [] })).toThrow(/Invalid editor document/);
  });

  it("creates a safe portable filename", () => {
    expect(templateFileName("My Cool / Template!" )).toBe("my-cool-template.shorts-template.json");
  });
});
