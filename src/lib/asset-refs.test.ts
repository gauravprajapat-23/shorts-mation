import { describe, expect, it } from "vitest";
import { assetUri, collectAssetIds, hydrateDocumentAssetRefs, missingAssetIds, normalizeDocumentAssetRefs, replaceAssetReference } from "./asset-refs";
import { migrateDocumentV1ToV2 } from "./editor-document-v2";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function doc() {
  return migrateDocumentV1ToV2({ version: 1, aspect: "9:16", variables: [], scenes: [{ id: "s", name: "S", durationMs: 1000, background: "#000", elements: [{ id: "i", type: "image", src: "https://stale.example/signed", assetId: A, x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1, fit: "cover" }] }] });
}

describe("durable asset refs", () => {
  it("normalizes owned signed URLs to asset URIs", () => {
    const out = normalizeDocumentAssetRefs(doc());
    expect((out.scenes[0].elements[0] as any).src).toBe(assetUri(A));
    expect(collectAssetIds(out)).toContain(A);
  });
  it("hydrates with a fresh URL but keeps identity", () => {
    const stored = normalizeDocumentAssetRefs(doc());
    const out = hydrateDocumentAssetRefs(stored, new Map([[A, { id: A, url: "https://fresh.example/one", storagePath: "u/a.png" }]]));
    expect((out.scenes[0].elements[0] as any).src).toBe("https://fresh.example/one");
    expect((out.scenes[0].elements[0] as any).assetId).toBe(A);
  });
  it("detects missing references and replaces identity everywhere", () => {
    const stored = normalizeDocumentAssetRefs(doc());
    expect(missingAssetIds(stored, [])).toEqual([A]);
    const replaced = replaceAssetReference(stored, A, B);
    expect(collectAssetIds(replaced)).toEqual([B]);
  });
  it("normalizes reusable-component and legacy audio references", () => {
    const source: any = doc();
    source.audio = { src: "https://stale.example/legacy-audio", volume: 1, assetId: B };
    source.components = [{ id: "c", name: "Card", width: 100, height: 100, createdAt: 1, elements: [{ id: "ci", type: "image", src: "https://stale.example/component", assetId: A, x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1, fit: "cover" }] }];
    const out: any = normalizeDocumentAssetRefs(source);
    expect(out.audio.src).toBe(assetUri(B));
    expect(out.components[0].elements[0].src).toBe(assetUri(A));
  });

});
