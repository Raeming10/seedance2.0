---
name: video-prompting
description: Write or revise model-specific video generation prompts from timed story beats and shot coverage. Choose identity reference, first-frame or endpoint modes and compile camera, visible action, dialogue and source timing for Google Veo, Seedance or MiniMax H3. Use during Social Video creation before paid generation; also use for prompt-only requests.
---

# Compile video prompts

This skill is part of the Social Video pipeline. The create-video skill reads it automatically; the user does not need to invoke it separately. Do not apply an image-prompt skill's anime defaults or fixed image counts to live-action video.

Resolve `../../scripts/studio.js` relative to this file as LAUNCHER. If the user only wants prompt writing, read the bundled `../../runtime/docs/guides/video-prompting.md` and selected model guide directly, without requiring API keys or starting paid work. For a running production, use `node LAUNCHER guide video-prompting` and `node LAUNCHER guide MODEL`.

1. Require a creative plan before compiling: story change, timed beats, assigned source coverage, retained duration and entering/exiting continuity. If these are absent, develop them with the create-video workflow; do not ask the user to write JSON.
2. Select a mode by the job of the reference. Identity images, shot-specific opening frames, endpoint frames and motion/audio references are distinct. Read the selected model guide's mode table and bind the actual inputs using its syntax.
3. Compile reference roles → shot/viewpoint → visible chronological action → attributed dialogue and sound → source-local timing and necessary constraints. Do not copy the screenplay, internal motivations or marketing rationale into the prompt.
4. Check prompt-to-shot fidelity and dialogue feasibility before paid submission. Record the guide, mode, reference roles and critical review requirements in the production note. Consult the original official source if the bundled guide does not cover the intended technique; do not guess capability.
5. After generation, review whether these requirements were actually met. Keep the same durable job for polling/recovery; prompt revision is not authorization for another paid submission.

Use only model capabilities exposed by this runtime. The calling workflow owns cost, execution and editing; this skill does not independently generate media or introduce another text-model API key.
