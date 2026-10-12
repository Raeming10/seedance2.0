# MiniMax H3 — agent prompt notes

Reviewed: 2026-10-12. Project summary of official guidance; original templates below.

Official prompt guides:

- https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/base-en.txt
- https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/ref-en.txt
  Provider schema:
- https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3/reference-to-video
- https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3/image-to-video

Describe the purpose of each reference, the creative idea, then the scene in chronological order. Separate visible action, spoken dialogue, physical sound and background music. Assign references clear roles; specify the important details to preserve and what must be absent. Read the linked mode-specific official guide when writing a complex sequence.

For fal reference mode, name inputs `Image 1`, `Video 1`, `Audio 1` in array order. The API fields are `reference_image_urls`, `reference_video_urls`, `reference_audio_urls`; the Studio adapter maps the public `images`, `videos`, `audios` arrays automatically. Up to 9/3/3, 12 files total. Video and audio clips: 2–15 seconds each, at most 15 seconds combined per modality. The provider validates duration/content.

In this app: 5–15 seconds, native 768P. Frame mode inherits the input image's aspect ratio: prepare the opening frame at the desired ratio. Use reference mode when you want composition freedom. Native audio is always generated; `audio:false` mutes the downloaded output using FFmpeg. Prompt expansion is disabled to preserve the agent's deliberate direction.

Original template:
“Image 1 defines the small robot's identity and orange paint. A miniature greenhouse at sunrise. [0–3s] Close-up: the robot lifts a watering can, camera gently moves forward. [3–5s] It waters one seedling and pauses. Water taps the soil; quiet motor sounds. No dialogue. Background music: none. Keep the robot's proportions and the seedling's position consistent.”

## Mode choice and prompt compilation

| Mode        | Studio input → fal input                                        | Prompt job                                                                |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `reference` | `images` → `reference_image_urls`; similarly video/audio arrays | State what `Image 1`, `Video 1`, `Audio 1` control; describe a new scene. |
| `image`     | `firstFrame` → `image_url`                                      | Animate that opening composition; concentrate on motion.                  |
| `frames`    | `firstFrame` / `lastFrame` → `image_url` / `end_image_url`      | Specify a feasible transition with consistent props and geography.        |

The upstream MiniMax reference guide distinguishes subjects, picture anchors, video behavior and audio. It describes structured subject definitions, retention analysis and detailed descriptions; fal accepts a plain prompt string, not that object. Borrow its reasoning without sending incompatible payload fields. Its `<Subject ...>` and `<Picture ...>` structures do not replace fal's named array order. Upstream editing/continuation tasks do not automatically become supported Studio modes.

For a deliberate internal cut, the upstream guide uses `[Shot 1]`, then later `[Shot 2] At MM:SS.mmm` markers. Keep source time and speaker identity consistent. Prefer a controlled single shot when a complex multi-cut request would lose the viewpoint. Do not pad a short prompt to satisfy guidance intended for complex sequences.

Original reference binding: “Image 1 supplies the adult performer's appearance. Video 1 supplies only the forward camera movement, not its subject or setting. Audio 1 supplies the voice reference.” Attach the assets actually mentioned; a still portrait cannot supply voice identity. Describe the new action and sound after these bindings.

Original first-frame example: “Animate the opening image. The adult visitor's hand slides the envelope forward; the other hand stops just short of taking it. Fixed eye-level close-up; maintain the supplied framing. Paper brushes the desk. No speech or music. End with the envelope between the two hands.”
