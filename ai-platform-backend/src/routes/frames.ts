import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import { assemblePrompt, generateImage, type ReferenceImage } from "../lib/gemini";
import {
  buildGenerationContext,
  renderContextBlock,
} from "../lib/generation-context";
import { renderSkillsContent } from "../lib/skill-template";
import {
  generateFrameStoryboard,
  type FrameStoryboard,
} from "../lib/frame-storyboard";
import {
  collectFrameSetStoragePaths,
  deleteStorageFiles,
} from "../lib/storage-cleanup";

const VALID_ASPECT_RATIOS = ["1:1", "9:16"];
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const FRAME_COUNT = 5;

const frames = new Hono();
frames.use("*", authMiddleware);

// Generate a set of 5 frames sequentially
frames.post("/:brandId/frames/generate", async (c) => {
  const token = c.get("token");
  const user = c.get("user");
  const brandId = c.req.param("brandId");

  let body: {
    prompt?: string;
    content_type_id?: string;
    aspect_ratio?: string;
    skill_ids?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { prompt, content_type_id, skill_ids } = body;
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

  // Fetch content type if provided. Pull the full set of fields the
  // generation context needs.
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

    if (!aspectRatio) {
      aspectRatio = contentType.default_aspect_ratio;
    }
  }

  // Default to 9:16 for video frames
  if (!aspectRatio) aspectRatio = "9:16";

  // Fetch products with full metadata for both the context block and per-image
  // labels.
  const { data: allProducts } = await sb
    .from("brand_products")
    .select("id, name, description, category")
    .eq("brand_id", brandId);

  const productList =
    (allProducts as
      | {
          id: string;
          name: string;
          description: string | null;
          category: string | null;
        }[]
      | null) || [];

  const productById = new Map(productList.map((p) => [p.id, p]));
  const productIds = productList.map((p) => p.id);

  let productImages: ReferenceImage[] = [];

  if (productIds.length > 0) {
    const { data: imageRows } = await sb
      .from("brand_product_images")
      .select("url, product_id")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });

    if (imageRows && imageRows.length > 0) {
      const fetched = await Promise.all(
        (imageRows as { url: string; product_id: string }[]).map(async (row): Promise<ReferenceImage | null> => {
          try {
            const res = await fetch(row.url);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const mimeType = res.headers.get("content-type") || "image/jpeg";
            const product = productById.get(row.product_id);
            const ref: ReferenceImage = { base64, mimeType };
            if (product) {
              ref.label = product.category
                ? `"${product.name}" (${product.category})`
                : `"${product.name}"`;
            }
            return ref;
          } catch (err) {
            console.error(
              `[frames] !! PRODUCT REFERENCE IMAGE FETCH FAILED — product_id=${row.product_id}, url=${row.url}, error=${err instanceof Error ? err.message : String(err)}`
            );
            return null;
          }
        })
      );
      productImages = fetched.filter(
        (img): img is ReferenceImage => img !== null
      );
      if (productImages.length < imageRows.length) {
        console.warn(
          `[frames] !! Product reference image count mismatch: ${imageRows.length} rows in DB, only ${productImages.length} successfully fetched. Generation will proceed with reduced references.`
        );
      }
    }
  }

  // Fetch content type reference images
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
          } catch (err) {
            console.error(
              `[frames] !! CONTENT TYPE REFERENCE IMAGE FETCH FAILED — url=${row.url}, error=${err instanceof Error ? err.message : String(err)}`
            );
            return null;
          }
        })
      );
      contentTypeImages = fetched.filter(
        (img): img is ReferenceImage => img !== null
      );
      if (contentTypeImages.length < ctImageRows.length) {
        console.warn(
          `[frames] !! Content type reference image count mismatch: ${ctImageRows.length} rows in DB, only ${contentTypeImages.length} successfully fetched.`
        );
      }
    }
  }

  // Build the generation context once. It is reused for every frame so all 5
  // frames see the same context block + same template-substituted skills.
  const ctx = buildGenerationContext({
    brand: { name: brand.name, description: brand.description ?? null },
    products: productList.map((p) => ({
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

  // Fetch selected skills and run {{...}} template substitution against the
  // shared context. Done once before the frame loop.
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

  // Claude pre-pass: expand the brief user prompt into a structured storyboard.
  // The base scene is copy-pasted across every frame and each frame only
  // applies its one incremental `change`. If this fails we return 500 without
  // creating a frame set row.
  let storyboard: FrameStoryboard;
  try {
    storyboard = await generateFrameStoryboard(
      prompt.trim(),
      ctx,
      skillsContent,
      FRAME_COUNT
    );
  } catch (err) {
    console.error("[frames] Storyboard generation failed:", err);
    return c.json(
      {
        error: `Storyboard planning failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      },
      500
    );
  }

  // Assemble base prompt (unchanged: content type template + image style + user prompt)
  const basePrompt = assemblePrompt(prompt.trim(), contentType);
  const fullPrompt = [
    contextBlock,
    skillsContent ? `[Skills]\n${skillsContent}` : null,
    `[Storyboard]\n${JSON.stringify(storyboard, null, 2)}`,
    `[Prompt]\n${basePrompt}`,
  ]
    .filter(Boolean)
    .join("\n---\n");

  // Create frame set record
  const { data: frameSet, error: frameSetError } = await sb
    .from("generated_frame_sets")
    .insert({
      user_id: user.id,
      brand_id: brandId,
      content_type_id: content_type_id || null,
      prompt: prompt.trim(),
      full_prompt: fullPrompt,
      storyboard: storyboard,
      aspect_ratio: aspectRatio,
      status: "generating",
      frame_count: FRAME_COUNT,
    })
    .select()
    .single();

  if (frameSetError || !frameSet) {
    console.error("[frames] Failed to create frame set:", frameSetError?.message);
    return c.json({ error: frameSetError?.message || "Failed to create frame set" }, 400);
  }

  const frameSetId = frameSet.id;
  const generatedFrames: Array<{
    id: string;
    frame_number: number;
    url: string;
    storage_path: string;
    created_at: string;
  }> = [];

  // Generate frames sequentially — each frame references the previous one
  let previousFrameBase64: string | null = null;
  let previousFrameMimeType: string | null = null;

  for (let n = 1; n <= FRAME_COUNT; n++) {
    // Build frame-specific prompt from the storyboard: same base scene every
    // frame, only the per-frame change differs.
    const framePrompt = [
      `Frame ${n}/${FRAME_COUNT} of a video sequence.`,
      "",
      "[BASE SCENE — identical in every frame]",
      storyboard.base_scene,
      "",
      `[FRAME ${n} CHANGE]`,
      storyboard.frames[n - 1]!.change,
      "",
      "[CONSISTENCY ENFORCEMENT]",
      "Everything else in the scene — background, lighting direction, camera angle, surface, props, and all unchanged elements — must remain exactly identical to the previous frame. Only the described change should differ. The product must match the provided reference image exactly, including every letter on the label.",
    ].join("\n");

    // Build previous frame reference (if not the first frame)
    const prevFrame =
      previousFrameBase64 && previousFrameMimeType
        ? { base64: previousFrameBase64, mimeType: previousFrameMimeType }
        : null;

    let generated: { data: string; mimeType: string };
    try {
      generated = await generateImage(
        framePrompt,
        productImages,
        contentTypeImages,
        aspectRatio as "1:1" | "9:16",
        skillsContent,
        prevFrame,
        contextBlock
      );
    } catch (err) {
      console.error(`[frames] Frame ${n} generation failed:`, err);
      // Mark set as failed and return partial result
      await sb
        .from("generated_frame_sets")
        .update({ status: "failed" })
        .eq("id", frameSetId);

      return c.json(
        {
          frameSet: { ...frameSet, status: "failed" },
          frames: generatedFrames,
          error: `Frame ${n}/${FRAME_COUNT} generation failed: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        },
        500
      );
    }

    // Upload to storage
    const ext = MIME_TO_EXT[generated.mimeType] || "png";
    const storagePath = `${user.id}/frames/${frameSetId}/${n}.${ext}`;
    const imageBuffer = Buffer.from(generated.data, "base64");

    const { error: uploadError } = await sb.storage
      .from("brand-assets")
      .upload(storagePath, imageBuffer, {
        contentType: generated.mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[frames] Frame ${n} upload failed:`, uploadError.message);
      await sb
        .from("generated_frame_sets")
        .update({ status: "failed" })
        .eq("id", frameSetId);

      return c.json(
        {
          frameSet: { ...frameSet, status: "failed" },
          frames: generatedFrames,
          error: `Frame ${n} storage upload failed`,
        },
        500
      );
    }

    const {
      data: { publicUrl },
    } = sb.storage.from("brand-assets").getPublicUrl(storagePath);

    // Insert frame record
    const { data: frameRecord, error: insertError } = await sb
      .from("generated_frames")
      .insert({
        user_id: user.id,
        frame_set_id: frameSetId,
        frame_number: n,
        storage_path: storagePath,
        url: publicUrl,
      })
      .select()
      .single();

    if (insertError || !frameRecord) {
      console.error(`[frames] Frame ${n} DB insert failed:`, insertError?.message);
      await sb
        .from("generated_frame_sets")
        .update({ status: "failed" })
        .eq("id", frameSetId);

      return c.json(
        {
          frameSet: { ...frameSet, status: "failed" },
          frames: generatedFrames,
          error: `Frame ${n} database insert failed`,
        },
        500
      );
    }

    generatedFrames.push(frameRecord);

    // Keep this frame's data for the next iteration
    previousFrameBase64 = generated.data;
    previousFrameMimeType = generated.mimeType;

    console.log(`[frames] Frame ${n}/${FRAME_COUNT} complete for set ${frameSetId}`);
  }

  // Mark set as complete
  await sb
    .from("generated_frame_sets")
    .update({ status: "complete" })
    .eq("id", frameSetId);

  return c.json(
    {
      frameSet: { ...frameSet, status: "complete" },
      frames: generatedFrames,
    },
    201
  );
});

// List frame sets (paginated)
frames.get("/:brandId/frames", async (c) => {
  const token = c.get("token");
  const brandId = c.req.param("brandId");

  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "20")));
  const offset = (page - 1) * limit;

  const sb = createUserClient(token);

  // Get total count
  const { count, error: countError } = await sb
    .from("generated_frame_sets")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId);

  if (countError) return c.json({ error: countError.message }, 400);

  // Get frame sets
  const { data: frameSets, error } = await sb
    .from("generated_frame_sets")
    .select("id, prompt, aspect_ratio, content_type_id, status, frame_count, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ error: error.message }, 400);

  // Fetch frames for each set
  const setIds = (frameSets || []).map((s: { id: string }) => s.id);
  let framesMap: Record<string, Array<{ id: string; frame_number: number; url: string }>> = {};

  if (setIds.length > 0) {
    const { data: allFrames } = await sb
      .from("generated_frames")
      .select("id, frame_set_id, frame_number, url")
      .in("frame_set_id", setIds)
      .order("frame_number", { ascending: true });

    if (allFrames) {
      for (const f of allFrames as Array<{ id: string; frame_set_id: string; frame_number: number; url: string }>) {
        if (!framesMap[f.frame_set_id]) framesMap[f.frame_set_id] = [];
        framesMap[f.frame_set_id].push({ id: f.id, frame_number: f.frame_number, url: f.url });
      }
    }
  }

  const result = (frameSets || []).map((s: { id: string }) => ({
    ...s,
    frames: framesMap[s.id] || [],
  }));

  return c.json({
    frameSets: result,
    total: count ?? 0,
    page,
    limit,
  });
});

// Get single frame set with all frames
frames.get("/:brandId/frames/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { data: frameSet, error } = await sb
    .from("generated_frame_sets")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error) return c.json({ error: error.message }, 404);

  const { data: framesList } = await sb
    .from("generated_frames")
    .select("*")
    .eq("frame_set_id", frameSet.id)
    .order("frame_number", { ascending: true });

  return c.json({ frameSet, frames: framesList || [] });
});

// Delete frame set + frames + storage
frames.delete("/:brandId/frames/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const frameSetId = c.req.param("id");

  // Clean up storage before DB delete — helper logs and swallows failures.
  const paths = await collectFrameSetStoragePaths(sb, frameSetId);
  await deleteStorageFiles(sb, paths, `frame set ${frameSetId}`);

  // Delete frame set (CASCADE deletes frames)
  const { error } = await sb
    .from("generated_frame_sets")
    .delete()
    .eq("id", frameSetId);

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default frames;
