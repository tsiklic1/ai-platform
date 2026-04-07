/**
 * Shared "generation context" used by image, frames, and text generation flows.
 *
 * This module produces:
 *   1. A typed `GenerationContext` object — the source of truth for the current
 *      generation's brand / products / content type / aspect ratio / image counts.
 *      Used both for rendering the context block AND for skill template substitution.
 *   2. `renderContextBlock()` — turns the context into the structured "[Generation
 *      Context]" text block that gets prepended to the system message in every flow.
 *
 * The goal is to give skills (and the model itself) a single, predictable place
 * to find brand/product/content-type metadata so generic skill prose can refer
 * to the actual data of the current generation.
 */

export interface GenContextBrand {
  name: string;
  description: string | null;
}

export interface GenContextProduct {
  name: string;
  description: string | null;
  category: string | null;
}

export interface GenContextContentType {
  name: string;
  description: string | null;
  image_style: string | null;
  image_prompt_template: string | null;
  text_prompt_template: string | null;
  default_aspect_ratio: string | null;
}

export interface GenerationContext {
  brand: GenContextBrand;
  products: GenContextProduct[];
  contentType: GenContextContentType | null;
  productImageCount: number;
  styleImageCount: number;
  aspectRatio: string | null;
}

export interface BuildGenerationContextInput {
  brand: GenContextBrand;
  products?: GenContextProduct[] | null;
  contentType?: GenContextContentType | null;
  productImageCount?: number;
  styleImageCount?: number;
  aspectRatio?: string | null;
}

/**
 * Build a GenerationContext from raw fetched data. Defaults are chosen so any
 * call site can pass the minimum it knows about.
 */
export function buildGenerationContext(
  input: BuildGenerationContextInput
): GenerationContext {
  return {
    brand: input.brand,
    products: input.products ?? [],
    contentType: input.contentType ?? null,
    productImageCount: input.productImageCount ?? 0,
    styleImageCount: input.styleImageCount ?? 0,
    aspectRatio: input.aspectRatio ?? null,
  };
}

/**
 * Render the structured "[Generation Context]" block that gets prepended to the
 * system message in every generation flow. Sections are omitted cleanly when
 * their underlying data is missing — never prints empty headers.
 */
export function renderContextBlock(ctx: GenerationContext): string {
  const lines: string[] = ["[Generation Context]"];

  // Brand
  lines.push(`Brand: ${ctx.brand.name}`);
  if (ctx.brand.description) {
    lines.push(`Brand description: ${ctx.brand.description}`);
  }

  // Products
  if (ctx.products.length > 0) {
    lines.push(`Products (${ctx.products.length}):`);
    for (const p of ctx.products) {
      const parts: string[] = [];
      if (p.description) parts.push(p.description);
      const tail = parts.length > 0 ? ` — ${parts.join(" ")}` : "";
      const cat = p.category ? ` (${p.category})` : "";
      lines.push(`  - ${p.name}${tail}${cat}`);
    }
  }

  // Content type
  if (ctx.contentType) {
    lines.push(`Content type: ${ctx.contentType.name}`);
    if (ctx.contentType.description) {
      lines.push(`  Description: ${ctx.contentType.description}`);
    }
    if (ctx.contentType.image_style) {
      lines.push(`  Style: ${ctx.contentType.image_style}`);
    }
    if (ctx.contentType.image_prompt_template) {
      lines.push(`  Image template: ${ctx.contentType.image_prompt_template}`);
    }
    if (ctx.contentType.text_prompt_template) {
      lines.push(`  Text template: ${ctx.contentType.text_prompt_template}`);
    }
    if (ctx.contentType.default_aspect_ratio) {
      lines.push(`  Default aspect ratio: ${ctx.contentType.default_aspect_ratio}`);
    }
  }

  // Reference image counts
  if (ctx.productImageCount > 0 || ctx.styleImageCount > 0) {
    lines.push(
      `Reference images attached: ${ctx.productImageCount} product, ${ctx.styleImageCount} style`
    );
  }

  // Aspect ratio for the current generation
  if (ctx.aspectRatio) {
    lines.push(`Output aspect ratio: ${ctx.aspectRatio}`);
  }

  return lines.join("\n");
}
