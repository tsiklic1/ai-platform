/**
 * Default content type templates seeded when a new brand is created.
 */

interface DefaultContentType {
  name: string;
  description: string;
  text_prompt_template: string;
  image_prompt_template: string;
  image_style: string;
  default_aspect_ratio: "1:1" | "9:16";
  is_default: true;
  sort_order: number;
}

const DEFAULTS: DefaultContentType[] = [
  {
    name: "Product Showcase",
    description: "Professional hero shots that highlight your product front and center.",
    text_prompt_template:
      "Write an engaging product showcase caption for {{product_name}}. Highlight its key features and appeal. Keep the tone confident and on-brand. 2-3 sentences max.",
    image_prompt_template:
      "Create a professional product hero shot of {{product_name}}. Use the provided product reference images for accurate visual details. Center the product with studio lighting against a clean white or subtle gradient background. Sharp focus, no text overlays.",
    image_style:
      "Studio lighting, clean white or gradient background, sharp focus on product, professional product photography",
    default_aspect_ratio: "1:1",
    is_default: true,
    sort_order: 0,
  },
  {
    name: "Lifestyle / In-Use",
    description: "Show your product in a real-world setting with people interacting with it.",
    text_prompt_template:
      "Write a lifestyle caption showing {{product_name}} in everyday use. Make it relatable and aspirational. Keep the tone warm and natural. 2-3 sentences max.",
    image_prompt_template:
      "Create a lifestyle scene showing {{product_name}} being used naturally in a real-world setting. Reference the provided product images for visual accuracy. Include a person interacting with the product. Warm natural lighting, shallow depth of field.",
    image_style:
      "Natural setting, people interacting with product, warm natural lighting, lifestyle photography",
    default_aspect_ratio: "9:16",
    is_default: true,
    sort_order: 1,
  },
  {
    name: "Behind the Scenes",
    description: "Authentic, raw content showing the making or process behind your brand.",
    text_prompt_template:
      "Write a behind-the-scenes caption about {{product_name}} or the brand's process. Make it feel authentic and personal. Give a peek behind the curtain. 2-3 sentences max.",
    image_prompt_template:
      "Create a behind-the-scenes shot related to {{product_name}}. Show a workspace, studio, or production environment. Use the provided product images as reference. Raw authentic feel with casual composition and natural imperfect lighting.",
    image_style:
      "Casual, workspace or studio environment, raw authentic feel, behind-the-scenes photography",
    default_aspect_ratio: "9:16",
    is_default: true,
    sort_order: 2,
  },
  {
    name: "Promo / Sale",
    description: "Bold promotional visuals designed to drive action and conversions.",
    text_prompt_template:
      "Write a punchy promotional caption for {{product_name}}. Create urgency and excitement. Include a clear call to action. Keep it short and impactful. 1-2 sentences.",
    image_prompt_template:
      "Create a bold promotional visual featuring {{product_name}}. Reference the provided product images. Use vibrant, eye-catching colors with ample negative space for text overlays. The product should pop against the background.",
    image_style:
      "Bold and vibrant colors, space for typography, eye-catching, promotional material design",
    default_aspect_ratio: "1:1",
    is_default: true,
    sort_order: 3,
  },
  {
    name: "UGC-Style",
    description: "Casual, phone-shot aesthetic content that feels user-generated and relatable.",
    text_prompt_template:
      "Write a casual, UGC-style caption for {{product_name}}. Make it sound like a real customer sharing their experience. Conversational and genuine. 1-2 sentences.",
    image_prompt_template:
      "Create a casual, user-generated content style photo featuring {{product_name}}. Reference the provided product images. Mimic a phone camera shot — slightly imperfect framing, natural indoor or outdoor lighting, no studio setup. Relatable and authentic.",
    image_style:
      "Casual phone-shot aesthetic, natural imperfect lighting, relatable, user-generated content style",
    default_aspect_ratio: "9:16",
    is_default: true,
    sort_order: 4,
  },
];

interface ContentTypeInsert {
  brand_id: string;
  user_id: string;
  name: string;
  description: string;
  text_prompt_template: string;
  image_prompt_template: string;
  image_style: string;
  default_aspect_ratio: string;
  is_default: boolean;
  sort_order: number;
}

export function getDefaultContentTypes(
  brandId: string,
  userId: string
): ContentTypeInsert[] {
  return DEFAULTS.map((t) => ({
    brand_id: brandId,
    user_id: userId,
    name: t.name,
    description: t.description,
    text_prompt_template: t.text_prompt_template,
    image_prompt_template: t.image_prompt_template,
    image_style: t.image_style,
    default_aspect_ratio: t.default_aspect_ratio,
    is_default: t.is_default,
    sort_order: t.sort_order,
  }));
}
