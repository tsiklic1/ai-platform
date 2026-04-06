# Stage 4 — Image Generation (Backend Only): Implementation Plan

> **Date**: 2026-04-01  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Depends on**: Stages 1-3 ✅  
> **Scope**: Backend only — frontend plan will follow separately  
> **Estimated effort**: 0.5–1 day  

---

## What This Plan Delivers

1. Gemini integration utility (`src/lib/gemini.ts`)
2. Prompt assembly function
3. Image generation endpoint (POST)
4. Generated images CRUD (list, get, delete)
5. Pagination on the list endpoint
6. Storage of generated images in Supabase

---

## Confirmed Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Gemini model | Nano Banana 2 (`gemini-3.1-flash-image-preview`) | Accepts reference images as input, free tier for dev, spec-aligned |
| SDK | `@google/genai` | Official Google SDK, supports image generation natively |
| API key | Platform-level, env var `GEMINI_API_KEY` | Single key for all users, simplest for MVP |
| Prompt storage | Store both `prompt` (user input) and `full_prompt` (assembled) | User-facing display + debugging/reproducibility |
| Output format | Save whatever Gemini returns (typically PNG) | No conversion needed, model returns mime_type |
| Rate limiting | Deferred (BL-004) | Not going to production yet |
| Request timeout | Let it hang, frontend will show loading warning | Simplest approach, generation takes 10-30s |
| Product images | Send all product images for the brand | Max 25 images per brand, manageable payload |

---

## Prerequisites

- ✅ `generated_images` table deployed in Supabase with RLS
- ✅ `content_types` table with CRUD (Stage 3)
- ✅ `brand_products` + `brand_product_images` tables (Stage 2)
- ✅ `brand-assets` storage bucket (public)
- ⬜ `@google/genai` npm package (install in Step 1)
- ⬜ `GEMINI_API_KEY` env var on Railway (you'll provide the key)

---

## Detailed Implementation Steps

### Step 1: Install @google/genai SDK

```bash
cd ai-platform-backend
bun add @google/genai
```

No other dependencies needed.

---

### Step 2: Gemini Integration Utility

**File**: `src/lib/gemini.ts` (new)

A thin wrapper around the Google GenAI SDK for image generation.

```ts
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-image-preview";
```

**Exports**:

#### `generateImage(prompt, referenceImages, aspectRatio)`

```
Parameters:
  - prompt: string — the full assembled prompt text
  - referenceImages: { data: string, mimeType: string }[] — base64-encoded product images
  - aspectRatio: "1:1" | "9:16"

Flow:
  1. Create GoogleGenAI client with API key
  2. Build contents array:
     - Text part: the prompt
     - Image parts: each reference image as inlineData { mimeType, data: base64 }
  3. Call ai.models.generateContent({
       model: MODEL,
       contents: contentsArray,
       config: { responseModalities: ["image"] }
     })
  4. Extract image from response:
     - Loop through response.candidates[0].content.parts
     - Find the part where inlineData exists and mimeType starts with "image/"
     - Return { data: base64String, mimeType: string }
  5. If no image in response, throw an error

Returns:
  { data: string (base64), mimeType: string }
```

**Error handling**:
- If `GEMINI_API_KEY` is not set, throw immediately with clear message
- Wrap the API call in try/catch, log errors, rethrow with user-friendly message
- Handle the case where Gemini returns text instead of an image (safety filters, refusal)

---

### Step 3: Prompt Assembly Function

**File**: `src/lib/gemini.ts` (same file, exported function)

#### `assemblePrompt(userPrompt, contentType?)`

```
Parameters:
  - userPrompt: string — what the user typed
  - contentType: { image_prompt_template, image_style } | null — from content_types table

Flow:
  1. Start with empty parts array
  2. If contentType provided and has image_prompt_template:
     - Add: "Content type template: {image_prompt_template}"
  3. If contentType provided and has image_style:
     - Add: "Image style: {image_style}"
  4. Add: the user's prompt
  5. Join with double newline

Returns:
  string — the full assembled prompt
```

This is deliberately simple — just string concatenation. The Gemini model is good at understanding structured prompts with labeled sections.

---

### Step 4: Images Route — Generate Endpoint

**File**: `src/routes/images.ts` (new)

All endpoints use `authMiddleware` and `createUserClient(token)`.

#### POST `/:brandId/images/generate` — Generate image

This is the core endpoint. It:
1. Validates input
2. Fetches content type (if selected)
3. Fetches product reference images
4. Assembles the prompt
5. Calls Gemini
6. Saves the result to Supabase Storage
7. Inserts a DB record
8. Returns the image

```
1. Get token + user from context
2. Parse body: { prompt, content_type_id?, aspect_ratio?, product_ids? }
3. Validate: prompt required, prompt.length > 0
4. Validate: if aspect_ratio provided, must be "1:1" or "9:16"
5. createUserClient(token)

6. If content_type_id provided:
   - Fetch content type: select * from content_types where id = content_type_id, .single()
   - If not found, return 404
   - If aspect_ratio not provided by user, use content type's default_aspect_ratio

7. Default aspect_ratio to "1:1" if still not set

8. Fetch product reference images:
   - Query brand_product_images for this brand:
     select url from brand_product_images
     inner join brand_products on brand_product_images.product_id = brand_products.id
     where brand_products.brand_id = brandId
   
   Actually, simpler approach since we have user_id RLS:
   - First get all product IDs for this brand:
     select id from brand_products where brand_id = brandId
   - Then get all images:
     select url from brand_product_images where product_id in (productIds)
   
   Or use nested select:
     select brand_product_images(url) from brand_products where brand_id = brandId

9. For each product image URL:
   - Fetch the image binary from the public URL
   - Convert to base64
   - Collect as { data: base64, mimeType: "image/jpeg" } (detect from URL extension)

10. Assemble prompt: assemblePrompt(body.prompt, contentType || null)
    - Store as full_prompt

11. Call generateImage(full_prompt, referenceImages, aspect_ratio)
    - This may take 10-30 seconds
    - If it fails, return 500 with error message

12. Save generated image to Supabase Storage:
    - Determine extension from response mimeType (image/png → png, image/jpeg → jpg)
    - Path: `${user.id}/generated/${brandId}/${Date.now()}_${crypto.randomUUID()}.${ext}`
    - Upload the base64-decoded buffer

13. Get public URL for the uploaded image

14. Insert into generated_images: {
      user_id, brand_id: brandId,
      content_type_id: body.content_type_id || null,
      prompt: body.prompt,
      full_prompt: full_prompt,
      aspect_ratio: aspect_ratio,
      storage_path: storagePath,
      url: publicUrl
    }

15. Return { image: data } with 201
```

**Important considerations**:
- Step 9 (fetching product images) adds latency. For brands with 25 images, this could be significant. We fetch them in parallel with `Promise.all`.
- The total request time could be 15-40 seconds. This is expected — the frontend will warn the user.
- If the brand has 0 product images, we still proceed — just no reference images sent to Gemini.

---

### Step 5: Images Route — List, Get, Delete

**File**: `src/routes/images.ts` (same file)

#### GET `/:brandId/images` — List generated images (paginated)

```
1. Get token from context
2. Parse query params: page (default 1), limit (default 20, max 50)
3. createUserClient(token)
4. Query with pagination:
   - Calculate offset: (page - 1) * limit
   - select id, prompt, aspect_ratio, content_type_id, url, created_at
     from generated_images
     where brand_id = brandId
     order by created_at DESC
     range(offset, offset + limit - 1)
   - Also get total count: select count with { count: "exact", head: true }
5. Return { images: data, total: count, page: page, limit: limit }
```

#### GET `/:brandId/images/:id` — Get single generated image

```
1. Get token from context
2. createUserClient(token)
3. Query: select * from generated_images where id = param, .single()
4. Return { image: data }
```

Returns all fields including `full_prompt` — useful for seeing how the prompt was assembled.

#### DELETE `/:brandId/images/:id` — Delete generated image

```
1. Get token from context
2. createUserClient(token)
3. Delete from generated_images where id = param
4. NOTE: Storage cleanup deferred (BL-001)
5. Return { message: "Deleted" }
```

---

### Step 6: Register Route

**File**: `src/index.ts` (modify)

```ts
import images from "./routes/images";

app.route("/brands", images);
```

Same mounting pattern as other brand-scoped routes.

---

## File Change Summary

### New Files (2):
| File | Location | Purpose |
|------|----------|---------|
| `gemini.ts` | `backend/src/lib/` | Gemini SDK wrapper + prompt assembly |
| `images.ts` | `backend/src/routes/` | Generate + list + get + delete endpoints |

### Modified Files (2):
| File | Location | Changes |
|------|----------|---------|
| `package.json` | `backend/` | Add `@google/genai` dependency |
| `index.ts` | `backend/src/` | Register images route |

---

## Implementation Order

```
1. bun add @google/genai
2. gemini.ts (SDK wrapper + prompt assembly)
3. images.ts (all endpoints)
4. index.ts (register route)
5. Set GEMINI_API_KEY env var on Railway
   ── DEPLOY ──
6. Test with curl
```

---

## Testing Checklist

### Prerequisites:
- [ ] `GEMINI_API_KEY` env var set on Railway
- [ ] At least one brand with products and product images uploaded

### Generation (curl):
- [ ] `POST /brands/:brandId/images/generate` with prompt only → generates image, returns URL
- [ ] `POST /brands/:brandId/images/generate` with prompt + content_type_id → uses template in assembly
- [ ] `POST /brands/:brandId/images/generate` with prompt + aspect_ratio → respects ratio
- [ ] `POST /brands/:brandId/images/generate` without prompt → 400
- [ ] `POST /brands/:brandId/images/generate` with invalid aspect_ratio → 400
- [ ] `POST /brands/:brandId/images/generate` with invalid content_type_id → 404
- [ ] Generated image is accessible via public URL
- [ ] `full_prompt` in DB contains assembled template + style + user prompt
- [ ] `prompt` in DB contains only the user's input

### CRUD (curl):
- [ ] `GET /brands/:brandId/images` → paginated list, newest first
- [ ] `GET /brands/:brandId/images?page=1&limit=5` → respects pagination params
- [ ] `GET /brands/:brandId/images/:id` → returns full image with full_prompt
- [ ] `DELETE /brands/:brandId/images/:id` → deletes record
- [ ] No auth → 401
- [ ] RLS: user A cannot see user B's generated images

### Edge cases:
- [ ] Generate with no product images in brand → still works (text-only prompt)
- [ ] Generate with content type that has empty templates → works, just uses user prompt
