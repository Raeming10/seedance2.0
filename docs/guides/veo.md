# Veo 3.1 — agent prompt notes

Reviewed: 2026-10-12. Project summary; not a replacement for the live official guide.

Official API and prompting guide: https://ai.google.dev/gemini-api/docs/veo
Official pricing: https://ai.google.dev/gemini-api/docs/pricing#veo-3.1

Provider is the Google Gemini API, model `veo-3.1-generate-preview`. Describe subject, action, setting, camera, visual style and sound. Clearly attribute dialogue to a speaker. Reference images guide subject appearance rather than fixing the opening frame. Use up to three asset references. First/last-frame mode anchors the two endpoint compositions; write a physically coherent transition. Do not mix references with endpoint frames.

Supported ratios: 16:9 and 9:16. Google supports native 720p, 1080p and 4k; this project exposes only 1080p (default) and 720p. Native durations: 4, 6, 8 seconds. Reference mode and 1080p require 8 seconds. Google generates audio. Silent delivery is local postprocessing, not a cheaper generation.

There is no native 2K parameter. Use native 1080p; do not request 4k as a substitute. 720p/1080p currently cost $0.40/s ($3.20 for 8 seconds). Native delivery with audio needs no FFmpeg; composition or removing audio does. Pricing is an estimate, not a billing guarantee.

Original template:
“An adult ceramic artist in a sunlit workshop slowly lifts a cobalt cup toward the camera. Medium close-up, soft side light, subtle handheld drift. Keep the cup's silhouette and glaze consistent with the reference. The artist says, ‘Made for your slow mornings.’ Quiet room tone and a soft ceramic tap. End with the cup steady at chest height.”

## Choose the input by its role

| Studio mode / input                  | Gemini mapping                                        | Use                                                                        |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `text`                               | `prompt`                                              | Stage from text.                                                           |
| `reference`, `images`                | `config.referenceImages`, each `referenceType: asset` | Subject appearance assets, not opening frames, motion or voice references. |
| `image`, `firstFrame`                | top-level `image`                                     | Animate the supplied opening composition.                                  |
| `frames`, `firstFrame` + `lastFrame` | `image` + `config.lastFrame`                          | Connect endpoints with plausible motion.                                   |

No `@Image1` prompt-token convention is exposed here: identify the asset subject and preserved traits naturally. This plugin does not expose video extension or audio-reference input. Cloud creative guidance can inform a shot, but Vertex payload fields are not interchangeable with Gemini fields. Additional official camera guidance: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide

## Project prompting recipe

Read the shared video-prompting guide. For asset mode describe which visible subject to preserve, then the new camera setup and action. For image mode describe motion from the existing composition, with concise continuity constraints. Quote dialogue and name the speaker; put offscreen voices, sound effects and ambience in separate sentences. Use source-local timing and finish speech inside the planned retained range. Do not use an identity portrait as the first frame for every angle.

For a strict first-person medium shot, first create a Flare edit showing that exact eye level, eyeline and prop state, inspect it, then attach it as `firstFrame`. A portrait attached as an asset does not anchor this composition. Neither mode guarantees fidelity: reject or disclose a reverse-angle result that exposes the viewer when the plan requires first person.

Original endpoint example: “Continue from the opening frame: the adult artist rotates the cup a quarter turn with both hands, bringing its handle into the ending frame's position. Locked camera; one continuous movement. A quiet ceramic tap as it settles. No dialogue.” Verify both endpoint images agree on identity, geometry and lighting before submission.
