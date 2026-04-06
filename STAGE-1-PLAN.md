# Stage 1 — Brands CRUD + Switcher: Complete Implementation Plan

> **Date**: 2026-03-30  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Estimated effort**: 1 day  

---

## Project Overview

### What is the AI Enterprise Platform?

A web application where users (brands/businesses) can manage AI-powered content creation. Users define their brand identity (products, visual assets), configure content types (post templates with prompt instructions), and generate on-brand images and text using AI (Google Gemini).

### Current State of the Codebase

**Stack:**
- **Backend**: Hono web framework + Bun runtime + Supabase (Postgres DB + Auth + Storage)
- **Frontend**: React 18 + Vite + Tailwind CSS + React Router v6
- **Deployment**: Backend on Railway (`lucky-appreciation-production.up.railway.app`), Frontend on Vercel (`ai-platform-frontend`)
- **Supabase project ref**: `jclvtzyexivvwuixcfko`

**Backend** (`~/Desktop/ai-enterprise-platform/ai-platform-backend/`):
```
src/
├── index.ts              — Hono app setup, CORS, logger, routes
├── lib/
│   └── supabase.ts       — Two clients: supabaseAdmin (service role, bypasses RLS) 
│                            and createUserClient(token) (user-scoped, respects RLS)
├── middleware/
│   └── auth.ts           — authMiddleware: extracts Bearer token, verifies via 
│                            supabaseAdmin.auth.getUser(), sets c.user + c.token
├── routes/
│   ├── auth.ts           — signup, login, refresh, me, logout
│   └── skills.ts         — Full CRUD (list/get/create/update/delete), all use 
│                            authMiddleware + createUserClient(token)
```

**Frontend** (`~/Desktop/ai-enterprise-platform/ai-platform-frontend/`):
```
src/
├── App.tsx               — BrowserRouter > AuthProvider > AppRoutes > ProtectedRoutes
├── main.tsx              — ReactDOM entry
├── context/
│   └── AuthContext.tsx    — Auth state: user, session, login/signup/logout
│                            Session stored in localStorage ("ai_platform_session")
│                            Auto-restores + refreshes on mount
├── components/
│   └── Sidebar.tsx       — Left sidebar nav: Skills, Tasks, ContentTypes, Images, 
│                            Captions, Frames, Videos, Brand Identity. User email + 
│                            sign out at bottom. Uses NavLink with active styling.
│                            Title: "AI Platform" (will be replaced by brand switcher)
├── layouts/
│   └── DashboardLayout.tsx — flex container: <Sidebar /> + <main><Outlet /></main>
├── lib/
│   └── api.ts            — Generic fetch wrapper: api<T>(path, {method, body, token})
│                            Uses VITE_API_URL env var, JSON only currently
├── pages/
│   ├── Login.tsx          — Email/password form, calls useAuth().login
│   ├── Skills.tsx         — FULL implementation: card grid + sidebar panel for 
│                             create/edit/delete. Fetches list (metadata only), 
│                             fetches single (with content) on click. Good reference.
│   ├── Tasks.tsx          — Shell (header only)
│   ├── ContentTypes.tsx   — Shell (header only)
│   ├── Identity.tsx       — Shell (header only)
│   ├── Images.tsx         — Shell (header only)
│   ├── Captions.tsx       — Shell (header only)
│   ├── Frames.tsx         — Shell (header only)
│   └── Videos.tsx         — Shell (header only)
```

**Database tables (all deployed, RLS enabled):**
- `skills` — id, user_id, name, description, content, created_at, updated_at (has 1 test row)
- `brands` — id, user_id, name, description, created_at, updated_at (empty)
- `brand_products` — id, user_id, brand_id, name, description, category, created_at, updated_at (empty)
- `brand_product_images` — id, user_id, product_id, storage_path, url, sort_order, created_at (empty)
- `content_types` — id, user_id, brand_id, name, description, text_prompt_template, image_prompt_template, image_style, default_aspect_ratio, is_default, sort_order, created_at, updated_at (empty)
- `generated_images` — id, user_id, brand_id, content_type_id, prompt, full_prompt, aspect_ratio, storage_path, url, created_at (empty)

**Key patterns to follow:**
- Backend routes: use `authMiddleware`, get token/user from context, use `createUserClient(token)` for all DB operations (respects RLS)
- Frontend pages: use `useAuth()` for session/token, use `api()` helper for API calls
- UI pattern: card grid with slide-in sidebar for create/edit (see Skills.tsx)

**Design system**: Tailwind with gray-800 sidebar, indigo accent color, gray-50 page background, rounded-lg/xl cards, text-sm body text. No component library — everything is custom.

**Important**: `skills` table has NO relation to `brands` or any other table. Skills remain a standalone global feature. Content types serve as the per-brand equivalent of skills for content generation.

---

## What Stage 1 Delivers

1. Backend CRUD API for brands
2. Default content type seeding when a brand is created
3. Frontend brand context provider (global state)
4. Brand switcher in the sidebar (replaces "AI Platform" text)
5. Brand creation page (separate page, not modal)
6. Brand edit/delete functionality
7. "Create a brand" prompt for first-time users

---

## Detailed Implementation Steps

### Step 1: Backend — Default Content Type Templates

**File**: `src/lib/default-content-types.ts` (new)

Create a constants file with the 5 default content type templates. Each template object has:

```ts
interface DefaultContentType {
  name: string
  description: string
  text_prompt_template: string
  image_prompt_template: string
  image_style: string
  default_aspect_ratio: "1:1" | "9:16"
  is_default: true
  sort_order: number
}
```

**The 5 defaults:**

1. **Product Showcase** (sort_order: 0, aspect: 1:1)
   - image_style: "Studio lighting, clean white or gradient background, sharp focus on product, professional product photography"
   - image_prompt_template: Generic template about creating a professional product hero shot, referencing the provided product images for visual accuracy
   - text_prompt_template: Generic template about writing an engaging product showcase caption

2. **Lifestyle / In-Use** (sort_order: 1, aspect: 9:16)
   - image_style: "Natural setting, people interacting with product, warm natural lighting, lifestyle photography"
   - Similar prompt templates about showing the product in real-world use

3. **Behind the Scenes** (sort_order: 2, aspect: 9:16)
   - image_style: "Casual, workspace or studio environment, raw authentic feel, behind-the-scenes photography"
   - Prompt templates about creating BTS content

4. **Promo / Sale** (sort_order: 3, aspect: 1:1)
   - image_style: "Bold and vibrant colors, space for typography, eye-catching, promotional material design"
   - Prompt templates about creating promotional visuals

5. **UGC-Style** (sort_order: 4, aspect: 9:16)
   - image_style: "Casual phone-shot aesthetic, natural imperfect lighting, relatable, user-generated content style"
   - Prompt templates about creating UGC-looking content

Export a function:
```ts
export function getDefaultContentTypes(brandId: string, userId: string): ContentTypeInsert[]
```

This returns an array of 5 objects ready to insert into `content_types`, with `brand_id`, `user_id`, `is_default: true`, and all template fields filled.

---

### Step 2: Backend — Brands Route

**File**: `src/routes/brands.ts` (new)

Follow the exact same pattern as `src/routes/skills.ts`. All endpoints use `authMiddleware` and `createUserClient(token)`.

#### GET `/brands` — List brands
```
1. Get token from context
2. createUserClient(token)
3. Query: select id, name, description, updated_at from brands, order by created_at ASC
4. Return { brands: data }
```

#### GET `/brands/:id` — Get single brand
```
1. Get token from context
2. createUserClient(token)
3. Query: select * from brands where id = param, .single()
4. Return { brand: data }
```

#### POST `/brands` — Create brand + seed content types
```
1. Get token + user from context
2. Parse body: { name, description }
3. Validate: name required, name.length <= 100
4. Check brand count: select count from brands where user_id — if >= 5, return 400 "Maximum 5 brands allowed"
5. createUserClient(token)
6. Insert into brands: { user_id: user.id, name, description }
7. If success, get the new brand's id
8. Generate default content types: getDefaultContentTypes(brand.id, user.id)
9. Insert 5 content type rows into content_types
10. If content type seeding fails: log error, still return the brand (non-critical)
11. Return { brand: data } with 201
```

**Important detail on step 9**: We insert all 5 content types in a single `.insert([...array])` call, not 5 separate calls.

#### PUT `/brands/:id` — Update brand
```
1. Get token from context
2. Parse body: { name, description } (both optional but at least one required)
3. Validate: if name provided, name.length <= 100
4. createUserClient(token)
5. Update brands set { ...updates, updated_at: new Date().toISOString() } where id = param
6. Return { brand: data }
```

#### DELETE `/brands/:id` — Delete brand
```
1. Get token from context
2. createUserClient(token)
3. Delete from brands where id = param
4. CASCADE handles: content_types, brand_products → brand_product_images, generated_images
5. NOTE: Storage cleanup is NOT implemented in Stage 1 (deferred)
6. Return { message: "Deleted" }
```

#### Register in `src/index.ts`:
```ts
import brands from "./routes/brands";
// Add after existing routes:
app.route("/brands", brands);
```

---

### Step 3: Frontend — API Helper (no changes needed)

The existing `api()` function in `src/lib/api.ts` handles JSON requests with Bearer token. It works for all brand CRUD operations. No changes needed for Stage 1.

(Multipart upload support will be added in Stage 2 for image uploads.)

---

### Step 4: Frontend — Brand Context Provider

**File**: `src/context/BrandContext.tsx` (new)

```tsx
interface Brand {
  id: string
  name: string
  description: string | null
  updated_at: string
}

interface BrandContextType {
  brands: Brand[]
  selectedBrand: Brand | null
  loading: boolean
  setSelectedBrand: (brand: Brand) => void
  refreshBrands: () => Promise<void>
}
```

**Behavior:**
1. On mount (when auth session exists), fetch `GET /brands`
2. Store brands in state
3. Restore `selectedBrandId` from `localStorage` key `"ai_platform_selected_brand"`
4. If stored ID matches a fetched brand, select it. Otherwise select first brand (if any), or null.
5. When `setSelectedBrand` is called, update state + save to localStorage
6. `refreshBrands()` re-fetches the list (called after create/edit/delete)
7. Depends on `useAuth()` — needs the token to make API calls and the user to know when auth is ready

**Important**: Must handle the case where user has 0 brands — `selectedBrand` is `null`.

---

### Step 5: Frontend — Wire BrandProvider into App

**File**: `src/App.tsx` (modify)

Wrap the app with `BrandProvider` **inside** `AuthProvider`:

```tsx
<BrowserRouter>
  <AuthProvider>
    <BrandProvider>    {/* ← NEW */}
      <AppRoutes />
    </BrandProvider>   {/* ← NEW */}
  </AuthProvider>
</BrowserRouter>
```

Import `BrandProvider` from `./context/BrandContext`.

---

### Step 6: Frontend — Brand Switcher Dropdown

**File**: `src/components/BrandSwitcher.tsx` (new)

A custom dropdown component. No external libraries.

**Visual structure:**
```
┌─────────────────────────┐
│ ▾  Selected Brand Name  │  ← trigger button (full width of sidebar top area)
├─────────────────────────┤
│  Brand Alpha         ✓  │  ← dropdown items (checkmark on selected)
│  Brand Beta             │
│  Brand Gamma            │
│─────────────────────────│
│  ＋ New Brand           │  ← links to /brands/new
│  ⚙ Manage Brands       │  ← links to /brands
└─────────────────────────┘
```

When no brand is selected: trigger shows "Select brand..." in gray placeholder text.

**Implementation details:**
- State: `isOpen` boolean
- Toggle on click
- Close on click outside (useEffect with document click listener)
- Close on Escape key
- Close on item selection
- Styling: same gray-800/700 tones as sidebar, white text, rounded-lg dropdown panel
- Positioned absolutely below the trigger, same width
- Z-index above sidebar content but below any modals
- "＋ New Brand" uses React Router `useNavigate()` to go to `/brands/new`
- "⚙ Manage Brands" uses `useNavigate()` to go to `/brands`

---

### Step 7: Frontend — Update Sidebar

**File**: `src/components/Sidebar.tsx` (modify)

**Changes:**
1. Replace the static "AI Platform" header with `<BrandSwitcher />`
2. Import the new component
3. The sidebar nav links stay the same
4. No visual dimming of brand-dependent pages for Stage 1 (defer to later — too complex for now, and all pages currently show shell content anyway)

**Before:**
```tsx
<div className="mb-6 px-3">
  <h2 className="text-lg font-semibold text-white">AI Platform</h2>
</div>
```

**After:**
```tsx
<div className="mb-6">
  <BrandSwitcher />
</div>
```

---

### Step 8: Frontend — Brands List/Manage Page

**File**: `src/pages/Brands.tsx` (new)

A page at route `/brands` that shows all brands and lets the user edit/delete them.

**Layout:**
- Header: "Brands" title + "Create Brand" button (links to `/brands/new`)
- Card grid (same style as Skills page)
- Each card shows: brand name, description (truncated), updated_at timestamp
- Click card → navigates to `/brands/:id/edit` (or opens inline edit — see below)

**Simpler approach (recommended):** Since we're doing a separate creation page, edit can use the same page pattern. Each card has:
- Click → opens edit view (could be same sidebar pattern as Skills, or navigate to edit page)

**My recommendation:** Use the **sidebar slide-in panel** pattern (same as Skills page) for editing. It's already built and proven. The Brands page has the card grid + a slide-in sidebar for edit. Brand creation gets its own page (Step 9) because it's a more important first-time experience.

**Edit sidebar fields:**
- Name (text input, required)
- Description (text input, optional)
- Save / Delete / Cancel buttons

**Delete behavior:**
- Confirm dialog: "Delete 'Brand Name'? This will remove all products, content types, and generated images for this brand. This cannot be undone."
- On confirm: `DELETE /brands/:id`, refresh brands context, close sidebar

---

### Step 9: Frontend — Brand Creation Page

**File**: `src/pages/BrandCreate.tsx` (new)

A dedicated page at route `/brands/new`.

**Layout:**
- Clean, centered form (similar vibe to Login page but inside the dashboard layout)
- Title: "Create a new brand"
- Subtitle: "Define your brand to start creating on-brand content."
- Fields:
  - **Brand name** (text input, required, max 100 chars)
  - **Description** (textarea, optional, placeholder: "Brief description of your brand")
- **Create Brand** button (indigo, full width of form)
- **Cancel** link (goes back to previous page or `/brands`)

**On submit:**
1. Call `POST /brands` with { name, description }
2. On success: call `refreshBrands()` from brand context
3. Auto-select the newly created brand via `setSelectedBrand(newBrand)`
4. Navigate to `/identity` (the Brand Identity page — where they'll add products next, in Stage 2)

**Error handling:**
- Show inline error if name is empty
- Show API error (e.g., "Maximum 5 brands allowed")

---

### Step 10: Frontend — First-Time User Prompt

When a user has zero brands, they should see a prompt to create one.

**Two places this appears:**

**A. In the dashboard (on any page):**

Create a small reusable component `NoBrandPrompt.tsx`:
```
┌──────────────────────────────────────────────┐
│  🏢 No brand selected                        │
│                                               │
│  Create a brand to get started with           │
│  content generation.                          │
│                                               │
│  [Create your first brand →]                  │
└──────────────────────────────────────────────┘
```

This renders when `selectedBrand` is null on brand-dependent pages (Identity, Content Types, Images). For Stage 1 it should appear on the Identity page at minimum. The button links to `/brands/new`.

**B. In the brand switcher:**

When the dropdown opens with 0 brands, show: "No brands yet" + "＋ Create your first brand" link.

---

### Step 11: Frontend — Add Routes

**File**: `src/App.tsx` (modify)

Add new routes inside `ProtectedRoutes`:

```tsx
import Brands from './pages/Brands'
import BrandCreate from './pages/BrandCreate'

// Inside <Route element={<DashboardLayout />}>:
<Route path="/brands" element={<Brands />} />
<Route path="/brands/new" element={<BrandCreate />} />
```

---

### Step 12: Frontend — Update Identity Page (Minimal)

**File**: `src/pages/Identity.tsx` (modify)

Replace the shell content with:
- If `selectedBrand` is null → show `<NoBrandPrompt />`
- If `selectedBrand` exists → show the header "Brand Identity — {brand.name}" + placeholder text "Product management coming soon." (actual implementation is Stage 2)

This validates the brand context flow end-to-end.

---

## File Change Summary

### New Files (7):
| File | Location | Purpose |
|------|----------|---------|
| `default-content-types.ts` | `backend/src/lib/` | Default content type constants + factory function |
| `brands.ts` | `backend/src/routes/` | Brands CRUD API route |
| `BrandContext.tsx` | `frontend/src/context/` | Global brand state provider |
| `BrandSwitcher.tsx` | `frontend/src/components/` | Sidebar dropdown component |
| `Brands.tsx` | `frontend/src/pages/` | Brand list + edit page |
| `BrandCreate.tsx` | `frontend/src/pages/` | Brand creation page |
| `NoBrandPrompt.tsx` | `frontend/src/components/` | Empty state for brand-dependent pages |

### Modified Files (4):
| File | Location | Changes |
|------|----------|---------|
| `index.ts` | `backend/src/` | Import + register brands route |
| `App.tsx` | `frontend/src/` | Add BrandProvider, add /brands and /brands/new routes |
| `Sidebar.tsx` | `frontend/src/components/` | Replace "AI Platform" header with BrandSwitcher |
| `Identity.tsx` | `frontend/src/pages/` | Add brand context check + NoBrandPrompt |

### No Changes:
| File | Reason |
|------|--------|
| `api.ts` | JSON helper works as-is for brand CRUD |
| `auth.ts` (backend) | Auth is complete |
| `auth.ts` (middleware) | No changes needed |
| `supabase.ts` | Both clients already exist |
| `Skills.tsx` | Skills stay global, no brand scoping |
| `DashboardLayout.tsx` | Layout unchanged |
| Database tables | All already deployed with correct schemas + RLS |

---

## Implementation Order (within Stage 1)

```
1. default-content-types.ts   — constants, no dependencies
2. brands.ts (backend route)  — depends on #1
3. index.ts (register route)  — depends on #2
   ── BACKEND DONE, test with curl ──
4. BrandContext.tsx            — depends on backend being ready
5. BrandSwitcher.tsx           — depends on #4
6. NoBrandPrompt.tsx           — standalone component
7. Sidebar.tsx (modify)        — depends on #5
8. BrandCreate.tsx             — depends on #4
9. Brands.tsx                  — depends on #4
10. App.tsx (modify)           — depends on #4, #8, #9
11. Identity.tsx (modify)      — depends on #4, #6
    ── FRONTEND DONE, test in browser ──
```

Steps 1-3 (backend) can be done first and tested independently with curl.
Steps 4-11 (frontend) should be done in order.

---

## Testing Checklist

### Backend (curl / Postman):
- [ ] `POST /brands` with name + description → returns brand, check `content_types` table has 5 rows for that brand
- [ ] `POST /brands` without name → 400 error
- [ ] `POST /brands` 6th brand → 400 "Maximum 5 brands"
- [ ] `GET /brands` → returns list
- [ ] `GET /brands/:id` → returns single brand
- [ ] `PUT /brands/:id` → updates name/description
- [ ] `DELETE /brands/:id` → deletes brand, cascades to content_types rows
- [ ] RLS: user A cannot see user B's brands

### Frontend:
- [ ] New user (0 brands): sees "Select brand..." in sidebar, NoBrandPrompt on Identity page
- [ ] Brand switcher dropdown opens/closes correctly
- [ ] "New Brand" in dropdown navigates to /brands/new
- [ ] Create brand form: validates name, submits, redirects to /identity
- [ ] After creation: brand appears in switcher, is auto-selected
- [ ] Switch between brands: selectedBrand updates, persists on page reload
- [ ] Brands page: shows card grid, edit sidebar works, delete works
- [ ] After delete: if deleted brand was selected, selectedBrand resets

---

## Decisions Made

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Content type seeding client | User client (not service role) | User inserts their own rows, RLS allows it, simpler |
| Seeding failure handling | Log error, return brand anyway | Non-critical, user can add content types manually |
| Skills ↔ Brands relation | None (Option C) | Skills stay global, content types are per-brand mini-skills |
| Storage cleanup on brand delete | Deferred to Stage 2 | No files exist in Stage 1, only DB cascade needed |
| Brand creation UI | Separate page (not modal) | Better first-time experience, more room for the form |
| Brand edit UI | Sidebar slide-in (like Skills) | Proven pattern already in codebase |
| Dropdown library | Custom built | Trivial, no external dependency needed |
| Zero brands UX | Show prompt, don't block navigation | Less aggressive than onboarding gate, still clear |
| Brand switcher location | Replaces "AI Platform" text in sidebar | Clean, prominent, always visible |
