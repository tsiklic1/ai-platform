# Project Memory — AI Enterprise Platform

> Detailed, evolving context about what has been built. Update this whenever a feature is added or meaningfully changes.

**Last updated**: 2026-04-07

---

## Stack & layout

- **Backend**: `ai-platform-backend/` — Hono on Bun, Supabase client
  - Routes in `src/routes/`
  - Library helpers in `src/lib/`
- **Frontend**: `ai-platform-frontend/` — React + Vite + Tailwind
  - Pages in `src/pages/`
  - Components in `src/components/`
  - API helpers in `src/lib/api.ts`
- **AI**: Gemini 3.1 (Nano Banana 2 / Pro) for images & frames; Claude for captions
- **Database**: Supabase Postgres with RLS. **Every table has a denormalized `user_id` column** so all RLS policies are simple `user_id = auth.uid()` checks (no joins, fast).
- **Storage**: Supabase Storage, single bucket `brand-assets` (private)
  - `{user_id}/products/{product_id}/{filename}`
  - `{user_id}/content-types/{content_type_id}/{filename}`
  - `{user_id}/generated/{brand_id}/{timestamp}_{hash}.png`

---

## Features (all implemented)

### 1. Brands + Brand Switcher
- CRUD on `brands` table (max 5/user, soft limit)
- Global `BrandContext` provider on the frontend, persists `selectedBrandId` in `localStorage`
- Brand switcher dropdown in the sidebar
- Manage Brands modal (create/edit/delete)
- On brand creation: auto-seeds 5 default content types (Product Showcase, Lifestyle/In-Use, Behind the Scenes, Promo/Sale, UGC-Style)
- Backend: `src/routes/brands.ts`
- Frontend: `src/context/BrandContext.tsx`, sidebar switcher, manage modal

### 2. Brand Identity (Products + Reference Images)
- `brand_products` table — name, description, category, brand_id
- `brand_product_images` table — up to 5 per product, 25 total per brand
- Multipart upload via Hono `c.req.parseBody()`, helper `apiUpload` on frontend
- Validations: jpeg/png/webp, max 10MB, count limits
- Backend: `src/routes/brand-products.ts`
- Frontend: `src/pages/Identity.tsx` with product list + image gallery + drop zone
- Reusable component: `ImageDropZone.tsx`

### 3. Content Types
- `content_types` table — per-brand templates with `text_prompt_template`, `image_prompt_template`, `image_style`, `default_aspect_ratio` (1:1 / 9:16), `is_default`, `sort_order`
- 5 defaults seeded on brand creation, fully editable/deletable
- Card grid UI with sidebar editor (same pattern as Skills page)
- Backend: `src/routes/content-types.ts`
- Frontend: `src/pages/ContentTypes.tsx`
- **Reference images** on content types: `content_type_images` table, max 5 per content type, uploaded via the same drop zone pattern. Sent to Gemini labeled as "STYLE REFERENCE" (vs product images labeled as "PRODUCT REFERENCE").

### 4. Image Generation (Gemini)
- `generated_images` table with `prompt`, `full_prompt` (assembled), `aspect_ratio`, storage path/url
- Aspect ratios: 1:1 and 9:16
- Prompt assembly: content type's `image_prompt_template` + `image_style` + user prompt + product reference images + content type reference images
- Gallery view with pagination, lightbox detail
- `content_type_id` is `SET NULL` on content type delete (preserves history)
- Backend: `src/routes/images.ts`, `src/lib/gemini.ts`
- Frontend: `src/pages/Images.tsx` (Pictures page) — generation form on top, gallery below

### 5. Skills + Skills Integration
- `skills` table with `actions text[]` column (lowercase identifiers: `image`, `text`, `video`, `frames`)
- GIN index on `actions` for fast `@>` queries
- New endpoint: `GET /skills/by-action/:action` (registered BEFORE `/:id` route)
- Skills page: actions multi-select in sidebar editor, action badges on cards
- Reusable `SkillPicker.tsx` component (chip-style multi-select)
- Picker shown on Images and Captions generation forms
- Selected skills are concatenated and injected as a system message
  - Image gen: skills as system message before user content
  - Text gen: skills appended into system prompt after role definition, before brand context
- Skills are stored in `full_prompt` for debugging
- Backend: `src/routes/skills.ts`, `src/lib/gemini.ts`, `src/lib/text-gen.ts`

### 6. Caption / Text Generation (Claude)
- `texts` (or similar) route generating Instagram captions via Claude
- Uses content type `text_prompt_template`, brand context (brand name + products), and skills
- Backend: `src/routes/texts.ts`, `src/lib/text-gen.ts` (`assembleTextPrompt`)
- Frontend: `src/pages/Captions.tsx`

### 7. Video Frames Generation
- Sequential keyframe generation for short Instagram Reels (4–16s)
- 9:16 vertical, generated **one frame at a time** (each frame uses previous as reference for continuity)
- Output meant to be fed into SeedDance 2.0 manually by the user
- Has its own page in the sidebar
- Default skill (`default-frames.md`) and brand-specific skill (`aranxhata-frames.md`) define the workflow

### 8. Tasks page
- Listed in the sidebar; details TBD in this memory file (read code if needed)

---

## Important conventions & gotchas

- **RLS pattern**: Every new table must include `user_id` and a single `user_id = auth.uid()` policy. Never use join-based RLS.
- **Storage cleanup**: CASCADE deletes only remove DB rows. Backend must explicitly delete files from `brand-assets` storage before deleting brand/product/image rows (see backlog item BL-001 in `SPEC-brand-identity.md` — may or may not be implemented, verify).
- **Hono route ordering**: Static segments must be registered before `/:id` routes (e.g., `/by-action/:action` before `/:id`, `/reset-defaults` before `/:id`).
- **Multipart uploads**: Use Hono's `c.req.parseBody()` and the frontend `apiUpload` helper; the regular JSON `api` helper won't work.
- **Default content types**: `is_default = true` on the 5 seeded types — users can still delete/modify them.
- **Generation context block**: All 3 generation flows (image / frames / text) prepend a structured `[Generation Context]` block to the system message via `renderContextBlock()` from `src/lib/generation-context.ts`. The block contains brand, products, content type fields, reference image counts, and aspect ratio. Built once per generation via `buildGenerationContext()`. Frames gen builds it once and reuses across all 5 frames.
- **Skill template variables**: Skill `content` is run through `applySkillTemplate()` (`src/lib/skill-template.ts`) before concatenation in every generation flow. Use `renderSkillsContent(skills, ctx)` for the standard `## Skill: ...` concatenation + substitution. Pure text replacement (no expressions, no loops). Missing values become empty strings; unknown placeholders are left intact so typos are visible. Substitution applies to skills only — content type templates (`image_prompt_template`, `text_prompt_template`) stay literal.
- **Per-image labels**: `ReferenceImage` in `src/lib/gemini.ts` carries an optional `label` field. Routes attach the source product name + category to each product image and the content type name to each style image, so the model (and skills) can refer to specific images by name.

### Supported skill template placeholders

- `{{brand.name}}`, `{{brand.description}}`
- `{{products.list}}` — bulleted name/description/category
- `{{products.names}}` — comma-separated names
- `{{products.count}}`
- `{{content_type.name}}`, `{{content_type.description}}`
- `{{content_type.image_style}}`
- `{{content_type.image_prompt_template}}`
- `{{content_type.text_prompt_template}}`
- `{{content_type.default_aspect_ratio}}`
- `{{counts.product_images}}`, `{{counts.style_images}}`
- `{{aspect_ratio}}`

---

## Aranxhata example brand

Aranxhata (a Glina beverage brand, slim cans in three variants: Rose/pink, Exotic/green, Classic/red) is the running example used in the markdown skill files (`aranxhata-image-gen.md`, `aranxhata-frames.md`, `aranxhata-captions.md`). These files document how a real brand uses the platform's skills system with strict can-accuracy rules and reference image requirements.

---

## Spec / plan documents in repo root

These describe **shipped** features and serve as historical reference:

- `SPEC-brand-identity.md` — full brand/product/content-type/generation spec (Stages 1–4)
- `SPEC-skills-integration.md` — skills `actions` column + injection
- `CONTENT-TYPE-REFERENCE-IMAGES-PLAN.md` — `content_type_images` table + Gemini labeling
- `STAGE-1-PLAN.md` … `STAGE-4-PLAN.md`, `STAGE-4-FRONTEND-PLAN.md`
- `TEXT-GENERATION-PLAN.md`, `FRAMES-PLAN.md`
- `DEPLOY.md` — deployment notes
- `default-captions.md`, `default-frames.md`, `default-images.md` — generic default skills
- `aranxhata-captions.md`, `aranxhata-frames.md`, `aranxhata-image-gen.md` — example brand skills

---

## How to keep this file useful

- When you add a feature, add it to the **Features** section with: table names, route file, frontend file, key behaviors.
- When you change a convention, update the **Important conventions** section.
- When something turns out differently than the spec docs say, note it (the specs are frozen, this file is the source of truth).
- Don't write status updates or change logs here — just the current state.
