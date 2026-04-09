/**
 * Skill Builder — system prompts, user prompt serialization, and AI generation.
 *
 * Uses OpenRouter (model configurable via SKILL_BUILDER_MODEL env var).
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const SKILL_BUILDER_MODEL =
  process.env.SKILL_BUILDER_MODEL || "anthropic/claude-sonnet-4";

// ─── System Prompts ────────────────────────────────────────

const IMAGE_SYSTEM_PROMPT = `You are an expert at writing AI skill documents for an image generation platform. Given detailed information about a brand, you generate a comprehensive skill document in markdown that will guide an AI image generator to produce brand-consistent images.

The skill document MUST include these sections in this exact order:

1. **Title & Introduction** — "# [Brand Name] Image Generator" + one-paragraph summary of the brand and what this skill does.

2. **Non-Negotiable Product Accuracy Rules** — Mandatory visual rules about product appearance that must never change. Include:
   - Variant/product descriptions with exact colors, design elements, label text, distinguishing features
   - A "Mandatory variant lock" list with one-line visual summaries per variant
   - Rules about when to use product reference images (always for product accuracy)

3. **Product Placement & Composition Rules** — How many products in frame, placement priority, when to reduce count, strategic placement guidelines.

4. **Lighting Consistency Rule** — Global rule about maintaining physically consistent lighting direction, shadows, color temperature across the full image.

5. **Workflow** — 5-step process:
   - Step 1: Identify the content type (include a table of content types with visual direction if the user provided content type info)
   - Step 2: Study reference images (composition, color, lighting, typography, props)
   - Step 3: Build generation prompt (brand context, product accuracy, content-type visual direction)
   - Step 4: Generate the image (format specs, aspect ratios)
   - Step 5: Review and iterate (comparison checklist)

6. **Content-Type Visual Direction** — For each content type the user described, write 2-3 sentences of specific visual direction: setting, lighting, mood, composition, props.

7. **Quick Prompt Templates** — One ready-to-use prompt template per content type, formatted as blockquotes. Each should be a complete, detailed image generation prompt.

8. **Do's and Don'ts** — If provided by the user, format as bullet lists.

IMPORTANT RULES:
- Output ONLY the markdown content. No YAML frontmatter, no code fences around the whole document.
- Start directly with the # heading.
- Be extremely specific about visual details — exact colors, materials, textures, lighting setups.
- The prompt templates should be long and detailed (3-5 sentences each), not generic one-liners.
- Use the brand's actual product names, colors, and details throughout.
- Every section should read like it was written by someone who deeply knows this brand.`;

const CAPTIONS_SYSTEM_PROMPT = `You are an expert at writing AI skill documents for a social media caption generation platform. Given detailed information about a brand, you generate a comprehensive skill document in markdown that will guide an AI caption writer.

The skill document MUST include these sections in this exact order:

1. **Title & Introduction** — "# [Brand Name] Caption Writer" + one-paragraph summary.

2. **Brand Context** — Account details, brand name, products, tone of voice, visual identity, target audience.

3. **Output Format** — How captions should be structured (e.g., both languages if multilingual, visual notes section).

4. **Caption Rules** — Specific rules covering:
   - Length (character count sweet spot)
   - Hook requirements (first line must stop the scroll)
   - Language versions (if multilingual, how each version should be handled)
   - Hashtag strategy (count, mix of branded/general, always-include tags)
   - Emoji usage (count, which emojis match brand palette)
   - CTA patterns (examples in each language if multilingual)

5. **Content Type Rotation** — Strategy for varying content types across posts. Include a priority table if the user provided content type info.

6. **Writing Workflow** — Step-by-step process per post (select type, draft each language version, add visual notes, verify hashtags, quality check).

7. **Language-Specific Guidelines** — For EACH language the brand uses:
   - Writing style and tone
   - Common phrases and expressions that fit the brand
   - Things to avoid (e.g., direct translations, formal language when casual is needed)

8. **Quality Checklist** — Bulleted verification list (hook quality, natural language, character count, hashtag count, emoji match, etc.).

9. **Example Output** — One complete example post showing the full format (all language versions, visual notes, content type label).

IMPORTANT RULES:
- Output ONLY the markdown content. No YAML frontmatter.
- Start directly with the # heading.
- Be specific to this brand — use their actual product names, brand voice, colors.
- Language guidelines should feel authentic, not textbook.
- The example output should be a realistic, high-quality post for this specific brand.`;

const FRAMES_SYSTEM_PROMPT = `You are an expert at writing AI skill documents for a video frames generation platform. Given detailed information about a brand, you generate a comprehensive skill document in markdown that will guide an AI to generate sequential keyframes for short videos.

CRITICAL CONTEXT: This platform generates individual IMAGE frames (not video). The frames are later fed into a video model (like SeedDance) by the user. Each frame is generated one at a time, sequentially, with each frame using the previous frame as a reference for visual continuity.

The skill document MUST include these sections in this exact order:

1. **Title & Introduction** — "# [Brand Name] Video Frames Generator" + one-paragraph summary. Emphasize that this generates IMAGES, not video.

2. **#1 Rule — Never Generate Frames in Parallel** — Bold emphasis that frames must be generated one at a time, sequentially. Each frame MUST use the previous frame's output as a reference.

3. **Core Rules** — Format defaults (9:16 vertical for Reels), product accuracy requirements, frame count guidelines (4-6 frames typical), consistency requirements.

4. **Product Accuracy Rules** — Same level of detail as an image skill:
   - Variant/product descriptions with exact colors, design elements
   - Mandatory variant lock list
   - Reference image requirements

5. **Content Type Suitability for Video** — Table showing which content types work well as video sequences and which don't, with notes on what kind of motion/action suits each.

6. **Workflow** — 5-step process:
   - Step 1: Determine content type and scenario
   - Step 2: Clarifying questions (variant, scenario, mood)
   - Step 3: Plan frame sequence (define what changes between each frame)
   - Step 4: Generate frames sequentially
   - Step 5: Provide video model prompt (SeedDance format)

7. **Gradual Progression Rule** — Non-negotiable rule that between any two consecutive frames, only 1-2 things should change. Everything else must remain identical. Include percentage markers for continuous actions (0%, 25%, 50%, 75%, 100%).

8. **Frame Prompt Template** — Three-part structure:
   - [BASE SCENE] — identical across all frames
   - [FRAME-SPECIFIC CHANGE] — the only thing that differs
   - [CONSISTENCY ENFORCEMENT] — instruction to keep everything else identical

9. **Example Frame Breakdown** — One complete multi-frame example (5 frames) for a specific scenario. Show the base scene and each frame's specific change. This is the most important section — make it extremely detailed and realistic for this brand.

10. **Lighting Consistency Rule** — Same light direction, color temperature, and shadow behavior across all frames.

11. **Brand Consistency** — Brand colors, aesthetic, product details summary.

IMPORTANT RULES:
- Output ONLY the markdown content. No YAML frontmatter.
- Start directly with the # heading.
- The example frame breakdown is CRITICAL — it should be a fully worked example showing exactly how to plan and describe each frame for this brand's products.
- Be extremely specific about visual details in the frame template and example.
- Use the brand's actual product names, colors, and visual details throughout.`;

// ─── User Prompt Builder ───────────────────────────────────

interface FormData {
  brand_name: string;
  brand_description?: string;
  product_details?: string;
  target_platforms?: string[];

  // Image-specific
  product_visual_rules?: string;
  visual_style?: string;
  visual_style_details?: string;
  composition_preferences?: string;
  lighting_preferences?: string;
  content_types_visual_direction?: string;
  dos_and_donts?: string;

  // Frames-specific
  video_sequence_types?: string;
  frame_progression_style?: string;
  motion_action_types?: string;
  video_content_types?: string;
  video_dos_and_donts?: string;

  // Captions-specific
  brand_voice_tone?: string;
  languages?: string[];
  language_guidelines?: string;
  caption_length_preference?: string;
  hashtag_strategy?: string;
  emoji_usage?: string;
  cta_style?: string;
  content_rotation_strategy?: string;
  example_caption?: string;
}

export function buildUserPrompt(formData: FormData): string {
  const sections: string[] = [];

  // Common fields
  sections.push(`## Brand Information`);
  sections.push(`- Brand Name: ${formData.brand_name}`);
  if (formData.brand_description)
    sections.push(`- Brand Description: ${formData.brand_description}`);
  if (formData.target_platforms?.length)
    sections.push(
      `- Target Platforms: ${formData.target_platforms.join(", ")}`
    );

  if (formData.product_details) {
    sections.push(`\n## Products\n${formData.product_details}`);
  }

  // Image-specific
  if (formData.product_visual_rules) {
    sections.push(
      `\n## Product Visual Accuracy Rules\n${formData.product_visual_rules}`
    );
  }
  if (formData.visual_style) {
    const detail = formData.visual_style_details
      ? ` — ${formData.visual_style_details}`
      : "";
    sections.push(`\n## Visual Style\n${formData.visual_style}${detail}`);
  }
  if (formData.composition_preferences) {
    sections.push(
      `\n## Composition Preferences\n${formData.composition_preferences}`
    );
  }
  if (formData.lighting_preferences) {
    sections.push(
      `\n## Lighting Preferences\n${formData.lighting_preferences}`
    );
  }
  if (formData.content_types_visual_direction) {
    sections.push(
      `\n## Content Types & Visual Direction\n${formData.content_types_visual_direction}`
    );
  }
  if (formData.dos_and_donts) {
    sections.push(`\n## Do's and Don'ts\n${formData.dos_and_donts}`);
  }

  // Frames-specific
  if (formData.video_sequence_types) {
    sections.push(
      `\n## Video Sequence Types\n${formData.video_sequence_types}`
    );
  }
  if (formData.frame_progression_style) {
    sections.push(
      `\n## Frame Progression Style\n${formData.frame_progression_style}`
    );
  }
  if (formData.motion_action_types) {
    sections.push(
      `\n## Motion & Action Types\n${formData.motion_action_types}`
    );
  }
  if (formData.video_content_types) {
    sections.push(
      `\n## Content Types Suited for Video\n${formData.video_content_types}`
    );
  }
  if (formData.video_dos_and_donts) {
    sections.push(
      `\n## Video Do's and Don'ts\n${formData.video_dos_and_donts}`
    );
  }

  // Captions-specific
  if (formData.brand_voice_tone) {
    sections.push(`\n## Brand Voice & Tone\n${formData.brand_voice_tone}`);
  }
  if (formData.languages?.length) {
    sections.push(`\n## Languages\n${formData.languages.join(", ")}`);
  }
  if (formData.language_guidelines) {
    sections.push(
      `\n## Language-Specific Guidelines\n${formData.language_guidelines}`
    );
  }
  if (formData.caption_length_preference) {
    sections.push(
      `\n## Caption Length Preference\n${formData.caption_length_preference}`
    );
  }
  if (formData.hashtag_strategy) {
    sections.push(`\n## Hashtag Strategy\n${formData.hashtag_strategy}`);
  }
  if (formData.emoji_usage) {
    sections.push(`\n## Emoji Usage\n${formData.emoji_usage}`);
  }
  if (formData.cta_style) {
    sections.push(`\n## CTA Style\n${formData.cta_style}`);
  }
  if (formData.content_rotation_strategy) {
    sections.push(
      `\n## Content Rotation Strategy\n${formData.content_rotation_strategy}`
    );
  }
  if (formData.example_caption) {
    sections.push(`\n## Example Caption\n${formData.example_caption}`);
  }

  return sections.join("\n");
}

// ─── System Prompt Getter ──────────────────────────────────

export function getSystemPrompt(
  skillType: "image" | "captions" | "frames"
): string {
  switch (skillType) {
    case "image":
      return IMAGE_SYSTEM_PROMPT;
    case "captions":
      return CAPTIONS_SYSTEM_PROMPT;
    case "frames":
      return FRAMES_SYSTEM_PROMPT;
  }
}

// ─── Metadata Derivation ──────────────────────────────────

const SKILL_TYPE_ACTIONS: Record<string, string[]> = {
  image: ["image"],
  captions: ["text"],
  frames: ["frames"],
};

const SKILL_TYPE_LABELS: Record<string, string> = {
  image: "Image Generator",
  captions: "Caption Writer",
  frames: "Video Frames Generator",
};

export function deriveSkillMeta(
  brandName: string,
  skillType: "image" | "captions" | "frames"
): { name: string; description: string; actions: string[] } {
  return {
    name: `${brandName} ${SKILL_TYPE_LABELS[skillType]}`,
    description: `AI-generated ${skillType} skill for ${brandName}. Review and customize before use.`,
    actions: SKILL_TYPE_ACTIONS[skillType] || [],
  };
}

// ─── AI Generation ─────────────────────────────────────────

export async function generateSkillContent(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  try {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SKILL_BUILDER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(
        "[skill-builder] OpenRouter error:",
        response.status,
        errBody
      );
      throw new Error(
        `OpenRouter returned ${response.status}: ${errBody.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      throw new Error(
        "AI did not return text content. The prompt may have been blocked."
      );
    }

    return content.trim();
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("OPENROUTER_API_KEY")
    ) {
      throw err;
    }
    console.error("[skill-builder] Generation failed:", err);
    throw new Error(
      err instanceof Error
        ? `Skill generation failed: ${err.message}`
        : "Skill generation failed unexpectedly"
    );
  }
}
