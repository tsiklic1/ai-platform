# Content Type Reference Images: Implementation Plan

> **Date**: 2026-04-02  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Depends on**: Stages 1-4 ✅  
> **Estimated effort**: 0.5–1 day  

---

## What This Delivers

1. A new `content_type_images` table in Supabase for storing reference images per content type
2. Backend endpoints for uploading/deleting content type reference images (max 5 per content type)
3. Updated image generation: sends both product images AND content type reference images to Gemini, with clear labeling in the prompt so Gemini can differentiate them
4. Updated Content Types sidebar with image upload zone (same pattern as product images in Brand Identity)

---

## Why Reference Images on Content Types?

Content types define *how* content should look (e.g. "Product Showcase" = studio lighting, clean background). Currently this is text-only (prompt templates + style description). Adding reference images lets users show Gemini *examples* of the visual style they want — much more effective than describing it in words.

**Example**: A "UGC-Style" content type could have 3 reference images showing the casual phone-shot aesthetic the user wants. When generating, Gemini sees both:
- **Product images** → "this is what my product looks like" (accuracy)
- **Content type reference images** → "this is the style I want" (aesthetic)

---

## Detailed Implementation Steps

### Step 1: Database — Create `content_type_images` Table

**Table**: `content_type_images`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key, default gen_random_uuid() |
| `user_id` | uuid | FK → auth.users, for RLS |
| `content_type_id` | uuid | FK → content_types.id, CASCADE delete |
| `storage_path` | text | Path in Supabase Storage |
| `url` | text | Public URL |
| `sort_order` | integer | Ordering within the content type |
| `created_at` | timestamptz | Default now() |

**RLS Policy**: Same pattern as all other tables — `SELECT/INSERT/UPDATE/DELETE WHERE user_id = auth.uid()`

**Foreign Key**: `content_type_id` → `content_types.id` with CASCADE delete (deleting a content type removes its reference images)

**Create via Supabase REST API or SQL**:
```sql
CREATE TABLE content_type_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  content_type_id uuid NOT NULL REFERENCES content_types(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_type_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own content type images"
  ON content_type_images FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_content_type_images_user_id ON content_type_images(user_id);
CREATE INDEX idx_content_type_images_content_type_id ON content_type_images(content_type_id);
```

---

### Step 2: Backend — Add Image Endpoints to Content Types Route

**File**: `src/routes/content-types.ts` (modify)

Add two new endpoints following the same pattern as product image upload/delete in `brand-products.ts`.

#### POST `/:brandId/content-types/:id/images` — Upload reference image

```
1. Get token + user from context
2. Parse multipart body, get file
3. Validate: file exists, is image (jpeg/png/webp), <= 10MB
4. createUserClient(token)
5. Check image count: select count from content_type_images where content_type_id
   - If >= 5, return 400 "Maximum 5 reference images per content type"
6. Determine sort_order from current count
7. Generate storage path: `${user.id}/content-types/${contentTypeId}/${crypto.randomUUID()}.${ext}`
8. Upload to Supabase Storage (brand-assets bucket)
9. Get public URL
10. Insert into content_type_images: { user_id, content_type_id, storage_path, url, sort_order }
11. Return { image: data } with 201
```

#### DELETE `/:brandId/content-types/:id/images/:imageId` — Delete reference image

```
1. Get token from context
2. createUserClient(token)
3. Delete from content_type_images where id = imageId
4. Return { message: "Deleted" }
```

#### Update GET `/:brandId/content-types/:id` — Include images in full response

Modify the existing single content type fetch to include reference images via nested select:

```ts
const { data, error } = await sb
  .from("content_types")
  .select("*, content_type_images(*)")
  .eq("id", c.req.param("id"))
  .order("sort_order", { ascending: true, referencedTable: "content_type_images" })
  .single();
```

This way the full content type response includes a `content_type_images` array. The summary list endpoint stays unchanged (no images in list view).

---

### Step 3: Backend — Update Image Generation to Include Content Type Images

**File**: `src/routes/images.ts` (modify)

Currently the generate endpoint fetches product images and sends them all as `referenceImages`. We need to also fetch content type reference images when a content type is selected.

**Changes to POST `/:brandId/images/generate`**:

After fetching the content type (step 6 in current code), also fetch its reference images:

```ts
let contentTypeImages: { base64: string; mimeType: string }[] = [];

if (content_type_id && contentType) {
  const { data: ctImages } = await sb
    .from("content_type_images")
    .select("url")
    .eq("content_type_id", content_type_id)
    .order("sort_order", { ascending: true });

  if (ctImages && ctImages.length > 0) {
    // Fetch in parallel, same as product images
    const fetched = await Promise.all(
      ctImages.map(async (row) => {
        try {
          const res = await fetch(row.url);
          if (!res.ok) return null;
          const buffer = await res.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          const contentType = res.headers.get("content-type") || "image/jpeg";
          return { base64, mimeType: contentType };
        } catch { return null; }
      })
    );
    contentTypeImages = fetched.filter(Boolean);
  }
}
```

**File**: `src/lib/gemini.ts` (modify)

Update `generateImage` to accept two separate image arrays and label them in the prompt:

```ts
export async function generateImage(
  prompt: string,
  productImages: ReferenceImage[] = [],
  contentTypeImages: ReferenceImage[] = [],
  aspectRatio: "1:1" | "9:16" = "1:1"
): Promise<GeneratedImage>
```

**Updated content building**:

```ts
const content = [];

// Content type reference images (style examples) — sent first
if (contentTypeImages.length > 0) {
  content.push({
    type: "text",
    text: "The following images are STYLE REFERENCE examples. Use them to understand the visual style, composition, and aesthetic I want:"
  });
  for (const img of contentTypeImages) {
    content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
  }
}

// Product reference images — sent after style refs
if (productImages.length > 0) {
  content.push({
    type: "text",
    text: "The following images are PRODUCT REFERENCE photos. Use them to accurately reproduce the product's appearance, details, and branding:"
  });
  for (const img of productImages) {
    content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
  }
}

// Main prompt
content.push({ type: "text", text: prompt });
```

This gives Gemini clear labels:
- **"STYLE REFERENCE examples"** → content type images (how it should look)
- **"PRODUCT REFERENCE photos"** → product images (what the product looks like)
- **Main prompt** → what to generate

---

### Step 4: Frontend — Update Content Types Sidebar

**File**: `src/pages/ContentTypes.tsx` (modify)

Add an image section to the edit sidebar (same pattern as the product edit sidebar in Identity.tsx).

**Changes**:

1. Import `ImageDropZone` and `apiUpload`
2. Add `content_type_images` to the `ContentTypeFull` type
3. In the sidebar, after the existing form fields and before the footer, add:
   - "Reference Images (X/5)" label
   - Image thumbnail grid (3 columns, same as product images)
   - × delete button on hover for each image
   - `<ImageDropZone />` component
4. Image upload calls `POST /brands/:brandId/content-types/:id/images`
5. Image delete calls `DELETE /brands/:brandId/content-types/:id/images/:imageId`
6. After upload/delete, refetch the full content type to update the sidebar

**Only show image section for existing content types** (not for new ones — same pattern as products: create first, then add images).

**Layout in sidebar**:
```
┌──────────────────────────────────────┐
│  Edit Content Type                ×  │
├──────────────────────────────────────┤
│  Name *            [Product Showcase]│
│  Description       [Clean hero shots]│
│  Default Aspect Ratio  [□ 1:1][▯9:16]│
│  Image Style       [Studio lighting] │
│  Image Prompt Template               │
│  [textarea]                          │
│  Text Prompt Template                │
│  [textarea]                          │
│                                      │
│  Reference Images (2/5)              │
│  ┌─────┐ ┌─────┐                    │
│  │ img │ │ img │                    │
│  │  ×  │ │  ×  │                    │
│  └─────┘ └─────┘                    │
│  ┌─────────────────────────────┐     │
│  │  📁 Drop image here or      │     │
│  │     click to browse          │     │
│  └─────────────────────────────┘     │
│                                      │
├──────────────────────────────────────┤
│  [Save Changes] [Delete]    Cancel   │
└──────────────────────────────────────┘
```

---

## File Change Summary

### New (via SQL):
| Item | Purpose |
|------|---------|
| `content_type_images` table | Store reference images per content type |
| RLS policy | User isolation |
| Indexes | Performance |

### Modified Files (4):
| File | Location | Changes |
|------|----------|---------|
| `content-types.ts` | `backend/src/routes/` | Add image upload/delete endpoints, include images in GET /:id |
| `images.ts` | `backend/src/routes/` | Fetch content type images during generation |
| `gemini.ts` | `backend/src/lib/` | Accept two image arrays, label them differently in prompt |
| `ContentTypes.tsx` | `frontend/src/pages/` | Add image gallery + upload zone to edit sidebar |

### No Changes:
| File | Reason |
|------|--------|
| `ImageDropZone.tsx` | Already reusable, works as-is |
| `api.ts` / `apiUpload` | Already built |
| `App.tsx` | No new routes |
| `Images.tsx` | Generation page calls backend which handles everything |

---

## Implementation Order

```
1. Create content_type_images table + RLS + indexes (SQL)
2. content-types.ts — add image upload/delete endpoints + nested select
   ── TEST BACKEND with curl ──
3. gemini.ts — update to accept two image arrays with labels
4. images.ts — fetch content type images during generation
   ── DEPLOY BACKEND, test generation with curl ──
5. ContentTypes.tsx — add image section to sidebar
   ── DEPLOY FRONTEND, test in browser ──
```

---

## Testing Checklist

### Backend:
- [ ] `POST /brands/:brandId/content-types/:id/images` with valid image → 201
- [ ] Upload 6th image → 400 "Maximum 5 reference images"
- [ ] Invalid file type → 400
- [ ] `DELETE .../images/:imageId` → deletes record
- [ ] `GET /brands/:brandId/content-types/:id` → includes `content_type_images` array
- [ ] Delete content type → cascades to content_type_images

### Generation:
- [ ] Generate with content type that has reference images → images included in Gemini request
- [ ] Generate with content type that has NO reference images → works as before
- [ ] Generate without content type → works as before (no content type images)
- [ ] Verify prompt labels: "STYLE REFERENCE" for content type images, "PRODUCT REFERENCE" for product images

### Frontend:
- [ ] Edit content type sidebar shows "Reference Images (X/5)" section
- [ ] Upload image → appears in gallery immediately
- [ ] Delete image → disappears immediately (optimistic)
- [ ] Image count updates correctly
- [ ] Drop zone disabled at 5/5
- [ ] New content type sidebar shows "Create first, then add images" message
- [ ] Image upload/delete don't interfere with metadata save
