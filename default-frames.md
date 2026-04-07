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
