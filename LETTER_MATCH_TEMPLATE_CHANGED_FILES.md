# Letter Match Template — Changed Files

## Added
- `src/lib/starter-templates.test.ts` — regression coverage for starter presence, automation replacement, and V2 migration.

## Updated
- `src/lib/starter-templates.ts` — adds **Letter Match — Complete the Word**, a 9:16 four-scene animated starter (Hook → Match challenge → Correct reveal → CTA).
- `src/lib/sample-csv.ts` — adds a 12-row Letter Match sample set (ANT, MANGO, TIGER, HOUSE, ORANGE, AXE, HEN, COCK, RAT, CAT, DOG, KITE) with incomplete words, correct/distractor letters, image URLs, and clues.
- `src/routes/_app/templates/index.tsx` — starter count is dynamic and starter tooltip mentions Letter Match.

## Automation variables
- `word` — incomplete display word, e.g. `_NT`, `M_NGO`, `T_GER`
- `missingLetter` — correct missing character
- `optionA`, `optionB`, `optionC` — selectable-looking letter tiles; place the correct answer in any tile
- `objectImage` — image URL for the object/animal/word
- `clue` — optional clue text
- `cta` — closing engagement prompt

The starter remains ordinary editable EditorDocument data and migrates through the canonical V2 timeline/render pipeline.
