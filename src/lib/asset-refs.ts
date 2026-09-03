import type { EditorDocument, EditorDocumentV2 } from "@/lib/types";

export const ASSET_URI_PREFIX = "asset://";

export type AssetResolution = { id: string; url: string; storagePath?: string | null };


export function assetStoragePathFromUrl(value?: string | null): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/assets\/(.+)$/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function collectLegacyAssetStoragePaths(value: unknown): string[] {
  const paths = new Set<string>();
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    for (const key of ["src", "logoSrc", "watermarkSrc"]) {
      if (typeof node[key] === "string") {
        const path = assetStoragePathFromUrl(node[key]);
        if (path) paths.add(path);
      }
    }
    if (Array.isArray(node)) node.forEach(walk); else Object.values(node).forEach(walk);
  };
  walk(value);
  return [...paths];
}

/** Attaches durable identity to legacy signed URLs by matching storage_path. */
export function attachLegacyAssetIdentities<T extends EditorDocument>(input: T, byStoragePath: Map<string, { id: string; storagePath: string }>): T {
  const doc = clone(input) as any;
  const apply = (node: any, srcKey: string, idKey = "assetId") => {
    if (node[idKey]) return;
    const path = assetStoragePathFromUrl(node[srcKey]);
    if (!path) return;
    const row = byStoragePath.get(path);
    if (!row) return;
    node[idKey] = row.id;
    if (idKey === "assetId") node.storagePath = row.storagePath;
  };
  for (const scene of doc.scenes ?? []) for (const el of scene.elements ?? []) if (el.type === "image" || el.type === "video") apply(el, "src");
  if (doc.audio?.src) apply(doc.audio, "src");
  if (doc.version === 2) {
    for (const clip of doc.audioClips ?? []) apply(clip, "src");
    for (const component of doc.components ?? []) for (const el of component.elements ?? []) if (el.type === "image" || el.type === "video") apply(el, "src");
    if (doc.brand) { apply(doc.brand, "logoSrc", "logoAssetId"); apply(doc.brand, "watermarkSrc", "watermarkAssetId"); }
  }
  return doc;
}
export function assetUri(assetId: string): string {
  return `${ASSET_URI_PREFIX}${assetId}`;
}

export function assetIdFromUri(value?: string | null): string | null {
  if (!value?.startsWith(ASSET_URI_PREFIX)) return null;
  const id = value.slice(ASSET_URI_PREFIX.length).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/** Collects every durable reference, including refs stored in automation defaults. */
export function collectAssetIds(value: unknown): string[] {
  const text = JSON.stringify(value ?? {});
  const ids = new Set<string>();
  for (const match of text.matchAll(/asset:\/\/([0-9a-f-]{36})/gi)) ids.add(match[1].toLowerCase());
  if (value && typeof value === "object") {
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (typeof node.assetId === "string") ids.add(node.assetId.toLowerCase());
      if (typeof node.logoAssetId === "string") ids.add(node.logoAssetId.toLowerCase());
      if (typeof node.watermarkAssetId === "string") ids.add(node.watermarkAssetId.toLowerCase());
      if (Array.isArray(node)) node.forEach(walk); else Object.values(node).forEach(walk);
    };
    walk(value);
  }
  return [...ids];
}

/** Removes expiring owned URLs from a document before DB save/export. */
export function normalizeDocumentAssetRefs<T extends EditorDocument>(input: T): T {
  const doc = clone(input) as any;
  for (const scene of doc.scenes ?? []) {
    for (const el of scene.elements ?? []) {
      if ((el.type === "image" || el.type === "video") && el.assetId) el.src = assetUri(el.assetId);
      else if ((el.type === "image" || el.type === "video") && assetIdFromUri(el.src)) el.assetId = assetIdFromUri(el.src);
    }
  }
  if (doc.audio?.src) {
    if (doc.audio.assetId) doc.audio.src = assetUri(doc.audio.assetId);
    else if (assetIdFromUri(doc.audio.src)) doc.audio.assetId = assetIdFromUri(doc.audio.src);
  }
  if (doc.version === 2) {
    for (const clip of doc.audioClips ?? []) {
      if (clip.assetId) clip.src = assetUri(clip.assetId);
      else if (assetIdFromUri(clip.src)) clip.assetId = assetIdFromUri(clip.src);
    }
    for (const component of doc.components ?? []) for (const el of component.elements ?? []) {
      if ((el.type === "image" || el.type === "video") && el.assetId) el.src = assetUri(el.assetId);
      else if ((el.type === "image" || el.type === "video") && assetIdFromUri(el.src)) el.assetId = assetIdFromUri(el.src);
    }
    if (doc.brand?.logoAssetId) doc.brand.logoSrc = assetUri(doc.brand.logoAssetId);
    else if (doc.brand?.logoSrc && assetIdFromUri(doc.brand.logoSrc)) doc.brand.logoAssetId = assetIdFromUri(doc.brand.logoSrc);
    if (doc.brand?.watermarkAssetId) doc.brand.watermarkSrc = assetUri(doc.brand.watermarkAssetId);
    else if (doc.brand?.watermarkSrc && assetIdFromUri(doc.brand.watermarkSrc)) doc.brand.watermarkAssetId = assetIdFromUri(doc.brand.watermarkSrc);
  }
  return doc;
}

/** Hydrates durable refs with fresh URLs while retaining assetId for the next save. */
export function hydrateDocumentAssetRefs<T extends EditorDocument>(input: T, resolutions: Map<string, AssetResolution>): T {
  const doc = clone(input) as any;
  const apply = (node: any, srcKey: string, idKey = "assetId") => {
    const id = (node[idKey] as string | undefined) ?? assetIdFromUri(node[srcKey]);
    if (!id) return;
    node[idKey] = id;
    const found = resolutions.get(id.toLowerCase());
    if (found) {
      node[srcKey] = found.url;
      if (idKey === "assetId" && found.storagePath) node.storagePath = found.storagePath;
    } else {
      node[srcKey] = assetUri(id); // keep detectable; do not persist a stale URL
    }
  };
  for (const scene of doc.scenes ?? []) for (const el of scene.elements ?? []) if (el.type === "image" || el.type === "video") apply(el, "src");
  if (doc.audio?.src) apply(doc.audio, "src");
  if (doc.version === 2) {
    for (const clip of doc.audioClips ?? []) apply(clip, "src");
    for (const component of doc.components ?? []) for (const el of component.elements ?? []) if (el.type === "image" || el.type === "video") apply(el, "src");
    if (doc.brand) {
      apply(doc.brand, "logoSrc", "logoAssetId");
      apply(doc.brand, "watermarkSrc", "watermarkAssetId");
    }
  }
  return doc;
}

export function replaceAssetReference<T>(input: T, oldAssetId: string, newAssetId: string): T {
  const oldUri = assetUri(oldAssetId);
  const newUri = assetUri(newAssetId);
  const json = JSON.stringify(input)
    .split(oldUri).join(newUri)
    .split(oldAssetId).join(newAssetId);
  return JSON.parse(json) as T;
}

export function missingAssetIds(doc: EditorDocument, availableIds: Iterable<string>): string[] {
  const available = new Set([...availableIds].map((id) => id.toLowerCase()));
  return collectAssetIds(doc).filter((id) => !available.has(id.toLowerCase()));
}

export function asV2DurableDocument(doc: EditorDocumentV2): EditorDocumentV2 {
  return normalizeDocumentAssetRefs(doc);
}
