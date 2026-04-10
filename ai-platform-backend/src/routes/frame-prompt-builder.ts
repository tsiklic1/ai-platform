import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import {
  buildFrameUserPrompt,
  generateFramePrompts,
} from "../lib/frame-prompt-builder";
import { renderSkillsContent } from "../lib/skill-template";
import { buildGenerationContext } from "../lib/generation-context";

const framePromptBuilder = new Hono();
framePromptBuilder.use("*", authMiddleware);

framePromptBuilder.post("/generate", async (c) => {
  const token = c.get("token");

  let body: { vibe?: string; brand_id?: string; skill_ids?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { vibe, brand_id, skill_ids } = body;

  if (!vibe || typeof vibe !== "string" || vibe.trim().length === 0) {
    return c.json({ error: "vibe is required" }, 400);
  }
  if (vibe.length > 500) {
    return c.json({ error: "vibe must be 500 characters or less" }, 400);
  }
  if (!brand_id || typeof brand_id !== "string") {
    return c.json({ error: "brand_id is required" }, 400);
  }

  const sb = createUserClient(token);

  // Fetch brand
  const { data: brand, error: brandError } = await sb
    .from("brands")
    .select("name, description")
    .eq("id", brand_id)
    .single();

  if (brandError || !brand) {
    return c.json({ error: "Brand not found" }, 404);
  }

  // Fetch and render skills if provided
  let skillsContent: string | null = null;
  if (Array.isArray(skill_ids) && skill_ids.length > 0) {
    const { data: skillsData } = await sb
      .from("skills")
      .select("name, content")
      .in("id", skill_ids);

    if (skillsData && skillsData.length > 0) {
      // Build a minimal generation context for template substitution
      const ctx = buildGenerationContext({
        brand: { name: brand.name, description: brand.description ?? null },
      });
      skillsContent = renderSkillsContent(
        skillsData as { name: string; content: string }[],
        ctx
      );
    }
  }

  try {
    const userPrompt = buildFrameUserPrompt(
      vibe.trim(),
      { name: brand.name, description: brand.description ?? null },
      skillsContent
    );

    const frames = await generateFramePrompts(userPrompt);
    return c.json({ frames });
  } catch (err) {
    console.error("[frame-prompt-builder] Generation failed:", err);
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Frame prompt generation failed",
      },
      500
    );
  }
});

export default framePromptBuilder;
