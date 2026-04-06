import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import { assembleTextPrompt, generateText } from "../lib/text-gen";

const texts = new Hono<{
  Variables: { token: string; user: { id: string; email: string } };
}>();

texts.use("*", authMiddleware);

// Generate caption
texts.post("/:brandId/texts/generate", async (c) => {
  const token = c.get("token");
  const user = c.get("user");
  const brandId = c.req.param("brandId");
  const sb = createUserClient(token);

  const body = await c.req.json<{
    prompt: string;
    content_type_id?: string;
    skill_ids?: string[];
  }>();

  const { prompt, content_type_id, skill_ids } = body;
  if (!prompt?.trim()) {
    return c.json({ error: "prompt is required" }, 400);
  }

  // Fetch brand name
  const { data: brand, error: brandError } = await sb
    .from("brands")
    .select("name")
    .eq("id", brandId)
    .single();

  if (brandError || !brand) {
    return c.json({ error: "Brand not found" }, 404);
  }

  // Fetch products for brand context
  const { data: products } = await sb
    .from("brand_products")
    .select("name, description, category")
    .eq("brand_id", brandId);

  const brandContext = {
    brandName: brand.name,
    products: (products || []) as { name: string; description: string | null; category: string | null }[],
  };

  // Fetch content type if provided
  let contentType: { text_prompt_template: string | null; name: string } | null = null;
  if (content_type_id) {
    const { data, error } = await sb
      .from("content_types")
      .select("name, text_prompt_template")
      .eq("id", content_type_id)
      .single();

    if (error || !data) {
      return c.json({ error: "Content type not found" }, 404);
    }
    contentType = data;
  }

  // Fetch selected skills (if any)
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

  // Assemble prompt
  const { systemPrompt, userPrompt, fullPrompt } = assembleTextPrompt(
    prompt.trim(),
    contentType,
    brandContext,
    skillsContent
  );

  // Generate text via Claude
  let generatedText: string;
  try {
    generatedText = await generateText(systemPrompt, userPrompt);
  } catch (err) {
    console.error("[texts] Generation failed:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Text generation failed" },
      500
    );
  }

  // Save to DB
  const { data, error: insertError } = await sb
    .from("generated_texts")
    .insert({
      user_id: user.id,
      brand_id: brandId,
      content_type_id: content_type_id || null,
      prompt: prompt.trim(),
      full_prompt: fullPrompt,
      generated_text: generatedText,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[texts] Insert failed:", insertError.message);
    return c.json({ error: insertError.message }, 400);
  }

  return c.json({ text: data }, 201);
});

// List generated texts (paginated)
texts.get("/:brandId/texts", async (c) => {
  const token = c.get("token");
  const brandId = c.req.param("brandId");
  const sb = createUserClient(token);

  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 20));
  const offset = (page - 1) * limit;

  // Get total count
  const { count } = await sb
    .from("generated_texts")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId);

  // Get page
  const { data, error } = await sb
    .from("generated_texts")
    .select("id, prompt, generated_text, content_type_id, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ error: error.message }, 400);

  return c.json({
    texts: data || [],
    total: count || 0,
    page,
    limit,
  });
});

// Get single text (full details)
texts.get("/:brandId/texts/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { data, error } = await sb
    .from("generated_texts")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json({ text: data });
});

// Delete generated text
texts.delete("/:brandId/texts/:id", async (c) => {
  const token = c.get("token");
  const sb = createUserClient(token);

  const { error } = await sb
    .from("generated_texts")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: "Deleted" });
});

export default texts;
