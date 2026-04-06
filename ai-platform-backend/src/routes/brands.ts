import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import { getDefaultContentTypes } from "../lib/default-content-types";

const brands = new Hono();
brands.use("*", authMiddleware);

// List brands (metadata only)
brands.get("/", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("brands")
    .select("id, name, description, updated_at")
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ brands: data });
});

// Get single brand
brands.get("/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("brands")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json({ brand: data });
});

// Create brand + seed default content types
brands.post("/", async (c) => {
  const token = c.get("token");
  const user = c.get("user");

  let body: { name?: string; description?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }
  if (name.length > 100) {
    return c.json({ error: "name must be 100 characters or less" }, 400);
  }

  const sb = createUserClient(token);

  // Check brand count limit
  const { count, error: countError } = await sb
    .from("brands")
    .select("id", { count: "exact", head: true });

  if (countError) return c.json({ error: countError.message }, 400);
  if (count !== null && count >= 5) {
    return c.json({ error: "Maximum 5 brands allowed" }, 400);
  }

  // Insert brand
  const { data: brand, error: insertError } = await sb
    .from("brands")
    .insert({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .select()
    .single();

  if (insertError) return c.json({ error: insertError.message }, 400);

  // Seed default content types (non-critical — log and continue on failure)
  try {
    const defaults = getDefaultContentTypes(brand.id, user.id);
    const { error: seedError } = await sb
      .from("content_types")
      .insert(defaults);

    if (seedError) {
      console.error(
        `[brands] Failed to seed content types for brand ${brand.id}:`,
        seedError.message
      );
    }
  } catch (err) {
    console.error(
      `[brands] Unexpected error seeding content types for brand ${brand.id}:`,
      err
    );
  }

  return c.json({ brand }, 201);
});

// Update brand
brands.put("/:id", async (c) => {
  const token = c.get("token");

  let body: { name?: string; description?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.name !== undefined && body.description === undefined && !body.name) {
    return c.json({ error: "name cannot be empty" }, 400);
  }
  if (body.name && body.name.length > 100) {
    return c.json({ error: "name must be 100 characters or less" }, 400);
  }
  if (body.name === undefined && body.description === undefined) {
    return c.json({ error: "At least one field (name or description) is required" }, 400);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined)
    updates.description = body.description?.trim() || null;

  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("brands")
    .update(updates)
    .eq("id", c.req.param("id"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ brand: data });
});

// Delete brand (cascade handles related rows)
brands.delete("/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { error } = await sb
    .from("brands")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default brands;
