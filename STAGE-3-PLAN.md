# Stage 3 — Content Types Page: Complete Implementation Plan

> **Date**: 2026-03-31  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Depends on**: Stage 1 ✅ (content_types table + default seeding already done)  
> **Estimated effort**: 0.5–1 day  

---

## What Stage 3 Delivers

1. Backend CRUD for content types (scoped per brand)
2. `is_default` flips to `false` when a default content type is edited
3. Frontend Content Types page with card grid + edit sidebar
4. Reusable aspect ratio toggle component (used again in Stage 4)
5. NoBrandPrompt when no brand is selected

---

## Confirmed Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Reset defaults endpoint | Deferred (backlog) | Potentially destructive, not needed for MVP |
| `is_default` on edit | Flip to `false` | Modified content type is no longer the original default |
| No brand selected | Show NoBrandPrompt | Same pattern as Identity page |
| Template textarea height | ~150px | Shorter than skill content, adjustable later |
| Aspect ratio selector | Toggle buttons with icons | Visual, reusable in Stage 4 |
| Card badges | Both aspect ratio + Default | Full info at a glance |

---

## Prerequisites

All already in place — no new infrastructure needed:

- ✅ `content_types` table deployed in Supabase with RLS
- ✅ Default seeding on brand creation (Stage 1)
- ✅ Route mounting pattern proven (brand-products)
- ✅ Card grid + sidebar UI pattern established

---

## Detailed Implementation Steps

### Step 1: Backend — Content Types Route

**File**: `src/routes/content-types.ts` (new)

Same pattern as `brand-products.ts`. All endpoints use `authMiddleware` and `createUserClient(token)`. Routes defined with full paths from brand ID level, mounted at `/brands`.

#### GET `/:brandId/content-types` — List content types (summary)

```
1. Get token from context
2. createUserClient(token)
3. Query: select id, name, description, default_aspect_ratio, is_default, sort_order
   from content_types where brand_id = brandId
   order by sort_order ASC, created_at ASC
4. Return { contentTypes: data }
```

Summary only — no template fields in the list. Keeps the response lightweight.

#### GET `/:brandId/content-types/:id` — Get full content type

```
1. Get token from context
2. createUserClient(token)
3. Query: select * from content_types where id = param, .single()
4. Return { contentType: data }
```

Returns all fields including `text_prompt_template`, `image_prompt_template`, `image_style`.

#### POST `/:brandId/content-types` — Create custom content type

```
1. Get token + user from context
2. Parse body: { name, description?, text_prompt_template?, image_prompt_template?, image_style?, default_aspect_ratio? }
3. Validate: name required, name.length <= 100
4. Validate: if default_aspect_ratio provided, must be "1:1" or "9:16"
5. createUserClient(token)
6. Determine sort_order: select max(sort_order) from content_types where brand_id, use max+1 (or 0 if none)
7. Insert into content_types: {
     user_id, brand_id: brandId, name, description,
     text_prompt_template, image_prompt_template, image_style,
     default_aspect_ratio: default_aspect_ratio || "1:1",
     is_default: false,
     sort_order
   }
8. Return { contentType: data } with 201
```

Custom content types always have `is_default: false`.

#### PUT `/:brandId/content-types/:id` — Update content type

```
1. Get token from context
2. Parse body: { name?, description?, text_prompt_template?, image_prompt_template?, image_style?, default_aspect_ratio? }
3. Validate: at least one field provided
4. Validate: if name provided, name.length <= 100
5. Validate: if default_aspect_ratio provided, must be "1:1" or "9:16"
6. createUserClient(token)
7. Build updates object with provided fields + updated_at: now
8. IMPORTANT: Always set is_default: false on any update
   (if it was a default template and the user modifies it, it's no longer "default")
9. Update content_types set { ...updates } where id = param
10. Return { contentType: data }
```

#### DELETE `/:brandId/content-types/:id` — Delete content type

```
1. Get token from context
2. createUserClient(token)
3. Delete from content_types where id = param
4. Return { message: "Deleted" }
```

No cascade needed — `generated_images.content_type_id` is SET NULL on delete (per spec).

---

### Step 2: Backend — Register Route

**File**: `src/index.ts` (modify)

```ts
import contentTypes from "./routes/content-types";

app.route("/brands", contentTypes);
```

Same mounting pattern as brand-products. The content-types routes use paths like `/:brandId/content-types/...` which are more specific than brands.ts's `/:id`, so no conflict.

---

### Step 3: Frontend — Aspect Ratio Toggle Component

**File**: `src/components/AspectRatioToggle.tsx` (new)

A reusable toggle between 1:1 and 9:16. Will be used on:
- Content Types sidebar (this stage)
- Image Generation page (Stage 4)

**Props**:
```ts
interface AspectRatioToggleProps {
  value: "1:1" | "9:16";
  onChange: (value: "1:1" | "9:16") => void;
}
```

**Visual**:
```
┌──────────┐ ┌──────────┐
│  □  1:1  │ │  ▯ 9:16  │
└──────────┘ └──────────┘
   active       inactive
```

**Implementation**:
- Two side-by-side buttons
- Active button: indigo background, white text
- Inactive button: gray border, gray text, hover highlights
- Small square/vertical rectangle icon next to each label
- Compact sizing (fits in a form field row)

---

### Step 4: Frontend — Content Types Page

**File**: `src/pages/ContentTypes.tsx` (rewrite — currently a shell)

**Types**:
```ts
interface ContentTypeSummary {
  id: string;
  name: string;
  description: string | null;
  default_aspect_ratio: string;
  is_default: boolean;
  sort_order: number;
}

interface ContentTypeFull extends ContentTypeSummary {
  user_id: string;
  brand_id: string;
  text_prompt_template: string | null;
  image_prompt_template: string | null;
  image_style: string | null;
  created_at: string;
  updated_at: string;
}
```

**Page layout**:
- If no brand selected → `<NoBrandPrompt />`
- If brand selected:
  - Header: "Content Types — {brand.name}" + description text
  - Card grid
  - Each card shows:
    - Name (bold, truncated)
    - Description (text-sm, 2-line clamp)
    - Badge row: aspect ratio pill (`1:1` or `9:16`) + "Default" pill (if `is_default`)
  - Click card → fetch full content type → open sidebar
  - "＋ New Content Type" dashed card at end

**Data fetching**:
- On mount and when `selectedBrand` changes: `GET /brands/{brandId}/content-types` (summary list)
- On card click: `GET /brands/{brandId}/content-types/{id}` (full content type with templates)
- Refetch list after any mutation

**Empty state** (unlikely since defaults are seeded, but just in case):
"No content types yet. Create one to define how your brand's content should look."

---

### Step 5: Frontend — Content Type Edit Sidebar

**File**: `src/pages/ContentTypes.tsx` (same file, sidebar component within)

Same slide-in panel pattern as Skills, Brands, and Products.

**Sidebar content**:

```
┌──────────────────────────────────────┐
│  Edit Content Type                ×  │
├──────────────────────────────────────┤
│                                      │
│  Name *                              │
│  ┌──────────────────────────────┐    │
│  │ Product Showcase             │    │
│  └──────────────────────────────┘    │
│                                      │
│  Description                         │
│  ┌──────────────────────────────┐    │
│  │ Clean product hero shots...  │    │
│  └──────────────────────────────┘    │
│                                      │
│  Default Aspect Ratio                │
│  ┌──────────┐ ┌──────────┐          │
│  │  □  1:1  │ │  ▯ 9:16  │          │
│  └──────────┘ └──────────┘          │
│                                      │
│  Image Style                         │
│  ┌──────────────────────────────┐    │
│  │ Studio lighting, clean...    │    │
│  └──────────────────────────────┘    │
│                                      │
│  Image Prompt Template               │
│  ┌──────────────────────────────┐    │
│  │ Generate a professional      │    │
│  │ product photograph...        │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  Text Prompt Template                │
│  ┌──────────────────────────────┐    │
│  │ Write a social media caption │    │
│  │ for a product showcase...    │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
├──────────────────────────────────────┤
│  [Save Changes] [Delete]    Cancel   │
└──────────────────────────────────────┘
```

**Field details**:
- **Name**: text input, required, max 100 chars
- **Description**: text input (single line), optional
- **Default Aspect Ratio**: `<AspectRatioToggle />` component
- **Image Style**: text input, optional (e.g. "Studio lighting, clean background...")
- **Image Prompt Template**: textarea, ~150px min-height, optional
- **Text Prompt Template**: textarea, ~150px min-height, optional

**New content type sidebar**:
- Same form, empty fields
- Aspect ratio defaults to "1:1"
- Button says "Create"

**Edit sidebar**:
- Fetches full content type on open (to get template fields)
- Shows loading state while fetching
- Button says "Save Changes"

**Save behavior**:
- Sends all fields to PUT endpoint
- Backend automatically sets `is_default: false` on any update

**Delete behavior**:
- Confirm dialog: "Delete '{name}'? This content type will be removed. Any generated images using it will keep their data but lose the content type reference."
- On confirm: DELETE, close sidebar, refetch list

---

### Step 6: Frontend — Wire Routes (verify)

**File**: `src/App.tsx` — verify the existing route:

The route `/contentTypes` already exists and points to `ContentTypes.tsx`. No changes needed.

---

## File Change Summary

### New Files (2):
| File | Location | Purpose |
|------|----------|---------|
| `content-types.ts` | `backend/src/routes/` | Content types CRUD API |
| `AspectRatioToggle.tsx` | `frontend/src/components/` | Reusable 1:1 / 9:16 toggle |

### Modified Files (2):
| File | Location | Changes |
|------|----------|---------|
| `index.ts` | `backend/src/` | Register content-types route |
| `ContentTypes.tsx` | `frontend/src/pages/` | Full rewrite: card grid + edit sidebar |

### No Changes:
| File | Reason |
|------|--------|
| `App.tsx` | Route `/contentTypes` already exists |
| `BrandContext.tsx` | selectedBrand already available |
| `NoBrandPrompt.tsx` | Already built |
| `brands.ts` | Default seeding already implemented |
| `default-content-types.ts` | Already complete |
| Database tables | Already deployed |

---

## Implementation Order

```
1. content-types.ts (backend route) — CRUD logic
2. index.ts (register route) — depends on #1
   ── BACKEND DONE, test with curl ──
3. AspectRatioToggle.tsx — standalone component
4. ContentTypes.tsx (full rewrite) — depends on #3
   ── FRONTEND DONE, test in browser ──
```

---

## Testing Checklist

### Backend (curl):
- [ ] `GET /brands/:brandId/content-types` → returns 5 default content types (summary fields only)
- [ ] `GET /brands/:brandId/content-types/:id` → returns full content type with templates
- [ ] `POST /brands/:brandId/content-types` with name → 201, `is_default: false`
- [ ] `POST /brands/:brandId/content-types` without name → 400
- [ ] `POST` with invalid aspect ratio → 400
- [ ] `PUT /brands/:brandId/content-types/:id` → updates fields, sets `is_default: false`
- [ ] `PUT` a default content type → confirm `is_default` flips to `false`
- [ ] `DELETE /brands/:brandId/content-types/:id` → deletes content type
- [ ] RLS: user A cannot see user B's content types
- [ ] No auth → 401

### Frontend:
- [ ] Content Types page shows NoBrandPrompt when no brand selected
- [ ] Page shows card grid with 5 default content types for a brand
- [ ] Cards show name, description, aspect ratio badge, "Default" badge
- [ ] Click card → sidebar opens with full content type data (templates loaded)
- [ ] Edit any field → save → card updates in grid
- [ ] Edit a default → "Default" badge disappears from card after save
- [ ] "＋ New Content Type" card → sidebar with empty form → create → appears in grid
- [ ] Delete content type → confirmation → removed from grid
- [ ] Aspect ratio toggle works: clicking toggles between 1:1 and 9:16
- [ ] Switching brands → page refetches content types for new brand
