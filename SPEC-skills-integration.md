# Skills Integration into Generation — Specification

> **Status**: DRAFT  
> **Date**: 2026-04-03  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Depends on**: Skills CRUD ✅, Image Generation ✅, Text Generation ✅  
> **Estimated effort**: 1–1.5 days  

---

## What This Delivers

1. Skills get an `actions` column — defines which generation types the skill is applicable to
2. Skills page updated to let users assign actions per skill
3. Generation forms (Images + Captions) show a skill picker — user selects which skills to apply
4. Selected skill content is injected into the generation prompt (system message)
5. Flexible action system — starts with `image` and `text`, extensible to `video`, `frames`, etc.

---

## Confirmed Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Skill ownership | Per-user (existing) | Admin skills can be layered on later |
| Action mapping | Array column on `skills` table | Simple, no junction table needed |
| User selection | Manual per-generation | User picks which skills apply each time |
| Injection position | System prompt: role → skills → content type → user prompt | Skills set the frame, content type refines, user prompt specifies |
| Skill content format | Freeform markdown (unchanged) | Skill writer's responsibility |
| Ordering | No priority — all selected skills concatenated | Order doesn't matter |
| Multiple skills | Yes — user can select 0, 1, or many | Concatenated with clear separators |
| Default selection | None selected | User explicitly opts in |

---

## Data Model Changes

### Modify `skills` table — add `actions` column

```sql
ALTER TABLE skills
ADD COLUMN actions text[] NOT NULL DEFAULT '{}';
```

The `actions` column is a Postgres text array. Each entry is a lowercase action identifier.

**Known action identifiers** (extensible):
- `image` — image generation
- `text` — text/caption generation
- `video` — video generation (future)
- `frames` — video frame generation (future)

**Examples**:
- A skill with `actions = ['image', 'text']` appears in both image and caption generation forms
- A skill with `actions = ['image']` only appears in image generation
- A skill with `actions = []` doesn't appear in any generation form (but still exists in the skills library)

**No migration needed for existing skills** — they'll default to `[]` (empty array) and won't appear in any generation form until the user assigns actions.

### Index

```sql
CREATE INDEX idx_skills_actions ON skills USING GIN (actions);
```

GIN index enables fast `@>` (contains) queries on the array.

---

## Detailed Implementation Steps

### Step 1: Database — Add `actions` column

```sql
-- Add actions column
ALTER TABLE skills
ADD COLUMN actions text[] NOT NULL DEFAULT '{}';

-- GIN index for array queries
CREATE INDEX idx_skills_actions ON skills USING GIN (actions);
```

---

### Step 2: Backend — Update Skills Route

**File**: `src/routes/skills.ts` (modify)

#### Changes to existing endpoints:

**`GET /skills`** — include `actions` in the list query:
```ts
.select("id, name, description, actions, updated_at")
```

**`POST /skills`** — accept `actions` in create body:
```ts
const { name, description, content, actions } = await c.req.json();
// Validate actions is an array of strings if provided
const validActions = Array.isArray(actions) 
  ? actions.filter((a: unknown) => typeof a === "string") 
  : [];
// Insert with actions: validActions
```

**`PUT /skills/:id`** — accept `actions` in update body:
```ts
if (body.actions !== undefined) {
  updates.actions = Array.isArray(body.actions) 
    ? body.actions.filter((a: unknown) => typeof a === "string") 
    : [];
}
```

#### New endpoint — get skills filtered by action:

**`GET /skills/by-action/:action`** — returns skills that include the given action

```ts
skills.get("/by-action/:action", async (c) => {
  const token = c.get("token");
  const action = c.req.param("action");
  const sb = createUserClient(token);
  
  const { data, error } = await sb
    .from("skills")
    .select("id, name, description")
    .contains("actions", [action])
    .order("name");

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ skills: data });
});
```

**Important**: Register this route BEFORE the `/:id` route so Hono doesn't match `by-action` as an `:id` param.

---

### Step 3: Backend — Update Image Generation

**File**: `src/lib/gemini.ts` (modify)

#### Update `generateImage` to accept skill content:

Add `skillsContent` parameter:

```ts
export async function generateImage(
  prompt: string,
  productImages: ReferenceImage[] = [],
  contentTypeImages: ReferenceImage[] = [],
  aspectRatio: "1:1" | "9:16" = "1:1",
  skillsContent?: string | null
): Promise<GeneratedImage>
```

#### Add system message when skills are provided:

Change the messages array from a single user message to include a system message:

```ts
const messages: Array<{ role: string; content: any }> = [];

// System message with skills
if (skillsContent) {
  messages.push({
    role: "system",
    content: skillsContent,
  });
}

// User message with images + prompt (existing logic)
messages.push({ role: "user", content });
```

#### Update the fetch body:

```ts
body: JSON.stringify({
  model: MODEL,
  messages,  // was: messages: [{ role: "user", content }]
  response_modalities: ["image"],
  image_config: { aspect_ratio: aspectRatio },
}),
```

---

### Step 4: Backend — Update Text Generation

**File**: `src/lib/text-gen.ts` (modify)

#### Update `assembleTextPrompt` to accept skills:

Add `skills` parameter:

```ts
export function assembleTextPrompt(
  userPrompt: string,
  contentType?: ContentTypeForTextPrompt | null,
  brandContext?: BrandContext | null,
  skillsContent?: string | null
): { systemPrompt: string; userPrompt: string; fullPrompt: string }
```

#### Inject skills after role definition, before brand context:

```ts
const systemParts: string[] = [
  "You are an expert Instagram caption writer...",
  "Captions should be 150-300 characters...",
  "Return ONLY the caption text...",
];

// Skills injected here — after role, before brand context
if (skillsContent) {
  systemParts.push(`\n--- Skills & Guidelines ---\n${skillsContent}`);
}

if (brandContext) {
  systemParts.push(`\nBrand: ${brandContext.brandName}`);
  // ... existing product listing
}

if (contentType?.text_prompt_template) {
  systemParts.push(`\nContent type "${contentType.name}" instructions:\n${contentType.text_prompt_template}`);
}
```

---

### Step 5: Backend — Update Generation Routes

**File**: `src/routes/images.ts` (modify)

#### Update `POST /:brandId/images/generate`:

Add `skill_ids` to request body parsing:

```ts
const { prompt, content_type_id, aspect_ratio, skill_ids } = await c.req.json();
```

Fetch selected skills and assemble content:

```ts
// Fetch selected skills (if any)
let skillsContent: string | null = null;
if (Array.isArray(skill_ids) && skill_ids.length > 0) {
  const { data: skillsData } = await sb
    .from("skills")
    .select("name, content")
    .in("id", skill_ids);
  
  if (skillsData && skillsData.length > 0) {
    skillsContent = skillsData
      .map((s: { name: string; content: string }) => 
        `## Skill: ${s.name}\n${s.content}`
      )
      .join("\n\n---\n\n");
  }
}
```

Pass to `generateImage`:

```ts
const result = await generateImage(fullPrompt, productImages, contentTypeImages, ar, skillsContent);
```

Also store `skill_ids` in the `full_prompt` field for debugging:

```ts
const assembledPrompt = skillsContent 
  ? `[SKILLS]\n${skillsContent}\n\n[PROMPT]\n${fullPrompt}`
  : fullPrompt;
```

---

**File**: `src/routes/texts.ts` (modify)

#### Update `POST /:brandId/texts/generate`:

Same pattern — add `skill_ids` to body parsing, fetch skills, pass to `assembleTextPrompt`:

```ts
const { prompt, content_type_id, skill_ids } = await c.req.json();

// Fetch selected skills
let skillsContent: string | null = null;
if (Array.isArray(skill_ids) && skill_ids.length > 0) {
  const { data: skillsData } = await sb
    .from("skills")
    .select("name, content")
    .in("id", skill_ids);
  
  if (skillsData && skillsData.length > 0) {
    skillsContent = skillsData
      .map((s: { name: string; content: string }) => 
        `## Skill: ${s.name}\n${s.content}`
      )
      .join("\n\n---\n\n");
  }
}

const { systemPrompt, userPrompt: assembledUserPrompt, fullPrompt } = 
  assembleTextPrompt(prompt, contentType, { brandName, products }, skillsContent);
```

---

### Step 6: Frontend — Skill Picker Component

**New file**: `src/components/SkillPicker.tsx`

A reusable multi-select component that shows available skills for a given action.

**Props**:
```ts
interface SkillPickerProps {
  action: "image" | "text" | "video" | "frames";
  token: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}
```

**Behavior**:
- Fetches skills via `GET /skills/by-action/{action}` on mount
- Shows nothing if no skills are available for this action
- Renders as a row of toggle chips/pills (not a dropdown — skills should be visible)
- Each chip shows skill name, highlighted when selected
- Click to toggle on/off
- Multiple selection allowed

**Layout**:
```
Skills (optional)
[📊 Brand Voice ✓] [🎨 Visual Style] [📐 Composition Rules ✓]
```

- Selected chips: indigo background, white text
- Unselected chips: gray border, gray text
- If no skills exist for this action: don't render anything (no empty state, no label)

---

### Step 7: Frontend — Update Skills Page

**File**: `src/pages/Skills.tsx` (modify)

#### Add actions assignment to the skill edit sidebar:

In `SkillSidebar`, add an actions multi-select section:

```
Available Actions
[☐ Image Generation] [☐ Text / Captions] [☐ Video] [☐ Video Frames]
```

- Checkboxes or toggle chips
- Maps to action identifiers: `image`, `text`, `video`, `frames`
- Saved as part of the skill create/update payload

#### Update types:

```ts
interface SkillSummary {
  id: string;
  name: string;
  description: string | null;
  actions: string[];
  updated_at: string;
}
```

#### Show action badges on skill cards:

Each skill card shows small badges for assigned actions:
```
┌────────────────────────────┐
│  Brand Voice Guidelines    │
│  Tone and style rules...   │
│  [image] [text]  · 2h ago  │
└────────────────────────────┘
```

---

### Step 8: Frontend — Update Image Generation Form

**File**: `src/pages/Images.tsx` (modify)

#### Add skill picker to the generation form:

Import and add `SkillPicker` component:

```tsx
const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
```

Add between Content Type selector and prompt textarea:

```tsx
<SkillPicker
  action="image"
  token={token}
  selectedIds={selectedSkillIds}
  onChange={setSelectedSkillIds}
/>
```

#### Send `skill_ids` in generation request:

```ts
body: {
  prompt: prompt.trim(),
  content_type_id: contentTypeId,
  aspect_ratio: aspectRatio,
  skill_ids: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
},
```

#### Reset skill selection on brand change:

```ts
setSelectedSkillIds([]);
```

---

### Step 9: Frontend — Update Captions Form

**File**: `src/pages/Captions.tsx` (modify)

Same pattern as Images:

```tsx
const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

// In the form, between content type and prompt:
<SkillPicker
  action="text"
  token={token}
  selectedIds={selectedSkillIds}
  onChange={setSelectedSkillIds}
/>

// In handleGenerate:
body: {
  prompt: prompt.trim(),
  content_type_id: contentTypeId,
  skill_ids: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
},
```

---

## Prompt Assembly — Final Structure

### Text Generation (Claude)

```
SYSTEM MESSAGE:
  You are an expert Instagram caption writer...
  Captions should be 150-300 characters...
  Return ONLY the caption text...

  --- Skills & Guidelines ---
  ## Skill: Brand Voice
  {skill markdown content}
  ---
  ## Skill: Hashtag Strategy  
  {skill markdown content}

  Brand: {brandName}
  Products:
  - {product details}

  Content type "{name}" instructions:
  {text_prompt_template}

USER MESSAGE:
  {user's prompt}
```

### Image Generation (Gemini)

```
SYSTEM MESSAGE:
  ## Skill: Visual Style Guide
  {skill markdown content}
  ---
  ## Skill: Composition Rules
  {skill markdown content}

USER MESSAGE:
  [Product reference images]
  [Content type style reference images]
  Content type template: {image_prompt_template}
  Image style: {image_style}
  {user's prompt}
```

---

## File Change Summary

### Database (SQL):
| Change | Purpose |
|--------|---------|
| `ALTER TABLE skills ADD COLUMN actions text[]` | Action mapping |
| `CREATE INDEX ... USING GIN (actions)` | Fast array queries |

### New Files (1):
| File | Location | Purpose |
|------|----------|---------|
| `SkillPicker.tsx` | `frontend/src/components/` | Reusable skill multi-select chips |

### Modified Files (6):
| File | Location | Changes |
|------|----------|---------|
| `skills.ts` | `backend/src/routes/` | Add actions to CRUD + new `/by-action/:action` endpoint |
| `gemini.ts` | `backend/src/lib/` | Accept + inject skills as system message |
| `text-gen.ts` | `backend/src/lib/` | Accept + inject skills into system prompt |
| `images.ts` | `backend/src/routes/` | Parse `skill_ids`, fetch skills, pass to generator |
| `texts.ts` | `backend/src/routes/` | Parse `skill_ids`, fetch skills, pass to generator |
| `Skills.tsx` | `frontend/src/pages/` | Actions assignment UI + action badges on cards |
| `Images.tsx` | `frontend/src/pages/` | Add SkillPicker to generation form |
| `Captions.tsx` | `frontend/src/pages/` | Add SkillPicker to generation form |

---

## Implementation Order

```
1. SQL: Add actions column + index
2. Backend: Update skills.ts (actions in CRUD + by-action endpoint)
   ── DEPLOY BACKEND, test with curl ──
3. Backend: Update gemini.ts + text-gen.ts (accept skillsContent)
4. Backend: Update images.ts + texts.ts (fetch skills, pass to generators)
   ── DEPLOY BACKEND, test with curl ──
5. Frontend: SkillPicker.tsx component
6. Frontend: Update Skills.tsx (actions assignment + badges)
7. Frontend: Update Images.tsx + Captions.tsx (add SkillPicker)
   ── DEPLOY FRONTEND, test in browser ──
```

---

## Testing Checklist

### Backend:
- [ ] `POST /skills` with `actions: ["image", "text"]` → saves correctly
- [ ] `PUT /skills/:id` with `actions: ["image"]` → updates correctly
- [ ] `GET /skills` → includes `actions` array in response
- [ ] `GET /skills/by-action/image` → returns only skills with `image` in actions
- [ ] `GET /skills/by-action/text` → returns only skills with `text` in actions
- [ ] `GET /skills/by-action/video` → returns empty array (no skills yet)
- [ ] `POST /brands/:id/images/generate` with `skill_ids: [...]` → skills injected into prompt
- [ ] `POST /brands/:id/texts/generate` with `skill_ids: [...]` → skills injected into system prompt
- [ ] Generation without `skill_ids` → works as before (no regression)
- [ ] Invalid `skill_ids` (non-existent UUIDs) → silently ignored, generation proceeds

### Frontend:
- [ ] Skills page: actions checkboxes in edit sidebar
- [ ] Skills page: action badges on cards
- [ ] Skills page: create new skill with actions → saved
- [ ] Images page: SkillPicker shows only `image` skills
- [ ] Captions page: SkillPicker shows only `text` skills
- [ ] SkillPicker: toggle chips on/off, multiple selection
- [ ] SkillPicker: hidden when no skills available for that action
- [ ] Generation with skills selected → skills visible in full_prompt
- [ ] Generation without skills → works as before
- [ ] Brand switch → skill selection reset

---

## Future Extensions (not in scope)

- **Admin skills**: Global skills visible to all users, always injected (add `is_admin` flag + fetch logic)
- **Skill versioning**: Track changes to skill content over time
- **Skill marketplace**: Users share/import skills from other users
- **Skill analytics**: Track which skills produce better generation results
- **Per-content-type skill defaults**: Auto-select certain skills when a content type is chosen
