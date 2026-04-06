import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGES_PER_PRODUCT = 5;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const brandProducts = new Hono();
brandProducts.use("*", authMiddleware);

// List products with images (nested select)
brandProducts.get("/:brandId/products", async (c) => {
  const token = c.get("token");
  const brandId = c.req.param("brandId");
  const sb = createUserClient(token);

  const { data, error } = await sb
    .from("brand_products")
    .select("*, brand_product_images(*)")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true })
    .order("sort_order", {
      ascending: true,
      referencedTable: "brand_product_images",
    });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ products: data });
});

// Create product
brandProducts.post("/:brandId/products", async (c) => {
  const token = c.get("token");
  const user = c.get("user");
  const brandId = c.req.param("brandId");

  let body: { name?: string; description?: string; category?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { name, description, category } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }
  if (name.length > 100) {
    return c.json({ error: "name must be 100 characters or less" }, 400);
  }

  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("brand_products")
    .insert({
      user_id: user.id,
      brand_id: brandId,
      name: name.trim(),
      description: description?.trim() || null,
      category: category?.trim() || null,
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ product: data }, 201);
});

// Update product
brandProducts.put("/:brandId/products/:id", async (c) => {
  const token = c.get("token");

  let body: { name?: string; description?: string; category?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    body.name === undefined &&
    body.description === undefined &&
    body.category === undefined
  ) {
    return c.json(
      { error: "At least one field (name, description, or category) is required" },
      400
    );
  }
  if (body.name !== undefined && (!body.name || body.name.trim().length === 0)) {
    return c.json({ error: "name cannot be empty" }, 400);
  }
  if (body.name && body.name.length > 100) {
    return c.json({ error: "name must be 100 characters or less" }, 400);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined)
    updates.description = body.description?.trim() || null;
  if (body.category !== undefined)
    updates.category = body.category?.trim() || null;

  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("brand_products")
    .update(updates)
    .eq("id", c.req.param("id"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ product: data });
});

// Delete product (cascade handles images rows; storage cleanup deferred BL-001)
brandProducts.delete("/:brandId/products/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { error } = await sb
    .from("brand_products")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

// Upload image to a product
brandProducts.post(
  "/:brandId/products/:productId/images",
  async (c) => {
    const token = c.get("token");
    const user = c.get("user");
    const productId = c.req.param("productId");

    // Parse multipart
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json(
        { error: "File must be an image (JPEG, PNG, or WebP)" },
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: "File too large (max 10MB)" }, 400);
    }

    const sb = createUserClient(token);

    // Check image count for this product
    const { count, error: countError } = await sb
      .from("brand_product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);

    if (countError) return c.json({ error: countError.message }, 400);
    if (count !== null && count >= MAX_IMAGES_PER_PRODUCT) {
      return c.json({ error: "Maximum 5 images per product" }, 400);
    }

    const sortOrder = count ?? 0;
    const ext = MIME_TO_EXT[file.type] || "jpg";
    const storagePath = `${user.id}/products/${productId}/${crypto.randomUUID()}.${ext}`;

    // Upload to Supabase Storage
    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await sb.storage
      .from("brand-assets")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error(
        `[brand-products] Storage upload failed:`,
        uploadError.message
      );
      return c.json({ error: "Failed to upload image" }, 500);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = sb.storage.from("brand-assets").getPublicUrl(storagePath);

    // Insert DB record
    const { data, error: insertError } = await sb
      .from("brand_product_images")
      .insert({
        user_id: user.id,
        product_id: productId,
        storage_path: storagePath,
        url: publicUrl,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (insertError) {
      console.error(
        `[brand-products] Image record insert failed:`,
        insertError.message
      );
      return c.json({ error: insertError.message }, 400);
    }

    return c.json({ image: data }, 201);
  }
);

// Delete image (DB row only; storage cleanup deferred BL-001)
brandProducts.delete(
  "/:brandId/products/:productId/images/:imageId",
  async (c) => {
    const token = c.get("token");
    const sb = createUserClient(token);

    const { error } = await sb
      .from("brand_product_images")
      .delete()
      .eq("id", c.req.param("imageId"));

    if (error) return c.json({ error: error.message }, 400);
    return c.json({ message: "Deleted" });
  }
);

export default brandProducts;
