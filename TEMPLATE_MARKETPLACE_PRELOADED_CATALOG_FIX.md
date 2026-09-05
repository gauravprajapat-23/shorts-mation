# Template Marketplace preloaded-catalog repair

## Problem
The `Starters` button copied the application's starter templates into the signed-in user's private `templates` rows. The marketplace already contained global/default templates, so pressing the button produced duplicate cards.

## Repair
- Removed the `Starters` button and its insert mutation.
- Marketplace now opens on the global Marketplace catalog by default.
- Built-in/default templates are treated as pre-added website templates; users do not need to install/copy them.
- Added defensive card de-duplication for old databases while cleanup is being deployed.
- Added a migration that deletes only untouched, unused private rows created by the old starter-copy flow.
- The migration does **not** delete remixes or templates referenced by campaigns.
- Existing Import, New Template, Favorites, Remix/Duplicate, search, categories, preview, documentation and export remain available.
- Global default rows are normalized to public/published marketplace products.

Apply migration `20260905150000_template_marketplace_preadded_catalog_cleanup.sql` to remove historical duplicate starter rows safely.
