# Editor V2.10 — Brand Kits + Reusable Components

## Added
- `src/lib/brand-components.ts`
  - normalized brand-kit model and defaults
  - flattened `brand.*` automation variables
  - explicit element property brand bindings
  - reusable component snapshot/instantiation helpers
  - built-in Brand CTA, Social Handle, Logo Lockup and Watermark blocks
  - browser-persistent brand/component libraries for reuse across templates
- `src/lib/brand-components.test.ts`
  - brand variable and component cloning regression coverage

## Updated
- `src/lib/types.ts`
  - `BrandKit`, `EditorReusableComponent`, `BrandBindableProperty`
  - brand bindings on visual elements
  - typed brand/components on `EditorDocumentV2`
- `src/lib/editor-document-v2.ts`
  - safe brand/component defaults during V1→V2 migration and V2 synchronization
- `src/lib/editor-defaults.ts`
  - new documents initialize component storage
- `src/lib/animate.ts`
  - brand values are merged into normal automation variables
  - text, colors, fonts, shape fills/strokes and media sources resolve consistently
- `src/lib/timeline-engine.ts`
  - brand variables resolve even when no campaign variables are supplied
  - removed duplicate audio segment type field
- `src/routes/_app/editor/$templateId.tsx`
  - Brand Kit and Components panels
  - logo/watermark upload and URL fields
  - saved brand-kit library
  - built-in reusable brand components
  - save selected element or whole scene as a reusable component
  - brand bindings for selected text/shape/media
  - `brand.*` entries in the Variables panel
- `src/routes/_app/campaigns/$campaignId.test-render.tsx`
  - campaign preview resolves the same brand variables as final rendering

## Compatibility
Existing V1 and V2 templates migrate safely. Brand/component fields are optional in stored documents and normalized on load. Campaign variables override brand defaults when the same flattened key is intentionally supplied.
