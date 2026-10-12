# Seedance 2.0 — agent prompt notes

Reviewed: 2026-10-11. This is a project summary and workflow advice, not a verbatim official manual.

Sources:

- ByteDance: https://seed.bytedance.com/en/blog/seedance-2-0-official-launch
- fal parameter contract: https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api
- fal frame contract: https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api

Use `@Image1`, `@Video1`, `@Audio1` in fal prompts, in the order of the corresponding arrays. Say what each reference controls: identity, wardrobe, environment, motion or voice. Do not give two references conflicting ownership. Image-to-video uses an opening image and optional ending image; describe the motion between them.

Project workflow: define the visible subject, setting, framing, one principal action, camera movement, light, audio and final composition. For multiple beats, use ordered time ranges whose total fits the requested duration. Quote dialogue and identify the speaker. Keep recurring subjects' appearance and props identical across shots. Use image editing to derive a new composition from an approved reference.

In this app: 4–15 seconds; 720p/1080p; up to 9 images, 3 videos and 3 audio references, 12 total. Reference audio needs an image or video. Video references: 2–15 seconds combined, under 50 MB, approximately 480p–720p. Audio: at most 15 seconds combined, 15 MB each. File-count validation is local; provider validates media duration/content.

Original template:
“@Image1 defines the ceramic cup, including its blue rim. Vertical close-up at a quiet café window, soft morning light. [0–2s] Steam rises from the cup. [2–5s] One hand turns it slowly toward the lens; the camera holds steady. Gentle café ambience. End with the cup centered and space above it for a caption.”
