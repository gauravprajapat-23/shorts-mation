# Template Import / Export — Changed Files

## Added

- `src/lib/template-io.ts`
  - Versioned `shorts-mation-template` portable JSON envelope.
  - Canonical V1/V2 runtime validation and V1→V2 migration on import.
  - Accepts portable envelopes, raw EditorDocument JSON, and database-row-style `template_json` exports.
  - 10 MB file-size guard, scene/element safety caps, safe type/name normalization.
  - Browser download/read helpers and `.shorts-template.json` filenames.

- `src/lib/template-io.test.ts`
  - Round-trip export/import coverage.
  - Raw-document backward compatibility.
  - Database-row import compatibility.
  - Unsupported-version and invalid-document rejection.
  - Safe filename generation.

## Updated

- `src/routes/_app/templates/index.tsx`
  - Added **Import template** file picker.
  - Imported templates are saved as the signed-in user's non-default templates.
  - Added **Download sample** using the Half-Cut Word Match starter as a real portable example.
  - Added per-template **Export template** action to built-in and user template cards.

- `src/routes/_app/editor/$templateId.tsx`
  - Added **Export** to the editor top bar so the current editable document can be downloaded without leaving the editor.

## Portable format

Files are JSON and use the suffix `.shorts-template.json`.

```json
{
  "format": "shorts-mation-template",
  "formatVersion": 1,
  "name": "My Template",
  "type": "custom",
  "aspect": "9:16",
  "exportedAt": "...",
  "document": { "version": 2, "...": "..." }
}
```

The JSON preserves editor structure and automation metadata. Asset files are not embedded; existing image/video/audio URLs or app paths remain references in the document.

## Verification

- `npm run integrity` → 165 TS/TSX files, 0 unresolved internal imports.
- `npm run integrity:migrations` → 18 migrations, PASS.
- Global TypeScript transpile/parser audit → 165 files, 0 syntax failures.

Full dependency-aware Vitest/typecheck/build remains subject to dependency installation in the execution environment.
