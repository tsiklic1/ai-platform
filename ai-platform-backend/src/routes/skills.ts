import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";

const skills = new Hono();
skills.use("*", authMiddleware);

// List skills (metadata only — no content)
skills.get("/", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("skills")
    .select("id, name, description, actions, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ skills: data });
});

// Get skills filtered by action type
skills.get("/by-action/:action", async (c) => {
  const token = c.get("token");
  const action = c.req.param("action");
  const sb = createUserClient(token);

  const { data, error } = await sb
    .from("skills")
    .select("id, name, description")
    .contains("actions", [action])
    .order("name");

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ skills: data });
});

// Get single skill (with content)
skills.get("/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("skills")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json({ skill: data });
});

// Create skill
skills.post("/", async (c) => {
  const token = c.get("token");
  const user = c.get("user");
  const { name, description, content, actions } = await c.req.json();

  if (!name || !content) {
    return c.json({ error: "name and content are required" }, 400);
  }

  const validActions = Array.isArray(actions)
    ? actions.filter((a: unknown) => typeof a === "string")
    : [];

  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("skills")
    .insert({ user_id: user.id, name, description: description || null, content, actions: validActions })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ skill: data }, 201);
});

// Update skill
skills.put("/:id", async (c) => {
  const token = c.get("token");
  const body = await c.req.json();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.content !== undefined) updates.content = body.content;
  if (body.actions !== undefined) {
    updates.actions = Array.isArray(body.actions)
      ? body.actions.filter((a: unknown) => typeof a === "string")
      : [];
  }

  const sb = createUserClient(token);
  const { data, error } = await sb
    .from("skills")
    .update(updates)
    .eq("id", c.req.param("id"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ skill: data });
});

// Delete skill
skills.delete("/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);
  const { error } = await sb
    .from("skills")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default skills;
