# Stage 2 — Brand Identity Page (Product Assets): Complete Implementation Plan

> **Date**: 2026-03-31  
> **Parent spec**: `SPEC-brand-identity.md`  
> **Depends on**: Stage 1 ✅  
> **Estimated effort**: 1–1.5 days  

---

## What Stage 2 Delivers

1. Backend CRUD for brand products (name, description, category)
2. Backend image upload + delete for product images (with validation)
3. Frontend `apiUpload` helper for multipart requests
4. Frontend Brand Identity page with product card grid + sidebar
5. Image upload zone (drag-and-drop + click-to-browse, one at a time)
6. Image gallery per product with delete capability
7. Per-product image count display (3/5)

---

## Confirmed Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Storage bucket | Public | Images accessible via direct URL, no signed tokens needed |
| Image validation | Backend only | Single source of truth, simpler frontend |
| Route structure | Single file (`brand-products.ts`) | Small scope, products + images are tightly coupled |
| Product layout | Card grid + sidebar | Consistent with Skills and Brands pages |
| Upload UX | Drag-and-drop + click-to-browse | Best UX, one image at a time |
| Category field | Free-text input | Flexible, no predefined list needed |
| Image count display | Per-product (3/5) | Simple, clear, no extra cross-product query |
| Image reorder | Deferred (BL-002) | Nice-to-have, upload order is fine for now |
| Storage cleanup on delete | Deferred (BL-001) | No orphan files yet, will address later |

---

## Detailed Implementation Steps

### Step 1: Backend — Multipart Upload Support Verification

**No new file needed** — Hono natively supports multipart via `c.req.parseBody()`.

Verify this works with Bun by checking Hono docs. The key API:

```ts
const body = await c.req.parseBody();
// body['file'] is a File object when Content-Type is multipart/form-data
```

For our use case, the frontend will send:
```
POST /brands/:brandId/products/:productId/images
Content-Type: multipart/form-data

file: <binary image data>
```

And the backend reads it as:
```ts
const body = await c.req.parseBody();
const file = body['file'] as File;
```

No middleware or library changes needed.

---

### Step 2: Backend — Brand Products Route

**File**: `src/routes/brand-products.ts` (new)

Follow the same pattern as `brands.ts`. All endpoints use `authMiddleware` and `createUserClient(token)`.

Routes are nested under `/brands/:brandId/products` but registered as a flat Hono router. The `brandId` param comes from the route path.

#### GET `/brands/:brandId/products` — List products with images

```
1. Get token from context
2. createUserClient(token)
3. Single query using Supabase nested select (foreign key join):
   select *, brand_product_images(*) from brand_products where brand_id = brandId, order by created_at ASC
4. Return { products: data }
```

Supabase supports nested selects via foreign key relationships. Since `brand_product_images.product_id` references `brand_products.id`, we can fetch everything in one query:

```ts
const { data: products, error } = await sb
  .from("brand_products")
  .select("*, brand_product_images(*)") 
  .eq("brand_id", brandId)
  .order("created_at", { ascending: true });
```

This returns each product with a nested `brand_product_images` array containing its images. One query, no N+1, no JS join. The nested images are automatically ordered by the DB default — if we need explicit sort_order ordering on the images, we can add:

```ts
.select("*, brand_product_images(*)")
.eq("brand_id", brandId)
.order("created_at", { ascending: true })
.order("sort_order", { ascending: true, referencedTable: "brand_product_images" });
```

#### POST `/brands/:brandId/products` — Create product

```
1. Get token + user from context
2. Parse body: { name, description?, category? }
3. Validate: name required, name.length <= 100
4. createUserClient(token)
5. Insert into brand_products: { user_id, brand_id: brandId, name, description, category }
6. Return { product: data } with 201
```

#### PUT `/brands/:brandId/products/:id` — Update product

```
1. Get token from context
2. Parse body: { name?, description?, category? } (at least one required)
3. Validate: if name provided, name.length <= 100
4. createUserClient(token)
5. Update brand_products set { ...updates, updated_at: now } where id = param
6. Return { product: data }
```

#### DELETE `/brands/:brandId/products/:id` — Delete product

```
1. Get token from context
2. createUserClient(token)
3. Delete from brand_products where id = param
4. CASCADE handles brand_product_images rows
5. NOTE: Storage cleanup deferred (BL-001)
6. Return { message: "Deleted" }
```

#### POST `/brands/:brandId/products/:productId/images` — Upload image

```
1. Get token + user from context
2. Parse multipart body: const body = await c.req.parseBody()
3. Get file: const file = body['file'] as File
4. Validate file exists
5. Validate MIME type: must be image/jpeg, image/png, or image/webp
6. Validate file size: must be <= 10MB (10 * 1024 * 1024 bytes)
7. createUserClient(token)
8. Check product image count: select count from brand_product_images where product_id = productId
   - If >= 5, return 400 "Maximum 5 images per product"
9. Determine sort_order: use the current count as sort_order (new image goes to end)
10. Generate storage path: `${user.id}/products/${productId}/${crypto.randomUUID()}.${ext}`
    - ext derived from MIME type: jpeg→jpg, png→png, webp→webp
11. Convert File to ArrayBuffer for upload: const buffer = await file.arrayBuffer()
12. Upload to Supabase Storage:
    ```ts
    const { error: uploadError } = await sb.storage
      .from("brand-assets")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
      });
    ```
13. If upload fails, return 500 with error
14. Construct public URL:
    ```ts
    const { data: { publicUrl } } = sb.storage
      .from("brand-assets")
      .getPublicUrl(storagePath);
    ```
15. Insert into brand_product_images: { user_id, product_id: productId, storage_path: storagePath, url: publicUrl, sort_order }
16. Return { image: data } with 201
```

**Important**: Use `createUserClient(token)` for the DB operations (RLS). For storage upload, also use the user client — Supabase Storage respects RLS policies on buckets.

#### DELETE `/brands/:brandId/products/:productId/images/:imageId` — Delete image

```
1. Get token from context
2. createUserClient(token)
3. First, fetch the image record to get storage_path:
   select storage_path from brand_product_images where id = imageId
4. Delete from brand_product_images where id = imageId
5. NOTE: Storage file cleanup deferred (BL-001) — only DB row deleted for now
6. Return { message: "Deleted" }
```

---

### Step 3: Backend — Register Route

**File**: `src/routes/brand-products.ts` — define routes with full paths from the brand ID level:

```ts
const brandProducts = new Hono();
brandProducts.use("*", authMiddleware);

brandProducts.get("/:brandId/products", async (c) => { ... });
brandProducts.post("/:brandId/products", async (c) => { ... });
brandProducts.put("/:brandId/products/:id", async (c) => { ... });
brandProducts.delete("/:brandId/products/:id", async (c) => { ... });
brandProducts.post("/:brandId/products/:productId/images", async (c) => { ... });
brandProducts.delete("/:brandId/products/:productId/images/:imageId", async (c) => { ... });
```

**File**: `src/index.ts` — mount alongside the existing brands router:

```ts
import brandProducts from "./routes/brand-products";

app.route("/brands", brandProducts);
```

Both `brands.ts` and `brand-products.ts` are mounted at `/brands`. This works because the brand-products paths always include `/products` after the ID, making them more specific than `brands.ts`'s `/:id` routes. Hono matches by specificity — no conflict.

---

### Step 4: Frontend — API Upload Helper

**File**: `src/lib/api.ts` (modify)

Add a new function for multipart uploads alongside the existing `api()` function:

```ts
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  token: string
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type — browser sets it automatically with boundary for FormData
    },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Upload failed");
  }

  return data as T;
}
```

**Important**: Do NOT set `Content-Type: application/json` or `Content-Type: multipart/form-data` manually. The browser automatically sets the correct `Content-Type` with the multipart boundary when you pass a `FormData` object as the body. Setting it manually breaks the upload.

---

### Step 5: Frontend — Image Upload Drop Zone Component

**File**: `src/components/ImageDropZone.tsx` (new)

A reusable component that supports both drag-and-drop and click-to-browse.

**Props**:
```ts
interface ImageDropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  imageCount: number;
  maxImages: number;
}
```

**Visual structure**:
```
┌─────────────────────────────────────┐
│                                     │
│     📁 Drop image here or click     │
│          to browse                  │
│                                     │
│     JPEG, PNG, WebP · Max 10MB      │
│           2/5 images                │
│                                     │
└─────────────────────────────────────┘
```

When at max capacity (5/5):
```
┌─────────────────────────────────────┐
│                                     │
│     ✓ Maximum images reached        │
│           5/5 images                │
│                                     │
└─────────────────────────────────────┘
```

**Implementation details**:
- Dashed border container, changes color on drag over
- `onDragOver`, `onDragLeave`, `onDrop` handlers
- Hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` triggered on click
- State: `isDragging` boolean for visual feedback
- On file drop/select: validate it's an image (basic client-side check), then call `onFileSelected(file)`
- If `imageCount >= maxImages`, show disabled state
- Styling: gray dashed border default, indigo border on drag over, rounded-lg

**Client-side validation** (for UX only — backend is the real gate):
- Check file.type is image/jpeg, image/png, or image/webp
- Check file.size <= 10MB
- Show inline error if validation fails (e.g., "File must be an image (JPEG, PNG, or WebP)")

---

### Step 6: Frontend — Brand Identity Page

**File**: `src/pages/Identity.tsx` (rewrite)

This replaces the current minimal implementation (which just shows brand name or NoBrandPrompt).

**Types**:
```ts
interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  url: string;
  sort_order: number;
  created_at: string;
}

interface Product {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
  images: ProductImage[];
}
```

**Page layout**:
- If no brand selected → `<NoBrandPrompt />`
- If brand selected:
  - Header: "Brand Identity — {brand.name}" + "Add Product" button
  - Product card grid (same styling as Skills/Brands pages)
  - Each card shows: product name, category badge (if set), thumbnail of first image (if any), image count "3/5"
  - Click card → opens sidebar

**Data fetching**:
- On mount and when `selectedBrand` changes: `GET /brands/{brandId}/products`
- Store products in local state
- Refetch after any mutation (create, update, delete, image upload/delete)

**"Add Product" card**: dashed border card at the end of the grid (same pattern as Skills page "New Skill" card)

---

### Step 7: Frontend — Product Edit Sidebar

**File**: `src/pages/Identity.tsx` (same file, sidebar component within)

Follows the same slide-in sidebar pattern as Skills and Brands pages.

**Sidebar content for existing product**:

```
┌──────────────────────────────────────┐
│  Edit Product                     ×  │
├──────────────────────────────────────┤
│                                      │
│  Name *                              │
│  ┌──────────────────────────────┐    │
│  │ Premium Coffee Blend         │    │
│  └──────────────────────────────┘    │
│                                      │
│  Category                            │
│  ┌──────────────────────────────┐    │
│  │ Beverages                    │    │
│  └──────────────────────────────┘    │
│                                      │
│  Description                         │
│  ┌──────────────────────────────┐    │
│  │ Our signature blend...       │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  Product Images (3/5)                │
│  ┌─────┐ ┌─────┐ ┌─────┐            │
│  │ img │ │ img │ │ img │            │
│  │  ×  │ │  ×  │ │  ×  │            │
│  └─────┘ └─────┘ └─────┘            │
│                                      │
│  ┌─────────────────────────────┐     │
│  │  📁 Drop image here or      │     │
│  │     click to browse          │     │
│  │  JPEG, PNG, WebP · Max 10MB  │     │
│  └─────────────────────────────┘     │
│                                      │
├──────────────────────────────────────┤
│  [Save Changes] [Delete]    Cancel   │
└──────────────────────────────────────┘
```

**Sidebar content for new product**:
- Same form but empty fields
- No image section (product must be created first to get an ID for image uploads)
- Button says "Create" instead of "Save Changes"
- After creation: sidebar closes, refetch products, user can then click the new product card to add images

**Image gallery in sidebar**:
- Grid of image thumbnails (3 columns)
- Each image has an × button on hover (top-right corner)
- Click × → confirm → `DELETE .../images/:imageId`
- Below the grid: `<ImageDropZone />` component
- On file selected: create FormData, call `apiUpload()`, refetch products on success
- Show upload progress indicator (or at minimum a "Uploading..." state)

**Save behavior**:
- Save only updates product metadata (name, description, category)
- Image upload/delete are immediate operations (not batched with save)

**Delete behavior**:
- "Delete Product" button in sidebar footer
- Confirm dialog: "Delete '{product.name}'? This will remove the product and all its images. This cannot be undone."
- On confirm: `DELETE /brands/:brandId/products/:id`, close sidebar, refetch

---

### Step 8: Frontend — Wire Everything Together

**Files to verify/update**:

**`src/App.tsx`** — No changes needed. The `/identity` route already exists and points to `Identity.tsx`.

**`src/context/BrandContext.tsx`** — No changes needed. `selectedBrand` is already available.

**`src/components/NoBrandPrompt.tsx`** — No changes needed. Already used in Identity page.

---

## File Change Summary

### New Files (2):
| File | Location | Purpose |
|------|----------|---------|
| `brand-products.ts` | `backend/src/routes/` | Products CRUD + image upload/delete API |
| `ImageDropZone.tsx` | `frontend/src/components/` | Drag-and-drop + click-to-browse upload component |

### Modified Files (3):
| File | Location | Changes |
|------|----------|---------|
| `index.ts` | `backend/src/` | Register brand-products route |
| `api.ts` | `frontend/src/lib/` | Add `apiUpload()` function for multipart |
| `Identity.tsx` | `frontend/src/pages/` | Full rewrite: product grid + sidebar + image management |

### No Changes:
| File | Reason |
|------|--------|
| `App.tsx` | Route already exists |
| `BrandContext.tsx` | selectedBrand already available |
| `NoBrandPrompt.tsx` | Already built |
| `Sidebar.tsx` | No changes needed |
| `brands.ts` (backend) | No changes needed |
| Database tables | Already deployed with correct schemas + RLS |
| Storage bucket | Already public |

---

## Implementation Order

```
1. apiUpload helper (frontend) — no dependencies, quick
2. brand-products.ts (backend route) — core logic
3. index.ts (register route) — depends on #2
   ── BACKEND DONE, test with curl ──
4. ImageDropZone.tsx (frontend component) — standalone, reusable
5. Identity.tsx (full rewrite) — depends on #1, #4
   ── FRONTEND DONE, test in browser ──
```

Steps 1 and 2 are independent and can be done in parallel.
Steps 4 and 5 depend on the backend being ready for integration testing.

---

## Testing Checklist

### Backend (curl):
- [ ] `POST /brands/:brandId/products` with name → 201, returns product
- [ ] `POST /brands/:brandId/products` without name → 400
- [ ] `GET /brands/:brandId/products` → returns products with images arrays
- [ ] `PUT /brands/:brandId/products/:id` → updates metadata
- [ ] `DELETE /brands/:brandId/products/:id` → deletes product
- [ ] `POST .../images` with valid JPEG → 201, returns image with URL
- [ ] `POST .../images` with valid PNG → 201
- [ ] `POST .../images` with valid WebP → 201
- [ ] `POST .../images` with PDF → 400 "File must be an image"
- [ ] `POST .../images` with >10MB file → 400 "File too large"
- [ ] `POST .../images` when product has 5 images → 400 "Maximum 5 images"
- [ ] `POST .../images` with no file → 400
- [ ] `DELETE .../images/:imageId` → deletes image record
- [ ] Uploaded image is accessible via public URL
- [ ] RLS: user A cannot see/modify user B's products

### Frontend:
- [ ] Identity page shows NoBrandPrompt when no brand selected
- [ ] Identity page shows product grid when brand is selected
- [ ] "Add Product" card opens sidebar with empty form
- [ ] Create product → card appears in grid
- [ ] Click product card → sidebar opens with product data + images
- [ ] Edit product name/description/category → save works
- [ ] Delete product → confirmation → product removed from grid
- [ ] Image drop zone: drag image onto zone → upload starts → image appears in gallery
- [ ] Image drop zone: click zone → file browser opens → select image → upload → appears
- [ ] Image drop zone: drop non-image file → error message
- [ ] Image × button → confirmation → image removed
- [ ] Image count updates correctly (3/5 → 4/5 after upload)
- [ ] Drop zone disabled at 5/5 images
- [ ] Switching brands in switcher → Identity page refetches for new brand
