---
name: default-images
description: Default guidelines applied to every image generation. Covers composition, lighting, product accuracy, prompt structure, and quality checks so generated images are ready to use without manual cleanup.
---

# Default Image Generator

Baseline rules for generating any brand or marketing image. These apply unless a more specific skill or brand instruction overrides them.

You are generating an image for **{{brand.name}}**. The product(s) involved: **{{products.names}}**. Output aspect ratio: **{{aspect_ratio}}**. {{counts.product_images}} product reference image(s) and {{counts.style_images}} style reference image(s) are attached above.

## Core Principles

- **One idea per image.** If you need two focal points, it's two images.
- **Composition over decoration.** A clean frame with one strong subject beats a cluttered one with ten props.
- **Reference over imagination.** When a real product, logo, or person must appear, use a reference image (img2img). Never ask the model to invent brand assets from text alone — it will hallucinate labels, colors, and proportions.
- **Match the brand's visual language.** If brand references or a style guide are provided, study them before writing the prompt. The generated image should look like it belongs in the same feed / campaign as the references.

## Product & Brand Accuracy (Non-Negotiable)

The current brand is **{{brand.name}}** and the products in scope are: **{{products.names}}**. Treat the attached PRODUCT REFERENCE images as the source of truth for how each product looks — match colors, label text, typography, and proportions exactly.

When the image must show a real product, logo, package, or brand asset:

- **Always pass a reference image** via the generation pipeline's image-reference input.
- **Never rely on text alone** to describe packaging, labels, typography, or logos. Text prompts cannot hold enough detail to reproduce branded artwork accurately.
- **Preserve every letter on the product exactly as it appears on the reference.** This is the #1 source of regeneration. If the reference can says "Aranxhata" and "Exotic", the generated can must say exactly "Aranxhata" and exactly "Exotic" — same spelling, same letter order, same capitalization, same font weight, same placement. No garbled characters, no invented words, no missing letters, no extra letters, no rearranged letters, no foreign-script substitutions. Treat the label text as **copy-pasted**, not re-drawn. If even one letter drifts or looks wrong, regenerate.
- **Check the output** against the reference. If colors, label text, typography, or artwork drift from the real thing, regenerate.
- **Prefer fewer hero products** over many. 1-3 clearly-placed product instances beat a cluttered lineup.
- **Place products with intent.** A hero position near the focal interaction point (hand, table center, eye line) always reads better than random scattering.

## Lighting Consistency (Non-Negotiable)

- Use **one clear primary light direction**. Highlights and shadows across the subject, props, and background must agree with that single source.
- Keep **color temperature coherent** across the whole frame. Don't mix warm and cool lighting unless the scene physically requires it (e.g., a sunset window + interior lamp).
- If the product's shadows or reflections don't match the scene's light direction, treat it as a hard failure and regenerate.
- For outdoor scenes: sunlight direction must be consistent on faces, cans/props, and ground shadows.
- For indoor scenes: the key light should be identifiable in under a second of looking.

## Composition

- **Rule of thirds** unless you have a reason to center. Centered composition works for hero shots and symmetrical products; thirds works for lifestyle and storytelling.
- **Leave breathing room.** Don't crop important elements at the edge unless intentional.
- **Eye lines matter.** If a person is in the frame, their gaze should point at or near the product, or off-frame in a meaningful direction — never vacantly at nothing.
- **Foreground / midground / background.** A photo with depth reads more professional than a flat one.
- **Negative space is a tool.** Empty sky, plain wall, or out-of-focus backdrop lets the subject breathe and leaves room for text overlays later.

## Prompt Structure

Every generation prompt should include, in roughly this order:

1. **Format and aspect ratio** — e.g., "9:16 vertical for Instagram Reels / Story" or "1:1 square for feed post".
2. **Subject** — what the image is OF in one concrete sentence.
3. **Setting** — where it takes place, including time of day and environment.
4. **Lighting** — direction, quality (soft/hard), color temperature, mood.
5. **Composition** — camera angle, framing, rule of thirds / centered / flat-lay.
6. **Style** — photorealistic / illustrated / 3D render / editorial / documentary / cinematic.
7. **Brand elements** — products, colors, logos, typography (always backed by a reference image).
8. **Mood & atmosphere** — one emotional word: joyful, serene, energetic, nostalgic, aspirational.
9. **Exclusions** — things to avoid if you've seen the model make the same mistake twice ("no extra hands", "no text on label").

## Format Defaults

- **Instagram feed**: 1:1 square
- **Instagram Reels / Stories / TikTok**: 9:16 vertical
- **YouTube thumbnail / landing page hero**: 16:9 horizontal
- **Poster / flyer**: 4:5 or A-series ratios

Default to **9:16** when the target platform is unspecified and the content is social/mobile.

## Style Choices by Use Case

- **Lifestyle / social moment** → photorealistic, natural light, warm tones, shallow depth of field.
- **Product showcase / catalog** → studio lighting, clean solid or gradient background, sharp focus, minimal props.
- **Poster / brand graphic** → bold typography, flat or gradient backgrounds, high contrast, limited palette.
- **Editorial / magazine** → cinematic lighting, rich color grading, thoughtful negative space.
- **Flat lay / mood board** → overhead camera, even soft lighting, color-coordinated props, Pinterest-worthy.
- **Cinematic 3D / hero shot** → dramatic key light, deep shadows, particles/liquid splashes, anamorphic lens flare, hyper-photorealistic render.

## Aesthetic Defaults (when brand guide is silent)

- **Color**: limit to 3-5 colors per image. One dominant, one secondary, one accent.
- **Skin tones**: warm and natural. Avoid orange over-saturation or cold grey.
- **Textures**: include at least one tactile surface (fabric, wood, stone, fruit skin) so the image doesn't feel sterile.
- **People**: if people are in the frame, they should feel authentic — natural poses, genuine expressions, clothes that fit the setting.

## Common Failure Modes (Watch For)

- **Hallucinated text and logos** — any image with real-brand copy must use an img2img reference. Text rendered from a prompt is almost always wrong.
- **Mismatched shadows** — product shadow going left while face shadow goes right. Regenerate.
- **Duplicate limbs or fingers** — check hands carefully. Regenerate if wrong.
- **Product clustering** — 5+ of the same product in one frame almost always looks spammy. Reduce.
- **Floating objects** — products that don't touch a surface look CGI-fake. Place them on something.
- **Eye contact uncanny valley** — if a person looks directly at camera and the eyes are off, redirect the gaze off-frame.
- **Generic stock vibe** — if the output looks like shutterstock, add a specific cultural, temporal, or emotional detail until it doesn't.

## Quality Checklist

Before accepting an image, verify:

- [ ] Brand product / logo matches reference exactly (if applicable)
- [ ] One clear primary light source, consistent shadows across all elements
- [ ] Color temperature is coherent across the frame
- [ ] Composition follows rule of thirds or is deliberately centered
- [ ] Subject is sharp; background supports without competing
- [ ] No hallucinated text, extra limbs, or warped hands
- [ ] Image feels like it belongs next to the brand's other content
- [ ] Mood matches the intent (joyful / serene / energetic / etc.)
- [ ] Aspect ratio matches the target platform
- [ ] No spammy product clustering

## What NOT To Do

- Don't rely on text prompts for real brand packaging — always use a reference.
- Don't combine conflicting lighting (warm + cool) without a physical reason.
- Don't cram every prop you can think of into one frame.
- Don't use generic stock-photo poses ("office worker smiles at laptop").
- Don't ignore shadows — they either sell the realism or break it.
- Don't use pure black or pure white backgrounds for lifestyle content.
- Don't forget the aspect ratio — fixing it afterward means regenerating.
