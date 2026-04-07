-- Update default skills with real content and split into 3 skills
-- (image / frames / captions). Content sourced from default-*.md files.

-- 1. Narrow existing image skill to just 'image' and fill its content
UPDATE skills
SET actions = ARRAY['image'],
    content = $MD$
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
$MD$
WHERE is_default = true AND name = 'Default Image Guidelines';

-- 2. Fill text/captions skill with real captions content
UPDATE skills
SET content = $MD$
---
name: default-captions
description: Default guidelines applied to every social media caption generation. Covers voice, structure, length, hashtags, emoji, CTAs, and multilingual output so generated posts are ready to publish.
---

# Default Caption Writer

Baseline rules for generating social media captions (Instagram, TikTok, Facebook, LinkedIn, X). These rules apply unless a more specific skill or brand instruction overrides them.

You are writing for **{{brand.name}}**. The product(s) being featured: **{{products.names}}**. The selected content type is **{{content_type.name}}** — let its tone and structure shape the caption.

## Core Principles

- **Stop the scroll.** The first line is the hook — it must earn the rest of the read before the "...more" truncation.
- **Write for a person, not a feed.** Conversational, warm, second-person. Avoid corporate or translated-sounding phrasing.
- **One idea per post.** If the caption needs two hooks, it's two posts.
- **Show, don't announce.** Prefer concrete detail ("the last sip always goes too fast") over generic claims ("the best drink ever").
- **Match the brand's energy.** Read the brand context above (you're writing for {{brand.name}}) and mirror its tone, voice, and audience. If none is given, default to warm, confident, and specific.

## Structure

Every caption should have, in order:

1. **Hook** — 1 line, < 125 characters. Curiosity, stat, bold claim, question, or vivid image. No greeting throat-clearing.
2. **Body** — 1-3 short lines. Deliver on the hook's promise. Use line breaks for breathing room.
3. **CTA** — 1 line. Light and natural. Ask for a save, share, tag, comment, click, or reply. Never aggressive.
4. **Hashtags** — on their own line(s) at the very end.

## Length

- **Instagram / Facebook:** 150-300 characters of body text (before hashtags). Short-and-punchy beats long-and-clever unless the post is a story.
- **TikTok:** 80-150 characters — viewers skim.
- **LinkedIn:** 400-800 characters — more space to tell a story.
- **X / Threads:** ≤ 280 characters total including hashtags.

Stay inside the sweet spot unless the content genuinely needs more room.

## Hooks That Work

- **Question:** "Ever wonder why [surprising thing]?"
- **Stat / claim:** "97% of [audience] get this wrong."
- **Contrarian:** "Stop [common advice]. Here's why."
- **POV:** "POV: you just [specific moment]."
- **Vivid image:** "That moment when the [sensory detail]."

Avoid: "We are excited to announce...", "In today's post...", "Hi everyone!".

## CTA Patterns

Pick one — don't stack.

- Save → "Save this for later."
- Share → "Tag someone who needs to hear this."
- Comment → "What's your take — [specific question]?"
- Follow → "Follow for more [topic]."
- Click → "Link in bio." / "Full story at [url]."
- Reply → "Hit reply and tell me [thing]."

## Hashtags

- **Count:** 5-10 for Instagram, 3-5 for TikTok, 2-3 for LinkedIn, 1-2 for X.
- **Mix:** 1-2 brand/campaign tags, 2-3 niche/category tags, 1-2 broader tags. Avoid single-word megatags (#love, #fun) — too noisy to rank on.
- **Format:** lowercase, no spaces. Place on a separate line from the body.
- **Relevance:** every hashtag must earn its place. If it doesn't describe the post, cut it.

## Emoji

- **Count:** 1-3 per caption. Zero is fine. Four or more looks like spam.
- **Placement:** inside the body near the feeling it amplifies, not trailing after every line.
- **Match the brand palette / mood.** Don't mix incompatible vibes (e.g., ✨ and ⚠️).

## Multilingual Output

If the caller specifies more than one language:

- **Adapt, don't translate.** A literal translation always sounds stiff in the second language. Rewrite the sentiment with idioms native to that language.
- **Separate versions clearly.** Each language gets its own full caption block (hook, body, CTA, hashtags).
- **Match tone across versions.** The emotional register should feel the same in every language even if the words differ.
- **Adjust hashtags per language.** Keep brand tags in both; swap niche tags for ones that trend in each language's audience.

## Voice & Word Choice

- Active voice, present tense.
- Short sentences. Fragments are fine. Rhythm matters.
- No corporate filler: "leverage", "utilize", "solutions", "game-changer", "unlock", "in today's world".
- No em dashes — use hyphens only.
- No exclamation marks unless the brand genuinely shouts. One per caption maximum.
- Contractions are encouraged ("you're", "it's") unless the brand is deliberately formal.

## Accessibility & Inclusion

- Capitalize each word in hashtags when multiple words are joined (#SmallBusinessSaturday, not #smallbusinesssaturday) — screen readers parse it better.
- Don't use emoji as load-bearing content. If a line only makes sense with the emoji, rewrite it.
- Describe images briefly in the body when the post is visual — don't rely on alt text alone.

## Quality Checklist

Before returning a caption, verify:

- [ ] First line would stop a scroll (hook lands in < 125 chars)
- [ ] Body delivers on the hook
- [ ] Exactly one clear CTA
- [ ] Length is inside the platform sweet spot
- [ ] 1-3 emoji, placed for meaning not decoration
- [ ] Hashtags are relevant, properly formatted, and on their own line
- [ ] No corporate filler, no em dashes, no excessive exclamation marks
- [ ] Reads naturally out loud
- [ ] Every language version reads as if it were written in that language first

## What NOT To Do

- Don't start with "We are thrilled to…".
- Don't stuff hashtags inline in the body.
- Don't repeat the hook in the CTA.
- Don't use 5+ emoji in a row.
- Don't write a caption longer than the image needs it to be.
- Don't close with "Thanks for reading!".
$MD$
WHERE is_default = true AND name = 'Default Text Guidelines';

-- 3. Insert new default frames skill (content from default-frames.md)
INSERT INTO skills (user_id, name, description, content, actions, is_default)
SELECT NULL,
       'Default Frames Guidelines',
       'Baseline instructions applied to every sequential video frame generation.',
       $MD$
---
name: default-frames
description: Default guidelines applied to every sequential video frame generation. Covers continuity, gradual progression, lighting consistency, and prompt structure so generated frames work as keyframes for video tools like SeedDance, Runway, or Kling.
---

# Default Video Frames Generator

Baseline rules for generating sequential keyframes for short-form video (Reels, TikTok, Shorts, ads). These apply unless a more specific skill or brand instruction overrides them.

**These frames are IMAGES.** They are meant to be fed as keyframes into a separate video model (SeedDance, Runway, Kling, Luma, etc.) or stop-motion-style played in sequence. This skill does not generate video — only the frames.

You are generating frames for **{{brand.name}}** featuring: **{{products.names}}**. Aspect ratio: **{{aspect_ratio}}**. Style direction from the selected content type ({{content_type.name}}): *{{content_type.image_style}}*. {{counts.product_images}} product reference image(s) are attached — match the products in them exactly across every frame.

## #1 Rule — Never Generate Frames in Parallel

Generate frames **one at a time, sequentially**. Each frame after the first MUST use the **previous frame's output as a reference image** for visual continuity. Wait for frame N to finish before starting frame N+1. No exceptions.

Parallel generation destroys continuity. The whole reason sequential frames work is that each new frame "sees" the last one.

## Core Rules

- **Format**: 9:16 vertical by default (Reels / TikTok / Shorts native). Only switch to 1:1 or 16:9 if explicitly requested.
- **Product accuracy**: any real brand product, logo, or package MUST use an img2img reference. Never invent brand assets from text alone. (Same rule as default image generation.)
- **Frame count**: 4-6 frames for short clips (3-6 seconds), up to 8-10 for longer sequences. More frames = smoother motion but also more drift risk.
- **Consistency is everything**: same style, lighting direction, color palette, camera angle, and scene elements across the whole set. Only the thing that's *supposed* to change should change.

## Gradual Progression (Non-Negotiable)

Between any two consecutive frames, **only 1-2 things should change**. Everything else stays identical.

Think stop-motion, not scene-cuts. Tiny incremental steps beat big jumps every time.

### Progression patterns

- **Continuous action** (pour, fill, reveal, drip): use percentage markers — 0%, 25%, 50%, 75%, 100%. Or at minimum 0%, 50%, 100%.
- **Camera motion** (push-in, pan, tilt): describe the camera position change in specific, quantifiable terms ("camera 10% closer", "camera 5° higher").
- **Element appearing/disappearing**: introduce or remove ONE element per frame. Not three.
- **Lighting shift** (sunrise, candle flicker, transition): describe the lighting in each frame precisely so the model doesn't freelance.
- **Position change** (object moving across frame): describe the position relative to the frame ("object at 30% from left edge" → "at 50%" → "at 70%").

### What stays the same

Explicitly call these out in every prompt as "unchanged":

- Background (walls, sky, furniture, landscape)
- Camera angle and distance (unless camera motion IS the change)
- Lighting direction, intensity, and color temperature
- Props that aren't the subject of the change
- Style / render quality / color grading
- Any people's poses and expressions (unless they ARE the change)

## Prompt Structure (per frame)

Every frame prompt should have three distinct sections:

```
[BASE SCENE — identical in EVERY frame of the set]
Full scene description: format, setting, lighting direction,
camera angle, background, style, product description (with
reference), atmosphere. Copy-paste this exactly across all frames.

[FRAME-SPECIFIC CHANGE — the ONE thing different in this frame]
"In this frame: [describe the single incremental change]."

[CONSISTENCY ENFORCEMENT — in every frame]
"Everything else in the scene — background, lighting direction,
camera angle, surface, props, and all unchanged elements — must
remain exactly identical to the previous frame. Only the described
change should differ. [If brand product] The product must match
the provided reference image exactly."
```

The base scene block is the most important part — **literally copy-paste it across every frame**. Paraphrasing it will drift the output.

## Reference Images — Order Matters

When calling the generation pipeline with multiple references, order them:

1. **Brand / product reference FIRST** — this anchors what the hero object looks like.
2. **Previous frame SECOND** (for frames 2+) — this anchors continuity.
3. **Style / content-type reference** (optional) — this anchors overall look.

For frame 1, there is no previous frame. Pass only the brand reference + optional style references.

## Frame Planning

Before generating anything, **plan the whole sequence in writing**. For each frame, note:

- **Frame 1** → starting state. Scene fully set up, action at 0%.
- **Middle frames** → one incremental step per frame. Be specific: "glass 50% full", "can tilted 45°", "confetti reaching mid-frame".
- **Final frame** → completed state. Action at 100%.

A good plan prevents mid-generation scope creep. If you can't describe the sequence in plain language, the model can't generate it consistently.

### Sequence types that work well

- **Pour / fill** — liquid level rises across 4-5 frames.
- **Reveal** — product appears from behind a hand, curtain, or object.
- **Transformation** — one scene morphs into another (dull → vibrant, empty → full).
- **Camera push-in** — camera slowly approaches the hero subject.
- **Camera orbit** — camera rotates around a centered hero object.
- **Particle burst** — explosion of confetti, petals, splashes, dust radiating outward.
- **Stop-motion build** — objects appearing one at a time onto a flat lay.
- **Expression / gesture shift** — a face or hand moves through a small emotional arc.

### Sequence types that struggle

- **Multiple simultaneous changes** — almost always drift.
- **Complex human motion** — walking, dancing, full body action. Models lose limb continuity.
- **Long sequences (>10 frames)** — drift compounds. Break into smaller sets.
- **Scene jumps** — if the scene must change entirely, generate two separate frame sets.

## Lighting Consistency (Non-Negotiable)

- **One primary light direction** across all frames. Highlights and shadows must agree on where the light comes from.
- **Color temperature stays coherent.** Don't shift from warm to cool mid-sequence unless it's the intended change.
- **If light or shadow drifts between frames, regenerate that frame.** Don't let it ride — the video model will amplify the inconsistency into visible flickering.
- **Check reflections**: on glass, metal, liquid, or polished surfaces. Reflections should track with the same light source across frames.

## What To Include in EVERY Frame Prompt

- Aspect ratio: "9:16 vertical format" (or whatever the target is)
- Full base scene description (copy-pasted exactly)
- The ONE specific thing that differs this frame
- Consistency enforcement sentence
- If brand product: "must match the provided reference image exactly"
- Style/render specification: "premium photography" / "photorealistic" / "cinematic render"

## Final Step — Video Model Prompt

After all frames are generated, write a **single short prompt** for the video model (SeedDance, Runway, Kling) that describes the motion between frames. Keep it simple — video models work best with clear, concise motion descriptions.

Format:

```
@frame1 [starting state description]
@frame2 [what changes in frame 2]
@frame3 [what changes in frame 3]
...
Smooth motion, consistent lighting, [motion descriptor: "gentle pour",
"slow reveal", "camera push-in", "particle burst"]
```

Don't overengineer this. The frames do the heavy lifting — the video prompt just tells the model how to interpolate between them.

## Quality Checklist (per frame, and per set)

**Per frame:**

- [ ] Base scene description matches all other frames exactly
- [ ] Only the described change differs from the previous frame
- [ ] Lighting direction and color temperature match previous frame
- [ ] Brand product (if present) matches its reference image exactly
- [ ] Aspect ratio is correct
- [ ] No hallucinated text, limbs, or extra objects

**Per set:**

- [ ] All frames look like they're from the same shoot / render session
- [ ] Progression is gradual — no visible jumps between consecutive frames
- [ ] A viewer flipping through them should see a smooth animation, not a slideshow
- [ ] No drift in style, color grade, or lighting from frame 1 to final frame
- [ ] Frame count matches the target clip length

## Common Failure Modes

- **Parallel generation.** Will always produce inconsistent frames. Never do this.
- **Paraphrased base scene.** Even small wording changes drift the output. Copy-paste the base exactly.
- **Too much change per frame.** If frame 3 has a new background AND a new camera angle, you've skipped 4 interpolation frames.
- **Missing previous-frame reference.** Forgetting to pass the previous frame's output as a reference for frame N+1 is the #1 cause of continuity breaks.
- **Over-long sequences.** Past 8-10 frames, drift compounds. Break it into chunks.
- **Lighting drift.** The sun moved between frame 2 and frame 3. Regenerate.
- **Hand / limb flicker.** Common when people move between frames. Either accept it or keep hands still.

## What NOT To Do

- Don't generate frames in parallel. Ever.
- Don't rewrite the base scene per frame — copy-paste it.
- Don't change more than 1-2 things between consecutive frames.
- Don't skip the previous-frame reference for frames 2+.
- Don't try to animate complex human motion in frame-by-frame mode.
- Don't mix aspect ratios within a single set.
- Don't ignore lighting drift — it looks worse when animated than when static.
$MD$,
       ARRAY['frames'],
       true
WHERE NOT EXISTS (
  SELECT 1 FROM skills WHERE is_default = true AND name = 'Default Frames Guidelines'
);
