import { describe, expect, it } from "vitest";
import { brandVariables, componentFromElements, instantiateComponent } from "./brand-components";
import type { TextElement } from "./types";

let n = 0;
const uid = (p = "id") => `${p}_${++n}`;

const text: TextElement = {
  id: "t", type: "text", text: "{{brand.cta}}", x: 100, y: 200, w: 400, h: 100,
  rotation: 0, opacity: 1, fontFamily: "Inter", fontSize: 50, fontWeight: 800,
  color: "#fff", align: "center", keyframes: [{ id: "old", timeMs: 0, values: { scale: .8 } }],
};

describe("brand/components", () => {
  it("flattens brand values into automation variables", () => {
    const vars = brandVariables({ name: "Acme", colors: { primary: "#123", secondary: "#456", accent: "#789", background: "#000", text: "#fff" }, typography: { headingFont: "Impact", bodyFont: "Inter" }, socialHandle: "@acme" });
    expect(vars["brand.name"]).toBe("Acme");
    expect(vars["brand.primaryColor"]).toBe("#123");
    expect(vars["brand.handle"]).toBe("@acme");
  });

  it("normalizes group coordinates and creates fresh ids when inserted", () => {
    const component = componentFromElements("CTA", [text], uid);
    expect(component.elements[0]!.x).toBe(0);
    expect(component.elements[0]!.y).toBe(0);
    const inserted = instantiateComponent(component, 20, 30, uid);
    expect(inserted[0]!.x).toBe(20);
    expect(inserted[0]!.y).toBe(30);
    expect(inserted[0]!.id).not.toBe(text.id);
    expect(inserted[0]!.keyframes?.[0]?.id).not.toBe("old");
  });
});
