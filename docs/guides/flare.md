# GPT Image 2.5 Flare — agent prompt notes

Reviewed: 2026-10-11. Parameter contract from fal; creative advice is project-authored.

Provider documentation:

- https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api
- https://fal.ai/models/openai/gpt-image-2.5/flare/edit/api

The app fixes `quality: medium`, one PNG per step, and a roughly 2048-pixel long edge. Both dimensions are rounded to multiples of 16, so unusual requested ratios can differ slightly. Ratios from 1:3 to 3:1 are supported. Text generation and reference editing are separate endpoints. Editing accepts up to 16 images.

Project advice: generate a clean subject reference before making a multi-shot story. Define subject identity, materials, wardrobe, environment, lighting, camera angle and composition. Leave room for platform captions. Put exact desired lettering in quotes. For edits, explicitly list what changes and what must remain identical. Avoid putting several camera views in one reference unless you actually want a contact sheet.

Use the generated image as `firstFrame` for a fixed opening composition, or in `images` for reference-to-video. With workflows, write `@step:hero` instead of manually copying URLs. Reuse the approved reference in subsequent image edits to reduce identity drift.

Original template:
“A handmade white ceramic cup with a thin cobalt rim on a pale oak café table. Soft morning window light, natural photographic texture, shallow depth of field. Vertical composition, cup centered in the lower half, clean space above for a later caption. No lettering, no hands, no extra cups.”
