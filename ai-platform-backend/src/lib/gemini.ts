/**
 * Image generation via OpenRouter (Gemini models).
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL =
  process.env.GEMINI_MODEL || "google/gemini-3.1-flash-image-preview";

export interface ReferenceImage {
  base64: string; // base64 data (no prefix)
  mimeType: string;
  /**
   * Optional per-image label rendered as a `text` block immediately before
   * the image. Lets the model associate a specific image with a name (e.g.
   * a product name or a content type name) so skills can refer to it.
   * If omitted, no label is emitted for this image.
   */
  label?: string;
}

interface GeneratedImage {
  data: string; // base64 (no prefix)
  mimeType: string;
}

interface ContentTypeForPrompt {
  image_prompt_template: string | null;
  image_style: string | null;
}

/**
 * Assemble a full prompt from user input + optional content type template.
 */
export function assemblePrompt(
  userPrompt: string,
  contentType?: ContentTypeForPrompt | null,
): string {
  const parts: string[] = [];

  if (contentType?.image_prompt_template) {
    parts.push(`Content type template: ${contentType.image_prompt_template}`);
  }
  if (contentType?.image_style) {
    parts.push(`Image style: ${contentType.image_style}`);
  }
  parts.push(userPrompt);

  return parts.join("\n\n");
}

/**
 * Generate an image using OpenRouter's Gemini integration.
 */
export async function generateImage(
  prompt: string,
  productImages: ReferenceImage[] = [],
  contentTypeImages: ReferenceImage[] = [],
  aspectRatio: "1:1" | "9:16" = "1:1",
  skillsContent?: string | null,
  previousFrame?: ReferenceImage | null,
  contextBlock?: string | null,
): Promise<GeneratedImage> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  // Build message content: labeled image groups + text prompt
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  // Product reference images — sent first (higher impact position).
  // Each image is preceded by its own labeled text block so the model can
  // associate the image with a specific product name (and skills can refer
  // to the products by name).
  if (productImages.length > 0) {
    content.push({
      type: "text",
      text: "PRODUCT REFERENCE photos — use these to accurately reproduce each product's appearance, details, and branding:",
    });
    for (const img of productImages) {
      const label = img.label
        ? `PRODUCT REFERENCE — ${img.label}:`
        : "PRODUCT REFERENCE:";
      content.push({ type: "text", text: label });
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      });
    }
  }

  // Content type reference images (style examples) — sent after product refs.
  // Same per-image labeling so the content type name is attached to its style
  // references.
  if (contentTypeImages.length > 0) {
    content.push({
      type: "text",
      text: "STYLE REFERENCE examples — use these to understand the visual style, composition, and aesthetic to match:",
    });
    for (const img of contentTypeImages) {
      const label = img.label
        ? `STYLE REFERENCE — ${img.label}:`
        : "STYLE REFERENCE:";
      content.push({ type: "text", text: label });
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      });
    }
  }

  // Previous frame reference (for sequential frame generation)
  if (previousFrame) {
    content.push({
      type: "text",
      text: "The following image is the PREVIOUS FRAME in a video sequence. Generate the next frame while maintaining visual continuity — keep the same style, lighting, colors, and scene elements:",
    });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${previousFrame.mimeType};base64,${previousFrame.base64}`,
      },
    });
  }

  // Main prompt
  content.push({ type: "text", text: prompt });

  try {
    // Compose the system message: generation context block first (so skills
    // can refer to the actual brand/product/content-type values), then the
    // assembled skills content. Either part is optional.
    const systemParts: string[] = [];
    if (contextBlock) systemParts.push(contextBlock);
    if (skillsContent) systemParts.push(`[Skills]\n${skillsContent}`);

    const messages: Array<{ role: string; content: unknown }> = [];
    if (systemParts.length > 0) {
      messages.push({
        role: "system",
        content: systemParts.join("\n---\n"),
      });
    }
    messages.push({ role: "user", content });

    const response = await fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_modalities: ["image"],
        image_config: { aspect_ratio: aspectRatio },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[gemini] OpenRouter error:", response.status, errBody);
      throw new Error(
        `OpenRouter returned ${response.status}: ${errBody.slice(0, 200)}`,
      );
    }

    const data = await response.json();

    // Extract image from response
    // OpenRouter returns: choices[0].message.images[0] = { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }
    const images = data.choices?.[0]?.message?.images;

    if (!images || images.length === 0) {
      // Check if there's a text response (safety filter, refusal)
      const textContent = data.choices?.[0]?.message?.content;
      throw new Error(
        `Gemini did not return an image. ${textContent ? `Response: ${String(textContent).slice(0, 200)}` : "The prompt may have been blocked by safety filters."}`,
      );
    }

    const imageData = images[0];
    const dataUrl: string = imageData.image_url?.url || imageData.url || "";

    if (!dataUrl.startsWith("data:")) {
      throw new Error("Unexpected image format from OpenRouter");
    }

    // Parse data URI: "data:image/jpeg;base64,/9j/4AAQ..."
    const [header, base64Data] = dataUrl.split(",", 2);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

    if (!base64Data) {
      throw new Error("Empty image data from OpenRouter");
    }

    return {
      data: base64Data,
      mimeType,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("OPENROUTER_API_KEY")) {
      throw err;
    }
    console.error("[gemini] Generation failed:", err);
    throw new Error(
      err instanceof Error
        ? `Image generation failed: ${err.message}`
        : "Image generation failed unexpectedly",
    );
  }
}
