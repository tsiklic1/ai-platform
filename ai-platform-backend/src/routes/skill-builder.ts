import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
  getSystemPrompt,
  buildUserPrompt,
  generateSkillContent,
  deriveSkillMeta,
} from "../lib/skill-builder-prompts";

const VALID_SKILL_TYPES = ["image", "captions", "frames"] as const;
type SkillType = (typeof VALID_SKILL_TYPES)[number];

const skillBuilder = new Hono();
skillBuilder.use("*", authMiddleware);

skillBuilder.post("/generate", async (c) => {
  let body: {
    skill_type?: string;
    form_data?: Record<string, unknown>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate skill_type
  const skillType = body.skill_type as SkillType;
  if (!skillType || !VALID_SKILL_TYPES.includes(skillType)) {
    return c.json(
      { error: "skill_type must be 'image', 'captions', or 'frames'" },
      400
    );
  }

  // Validate form_data
  const formData = body.form_data;
  if (!formData || typeof formData !== "object") {
    return c.json({ error: "form_data is required" }, 400);
  }

  const brandName = formData.brand_name;
  if (!brandName || typeof brandName !== "string" || !brandName.trim()) {
    return c.json({ error: "form_data.brand_name is required" }, 400);
  }

  // Build prompts
  const systemPrompt = getSystemPrompt(skillType);
  const userPrompt = buildUserPrompt(
    formData as unknown as Parameters<typeof buildUserPrompt>[0]
  );

  console.log(
    `[skill-builder] Generating ${skillType} skill for brand "${brandName}"`
  );

  // Generate
  let content: string;
  try {
    content = await generateSkillContent(systemPrompt, userPrompt);
  } catch (err) {
    console.error("[skill-builder] Generation failed:", err);
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Skill generation failed unexpectedly",
      },
      500
    );
  }

  const meta = deriveSkillMeta(brandName.trim(), skillType);

  return c.json({
    name: meta.name,
    description: meta.description,
    content,
    actions: meta.actions,
  });
});

export default skillBuilder;
