# MiniMax H3 — default video model

Reviewed 2026-10-12. Read the **complete** official mode guide before compiling prompts, including examples, speaker rules and audio relationships. Reading only the base guide or an excerpt is insufficient for reference-to-video.

- [Official H3 skill](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/SKILL.md)
- [Full-reference guide](https://raw.githubusercontent.com/MiniMax-AI/MiniMax-H3/main/skills/h3-prompt-writing/references/ref-en.txt)
- [Base shot/camera/dialogue conventions](https://raw.githubusercontent.com/MiniMax-AI/MiniMax-H3/main/skills/h3-prompt-writing/references/base-en.txt)
- [User-provided base guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [fal reference schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3/reference-to-video)
- [fal frame schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3/image-to-video)

## Runtime contract

Use `model: minimax`, normally `mode: reference`. The runtime supports 5–15 seconds, 768p (`768P` at fal), reference / first-frame / first-and-last-frame modes. Native audio is generated; `audio:false` mutes it locally. Prompt expansion is disabled. Veo 3.1 remains an explicit alternative; Seedance is removed. The upstream model's broader modes or duration ranges are not automatically available through this adapter.

Arrays `images`, `videos`, `audios` map to fal's `reference_image_urls`, `reference_video_urls`, `reference_audio_urls`. Address files as `Image 1`, `Video 1`, `Audio 1` in their array order. Up to 9 images, 3 videos, 3 audio files, 12 total; each video/audio reference is 2–15 seconds and each modality totals at most 15 seconds. A picture supplies no voice. Frame mode uses `firstFrame` and optionally `lastFrame` instead, and inherits image aspect ratio.

## Build a role map before making images

The reference may supply an identity, costume, environment, composition, movement or sound; these are different jobs. A subject can span several assets; an asset can contain several subjects. Preserve the chosen role, not every incidental pixel.

Default reference design for a dramatic scene: separate clean character images; optional **empty location** image. Do not make a whole cast sitting in the final blocking as an obligatory environment reference. That was a production failure in earlier tests: the environment contained a seated boss, while the target asked him to stand, creating duplicate people; tattoos also leaked to another man. Do not pass such a known-defective reference and hope a negative instruction fixes it. Repair the relevant image or omit the optional reference before video generation.

An identity image does not lock body position or viewpoint. A composition/shot-planning reference is useful only when that specific framing is needed; map it to the relevant shot instead of imposing it on the whole video. H3 reference mode can stage new views and actions. Do not generate a first-frame still for every new angle merely out of habit.

## Compile the official six-section reference structure

For Ref2VA keep this order **inside the prompt string**:

1. `subject_definitions`: define reusable subjects and which real input assets supply them. Keep `<Subject N>` labels stable. Use `<Picture N>` as an independent anchor only when the image itself anchors a shot, rather than defining identity or environment. Map any official picture label explicitly to fal's `Image N`; don't leave two numbering systems ambiguous. `Video N` / `Audio N` also need actual attached assets and explicit roles.
2. `summary`: identify the actual reference relationship and briefly describe the new scene. Do not claim editing/continuation/audio reuse unless that is the real requested relationship and supported operation.
3. `retention_analysis`: state what each subject/reference retains, changes or transfers, in which shots. Speaker IDs do not belong here. A new pose or camera angle is not loss of identity fidelity.
4. `detailed_description`: establish style before `[Shot 1]`; then describe shot-local framing, subject placement, environment/light, chronological action, state changes, camera and synchronized sound. Later cuts use increasing source-local `At MM:SS.mmm` timestamps. Every cut or move must reveal something or follow an action, not mechanically alternate frontal faces. Give the specific speed/amplitude when useful. Track who is seated/standing and where each person exits/enters, so the same person cannot appear twice.
5. `overall_soundscape`: ambience and physical sounds, without repeating the dialogue.
6. `non_diegetic_music`: audience-only music with concrete instrumentation/pacing, or `N/A` when no score is intended.

The six sections are prompt text, **not extra JSON fields in the API payload**. The previous instruction to discard the official subject/retention structure simply because fal accepts a string was wrong. Preserve that structure while binding the actual ordered assets.

Assign `(S1)`, `(S2)` by first vocal event and keep each stable across the complete target. Attach the subject label and speaker ID to actual speech; mark offscreen speech explicitly. Keep original words/language/punctuation inside `<d>[Language] ...</d>`. An image-only silent character does not need a speaker ID. Audio-timbre guidance does not authorize copying the reference audio's words. Speech spanning cuts needs the official continuity notation; don't break words at clip boundaries.

The official guide describes detailed multi-shot generation passages; do not reduce them to a plot summary. Include enough visible and audible detail to direct the performance. Avoid mechanically padding to a word count or stacking camera buzzwords.

For frame modes, use the base guide's alignment instruction and three core fields instead; do not paste reference-mode sections into a first-frame workflow. Keep the asset mode and prompt mode consistent.

## Audit before spending

Compare the entire ordered dialogue with the source lock. Check actual reference attachments and role/label mapping, each speaker, cut time, screen direction and entering/exiting state. Confirm every source beat fits its duration; if the requested duration is clearly too long, compile the complete shorter story and explain its natural duration without a confirmation gate or a fabricated new line. Inspect character references and environment cleanliness before the video phase. In the result check duplicate people, identity transfer, changed dialogue, missed movements and speaker/voice attribution. Recut useful material first; do not conceal a failed shot with unrelated silent footage or alter the source to excuse model drift.
