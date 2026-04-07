/**
 * Text generation via OpenRouter (Claude).
 */

import {
  renderContextBlock,
  type GenerationContext,
} from "./generation-context";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = process.env.TEXT_MODEL || "anthropic/claude-sonnet-4";

/**
 * Assemble system + user prompts for caption generation.
 *
 * The shape is: role lines → [Generation Context] block (shared with image &
 * frames flows via renderContextBlock) → [Skills] (if any) → user prompt.
 *
 * Skills passed in here are expected to be PRE-PROCESSED — i.e. {{...}}
 * placeholders should already have been substituted by the caller via
 * renderSkillsContent(). This function only concatenates.
 */
export function assembleTextPrompt(
  userPrompt: string,
  ctx: GenerationContext,
  skillsContent?: string | null
): { systemPrompt: string; userPrompt: string; fullPrompt: string } {
  const systemParts: string[] = [
    "You are an expert Instagram caption writer. Write engaging, on-brand captions for social media posts.",
    "Captions should be 150-300 characters, include relevant hashtags, and have a clear call-to-action when appropriate.",
    "Return ONLY the caption text — no titles, labels, or meta-commentary.",
  ];

  systemParts.push(""); // blank line before context block
  systemParts.push(renderContextBlock(ctx));

  if (skillsContent) {
    systemParts.push("---");
    systemParts.push(`[Skills]\n${skillsContent}`);
  }

  const systemPrompt = systemParts.join("\n");
  const fullPrompt = `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${userPrompt}`;

  return { systemPrompt, userPrompt, fullPrompt };
}

/**
 * Generate text via OpenRouter / Claude.
 */
export async function generateText(
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
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[text-gen] OpenRouter error:", response.status, errBody);
      throw new Error(`OpenRouter returned ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      throw new Error("Claude did not return text content. The prompt may have been blocked.");
    }

    return content.trim();
  } catch (err) {
    if (err instanceof Error && err.message.includes("OPENROUTER_API_KEY")) {
      throw err;
    }
    console.error("[text-gen] Generation failed:", err);
    throw new Error(
      err instanceof Error
        ? `Text generation failed: ${err.message}`
        : "Text generation failed unexpectedly"
    );
  }
}
