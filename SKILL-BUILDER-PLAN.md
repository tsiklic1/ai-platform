# Plan — AI Skill Builder

## Context

Brand-specific skills (like `aranxhata-image-gen.md`, 261 lines) are highly effective but take significant effort to write manually. Default/generic skills lose ~70% of actionable substance. This feature adds a form-based wizard that asks detailed brand questions, sends answers to Claude via OpenRouter, and generates a complete skill document. The result is editable before saving.

## Decisions

- **UI:** "Generate with AI" button on Skills page, opens a modal wizard
- **One form per skill type:** separate tailored forms for Images, Captions, Frames
- **Brand-scoped:** user selects a brand; form knows which brand (via `useBrand()`)
- **No auto-populate:** user fills fields manually
- **AI:** OpenRouter, model via `SKILL_BUILDER_MODEL` env var (default `anthropic/claude-sonnet-4`)
- **Does NOT auto-save:** returns generated draft → user edits in existing SkillSidebar → saves via existing `POST /skills`

## Files

| File | Action |
|------|--------|
| `ai-platform-backend/src/lib/skill-builder-prompts.ts` | **New** — system prompts per type + OpenRouter call + user prompt serializer |
| `ai-platform-backend/src/routes/skill-builder.ts` | **New** — `POST /generate` endpoint |
| `ai-platform-backend/src/index.ts` | Register new route |
| `ai-platform-frontend/src/components/SkillBuilderModal.tsx` | **New** — multi-step modal (type select → brand → form → generating → preview) |
| `ai-platform-frontend/src/pages/Skills.tsx` | Add "Generate with AI" button, modal state, pass generated data into SkillSidebar via `initialData` prop |

## Backend

### New file: `src/lib/skill-builder-prompts.ts`

**Functions:**
- `getSystemPrompt(skillType: 'image' | 'captions' | 'frames'): string` — type-specific template
- `buildUserPrompt(formData: Record<string, any>): string` — serialize form fields into labeled sections, omit empty fields
- `generateSkillContent(systemPrompt: string, userPrompt: string): Promise<string>` — OpenRouter call with `SKILL_BUILDER_MODEL` env var (default `anthropic/claude-sonnet-4`), `max_tokens: 8192`

Separate from `text-gen.ts` to avoid breaking captions (different model env var, different max_tokens).

**System prompt structure per type (derived from Aranxhata gold standards):**

**Image** — instruct Claude to generate these sections:
1. Title + intro
2. Non-Negotiable Product Accuracy Rules (variant locks, colors, label text)
3. Product Placement & Composition Rules
4. Lighting Consistency Rule
5. Workflow (5 steps: identify content type → study refs → build prompt → generate → review)
6. Content type table with visual direction per type
7. Quick Prompt Templates (one per content type as blockquotes)
8. Do's and Don'ts

**Captions** — sections:
1. Title + intro
2. Brand Context (account, tone, visual identity)
3. Output Format
4. Caption Rules (length, hook, language, hashtags, emoji, CTA)
5. Content Type Rotation strategy
6. Writing Workflow per post
7. Language-Specific Guidelines
8. Quality Checklist
9. Example Output

**Frames** — sections:
1. Title + intro
2. Core Rules (sequential generation, format specs)
3. Product Accuracy Rules
4. Content Type Suitability Matrix (which types suit video)
5. Workflow (5 steps)
6. Gradual Progression Rule
7. Frame Prompt Template (base scene + frame change + consistency enforcement)
8. Example Frame Breakdown (complete multi-frame example)
9. Lighting Consistency Rule

### New file: `src/routes/skill-builder.ts`

Single `POST /generate` endpoint with `authMiddleware`.

Request body:
```ts
{
  skill_type: 'image' | 'captions' | 'frames';
  form_data: {
    brand_name: string;           // required
    brand_description: string;
    product_details: string;
    target_platforms: string[];
    // + type-specific fields (see form section below)
  };
}
```

Response:
```ts
{
  name: string;        // e.g. "Aranxhata Image Generator"
  description: string; // one-liner derived from brand + type
  content: string;     // full markdown
  actions: string[];   // ['image'] | ['text'] | ['frames']
}
```

Handler: validate → build prompts → call `generateSkillContent()` → derive name/description/actions → return.

### `src/index.ts` change

```ts
import skillBuilder from "./routes/skill-builder";
app.route("/skill-builder", skillBuilder);
```

## Frontend

### New file: `src/components/SkillBuilderModal.tsx`

Multi-step modal with 5 steps:

**Step 1 — Type Select:** Three cards: "Image Generation", "Text / Captions", "Video Frames"

**Step 2 — Brand Select:** Dropdown from `useBrand()`. Pre-selects `selectedBrand` if active. "Next" button.

**Step 3 — Form:** Type-specific questions (see below). "Generate" button.

**Step 4 — Generating:** Loading spinner, "Generating your skill... ~15-30 seconds."

**Step 5 — Preview:** Show generated markdown in scrollable container. "Edit & Save" closes modal and opens SkillSidebar pre-populated. "Regenerate" goes back to step 4.

Props: `open`, `onClose`, `onComplete(data: { name, description, content, actions })`

### Form fields

**Common (all types):**
- Brand name (text, pre-filled from selected brand)
- Brand description / positioning (textarea)
- Product details — variant names, visual descriptions, colors, shapes, distinguishing features (textarea)
- Target platforms (checkboxes: Instagram, TikTok, Facebook, LinkedIn, YouTube, X)

**Image-specific:**
- Product visual accuracy rules — what must never change (textarea)
- Visual style preference (select: photorealistic, editorial, studio, lifestyle, cinematic, flat lay + textarea for details)
- Composition preferences — placement, angles, count limits (textarea)
- Lighting preferences (textarea)
- Content types with visual direction — list their main content types and describe the look for each (textarea)
- Do's and don'ts (textarea)

**Captions-specific:**
- Brand voice/tone (textarea)
- Languages (multi-select: English, Albanian, Spanish, etc. + textarea for per-language notes)
- Caption length preference (select: short/medium/long)
- Hashtag strategy — count, branded vs general (textarea)
- Emoji usage (select: none/minimal/moderate/heavy)
- CTA style preferences (textarea)
- Content rotation strategy (textarea)
- Example caption (textarea, optional)

**Frames-specific:**
- Product visual accuracy rules (textarea, same as images)
- Video sequence types — what kinds of sequences they want (textarea, e.g. "bartender pour shots, product reveals, lifestyle moments")
- Frame progression style (textarea)
- Motion/action types to feature (textarea)
- Content types suited for video (textarea)
- Do's and don'ts for video (textarea)

### Skills.tsx changes

- Add state: `showBuilder: boolean`, `generatedSkill: { name, description, content, actions } | null`
- Add "Generate with AI" card in the grid (next to "+ New Skill" card)
- Import + render `SkillBuilderModal`
- `handleBuilderComplete(data)`: set `generatedSkill`, close modal, open sidebar in new mode
- Modify SkillSidebar (inline component): accept optional `initialData` prop. When `isNew && initialData`, populate name/description/content/actions from it instead of blanking.

## Flow

1. User on `/skills` → clicks "Generate with AI" card
2. Modal opens → select type → select brand → fill form → click "Generate"
3. `POST /skill-builder/generate` → Claude generates ~150-250 line skill markdown
4. Preview shown → user clicks "Edit & Save"
5. Modal closes, SkillSidebar opens pre-populated with generated content
6. User tweaks → clicks "Create" → existing `POST /skills` saves to DB
7. Skill appears in grid, ready to use in generation

## Verification

1. `npx tsc --noEmit` in backend — no errors
2. `npm run build` in frontend — clean
3. Test each skill type: fill form with test brand data, generate, verify output has all expected sections
4. "Edit & Save" → verify sidebar pre-populates correctly
5. Save → verify skill appears in grid with correct actions tag
6. Use generated skill in an image/caption/frames generation → verify it's injected into the prompt
