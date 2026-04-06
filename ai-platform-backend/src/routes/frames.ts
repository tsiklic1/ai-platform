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

    if (!aspectRatio) {
      aspectRatio = contentType.default_aspect_ratio;
    }
  }

  // Default to 9:16 for video frames
  if (!aspectRatio) aspectRatio = "9:16";

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
      .order("sort_order", { ascending: true })
      .in("product_id", productIds);

    const { data: imageRows } = await query;

    if (imageRows && imageRows.length > 0) {
      const fetched = await Promise.all(
        imageRows.map(async (row: { url: string }) => {
          try {
            const res = await fetch(row.url);
            if (!res.ok) return null;
            const buffer = await res.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const ct = res.headers.get("content-type") || "image/jpeg";
            return { base64, mimeType: ct };
          } catch {
            console.error(`[frames] Failed to fetch reference image: ${row.url}`);
            return null;
          }
        })
      );
      productImages = fetched.filter(
        (img): img is { base64: string; mimeType: string } => img !== null
      );
    }
  }

  // Fetch content type reference images
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
            console.error(`[frames] Failed to fetch content type image: ${row.url}`);
            return null;
          }
        })
      );
      contentTypeImages = fetched.filter(
        (img): img is { base64: string; mimeType: string } => img !== null
      );
    }
  }

  // Fetch selected skills
  let skillsContent: string | null = null;
  if (Array.isArray(skill_ids) && skill_ids.length > 0) {
    const { data: skillsData } = await sb
      .from("skills")
      .select("name, content")
      .in("id", skill_ids);

    if (skillsData && skillsData.length > 0) {
      skillsContent = skillsData
        .map((s: { name: string; content: string }) =>
          `## Skill: ${s.name}\n${s.content}`
        )
        .join("\n\n---\n\n");
    }
  }

  // Assemble base prompt
  const basePrompt = assemblePrompt(prompt.trim(), contentType);
  const fullPrompt = skillsContent
    ? `[SKILLS]\n${skillsContent}\n\n[PROMPT]\n${basePrompt}`
    : basePrompt;

  // Create frame set record
  const { data: frameSet, error: frameSetError } = await sb
    .from("generated_frame_sets")
    .insert({
      user_id: user.id,
      brand_id: brandId,
      content_type_id: content_type_id || null,
      prompt: prompt.trim(),
      full_prompt: fullPrompt,
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
    // Build frame-specific prompt
    const framePrompt = `Frame ${n}/${FRAME_COUNT} of a video sequence. Generate this frame as part of a smooth visual narrative.\n\n${basePrompt}`;

    // Build reference images for this frame: product images + previous frame
    const frameRefImages = [...productImages];
    if (previousFrameBase64 && previousFrameMimeType) {
      frameRefImages.push({
        base64: previousFrameBase64,
        mimeType: previousFrameMimeType,
      });
    }

    // Build the prompt with continuity instructions
    let finalFramePrompt = framePrompt;
    if (n > 1) {
      finalFramePrompt =
        "The following images include the PREVIOUS FRAME of this video sequence. You MUST maintain exact visual continuity — same style, lighting, color palette, camera angle, and scene elements. Only advance the action/motion slightly for this next frame.\n\n" +
        framePrompt;
    }

    let generated: { data: string; mimeType: string };
    try {
      generated = await generateImage(
        finalFramePrompt,
        frameRefImages,
        contentTypeImages,
        aspectRatio as "1:1" | "9:16",
        skillsContent
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

  // Fetch frames to get storage paths
  const { data: framesList } = await sb
    .from("generated_frames")
    .select("storage_path")
    .eq("frame_set_id", c.req.param("id"));

  // Delete storage files
  if (framesList && framesList.length > 0) {
    const paths = framesList.map((f: { storage_path: string }) => f.storage_path);
    await sb.storage.from("brand-assets").remove(paths);
  }

  // Delete frame set (CASCADE deletes frames)
  const { error } = await sb
    .from("generated_frame_sets")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default frames;
