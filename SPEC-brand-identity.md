# Brand Identity System — Full Specification

> **Status**: DRAFT  
> **Author**: Amy  
> **Date**: 2026-03-30  
> **Target**: End of week (2026-04-03)  
> **Stack**: Hono + Bun + Supabase (backend) / React + Vite + Tailwind (frontend)  
> **AI Provider**: Google Gemini 3.1 (Nano Banana 2 or Pro)

---

## Table of Contents

1. [Overview](#overview)
2. [Data Model](#data-model)
3. [Stage 1 — Brands CRUD + Switcher ✅](#stage-1--brands-crud--switcher)
4. [Stage 2 — Brand Identity Page (Product Assets) ✅](#stage-2--brand-identity-page-product-assets)
5. [Stage 3 — Content Types Page ✅](#stage-3--content-types-page)
6. [Stage 4 — Image Generation Page](#stage-4--image-generation-page)
7. [Supabase Setup Summary](#supabase-setup-summary)
8. [Open Questions](#open-questions)

---

## Overview

The Brand Identity system lets users define brands, upload product reference images, configure content types (post templates), and generate on-brand images using AI. Everything is scoped per-brand — switching brands changes the context for all downstream features.

### Core Flow
```
User creates Brand → Uploads product images → Configures content types → Generates images
                                                        ↓
                                              Skills get injected with
                                              brand assets + content type
                                              instructions at generation time
```

### Key Constraints
- Max **5 brands** per user (soft limit, configurable)
- Max **5 images per product**, **25 images per brand**
- Image output sizes: **1:1** (square) and **9:16** (vertical/stories)
- Product images stored in **Supabase Storage**
- Image URLs injected directly into Gemini prompts as visual references
- Content types are **per-brand** (not per-user)
- Users get **default content type templates** on brand creation, which they can delete/modify/extend

---

## Data Model

### RLS Strategy: Denormalized `user_id`

> **Decision:** Every table includes a direct `user_id` column, even child tables that already have a FK to `brands`.
>
> **Why:** Supabase RLS policies that use joins (e.g., checking `brand_products.brand_id → brands.user_id`) are significantly slower and more complex than a simple `user_id = auth.uid()` check. By denormalizing `user_id` onto every table, all RLS policies become identical single-column checks — fast, simple, and consistent. The trade-off is slight data redundancy, but the performance and maintainability gains are well worth it.

### Storage Cleanup on Delete

> **Decision:** When a brand or product is deleted, the backend must also delete associated files from Supabase Storage.
>
> **Why:** Database CASCADE deletes only remove rows — they don't touch Supabase Storage. Without explicit cleanup, orphaned files accumulate in the `brand-assets` bucket. Delete logic in the backend must: (1) list storage files for the entity, (2) delete them from storage, (3) then delete the database row.

### Supabase Tables

#### `brands`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Default `gen_random_uuid()` |
| `user_id` | uuid (FK → auth.users) | RLS: user can only see own brands |
| `name` | text | Required. e.g., "Pepsi", "Nike" |
| `description` | text | Optional. Brief brand description |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

**RLS Policy**: `user_id = auth.uid()` on all operations.

#### `brand_products`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Default `gen_random_uuid()` |
| `user_id` | uuid (FK → auth.users) | Denormalized for RLS |
| `brand_id` | uuid (FK → brands) | CASCADE delete |
| `name` | text | Required. e.g., "Pepsi Can 330ml" |
| `description` | text | Optional. Product details |
| `category` | text | Optional. e.g., "Beverages", "Electronics" |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

**RLS Policy**: `user_id = auth.uid()` on all operations.

#### `brand_product_images`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Default `gen_random_uuid()` |
| `user_id` | uuid (FK → auth.users) | Denormalized for RLS |
| `product_id` | uuid (FK → brand_products) | CASCADE delete |
| `storage_path` | text | Path in Supabase Storage bucket |
| `url` | text | Public or signed URL for the image |
| `sort_order` | int | For ordering within a product (0-4) |
| `created_at` | timestamptz | Default `now()` |

**Limit enforcement**: Application-level check — max 5 per product. Additional check: count all images across products for the brand ≤ 25.

**RLS Policy**: `user_id = auth.uid()` on all operations.

#### `content_types`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Default `gen_random_uuid()` |
| `user_id` | uuid (FK → auth.users) | Denormalized for RLS |
| `brand_id` | uuid (FK → brands) | CASCADE delete |
| `name` | text | Required. e.g., "Product Showcase" |
| `description` | text | What this content type is for |
| `text_prompt_template` | text | Template/instructions for text generation |
| `image_prompt_template` | text | Template/instructions for image generation |
| `image_style` | text | Style guidance (e.g., "clean product photography on white background") |
| `default_aspect_ratio` | text | `"1:1"` or `"9:16"`. Default `"1:1"` |
| `is_default` | boolean | `true` if auto-created with brand. User can delete these. |
| `sort_order` | int | Display ordering |
| `created_at` | timestamptz | Default `now()` |
| `updated_at` | timestamptz | Default `now()` |

**RLS Policy**: `user_id = auth.uid()` on all operations.

#### `generated_images`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Default `gen_random_uuid()` |
| `user_id` | uuid (FK → auth.users) | Denormalized for RLS |
| `brand_id` | uuid (FK → brands) | CASCADE delete |
| `content_type_id` | uuid (FK → content_types) | Nullable — can generate without a content type. **SET NULL on delete** — keeps the generated image even if the content type is later removed. |
| `prompt` | text | The user's prompt |
| `full_prompt` | text | The assembled prompt sent to Gemini (for debugging/reuse) |
| `aspect_ratio` | text | `"1:1"` or `"9:16"` |
| `storage_path` | text | Path in Supabase Storage |
| `url` | text | Public/signed URL |
| `created_at` | timestamptz | Default `now()` |

**RLS Policy**: `user_id = auth.uid()` on all operations.

### Supabase Storage

**Bucket**: `brand-assets` (private, RLS-scoped)

**Path structure**:
```
{user_id}/products/{product_id}/{filename}
{user_id}/generated/{brand_id}/{timestamp}_{hash}.png
```

---

## Stage 1 — Brands CRUD + Switcher ✅ COMPLETED (2026-03-31)

**Goal**: Users can create, edit, and delete brands. A global brand switcher appears in the UI. All downstream pages filter by the selected brand.

### Backend

**New file**: `src/routes/brands.ts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/brands` | List all brands for the authenticated user |
| `POST` | `/brands` | Create a new brand (name, description). Triggers default content type seeding. |
| `GET` | `/brands/:id` | Get single brand |
| `PUT` | `/brands/:id` | Update brand (name, description) |
| `DELETE` | `/brands/:id` | Delete brand (cascades to products, images, content types, generated images) |

**Validation**:
- `name` required, max 100 chars
- Max 5 brands per user (check count before insert)

**On brand creation** — auto-seed default content types:
1. **Product Showcase** — Clean product photography, hero shots
2. **Lifestyle / In-Use** — Product in real-world context, people using it
3. **Behind the Scenes** — Process, making-of, workspace
4. **Promo / Sale** — Promotional material, discounts, urgency
5. **UGC-Style** — User-generated content aesthetic, casual, authentic

Each default gets pre-filled `text_prompt_template`, `image_prompt_template`, `image_style`, and sensible `default_aspect_ratio`. These are fully editable/deletable by the user.

**Register route** in `src/index.ts`:
```ts
import brands from "./routes/brands";
app.route("/brands", brands);
```

### Frontend

**Brand Context** — new `src/context/BrandContext.tsx`:
- Fetches brands on auth
- Stores `selectedBrandId` in `localStorage` for persistence
- Provides `brands`, `selectedBrand`, `setSelectedBrand`, `refreshBrands`
- Wraps the app inside `<BrandProvider>`

**Brand Switcher** — dropdown component in the top-left of the sidebar or top bar:
- Shows brand name + chevron
- Dropdown lists all brands
- "＋ New Brand" option at the bottom opens a creation modal
- Selecting a brand updates context → all pages re-fetch with new brand scope

**Brand Management Modal/Page**:
- Simple modal triggered from the switcher (gear icon or "Manage Brands")
- Edit name/description, delete brand (with confirmation)
- Keep it lightweight — no need for a dedicated page

**Sidebar update**: Brand Identity, Content Types, and Images links should be slightly dimmed/disabled if no brand is selected.

### Deliverables
- [ ] Supabase: `brands` table + RLS policies
- [ ] Backend: `brands.ts` route with CRUD + validation + content type seeding
- [ ] Frontend: `BrandContext` provider
- [ ] Frontend: Brand switcher dropdown in sidebar
- [ ] Frontend: Brand create/edit/delete modal

---

## Stage 2 — Brand Identity Page (Product Assets) ✅ COMPLETED (2026-03-31)

**Goal**: Users upload product reference images per brand. These images are the core brand assets that get injected into AI generation later.

### Backend

**New file**: `src/routes/brand-products.ts`

All endpoints scoped to a brand: `/brands/:brandId/products`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/brands/:brandId/products` | List products with their images |
| `POST` | `/brands/:brandId/products` | Create product (name, description, category) |
| `PUT` | `/brands/:brandId/products/:id` | Update product metadata |
| `DELETE` | `/brands/:brandId/products/:id` | Delete product + its images from storage |

**Image sub-routes**: `/brands/:brandId/products/:productId/images`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `.../images` | Upload image (multipart). Validates limits (5/product, 25/brand). Stores in Supabase Storage. |
| `DELETE` | `.../images/:imageId` | Delete single image from storage + DB |
| `PUT` | `.../images/reorder` | Update `sort_order` for images within a product |

**Upload flow**:
1. Frontend sends `multipart/form-data` with the image file
2. Backend validates:
   - File is an image (jpeg, png, webp)
   - Max file size: 10MB
   - Product has < 5 images
   - Brand has < 25 total images
3. Upload to Supabase Storage at `{user_id}/products/{product_id}/{uuid}.{ext}`
4. Get public URL
5. Insert row in `brand_product_images`
6. Return the image record

**Note**: The Hono backend currently only handles JSON (`Content-Type: application/json`). We need to add multipart form handling. Hono supports this natively via `c.req.parseBody()`.

### Frontend — Identity Page (`/identity`)

**Layout**: Two-panel or card-based layout

**Left/Top section — Product list**:
- Cards showing each product: name, category, thumbnail of first image
- "＋ Add Product" button
- Click product → expands or opens detail panel

**Product Detail Panel**:
- Edit name, description, category (inline or modal)
- **Image gallery grid**: shows uploaded images (up to 5)
- **Upload zone**: drag-and-drop or click-to-upload area
- Image count indicator: "3/5 images"
- Brand-level count: "12/25 brand images used"
- Delete image (× button on hover with confirmation)
- Drag to reorder images (nice-to-have, not MVP-critical)

**Empty state**: "Upload product photos to establish your brand's visual identity. These images will be used as references when generating content."

**API helper update** — `src/lib/api.ts` needs a variant for multipart uploads (current helper only sends JSON):
```ts
export async function apiUpload<T>(path: string, formData: FormData, token: string): Promise<T>
```

### Deliverables
- [ ] Supabase: `brand_products` + `brand_product_images` tables + RLS
- [ ] Supabase: `brand-assets` storage bucket + policies
- [ ] Backend: `brand-products.ts` route (CRUD + image upload/delete)
- [ ] Frontend: Identity page with product list + image upload UI
- [ ] Frontend: `apiUpload` helper for multipart

---

## Stage 3 — Content Types Page ✅ COMPLETED (2026-04-01)

**Goal**: Users manage post type templates per brand. Each content type defines how text and images should be generated — essentially a mini-skill that references the brand's product images.

### Backend

**New file**: `src/routes/content-types.ts`

All endpoints scoped to a brand: `/brands/:brandId/content-types`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/brands/:brandId/content-types` | List content types for a brand (summary: id, name, description, default_aspect_ratio, is_default) |
| `GET` | `/brands/:brandId/content-types/:id` | Get full content type (includes templates) |
| `POST` | `/brands/:brandId/content-types` | Create custom content type |
| `PUT` | `/brands/:brandId/content-types/:id` | Update content type |
| `DELETE` | `/brands/:brandId/content-types/:id` | Delete content type |
| `POST` | `/brands/:brandId/content-types/reset-defaults` | Re-seed the 5 default types (optional, nice-to-have) |

**Content type fields (create/update)**:
```json
{
  "name": "Product Showcase",
  "description": "Clean product hero shots on minimal backgrounds",
  "text_prompt_template": "Write a social media caption for a product showcase post...",
  "image_prompt_template": "Generate a professional product photograph...",
  "image_style": "Studio lighting, clean white/gradient background, sharp focus on product",
  "default_aspect_ratio": "1:1"
}
```

**Default content type seeds** (created on brand creation in Stage 1):

| Name | Aspect Ratio | Image Style |
|------|-------------|-------------|
| Product Showcase | 1:1 | Studio lighting, clean background, hero shot |
| Lifestyle / In-Use | 9:16 | Natural setting, people interacting with product |
| Behind the Scenes | 9:16 | Casual, workspace, raw/authentic feel |
| Promo / Sale | 1:1 | Bold typography space, vibrant colors, urgency |
| UGC-Style | 9:16 | Casual phone-shot aesthetic, natural lighting, relatable |

### Frontend — Content Types Page (`/contentTypes`)

**Layout**: Card grid (similar to Skills page)

**Card display**:
- Name, description preview, default aspect ratio badge (square icon / vertical icon)
- "Default" badge if `is_default`
- Click → opens sidebar panel (same pattern as Skills page)

**Sidebar/Panel — Edit content type**:
- Name field
- Description field
- Text prompt template (textarea, markdown)
- Image prompt template (textarea, markdown)
- Image style (text input)
- Default aspect ratio (toggle: 1:1 / 9:16)
- Save / Delete / Cancel buttons

**"＋ New Content Type"** card at the end of the grid.

**Empty state**: Should never happen (defaults are seeded), but just in case: "No content types yet. Create one to define how your brand's content should look."

### How Content Types Feed Into Generation (conceptual — implemented in Stage 4)

When a user generates an image:
1. They select a content type (or "Custom")
2. The system assembles the full prompt:
   - Content type's `image_prompt_template` as the system/style instruction
   - Content type's `image_style` as additional style guidance
   - User's custom prompt as the specific request
   - Brand's product images injected as visual references
3. This assembled prompt goes to Gemini

### Deliverables
- [ ] Supabase: `content_types` table + RLS
- [ ] Backend: `content-types.ts` route (CRUD)
- [ ] Backend: Default seeding logic (called from brand creation in Stage 1)
- [ ] Frontend: Content Types page with card grid + edit sidebar
- [ ] Frontend: Aspect ratio selector component (reusable for Stage 4)

---

## Stage 4 — Image Generation Page

**Goal**: Users generate on-brand images using Gemini, with product references and content type templates auto-applied. Generated images are saved and browsable in a gallery.

### Backend

**New file**: `src/routes/images.ts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/brands/:brandId/images/generate` | Generate image via Gemini |
| `GET` | `/brands/:brandId/images` | List generated images (paginated, newest first) |
| `GET` | `/brands/:brandId/images/:id` | Get single generated image (with prompt details) |
| `DELETE` | `/brands/:brandId/images/:id` | Delete generated image from storage + DB |

**Generation endpoint — `POST /brands/:brandId/images/generate`**

Request body:
```json
{
  "prompt": "A refreshing Pepsi can on a summer beach at sunset",
  "content_type_id": "uuid-or-null",
  "aspect_ratio": "1:1",
  "product_ids": ["uuid1", "uuid2"]
}
```

- `content_type_id` — optional. If provided, the content type's templates and style are prepended to the prompt.
- `aspect_ratio` — `"1:1"` or `"9:16"`. If content type is selected and user doesn't override, use content type's default.
- `product_ids` — optional array. Which products' images to include as visual references. If empty, all brand products are included.

**Prompt assembly logic**:
```
1. Start with content type's image_prompt_template (if selected)
2. Append content type's image_style (if selected)
3. Append user's prompt
4. Attach product reference images (actual image URLs/data sent to Gemini as image parts)
5. Send to Gemini with appropriate aspect ratio config
```

**Gemini integration**:
- Use Google AI SDK (`@google/genai` or REST API)
- Model: `gemini-3.1-pro` or `gemini-3.1-nano-banana-2` (configurable, probably env var)
- Image generation via Gemini's image generation capabilities
- Response: save generated image to Supabase Storage at `{user_id}/generated/{brand_id}/{timestamp}_{hash}.png`
- Insert row in `generated_images` table
- Return the image record with URL

**Pagination** for `GET /brands/:brandId/images`:
- Query params: `?page=1&limit=20`
- Returns: `{ images: [...], total: number, page: number }`

### Frontend — Images Page (`/images`)

**Layout**: Split — generation tool on top, gallery below

**Generation Section (top)**:
- **Content type selector**: dropdown of brand's content types + "Custom (no template)" option
  - When selected, shows a preview of the template being used (collapsed, expandable)
  - Auto-sets aspect ratio to the content type's default
- **Prompt input**: large textarea for the user's specific prompt
- **Aspect ratio toggle**: 1:1 / 9:16 (visual toggle with preview of the ratio)
- **Product reference selector** (optional, nice-to-have): checkboxes to pick which products to include. Default: all.
- **"Generate" button**: triggers generation, shows loading spinner
- **Generated image preview**: shows the result immediately after generation with options to:
  - Download
  - Delete
  - Generate another with same settings

**Gallery Section (below)**:
- Grid of generated images (masonry or uniform grid)
- Each image card shows:
  - Thumbnail
  - Prompt (truncated)
  - Content type badge
  - Aspect ratio badge
  - Date
- Click → lightbox or detail view showing full image + full prompt + metadata
- Delete option
- **Infinite scroll or pagination** (start with pagination, simpler)
- **Filter by content type** (optional, nice-to-have)

**Loading state during generation**: skeleton/shimmer in the preview area + disabled generate button with spinner

### Deliverables
- [ ] Supabase: `generated_images` table + RLS
- [ ] Backend: Gemini integration utility (`src/lib/gemini.ts`)
- [ ] Backend: `images.ts` route (generate + list + get + delete)
- [ ] Backend: Prompt assembly logic
- [ ] Frontend: Images page — generation UI + gallery
- [ ] Frontend: Content type selector component
- [ ] Frontend: Aspect ratio toggle component
- [ ] Frontend: Image lightbox/detail view

---

## Supabase Setup Summary

### Tables to Create
1. `brands` — Stage 1
2. `brand_products` — Stage 2
3. `brand_product_images` — Stage 2
4. `content_types` — Stage 1 (table) + Stage 3 (full CRUD)
5. `generated_images` — Stage 4

### Storage
- Bucket: `brand-assets` (private) — Stage 2

### RLS Policies (all tables)
- Every table has a direct `user_id` column (denormalized — see Data Model section for rationale)
- All policies: `SELECT/INSERT/UPDATE/DELETE WHERE user_id = auth.uid()`
- No join-based RLS — simple, fast, consistent

### Foreign Key Behaviors
- `brand_products.brand_id` → `brands.id` CASCADE delete
- `brand_product_images.product_id` → `brand_products.id` CASCADE delete
- `content_types.brand_id` → `brands.id` CASCADE delete
- `generated_images.brand_id` → `brands.id` CASCADE delete
- `generated_images.content_type_id` → `content_types.id` **SET NULL** on delete

### Storage Cleanup
- Brand delete: delete all files under `{user_id}/products/*` and `{user_id}/generated/{brand_id}/*` before DB delete
- Product delete: delete all files under `{user_id}/products/{product_id}/*` before DB delete
- Single image delete: delete the specific file from storage before DB delete

### Indexes
- `brands.user_id`
- `brand_products.user_id`, `brand_products.brand_id`
- `brand_product_images.user_id`, `brand_product_images.product_id`
- `content_types.user_id`, `content_types.brand_id`
- `generated_images.user_id`, `generated_images.brand_id`
- `generated_images.created_at DESC` (for gallery pagination)

---

## Implementation Order

| Stage | Scope | Estimated Effort | Dependencies |
|-------|-------|-----------------|--------------|
| **1** | Brands CRUD + Switcher + Default content type seeding | 1 day | None |
| **2** | Brand Identity page (products + image upload) | 1–1.5 days | Stage 1 |
| **3** | Content Types page (CRUD + edit UI) | 0.5–1 day | Stage 1 |
| **4** | Image Generation page (Gemini + gallery) | 1.5–2 days | Stages 1–3 |

**Total**: ~4–5 days, fits within the week.

Stages 2 and 3 can be parallelized if two devs are available — they only depend on Stage 1, not each other.

---

## Open Questions

1. **Gemini API key management** — Per-user API keys or platform-level key? (Probably platform-level for now)
2. **Image generation rate limiting** — How many generations per user/day? (Need to prevent abuse / cost overruns)
3. **Generated image retention** — Keep forever or auto-delete after X days?
4. **Content type templates** — Should we draft the full default prompt templates now, or iterate on them once the UI is live?
5. **Skills injection** — The spec covers how content types work independently. The separate skills system (existing `/skills` CRUD) will reference brand assets manually for now. Should we document the planned integration, or keep that for a future spec?
6. **Text generation** — The Captions page exists as a shell. Is text generation in scope for this week, or images only? Content types already define `text_prompt_template` so the data model is ready.

---

## Backlog

Non-priority items to discuss once core stages are complete.

### BL-001: Storage cleanup on brand/product/image delete — ✅ DONE (2026-04-07)

**Status**: Shipped. Every DELETE endpoint now removes associated storage files from the `brand-assets` bucket before (or alongside) the DB delete. All paths routed through a single helper at `ai-platform-backend/src/lib/storage-cleanup.ts` with log-and-proceed error handling.

**Wired endpoints**:
- `DELETE /brands/:id` — `collectBrandStoragePaths` (product images + content type images + generated images + generated frames, all in parallel)
- `DELETE /brands/:brandId/products/:id` — `collectProductStoragePaths`
- `DELETE /brands/:brandId/products/:productId/images/:imageId` — single path fetch
- `DELETE /brands/:brandId/content-types/:id` — `collectContentTypeStoragePaths`
- `DELETE /brands/:brandId/content-types/:id/images/:imageId` — single path fetch
- `DELETE /brands/:brandId/images/:id` — single path fetch
- `DELETE /brands/:brandId/frames/:id` — refactored to use `collectFrameSetStoragePaths`

**Out of scope (intentionally)**: Backfill of existing orphaned files. Only new deletes from now on are cleaned up.

---

### BL-002: Reset default content types endpoint — ✅ DONE (2026-04-08)

**Status**: Shipped. `POST /brands/:brandId/content-types/reset-defaults` wipes every content type for the brand (default + custom, cascading to `content_type_images` DB rows) and re-seeds the 5 starter templates from `getDefaultContentTypes()`. Storage files for CT reference images are cleaned up before the DB delete. Route registered before `/:id` handlers so "reset-defaults" is never matched as an `:id` param. Frontend Content Types page has a "Reset to defaults" button in the header gated by `window.confirm()`.

---

### BL-002 (original spec, kept for history): Reset default content types endpoint

**Description**: Endpoint `POST /brands/:brandId/content-types/reset-defaults` that re-seeds the 5 default content type templates for a brand. Useful if a user deletes or heavily modifies defaults and wants to start fresh.

**Behavior**: Deletes ALL existing content types for the brand (both default and custom), then re-inserts the 5 default templates from `getDefaultContentTypes()`. This is destructive — must include a confirmation step on the frontend.

**Route conflict note**: This path could conflict with `/:brandId/content-types/:id` since Hono might match `reset-defaults` as an `:id` param. The `reset-defaults` route must be registered BEFORE the `/:id` route in the router.

**Deferred because**: Not needed for MVP. Users can manually recreate content types. The destructive nature (wipes custom types too) needs careful UX design.

---

### BL-003: Group sidebar navigation into logical sections — ✅ DONE (2026-04-08)

**Status**: Shipped. `ai-platform-frontend/src/components/Sidebar.tsx` now renders two labeled groups: **Brand Setup** (Manage Brands, Brand Identity, Content Types, Skills) and **Generated Content** (Pictures, Captions, Video Frames, Videos). Tasks link / "Other" section skipped — no Tasks link exists in the sidebar today.

---

### BL-003 (original spec, kept for history): Group sidebar navigation into logical sections

**Description**: The sidebar currently lists all nav links in a flat list: Skills, Tasks, Content Types, Pictures, Text, Video Frames, Videos, Brand Identity, Manage Brands. These should be grouped into two visible sections with labels:

**"Brand Setup"** — pages where the user defines/inputs brand data:
- Brand Identity (products + images)
- Content Types (prompt templates)
- Manage Brands
- Skills

**"Generated Content"** — pages showing AI-generated output from the APIs:
- Pictures
- Text
- Video Frames
- Videos

**"Other"** (or ungrouped):
- Tasks

Each group should have a small muted label (e.g. `text-xs text-gray-500 uppercase tracking-wider`) above its links, with a bit of spacing between groups. The exact grouping and naming can be adjusted during implementation.

**Current sidebar links**: Skills, Tasks, Content Types, Pictures, Text, Video Frames, Videos, Brand Identity, Manage Brands.

---

### BL-004: Product reference selector for image generation

**Description**: When generating an image, the user currently has no way to pick which products' reference images get sent to Gemini — all product images for the brand are sent automatically. A product reference selector would let users choose specific products to include, which could improve generation quality when a brand has multiple distinct products.

**UI**: Checkboxes or multi-select showing the brand's products. Default: all selected. Unchecking a product excludes its images from the generation request.

**Backend**: Already supports `product_ids` array in the generate request body. No backend changes needed.

**Deferred because**: The backend sends all product images by default which works well. Selector adds UI complexity for a marginal improvement. Worth revisiting once users have brands with many diverse products.

---

### BL-005: Filter gallery by content type — ✅ DONE (2026-04-08)

**Status**: Shipped. `GET /brands/:brandId/images` accepts an optional `content_type_id` query param. Frontend Images page renders a filter dropdown above the gallery; selecting a content type re-fetches scoped to it. Filter is independent of the generation form's content type selector and resets on brand change.

---

### BL-005 (original spec, kept for history): Filter gallery by content type

**Description**: The generated images gallery currently shows all images for the brand. A content type filter dropdown above the gallery would let users filter to see only images generated with a specific content type (e.g. only "Product Showcase" images).

**Implementation**: Add a `content_type_id` query param to `GET /brands/:brandId/images` on the backend, and a dropdown filter on the frontend gallery section.

**Deferred because**: Not critical for MVP. Gallery is paginated and manageable without filters initially.

---

### BL-006: Image generation rate limiting (open question from spec)

**Description**: Currently there is no rate limiting on image generation. Any authenticated user can generate unlimited images, which could lead to cost overruns on the platform-level Gemini API key.

**Open questions**:
- How many generations per user per day? (e.g., 50/day, 100/day?)
- Should there be a per-brand limit or per-user limit?
- Should we track generation count in a separate table, or use a simple in-memory counter with Redis?
- Should rate-limited users see a friendly message with reset time?

**Why deferred**: Not going to production yet. Once user base grows, this becomes critical to prevent abuse and manage API costs. Simple implementation: add a `generation_count` + `generation_reset_at` column to users table, check before each generation, reset daily.

---

### BL-007: Drag-to-reorder product images (nice-to-have)

**Description**: Product images in `brand_product_images` have a `sort_order` column. Currently there is no UI or API to reorder images within a product — they display in upload order.

**Requirement from spec**: The Brand Identity page should allow users to drag-and-drop product images to reorder them. The new order should be persisted via a `PUT .../images/reorder` endpoint that accepts an ordered array of image IDs and updates their `sort_order` values.

**Backend**: `PUT /brands/:brandId/products/:productId/images/reorder` — accepts `{ image_ids: ["id1", "id2", ...] }`, updates `sort_order` for each image to match the array index.

**Frontend**: Drag-and-drop reorder within the product image gallery grid. Requires a drag library (e.g. `@dnd-kit/core` or `react-beautiful-dnd`).

**Nice-to-have** — not critical for MVP. Upload order is a reasonable default. Can be added after core Stage 2 functionality is solid.
