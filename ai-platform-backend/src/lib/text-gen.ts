/**
 * Text generation via OpenRouter (Claude).
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = process.env.TEXT_MODEL || "anthropic/claude-sonnet-4";

interface ContentTypeForTextPrompt {
  text_prompt_template: string | null;
  name: string;
}

interface BrandContext {
  brandName: string;
  products: { name: string; description: string | null; category: string | null }[];
}

/**
 * Assemble system + user prompts for caption generation.
 */
export function assembleTextPrompt(
  userPrompt: string,
  contentType?: ContentTypeForTextPrompt | null,
  brandContext?: BrandContext | null
): { systemPrompt: string; userPrompt: string; fullPrompt: string } {
  const systemParts: string[] = [
    "You are an expert Instagram caption writer. Write engaging, on-brand captions for social media posts.",
    "Captions should be 150-300 characters, include relevant hashtags, and have a clear call-to-action when appropriate.",
    "Return ONLY the caption text — no titles, labels, or meta-commentary.",
  ];

  if (brandContext) {
    systemParts.push(`\nBrand: ${brandContext.brandName}`);
    if (brandContext.products.length > 0) {
      systemParts.push("Products:");
      for (const p of brandContext.products) {
        const parts = [p.name];
        if (p.description) parts.push(p.description);
        if (p.category) parts.push(`(${p.category})`);
        systemParts.push(`- ${parts.join(": ")}`);
      }
    }
  }

  if (contentType?.text_prompt_template) {
    systemParts.push(`\nContent type "${contentType.name}" instructions:\n${contentType.text_prompt_template}`);
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
