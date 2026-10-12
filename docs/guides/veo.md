# Veo 3.1 — agent prompt notes

Reviewed: 2026-10-11. Project summary; not a replacement for the live official guide.

Official API and prompting guide: https://ai.google.dev/gemini-api/docs/veo
Official pricing: https://ai.google.dev/gemini-api/docs/pricing#veo-3.1

Provider is the Google Gemini API, model `veo-3.1-generate-preview`. Describe subject, action, setting, camera, visual style and sound. Clearly attribute dialogue to a speaker. Reference images guide subject appearance rather than fixing the opening frame. Use up to three asset references. First/last-frame mode anchors the two endpoint compositions; write a physically coherent transition. Do not mix references with endpoint frames.

Supported ratios: 16:9 and 9:16. Google supports native 720p, 1080p and 4k; this project exposes only 1080p (default) and 720p. Native durations: 4, 6, 8 seconds. Reference mode and 1080p require 8 seconds. Google generates audio. Silent delivery is local postprocessing, not a cheaper generation.

There is no native 2K parameter. Use native 1080p; do not request 4k as a substitute. 720p/1080p currently cost $0.40/s ($3.20 for 8 seconds). Native delivery with audio needs no FFmpeg; composition or removing audio does. Pricing is an estimate, not a billing guarantee.

Original template:
“An adult ceramic artist in a sunlit workshop slowly lifts a cobalt cup toward the camera. Medium close-up, soft side light, subtle handheld drift. Keep the cup's silhouette and glaze consistent with the reference. The artist says, ‘Made for your slow mornings.’ Quiet room tone and a soft ceramic tap. End with the cup steady at chest height.”
