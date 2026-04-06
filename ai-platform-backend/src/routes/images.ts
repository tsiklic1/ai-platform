import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import { assemblePrompt, generateImage } from "../lib/gemini";

const VALID_ASPECT_RATIOS = ["1:1", "9:16"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const images = new Hono();
images.use("*", authMiddleware);

// Generate image
images.post("/:brandId/images/generate", async (c) => {
  const token = c.get("token");
  const user = c.get("user");
  const brandId = c.req.param("brandId");

  let body: {
    prompt?: string;
    content_type_id?: string;
    aspect_ratio?: string;
    product_ids?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { prompt, content_type_id, product_ids } = body;
  let aspectRatio = body.aspect_ratio;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return c.json({ error: "prompt is required" }, 400);
  }
  if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    return c.json({ error: "aspect_ratio must be '1:1' or '9:16'" }, 400);
  }

  const sb = createUserClient(token);

  // Fetch content type if provided
  let contentType: {
    image_prompt_template: string | null;
    image_style: string | null;
    default_aspect_ratio: string;
  } | null = null;

  if (content_type_id) {
    const { data, error } = await sb
      .from("content_types")
      .select("image_prompt_template, image_style, default_aspect_ratio")
      .eq("id", content_type_id)
      .single();

    if (error || !data) {
      return c.json({ error: "Content type not found" }, 404);
    }
    contentType = data;

    // Use content type's default aspect ratio if user didn't specify
    if (!aspectRatio) {
      aspectRatio = contentType.default_aspect_ratio;
    }
  }

  if (!aspectRatio) aspectRatio = "1:1";

  // Fetch product reference images for the brand
  const { data: products } = await sb
    .from("brand_products")
    .select("id")
    .eq("brand_id", brandId);

  const productIds = products?.map((p: { id: string }) => p.id) || [];

  let productImages: { base64: string; mimeType: string }[] = [];

  if (productIds.length > 0) {
    const query = sb
      .from("brand_product_images")
      .select("url")
      .order("sort_order", { ascending: true });

    // Filter by specific products if provided, otherwise all brand products
    if (product_ids && product_ids.length > 0) {
      query.in("product_id", product_ids);
    } else {
      query.in("product_id", productIds);
    }

    const { data: imageRows } = await query;

    if (imageRows && imageRows.length > 0) {
      // Fetch images in parallel and convert to base64
      const fetched = await Promise.all(
        imageRows.map(async (row: { url: string }) => {
          try {
            const res = await fetch(row.url);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const contentType =
              res.headers.get("content-type") || "image/jpeg";
            return { base64, mimeType: contentType };
          } catch {
            console.error(
              `[images] Failed to fetch reference image: ${row.url}`
            );
            return null;
          }
        })
      );
      productImages = fetched.filter(
        (img): img is { base64: string; mimeType: string } => img !== null
      );
    }
  }

  // Fetch content type reference images (style examples)
  let contentTypeImages: { base64: string; mimeType: string }[] = [];

  if (content_type_id) {
    const { data: ctImageRows } = await sb
      .from("content_type_images")
      .select("url")
      .eq("content_type_id", content_type_id)
      .order("sort_order", { ascending: true });

    if (ctImageRows && ctImageRows.length > 0) {
      const fetched = await Promise.all(
        ctImageRows.map(async (row: { url: string }) => {
          try {
            const res = await fetch(row.url);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const ct = res.headers.get("content-type") || "image/jpeg";
            return { base64, mimeType: ct };
          } catch {
            console.error(`[images] Failed to fetch content type image: ${row.url}`);
            return null;
          }
        })
      );
      contentTypeImages = fetched.filter(
        (img): img is { base64: string; mimeType: string } => img !== null
      );
    }
  }

  // Assemble prompt
  const fullPrompt = assemblePrompt(prompt.trim(), contentType);

  // Generate image via OpenRouter/Gemini
  let generated: { data: string; mimeType: string };
  try {
    generated = await generateImage(
      fullPrompt,
      productImages,
      contentTypeImages,
      aspectRatio as "1:1" | "9:16"
    );
  } catch (err) {
    console.error("[images] Generation failed:", err);
    return c.json(
      {
        error:
          err instanceof Error ? err.message : "Image generation failed",
      },
      500
    );
  }

  // Save to Supabase Storage
  const ext = MIME_TO_EXT[generated.mimeType] || "png";
  const storagePath = `${user.id}/generated/${brandId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const imageBuffer = Buffer.from(generated.data, "base64");

  const { error: uploadError } = await sb.storage
    .from("brand-assets")
    .upload(storagePath, imageBuffer, {
      contentType: generated.mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[images] Storage upload failed:", uploadError.message);
    return c.json({ error: "Failed to save generated image" }, 500);
  }

  const {
    data: { publicUrl },
  } = sb.storage.from("brand-assets").getPublicUrl(storagePath);

  // Insert DB record
  const { data: imageRecord, error: insertError } = await sb
    .from("generated_images")
    .insert({
      user_id: user.id,
      brand_id: brandId,
      content_type_id: content_type_id || null,
      prompt: prompt.trim(),
      full_prompt: fullPrompt,
      aspect_ratio: aspectRatio,
      storage_path: storagePath,
      url: publicUrl,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[images] DB insert failed:", insertError.message);
    return c.json({ error: insertError.message }, 400);
  }

  return c.json({ image: imageRecord }, 201);
});

// List generated images (paginated)
images.get("/:brandId/images", async (c) => {
  const token = c.get("token");
  const brandId = c.req.param("brandId");

  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "20")));
  const offset = (page - 1) * limit;

  const sb = createUserClient(token);

  // Get total count
  const { count, error: countError } = await sb
    .from("generated_images")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId);

  if (countError) return c.json({ error: countError.message }, 400);

  // Get page
  const { data, error } = await sb
    .from("generated_images")
    .select("id, prompt, aspect_ratio, content_type_id, url, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ error: error.message }, 400);

  return c.json({
    images: data,
    total: count ?? 0,
    page,
    limit,
  });
});

// Get single generated image (full details)
images.get("/:brandId/images/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { data, error } = await sb
    .from("generated_images")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json({ image: data });
});

// Delete generated image (DB only; storage cleanup deferred BL-001)
images.delete("/:brandId/images/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { error } = await sb
    .from("generated_images")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default images;
