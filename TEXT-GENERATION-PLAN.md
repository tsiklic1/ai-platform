# Text Generation (Instagram Captions): Implementation Plan

> **Date**: 2026-04-02  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Depends on**: Stages 1-4 ✅ + Content Type Reference Images ✅  
> **Estimated effort**: 0.5–1 day  

---

## What This Delivers

1. New `generated_texts` table in Supabase
2. Backend text generation endpoint via Claude Sonnet 4 (through OpenRouter)
3. Backend CRUD for generated texts (list, get, delete)
4. Text prompt assembly with brand context + content type's `text_prompt_template`
5. Frontend Text page with prompt input at top and caption cards below
6. Copy to clipboard on each caption
7. Pagination via "Load more"

---

## Confirmed Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Model | `anthropic/claude-sonnet-4` via OpenRouter | Best for creative writing, same API infrastructure |
| Output type | Instagram captions, 150-300 words | Specific, well-scoped |
| Output count | 1 caption per generation | Simple, user regenerates for alternatives |
| Content type integration | Uses `text_prompt_template` | Parallel to image generation using `image_prompt_template` |
| Brand context | Brand name + product names/descriptions injected | On-brand output without needing images |
| No image input | Text-only prompt to Claude | Captions don't need visual context |
| History | Saved to `generated_texts` table | Browsable past captions |
| Copy to clipboard | One-click button on each caption | Essential for social media workflow |
| Edit after generation | No — regenerate instead | Simpler UX |
| Layout | Prompt at top, caption cards below (not gallery grid) | Text is better in a vertical list |
| Model configurable | Env var `TEXT_MODEL`, defaults to `anthropic/claude-sonnet-4` | Flexibility |

---

## Detailed Implementation Steps

### Step 1: Database — Create `generated_texts` Table

**Table**: `generated_texts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key, default gen_random_uuid() |
| `user_id` | uuid | FK → auth.users, for RLS |
| `brand_id` | uuid | FK → brands.id, CASCADE delete |
| `content_type_id` | uuid | FK → content_types.id, SET NULL on delete |
| `prompt` | text | User's input prompt |
| `full_prompt` | text | Assembled prompt sent to Claude (system + user) |
| `generated_text` | text | The generated caption |
| `created_at` | timestamptz | Default now() |

**RLS Policy**: `SELECT/INSERT/DELETE WHERE user_id = auth.uid()`

**Indexes**: `user_id`, `brand_id`, `created_at DESC`

```sql
CREATE TABLE generated_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  content_type_id uuid REFERENCES content_types(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  full_prompt text NOT NULL,
  generated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE generated_texts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own generated texts"
  ON generated_texts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own generated texts"
  ON generated_texts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their own generated texts"
  ON generated_texts FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_generated_texts_user_id ON generated_texts(user_id);
CREATE INDEX idx_generated_texts_brand_id ON generated_texts(brand_id);
CREATE INDEX idx_generated_texts_created_at ON generated_texts(created_at DESC);
```

---

### Step 2: Backend — Text Generation Utility

**File**: `src/lib/text-gen.ts` (new)

A utility for generating text via Claude through OpenRouter.

```ts
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TEXT_MODEL = process.env.TEXT_MODEL || "anthropic/claude-sonnet-4";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
```

#### `assembleTextPrompt(userPrompt, contentType?, brandContext?)`

Builds the full prompt with brand context and content type template.

**Parameters**:
- `userPrompt`: string — what the user typed
- `contentType`: `{ text_prompt_template, name } | null`
- `brandContext`: `{ brandName, products: { name, description, category }[] }`

**System message** (sent as `role: "system"`):
```
You are an expert Instagram caption writer. Write engaging, on-brand captions 
for social media posts. Captions should be 150-300 words, include relevant 
hashtags, and have a clear call-to-action when appropriate.

Brand: {brandName}
Products: 
- {productName}: {productDescription} ({category})
- ...

{contentType.text_prompt_template if provided}
```

**User message**: The user's prompt as-is.

**Returns**: `{ systemPrompt: string, userPrompt: string }` — both stored as `full_prompt` (concatenated) for debugging.

#### `generateText(systemPrompt, userPrompt)`

Calls OpenRouter with Claude:

```ts
const response = await fetch(OPENROUTER_BASE_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: TEXT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1024,
  }),
});
```

Extracts and returns `choices[0].message.content` as a string.

---

### Step 3: Backend — Texts Route

**File**: `src/routes/texts.ts` (new)

All endpoints use `authMiddleware` and `createUserClient(token)`.

#### POST `/:brandId/texts/generate` — Generate caption

```
1. Get token + user from context
2. Parse body: { prompt, content_type_id? }
3. Validate: prompt required
4. createUserClient(token)

5. Fetch brand name:
   SELECT name FROM brands WHERE id = brandId

6. Fetch products for brand context:
   SELECT name, description, category FROM brand_products WHERE brand_id = brandId

7. If content_type_id provided:
   Fetch content type: SELECT text_prompt_template, name FROM content_types WHERE id = content_type_id

8. Assemble prompt: assembleTextPrompt(prompt, contentType, { brandName, products })
   Store system + user as full_prompt

9. Call generateText(systemPrompt, userPrompt)
   - Much faster than image gen (~2-5 seconds)

10. Insert into generated_texts: {
      user_id, brand_id, content_type_id,
      prompt, full_prompt, generated_text
    }

11. Return { text: data } with 201
```

#### GET `/:brandId/texts` — List generated texts (paginated)

```
1. Parse query: page (default 1), limit (default 20, max 50)
2. SELECT id, prompt, generated_text, content_type_id, created_at
   FROM generated_texts WHERE brand_id = brandId
   ORDER BY created_at DESC
   RANGE(offset, offset + limit - 1)
3. Also get total count
4. Return { texts: data, total, page, limit }
```

#### GET `/:brandId/texts/:id` — Get single text (full details)

```
1. SELECT * FROM generated_texts WHERE id = param
2. Return { text: data }
```

Returns all fields including `full_prompt` for debugging.

#### DELETE `/:brandId/texts/:id` — Delete generated text

```
1. DELETE FROM generated_texts WHERE id = param
2. Return { message: "Deleted" }
```

---

### Step 4: Backend — Register Route

**File**: `src/index.ts` (modify)

```ts
import texts from "./routes/texts";
app.route("/brands", texts);
```

---

### Step 5: Frontend — Text Page

**File**: `src/pages/Captions.tsx` (rewrite — currently a shell)

**Layout**: Prompt section at top, generated captions in a vertical list below.

**Types**:
```ts
interface GeneratedText {
  id: string;
  prompt: string;
  generated_text: string;
  content_type_id: string | null;
  created_at: string;
}

interface GeneratedTextFull extends GeneratedText {
  full_prompt: string;
  brand_id: string;
  user_id: string;
}
```

**Page structure**:
```
┌──────────────────────────────────────────────────────┐
│  Text — {brand.name}                                 │
│  Generate Instagram captions for your brand.         │
│                                                      │
│  Content Type     [Custom (no template)  ▾] ℹ️       │
│                                                      │
│  Prompt *                                            │
│  ┌──────────────────────────────────────────────┐    │
│  │ What should the caption be about...          │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  [Generate Caption]                                  │
│  ⚠ Uses Claude to generate on-brand captions.        │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Generated Captions                                  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  "Sip into the golden hour ☀️ Our Classic     │  │
│  │  Can brings that ice-cold refreshment you've   │  │
│  │  been craving all day long..."                 │  │
│  │                                                │  │
│  │  Prompt: "summer beach vibes"     [📋 Copy]   │  │
│  │  Product Showcase · 2m ago       [🗑 Delete]   │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  "Monday motivation starts with..."           │  │
│  │  ...                                          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│              [Load more]                             │
└──────────────────────────────────────────────────────┘
```

**Caption card** (each generated text):
- Generated text displayed prominently (the main content)
- User's original prompt shown smaller below
- Content type name badge (if used)
- Relative timestamp
- **📋 Copy** button — copies `generated_text` to clipboard, shows "Copied!" briefly
- **🗑 Delete** button — confirmation → optimistic delete

**No sidebar needed** — all info is visible in the card. For `full_prompt` viewing, we can add an expandable "Show full prompt" link on each card (collapsed by default).

**Generation form**:
- Content type selector (reuse `ContentTypeSelector` component)
- Prompt textarea (smaller than images, 2-3 rows)
- "Generate Caption" button with spinner
- No aspect ratio toggle (not relevant for text)

**Data fetching**:
- On mount + brand change: `GET /brands/{brandId}/texts?page=1&limit=20`
- "Load more" appends next page
- After generation: refetch from page 1

**Empty state**: "No captions generated yet. Use the form above to create your first caption."

---

### Step 6: Frontend — Verify Route

The route `/captions` already exists in `App.tsx` pointing to `Captions.tsx`. No changes needed.

---

## File Change Summary

### New (SQL):
| Item | Purpose |
|------|---------|
| `generated_texts` table | Store generated captions |
| RLS policies | User isolation |
| Indexes | Performance |

### New Files (2):
| File | Location | Purpose |
|------|----------|---------|
| `text-gen.ts` | `backend/src/lib/` | Claude prompt assembly + text generation |
| `texts.ts` | `backend/src/routes/` | Generate + list + get + delete endpoints |

### Modified Files (2):
| File | Location | Changes |
|------|----------|---------|
| `index.ts` | `backend/src/` | Register texts route |
| `Captions.tsx` | `frontend/src/pages/` | Full rewrite: generation form + caption cards |

### No Changes:
| File | Reason |
|------|--------|
| `ContentTypeSelector.tsx` | Already reusable |
| `App.tsx` | Route `/captions` already exists |
| `gemini.ts` | Text gen uses separate utility |

---

## Implementation Order

```
1. Create generated_texts table + RLS + indexes (SQL)
2. text-gen.ts (prompt assembly + Claude call)
3. texts.ts (all endpoints)
4. index.ts (register route)
   ── DEPLOY BACKEND, test with curl ──
5. Captions.tsx (full rewrite)
   ── DEPLOY FRONTEND, test in browser ──
```

---

## Testing Checklist

### Backend:
- [ ] `POST /brands/:brandId/texts/generate` with prompt → 201, returns generated caption
- [ ] Generate with content type → uses `text_prompt_template` in system prompt
- [ ] Generate without content type → works, just brand context + user prompt
- [ ] Generated text is 150-300 words (Instagram-appropriate)
- [ ] `full_prompt` contains brand name, products, template
- [ ] `GET /brands/:brandId/texts` → paginated list, newest first
- [ ] `GET /brands/:brandId/texts/:id` → full details with full_prompt
- [ ] `DELETE /brands/:brandId/texts/:id` → deletes
- [ ] No auth → 401

### Frontend:
- [ ] No brand → NoBrandPrompt
- [ ] Generation form with content type selector + prompt textarea
- [ ] Click "Generate Caption" → spinner → caption appears at top of list
- [ ] Caption card shows full text, prompt, content type badge, timestamp
- [ ] 📋 Copy button copies text to clipboard, shows "Copied!" feedback
- [ ] 🗑 Delete button → confirmation → optimistic removal
- [ ] "Load more" pagination works
- [ ] Brand switch → refetch captions
- [ ] Empty state message when no captions
