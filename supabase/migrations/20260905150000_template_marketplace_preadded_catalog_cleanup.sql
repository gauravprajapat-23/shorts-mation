-- Template Marketplace: remove legacy per-user Starter copies and keep the
-- website catalog as the single source of built-in templates.
--
-- The removed UI "Starters" button used to copy these exact starter templates
-- into every user's private library, which made the same template appear twice
-- beside the global/default catalog entry.

WITH starter_keys(type, name) AS (
  VALUES
    ('half_cut_word_match','Half-Cut Word Match — Any Word'),
    ('half_letter_match','Half Letter Match — Sliding Halves'),
    ('letter_match','Letter Match — Complete the Word'),
    ('quiz','Quiz — Guess the Answer'),
    ('motivation','Motivation — Stoic Punch'),
    ('fact','Did You Know? — Fact'),
    ('countdown','Top 5 — Countdown')
)
DELETE FROM public.templates t
USING starter_keys s
WHERE t.user_id IS NOT NULL
  AND t.is_default = false
  AND t.visibility = 'private'
  AND lower(t.type) = lower(s.type)
  AND lower(t.name) = lower(s.name)
  -- Do not remove a deliberately edited/remixed template.
  AND t.remix_of IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.template_id = t.id
  );

-- Global defaults are website-provided marketplace products.
UPDATE public.templates
SET visibility = 'public',
    published_at = COALESCE(published_at, created_at, now()),
    category = COALESCE(NULLIF(category,''),'Other')
WHERE is_default = true AND user_id IS NULL;

-- The old duplication path is removed from the application. Real user-created
-- duplicates/remixes remain supported and are not constrained by this repair.
