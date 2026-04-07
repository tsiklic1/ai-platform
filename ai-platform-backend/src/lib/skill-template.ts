/**
 * Lightweight {{...}} template substitution for skill content.
 *
 * Skills are user-authored markdown. To make general skills able to refer to
 * the actual brand/product/content-type values of the current generation, we
 * let skill authors embed placeholders like {{brand.name}} or
 * {{products.names}}. At generation time, each fetched skill's content is run
 * through `applySkillTemplate(content, ctx)` before being concatenated.
 *
 * Rules:
 * - Pure text replacement. No expressions, no loops, no conditionals — kept
 *   intentionally dumb so behavior is easy to predict.
 * - Missing/null values render as the empty string (no errors thrown).
 * - Unknown placeholders are LEFT INTACT so authors notice typos.
 * - Substitution applies to skill content only. Content type templates stay
 *   literal.
 */

import type { GenerationContext } from "./generation-context";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function buildVariableMap(ctx: GenerationContext): Record<string, string> {
  const ct = ctx.contentType;

  const productsList = ctx.products
    .map((p) => {
      const desc = p.description ? ` — ${p.description}` : "";
      const cat = p.category ? ` (${p.category})` : "";
      return `- ${p.name}${desc}${cat}`;
    })
    .join("\n");

  const productsNames = ctx.products.map((p) => p.name).join(", ");

  return {
    "brand.name": ctx.brand.name ?? "",
    "brand.description": ctx.brand.description ?? "",

    "products.list": productsList,
    "products.names": productsNames,
    "products.count": String(ctx.products.length),

    "content_type.name": ct?.name ?? "",
    "content_type.description": ct?.description ?? "",
    "content_type.image_style": ct?.image_style ?? "",
    "content_type.image_prompt_template": ct?.image_prompt_template ?? "",
    "content_type.text_prompt_template": ct?.text_prompt_template ?? "",
    "content_type.default_aspect_ratio": ct?.default_aspect_ratio ?? "",

    "counts.product_images": String(ctx.productImageCount),
    "counts.style_images": String(ctx.styleImageCount),

    "aspect_ratio": ctx.aspectRatio ?? "",
  };
}

/**
 * Substitute {{...}} placeholders in `content` against `ctx`.
 * Unknown keys are left as-is so typos are visible to skill authors.
 */
export function applySkillTemplate(
  content: string,
  ctx: GenerationContext
): string {
  if (!content || !content.includes("{{")) return content;

  const vars = buildVariableMap(ctx);

  return content.replace(PLACEHOLDER_RE, (match: string, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key] ?? "";
    }
    return match; // unknown placeholder — keep intact
  });
}

/**
 * Convenience: apply the template to multiple skill contents and concatenate
 * them in the existing "## Skill: <name>\n<content>" format used across all
 * three generation flows. Returns null if there are no skills.
 */
export function renderSkillsContent(
  skills: Array<{ name: string; content: string }>,
  ctx: GenerationContext
): string | null {
  if (skills.length === 0) return null;
  return skills
    .map((s) => `## Skill: ${s.name}\n${applySkillTemplate(s.content, ctx)}`)
    .join("\n\n---\n\n");
}
