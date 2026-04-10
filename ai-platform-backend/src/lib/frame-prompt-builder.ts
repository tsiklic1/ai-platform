/**
 * Frame Prompt Builder — generates 5-frame video sequence descriptions
 * from a brief vibe/theme using Claude via OpenRouter.
 */

import { generateSkillContent } from "./skill-builder-prompts";

const SYSTEM_PROMPT = `You are an expert at writing detailed 5-frame video sequence descriptions for AI image generation.

Given a brief vibe or theme description, you create a cinematic 5-frame narrative with a coherent visual arc — buildup, payoff, and resolution. You decide the pacing naturally based on the vibe. A dark cinematic reveal might peak at frame 4 with explosive chaos; a calm beach scene might peak earlier and settle into serene hero shots. Match the energy arc to the theme.

## Rules

1. Output EXACTLY 5 frames, labeled "Frame 1:" through "Frame 5:".
2. Each frame description must be 2-4 sentences of rich visual detail: lighting, camera angle, objects, motion, mood, particles/effects.
3. The product should appear progressively — build anticipation. Don't show it fully formed in frame 1.
4. Be specific about visual details: colors, textures, lighting direction, particle types, liquid behavior, material properties.
5. Adapt the visual language to the vibe — a "beach party" should have sand, waves, warm golden light; a "sporty tennis" should have courts, rackets, dynamic motion blur; a "cinematic reveal" should have volumetric rays, particles, dramatic contrast.
6. Do NOT use markdown formatting, bullet points, or headers. Just "Frame N:" followed by the description paragraph.
7. IMPORTANT: The examples below use canned beverages, but the user's product could be anything — a bottle, a shoe, a tech device, food, etc. Adapt to whatever the user's product is. If the user provides brand/product context, use those specific details (colors, names, features) in your descriptions.

## Example 1 — "cinematic dual product reveal, dark void, tropical elements"

Frame 1: Pure dark void. Two faint glowing points at center — one emerald green, one hot pink — like twin stars orbiting each other. A few tiny glass shards and petals barely visible, drifting slowly. No cans yet. Tension and anticipation. A sense that something dual, something electric, is about to emerge.

Frame 2: The two glows intensify — an emerald and a magenta energy core swirling around each other, their light blending into electric lime-pink where they meet. Tropical leaves, mango slices, and hibiscus petals begin materializing from opposite edges, swirling inward. Glass shards multiply. Two faint translucent can silhouettes begin forming inside each glow — green on the left, pink on the right.

Frame 3: Both cans are now 70% materialized — semi-transparent, tilted toward each other at dramatic mirrored angles. Tropical debris orbits the pair as one unified system, accelerating. Green liquid tendrils spiral from the left, pink liquid tendrils from the right — the two streams colliding and twisting at center frame. Volumetric light rays cut through from both upper corners. Energy building to peak.

Frame 4: Full explosive moment. Both cans fully solid mid-air, angled dramatically toward each other like a clash, surrounded by a shared burst of tropical leaves, mango and pineapple slices, hibiscus petals, shattering glass, and twin liquid splashes — green and pink — erupting outward from the center collision point. Peak energy, maximum particle chaos. Dual volumetric light rays. The two colors blend into a vivid gradient at the heart of the explosion.

Frame 5: The aftermath. Both cans settle into a hero pose — side by side, upright, centered, slightly angled inward facing each other. Most particles and leaves are gone. A soft dual mist lingers — green on the left, pink on the right, blending to a warm glow at center. Calm after the storm. Premium hero shot. Two flavors. One moment.

## Example 2 — "realistic sporty basketball gym vibe"

Frame 1: A can sitting on the bleacher seat beside a gym bag and a basketball. Indoor gym light. Squeaky court in the background. Still and quiet between sessions.

Frame 2: Player sits down heavily after a run, picks up the can with both hands. Sneakers untied. Breathing hard. Teammates shooting around in the background.

Frame 3: Can cracked open close to the camera — fizz catches the gym light softly. Player's face partially visible, eyes closed for a second. Brief relief.

Frame 4: Player drinking deeply, jersey pulled up slightly at the hem, elbow high. Sweat soaked collar. The can bold and bright under the gym lights. Hoop and backboard just visible behind them, slightly out of focus. Real fatigue, real thirst.

Frame 5: Can resting on the floor next to their sneakers, nearly empty. Player back on their feet, dribbling slowly back into the game. The can left behind on the hardwood. Job done.

## Output Format

Frame 1: [description]

Frame 2: [description]

Frame 3: [description]

Frame 4: [description]

Frame 5: [description]`;

/**
 * Parse Claude's response into an array of 5 frame descriptions.
 */
export function parseFrames(content: string): string[] {
  // Split on "Frame N:" or "Frame N -" patterns
  const segments = content.split(/Frame\s*\d+\s*[:\-–]\s*/i).filter((s) => s.trim());

  if (segments.length !== 5) {
    // Fallback: try splitting on double newlines if frame labels are missing
    const byNewline = content.split(/\n\n+/).filter((s) => s.trim());
    if (byNewline.length === 5) {
      return byNewline.map((s) => s.trim());
    }
    throw new Error(
      `Expected 5 frame descriptions but got ${segments.length}. The AI output may have been malformed.`
    );
  }

  return segments.map((s) => s.trim());
}

/**
 * Build the user prompt with vibe + brand context + skills content.
 */
export function buildFrameUserPrompt(
  vibe: string,
  brand: { name: string; description: string | null },
  skillsContent: string | null
): string {
  const parts: string[] = [`Vibe: ${vibe}`];

  parts.push(`\nBrand: ${brand.name}`);
  if (brand.description) {
    parts.push(brand.description);
  }

  if (skillsContent) {
    parts.push(`\n--- Skills Context ---\n${skillsContent}`);
  }

  return parts.join("\n");
}

/**
 * Generate 5 frame descriptions from a user prompt.
 */
export async function generateFramePrompts(
  userPrompt: string
): Promise<string[]> {
  const content = await generateSkillContent(SYSTEM_PROMPT, userPrompt);
  return parseFrames(content);
}
