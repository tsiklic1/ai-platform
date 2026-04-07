# AI Enterprise Platform

AI content generation platform for brands. Users define brands, upload product reference images, configure content type templates, and generate on-brand images, captions, and video frames using AI.

## Stack

- **Backend**: Hono + Bun + Supabase — `ai-platform-backend/`
- **Frontend**: React + Vite + Tailwind — `ai-platform-frontend/`
- **AI providers**: Google Gemini 3.1 (Nano Banana 2 / Pro) for images & video frames, Anthropic Claude for text/captions
- **Storage**: Supabase Storage (`brand-assets` bucket), Postgres with RLS via denormalized `user_id` on every table

## Core domain

Per-user, per-brand. Selecting a brand scopes all downstream pages.

- `brands` → `brand_products` → `brand_product_images`
- `content_types` (per-brand templates) → `content_type_images` (style refs)
- `generated_images` (Gemini outputs)
- `skills` with `actions text[]` — injected as system messages into generation
- Captions (Claude) + Video Frames (sequential Gemini keyframes for SeedDance 2.0)

## Working in this repo

- **Always check `MEMORY.md`** at the start of a task — it has the up-to-date detailed context for the project (features, structure, conventions, gotchas).
- **When a new feature is added or an existing feature changes meaningfully, update `MEMORY.md`** so the next session has accurate context. Do this proactively without being asked.
- Spec docs in the repo root (`SPEC-*.md`, `STAGE-*.md`, `*-PLAN.md`) describe **already-shipped** features, not pending work. Treat them as historical reference, not a backlog.
- For implementation details, prefer reading actual code in `ai-platform-backend/src/` and `ai-platform-frontend/src/` over re-reading spec docs.
