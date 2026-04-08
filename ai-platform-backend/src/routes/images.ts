import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import { assemblePrompt, generateImage, type ReferenceImage } from "../lib/gemini";
import {
  buildGenerationContext,
  renderContextBlock,
} from "../lib/generation-context";
import { renderSkillsContent } from "../lib/skill-template";
import { deleteStorageFiles } from "../lib/storage-cleanup";

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
    skill_ids?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { prompt, content_type_id, product_ids, skill_ids } = body;
  let aspectRatio = body.aspect_ratio;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return c.json({ error: "prompt is required" }, 400);
  }
  if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    return c.json({ error: "aspect_ratio must be '1:1' or '9:16'" }, 400);
  }

  const sb = createUserClient(token);

  // Fetch brand (for the generation context block)
  const { data: brand, error: brandError } = await sb
    .from("brands")
    .select("name, description")
    .eq("id", brandId)
    .single();

  if (brandError || !brand) {
    return c.json({ error: "Brand not found" }, 404);
  }

  // Fetch content type if provided. We pull the full set of fields the
  // generation context needs, on top of the ones used by assemblePrompt().
  let contentType: {
    name: string;
    description: string | null;
    image_prompt_template: string | null;
    image_style: string | null;
    text_prompt_template: string | null;
    default_aspect_ratio: string;
  } | null = null;

  if (content_type_id) {
    const { data, error } = await sb
      .from("content_types")
      .select(
        "name, description, image_prompt_template, image_style, text_prompt_template, default_aspect_ratio"
      )
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

  // Fetch products with full metadata for both the context block and per-image
  // labels. We fetch id + name/description/category for ALL brand products,
  // then narrow to product_ids if the user specified them.
  const { data: allProducts } = await sb
    .from("brand_products")
    .select("id, name, description, category")
    .eq("brand_id", brandId);

  const allProductsList =
    (allProducts as
      | {
          id: string;
          name: string;
          description: string | null;
          category: string | null;
        }[]
      | null) || [];

  const selectedProducts =
    product_ids && product_ids.length > 0
      ? allProductsList.filter((p) => product_ids.includes(p.id))
      : allProductsList;

  const selectedProductIds = selectedProducts.map((p) => p.id);
  // Index by id so we can attach a name/category label per image.
  const productById = new Map(selectedProducts.map((p) => [p.id, p]));

  let productImages: ReferenceImage[] = [];

  if (selectedProductIds.length > 0) {
    const { data: imageRows } = await sb
      .from("brand_product_images")
      .select("url, product_id")
      .in("product_id", selectedProductIds)
      .order("sort_order", { ascending: true });

    if (imageRows && imageRows.length > 0) {
      // Fetch images in parallel and convert to base64. Each image carries
      // its source product's name + category as a label so the model can
      // associate the image with a specific product.
      const fetched = await Promise.all(
        (imageRows as { url: string; product_id: string }[]).map(async (row): Promise<ReferenceImage | null> => {
          try {
            const res = await fetch(row.url);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const mimeType =
              res.headers.get("content-type") || "image/jpeg";
            const product = productById.get(row.product_id);
            const ref: ReferenceImage = { base64, mimeType };
            if (product) {
              ref.label = product.category
                ? `"${product.name}" (${product.category})`
                : `"${product.name}"`;
            }
            return ref;
          } catch {
            console.error(
              `[images] Failed to fetch reference image: ${row.url}`
            );
            return null;
          }
        })
      );
      productImages = fetched.filter(
        (img): img is ReferenceImage => img !== null
      );
    }
  }

  // Fetch content type reference images (style examples). Each image is
  // labeled with the content type name so the model can tie style refs to
  // a specific content type.
  let contentTypeImages: ReferenceImage[] = [];

  if (content_type_id && contentType) {
    const { data: ctImageRows } = await sb
      .from("content_type_images")
      .select("url")
      .eq("content_type_id", content_type_id)
      .order("sort_order", { ascending: true });

    if (ctImageRows && ctImageRows.length > 0) {
      const ctName = contentType.name;
      const fetched = await Promise.all(
        (ctImageRows as { url: string }[]).map(async (row): Promise<ReferenceImage | null> => {
          try {
            const res = await fetch(row.url);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const mimeType = res.headers.get("content-type") || "image/jpeg";
            return {
              base64,
              mimeType,
              label: `content type "${ctName}"`,
            };
          } catch {
            console.error(`[images] Failed to fetch content type image: ${row.url}`);
            return null;
          }
        })
      );
      contentTypeImages = fetched.filter(
        (img): img is ReferenceImage => img !== null
      );
    }
  }

  // Build the generation context now that we know everything that will be
  // sent to the model. Used for both renderContextBlock() and skill template
  // substitution so the two views stay in sync.
  const ctx = buildGenerationContext({
    brand: { name: brand.name, description: brand.description ?? null },
    products: selectedProducts.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
    })),
    contentType: contentType
      ? {
          name: contentType.name,
          description: contentType.description,
          image_style: contentType.image_style,
          image_prompt_template: contentType.image_prompt_template,
          text_prompt_template: contentType.text_prompt_template,
          default_aspect_ratio: contentType.default_aspect_ratio,
        }
      : null,
    productImageCount: productImages.length,
    styleImageCount: contentTypeImages.length,
    aspectRatio,
  });

  const contextBlock = renderContextBlock(ctx);

  // Fetch selected skills (if any) and run {{...}} template substitution
  // against the generation context before concatenation.
  let skillsContent: string | null = null;
  if (Array.isArray(skill_ids) && skill_ids.length > 0) {
    const { data: skillsData } = await sb
      .from("skills")
      .select("name, content")
      .in("id", skill_ids);

    if (skillsData && skillsData.length > 0) {
      skillsContent = renderSkillsContent(
        skillsData as { name: string; content: string }[],
        ctx
      );
    }
  }

  // Assemble user-message text prompt (unchanged: content type template +
  // image style + user prompt).
  const fullPrompt = assemblePrompt(prompt.trim(), contentType);

  // Generate image via OpenRouter/Gemini
  let generated: { data: string; mimeType: string };
  try {
    generated = await generateImage(
      fullPrompt,
      productImages,
      contentTypeImages,
      aspectRatio as "1:1" | "9:16",
      skillsContent,
      null,
      contextBlock
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
      full_prompt: [
        contextBlock,
        skillsContent ? `[Skills]\n${skillsContent}` : null,
        `[Prompt]\n${fullPrompt}`,
      ]
        .filter(Boolean)
        .join("\n---\n"),
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

// List generated images (paginated, optional content type filter)
images.get("/:brandId/images", async (c) => {
  const token = c.get("token");
  const brandId = c.req.param("brandId");

  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "20")));
  const offset = (page - 1) * limit;
  const contentTypeFilter = c.req.query("content_type_id") || null;

  const sb = createUserClient(token);

  // Get total count
  let countQuery = sb
    .from("generated_images")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId);
  if (contentTypeFilter) {
    countQuery = countQuery.eq("content_type_id", contentTypeFilter);
  }
  const { count, error: countError } = await countQuery;

  if (countError) return c.json({ error: countError.message }, 400);

  // Get page
  let dataQuery = sb
    .from("generated_images")
    .select("id, prompt, aspect_ratio, content_type_id, url, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (contentTypeFilter) {
    dataQuery = dataQuery.eq("content_type_id", contentTypeFilter);
  }
  const { data, error } = await dataQuery;

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

// Delete generated image (storage file + DB row)
images.delete("/:brandId/images/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const imageId = c.req.param("id");

  const { data: imageRow } = await sb
    .from("generated_images")
    .select("storage_path")
    .eq("id", imageId)
    .single();

  if (imageRow?.storage_path) {
    await deleteStorageFiles(
      sb,
      [imageRow.storage_path],
      `generated image ${imageId}`
    );
  }

  const { error } = await sb
    .from("generated_images")
    .delete()
    .eq("id", imageId);

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default images;
