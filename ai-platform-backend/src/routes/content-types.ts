import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import {
  collectContentTypeStoragePaths,
  deleteStorageFiles,
} from "../lib/storage-cleanup";

const VALID_ASPECT_RATIOS = ["1:1", "9:16"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGES_PER_CT = 5;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const contentTypes = new Hono();
contentTypes.use("*", authMiddleware);

// List content types (summary — no templates)
contentTypes.get("/:brandId/content-types", async (c) => {
  const token = c.get("token");
  const brandId = c.req.param("brandId");
  const sb = createUserClient(token);

  const { data, error } = await sb
    .from("content_types")
    .select("id, name, description, default_aspect_ratio, is_default, sort_order")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ contentTypes: data });
});

// Get full content type (with templates)
contentTypes.get("/:brandId/content-types/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { data, error } = await sb
    .from("content_types")
    .select("*, content_type_images(*)")
    .eq("id", c.req.param("id"))
    .order("sort_order", { ascending: true, referencedTable: "content_type_images" })
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json({ contentType: data });
});

// Create custom content type
contentTypes.post("/:brandId/content-types", async (c) => {
  const token = c.get("token");
  const user = c.get("user");
  const brandId = c.req.param("brandId");

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const name = body.name as string | undefined;
  const description = (body.description as string) || null;
  const text_prompt_template = (body.text_prompt_template as string) || null;
  const image_prompt_template = (body.image_prompt_template as string) || null;
  const image_style = (body.image_style as string) || null;
  const default_aspect_ratio = (body.default_aspect_ratio as string) || "1:1";

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }
  if (name.length > 100) {
    return c.json({ error: "name must be 100 characters or less" }, 400);
  }
  if (!VALID_ASPECT_RATIOS.includes(default_aspect_ratio)) {
    return c.json({ error: "default_aspect_ratio must be '1:1' or '9:16'" }, 400);
  }

  const sb = createUserClient(token);

  // Determine sort_order
  const { data: maxRow } = await sb
    .from("content_types")
    .select("sort_order")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sortOrder = maxRow ? maxRow.sort_order + 1 : 0;

  const { data, error } = await sb
    .from("content_types")
    .insert({
      user_id: user.id,
      brand_id: brandId,
      name: name.trim(),
      description: description?.trim() || null,
      text_prompt_template: text_prompt_template?.trim() || null,
      image_prompt_template: image_prompt_template?.trim() || null,
      image_style: image_style?.trim() || null,
      default_aspect_ratio,
      is_default: false,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ contentType: data }, 201);
});

// Update content type (flips is_default to false)
contentTypes.put("/:brandId/content-types/:id", async (c) => {
  const token = c.get("token");

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const allowedFields = [
    "name",
    "description",
    "text_prompt_template",
    "image_prompt_template",
    "image_style",
    "default_aspect_ratio",
  ];

  const hasUpdate = allowedFields.some((f) => body[f] !== undefined);
  if (!hasUpdate) {
    return c.json({ error: "At least one field is required" }, 400);
  }

  if (body.name !== undefined) {
    if (!body.name || (body.name as string).trim().length === 0) {
      return c.json({ error: "name cannot be empty" }, 400);
    }
    if ((body.name as string).length > 100) {
      return c.json({ error: "name must be 100 characters or less" }, 400);
    }
  }

  if (
    body.default_aspect_ratio !== undefined &&
    !VALID_ASPECT_RATIOS.includes(body.default_aspect_ratio as string)
  ) {
    return c.json({ error: "default_aspect_ratio must be '1:1' or '9:16'" }, 400);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    is_default: false, // any edit flips this
  };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      const val = body[field];
      updates[field] =
        typeof val === "string" ? val.trim() || null : val;
    }
  }
  // name should never be null
  if (updates.name === null) {
    return c.json({ error: "name cannot be empty" }, 400);
  }

  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("content_types")
    .update(updates)
    .eq("id", c.req.param("id"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ contentType: data });
});

// Delete content type (cascade handles image rows; we also clean up storage)
contentTypes.delete("/:brandId/content-types/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const contentTypeId = c.req.param("id");

  const paths = await collectContentTypeStoragePaths(sb, contentTypeId);
  await deleteStorageFiles(sb, paths, `content type ${contentTypeId}`);

  const { error } = await sb
    .from("content_types")
    .delete()
    .eq("id", contentTypeId);

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

// Upload reference image to a content type
contentTypes.post("/:brandId/content-types/:id/images", async (c) => {
  const token = c.get("token");
  const user = c.get("user");
  const contentTypeId = c.req.param("id");

  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "file is required" }, 400);
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return c.json({ error: "File must be an image (JPEG, PNG, or WebP)" }, 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "File too large (max 10MB)" }, 400);
  }

  const sb = createUserClient(token);

  // Check image count
  const { count, error: countError } = await sb
    .from("content_type_images")
    .select("id", { count: "exact", head: true })
    .eq("content_type_id", contentTypeId);

  if (countError) return c.json({ error: countError.message }, 400);
  if (count !== null && count >= MAX_IMAGES_PER_CT) {
    return c.json({ error: "Maximum 5 reference images per content type" }, 400);
  }

  const sortOrder = count ?? 0;
  const ext = MIME_TO_EXT[file.type] || "jpg";
  const storagePath = `${user.id}/content-types/${contentTypeId}/${crypto.randomUUID()}.${ext}`;

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await sb.storage
    .from("brand-assets")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[content-types] Storage upload failed:", uploadError.message);
    return c.json({ error: "Failed to upload image" }, 500);
  }

  const {
    data: { publicUrl },
  } = sb.storage.from("brand-assets").getPublicUrl(storagePath);

  const { data, error: insertError } = await sb
    .from("content_type_images")
    .insert({
      user_id: user.id,
      content_type_id: contentTypeId,
      storage_path: storagePath,
      url: publicUrl,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[content-types] Image record insert failed:", insertError.message);
    return c.json({ error: insertError.message }, 400);
  }

  return c.json({ image: data }, 201);
});

// Delete reference image from a content type (storage file + DB row)
contentTypes.delete("/:brandId/content-types/:id/images/:imageId", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const imageId = c.req.param("imageId");

  const { data: imageRow } = await sb
    .from("content_type_images")
    .select("storage_path")
    .eq("id", imageId)
    .single();

  if (imageRow?.storage_path) {
    await deleteStorageFiles(
      sb,
      [imageRow.storage_path],
      `content type image ${imageId}`
    );
  }

  const { error } = await sb
    .from("content_type_images")
    .delete()
    .eq("id", imageId);

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default contentTypes;
