# Automation Data Studio — Template CSV & Workflow Upgrade

## Template-aware CSV

Data Studio now builds CSV columns from the selected template's actual automation schema instead of relying on one generic CSV layout.

- Includes every template variable discovered from the EditorDocument.
- Uses automation variable labels, types, required flags, defaults and validation metadata.
- Includes publishing/system fields: filename, title, description, hook, CTA, captions, quiz data, tags, hashtags, privacy, schedule, playlist, category, language, made-for-kids, thumbnail, background media and audio media.
- Provides both Sample CSV and Blank CSV downloads per selected template.
- Sample row count is configurable from 1–100.
- Selecting a template initially loads meaningful schema-aware sample rows.

## Letter / word templates

Sample generation now understands relationships used by the starter templates:

- Half-Cut Word Match gets flexible words such as APPLE, MANGO, LION, ZEBRA, COCK and HOUSE.
- Half Letter Match gets real three-letter challenges such as ANT/CAT/DOG and keeps word, letter1, letter2 and letter3 synchronized.
- Letter Match keeps its media/input columns in the generated CSV.
- An `alphabetAssets` field is automatically recognized. Data Studio can build an A–Z JSON asset map from Assets files named like `A.png`, `B.png`, `letter-C.png`, etc.

## Durable asset handling

CSV imports can use either:

- durable `asset://<id>` refs,
- raw Asset UUIDs where applicable,
- or existing asset file names.

During import, known file names/IDs for template image/video/audio variables are resolved to durable `asset://` references. `alphabetAssets` JSON values are resolved the same way.

The A–Z helper reports how many of 26 letter assets were found. Missing letters remain blank and row validation reports exactly which letters are missing for a word.

## Improved import

- CSV, TSV, text tables and JSON accepted.
- BOM-safe parsing and automatic delimiter detection.
- Duplicate CSV headers are normalized instead of silently overwriting one another.
- Better header aliases and label-aware auto mapping.
- Import can Replace current rows or Append to them.
- Unmatched fields can be added as custom columns or ignored.
- Mapping dialog shows imported columns, auto-mapped count and template required-field count.
- Imports remain capped at 100 rows, matching campaign generation limits.

## Table workflow improvements

- Fill Defaults fills empty cells from template defaults.
- Load Sample Rows regenerates clean template-specific sample data.
- Template schema sidebar documents variable key, type, required state and variable description.
- A–Z Auto-map is shown automatically for templates containing an alphabet asset-map variable.
- Existing bulk paste, autofill, row preview, search, draft saving, AI generation, CSV/JSON export and campaign generation remain intact.

## Publishing improvements

Data Studio adds row-level fields for:

- language,
- made-for-kids,
- YouTube thumbnail asset.

YouTube settings are carried into `rowToCampaignItem()`. Thumbnail choices are restricted in the editor to active JPEG/PNG assets no larger than 2 MB, and campaign generation validates thumbnail ownership/type/size again server-side.

## Verification

Passed:

- `npm run integrity` — 222 TS/TSX files, 0 unresolved internal imports.
- `npm run integrity:migrations` — 36 migrations, all recorded invariants present.
- TypeScript parser/transpile audit — 222 source files, 0 syntax diagnostics.

Full `npm run typecheck` could not run because this archive does not include `node_modules`. Its dependency preflight correctly reports missing `vite`, `typescript`, and `@types/react`; run `npm ci` in the normal development/build environment before typecheck/build.
