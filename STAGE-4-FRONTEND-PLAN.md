# Stage 4 — Image Generation (Frontend): Implementation Plan

> **Date**: 2026-04-01  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Depends on**: Stage 4 backend ✅  
> **Estimated effort**: 0.5–1 day  

---

## What This Plan Delivers

1. Generation form: content type selector, prompt textarea, aspect ratio toggle, generate button
2. Loading state with warning text during generation (10-30s)
3. Generated images gallery with "Load more" pagination
4. Detail sidebar (same pattern as other pages) with full image, prompt, metadata, download, delete
5. Content type template preview on hover (tooltip)

---

## Confirmed Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Layout | Generation form on top, gallery below (single scrollable page) | Spec-aligned, simple |
| New image appears | In the gallery (refetch after generate) | No special preview area needed |
| Content type template preview | Tooltip on hover | Lightweight, doesn't clutter the form |
| Product reference selector | Deferred (BL-004) | Backend sends all by default |
| Image detail view | Sidebar slide-in | Consistent pattern across the app |
| Pagination | "Load more" button at bottom | Simpler than numbered pages |
| Delete | From detail sidebar only | Avoids accidental deletes from gallery |
| Download | From detail sidebar only | Clean, not cluttered |
| Gallery filter by content type | Deferred (BL-005) | Not critical for MVP |
| Loading state | Disabled button + "Generating..." + warning text | Generation takes 10-30s |

---

## Prerequisites

All already in place:

- ✅ Backend generate/list/get/delete endpoints deployed
- ✅ `AspectRatioToggle` component (Stage 3)
- ✅ `NoBrandPrompt` component
- ✅ `api()` helper for JSON requests
- ✅ Sidebar slide-in pattern established

---

## Detailed Implementation Steps

### Step 1: Content Type Selector Component

**File**: `src/components/ContentTypeSelector.tsx` (new)

A dropdown that lists the brand's content types + a "Custom (no template)" option. Shows a tooltip with the template preview on hover.

**Props**:
```ts
interface ContentTypeSelectorProps {
  brandId: string;
  token: string;
  value: string | null; // content_type_id or null for custom
  onChange: (contentTypeId: string | null, defaultAspectRatio?: string) => void;
}
```

**Behavior**:
1. On mount: fetch `GET /brands/{brandId}/content-types` (summary list)
2. Render a `<select>` dropdown with:
   - First option: "Custom (no template)" → value null
   - Then each content type: "{name}" → value is the ID
3. On change: call `onChange(id, defaultAspectRatio)` so the parent can auto-set aspect ratio
4. Tooltip on hover over the selected option (or an info icon next to the dropdown):
   - Shows the content type's `image_prompt_template` and `image_style`
   - Since the list endpoint only returns summary fields, we need to fetch the full content type when one is selected (or hovered)
   
**Simpler tooltip approach**: Fetch full content types on mount instead of summary-only. The list is small (5-10 items), so fetching all fields is fine. Then show tooltip from the already-loaded data.

Actually even simpler: use the summary endpoint but add a small info icon (ℹ️) next to the dropdown. On hover of the icon, show a tooltip with the content type's description. For the full template, the user can go to the Content Types page. This avoids an extra API call per hover.

**Revised approach**: 
- Fetch summary list on mount
- Dropdown shows name
- Small ℹ️ icon next to dropdown — hover shows description as tooltip
- When a content type is selected, auto-set aspect ratio to its `default_aspect_ratio`

---

### Step 2: Images Page — Generation Form

**File**: `src/pages/Images.tsx` (rewrite — currently a shell)

**Types**:
```ts
interface GeneratedImage {
  id: string;
  prompt: string;
  aspect_ratio: string;
  content_type_id: string | null;
  url: string;
  created_at: string;
}

interface GeneratedImageFull extends GeneratedImage {
  user_id: string;
  brand_id: string;
  full_prompt: string;
  storage_path: string;
}
```

**Generation form layout**:
```
┌──────────────────────────────────────────────────────┐
│  Pictures — {brand.name}                             │
│  Generate on-brand images using AI.                  │
│                                                      │
│  Content Type          [Custom (no template)  ▾] ℹ️  │
│                                                      │
│  Prompt *                                            │
│  ┌──────────────────────────────────────────────┐    │
│  │ Describe the image you want to generate...   │    │
│  │                                              │    │
│  │                                              │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  Aspect Ratio                                        │
│  [□ 1:1] [▯ 9:16]                                   │
│                                                      │
│  [Generate Image]                                    │
│                                                      │
│  ⚠ Generation may take up to 30 seconds.             │
│    Your brand's product images are used as            │
│    references automatically.                          │
└──────────────────────────────────────────────────────┘
```

**State**:
- `contentTypeId`: string | null (default null)
- `prompt`: string
- `aspectRatio`: "1:1" | "9:16" (default "1:1")
- `generating`: boolean
- `error`: string | null

**Generate flow**:
1. User fills in prompt, optionally selects content type and aspect ratio
2. Clicks "Generate Image"
3. Button changes to "Generating..." (disabled), warning text visible
4. Calls `POST /brands/{brandId}/images/generate` with `{ prompt, content_type_id, aspect_ratio }`
5. On success: refetch gallery, clear error, keep form filled (so user can generate another)
6. On error: show error message, re-enable button

**When content type is selected**: auto-set aspect ratio to the content type's default. User can still override.

**Warning text**: Always visible below the button. Static text, not conditional on generating state.

---

### Step 3: Images Page — Gallery Section

**File**: `src/pages/Images.tsx` (same file, below generation form)

**Gallery layout**:
```
┌──────────────────────────────────────────────────────┐
│  ─── Generated Images ───────────────────────────    │
│                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │         │ │         │ │         │               │
│  │  image  │ │  image  │ │  image  │               │
│  │         │ │         │ │         │               │
│  ├─────────┤ ├─────────┤ ├─────────┤               │
│  │ prompt  │ │ prompt  │ │ prompt  │               │
│  │ [1:1]   │ │ [9:16]  │ │ [1:1]   │               │
│  │ 2m ago  │ │ 5m ago  │ │ 1h ago  │               │
│  └─────────┘ └─────────┘ └─────────┘               │
│                                                      │
│            [Load more]                               │
└──────────────────────────────────────────────────────┘
```

**Data fetching**:
- On mount + when brand changes: `GET /brands/{brandId}/images?page=1&limit=20`
- Store images in state array
- "Load more": fetch next page, append to existing array
- After generation: reset to page 1 (refetch fresh list so new image appears first)

**Image card**:
- Thumbnail (aspect-ratio preserved, object-cover)
- Prompt text (truncated to 2 lines)
- Aspect ratio badge pill
- Relative timestamp (timeAgo helper — already used in other pages)
- Click → opens detail sidebar

**"Load more" button**:
- Visible when `images.length < total`
- Shows "Loading..." while fetching
- Appends new images to existing array

**Empty state**: "No images generated yet. Use the form above to create your first image."

---

### Step 4: Image Detail Sidebar

**File**: `src/pages/Images.tsx` (same file, sidebar component)

Same slide-in panel pattern. Opens when clicking a gallery card. Fetches full image details (`GET /brands/{brandId}/images/{id}`) to get `full_prompt`.

**Sidebar layout**:
```
┌──────────────────────────────────────┐
│  Image Details                    ×  │
├──────────────────────────────────────┤
│                                      │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  │        full image            │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  Prompt                              │
│  "A refreshing Pepsi can on a        │
│  summer beach at sunset"             │
│                                      │
│  Full Prompt (assembled)             │
│  "Content type template: Create a    │
│  professional product hero shot...   │
│  Image style: Studio lighting...     │
│  A refreshing Pepsi can on a..."     │
│                                      │
│  Aspect Ratio: 1:1                   │
│  Generated: 5 minutes ago            │
│                                      │
├──────────────────────────────────────┤
│  [Download]  [Delete]        Close   │
└──────────────────────────────────────┘
```

**Fields**:
- Full image (rendered large, max-width constrained)
- Prompt (the user's input)
- Full prompt (the assembled prompt — collapsible if long, show first 3 lines with "Show more")
- Aspect ratio
- Generated timestamp (timeAgo)

**Download button**:
- Creates an `<a>` element with `href=image.url` and `download` attribute
- Triggers browser download

**Delete button**:
- Confirm dialog: "Delete this generated image? This cannot be undone."
- On confirm: `DELETE /brands/{brandId}/images/{id}`
- Optimistic: remove from gallery array immediately, close sidebar
- Revert on failure

---

### Step 5: Wire Route (verify)

**File**: `src/App.tsx` — verify the existing route.

The route `/images` already exists and points to `Images.tsx`. No changes needed.

---

## File Change Summary

### New Files (1):
| File | Location | Purpose |
|------|----------|---------|
| `ContentTypeSelector.tsx` | `frontend/src/components/` | Content type dropdown with tooltip |

### Modified Files (1):
| File | Location | Changes |
|------|----------|---------|
| `Images.tsx` | `frontend/src/pages/` | Full rewrite: generation form + gallery + detail sidebar |

### No Changes:
| File | Reason |
|------|--------|
| `App.tsx` | Route `/images` already exists |
| `AspectRatioToggle.tsx` | Already built, reused here |
| `NoBrandPrompt.tsx` | Already built |
| `api.ts` | JSON helper works as-is |

---

## Implementation Order

```
1. ContentTypeSelector.tsx — standalone component
2. Images.tsx — generation form (top section)
3. Images.tsx — gallery section (bottom section)
4. Images.tsx — detail sidebar
5. Verify route in App.tsx
   ── DEPLOY, test in browser ──
```

---

## Testing Checklist

### Generation:
- [ ] No brand selected → NoBrandPrompt
- [ ] Generation form renders with content type selector, prompt, aspect ratio toggle
- [ ] Select content type → aspect ratio auto-updates to content type's default
- [ ] Hover ℹ️ icon → tooltip shows content type description
- [ ] Type prompt, click "Generate Image" → button disabled, shows "Generating..."
- [ ] Warning text visible: "Generation may take up to 30 seconds"
- [ ] On success: new image appears at top of gallery
- [ ] On error: error message shown, button re-enabled
- [ ] Form stays filled after generation (can generate another)
- [ ] Empty prompt → generate button disabled

### Gallery:
- [ ] Shows generated images in grid, newest first
- [ ] Each card: thumbnail, prompt (truncated), aspect ratio badge, timestamp
- [ ] Click card → detail sidebar opens
- [ ] "Load more" button visible when more images exist
- [ ] Click "Load more" → appends next page of images
- [ ] Empty state when no images generated

### Detail Sidebar:
- [ ] Shows full image, prompt, full prompt, aspect ratio, timestamp
- [ ] Full prompt collapsible if long
- [ ] Download button triggers browser download
- [ ] Delete button → confirmation → image removed from gallery, sidebar closes
- [ ] Delete is optimistic (instant removal, revert on API failure)

### Brand switching:
- [ ] Switch brand → form resets, gallery refetches for new brand
- [ ] Content type selector refetches for new brand
