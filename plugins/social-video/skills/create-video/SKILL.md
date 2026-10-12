---
name: create-video
description: Direct, generate and edit social videos in Codex using fal Flare, Seedance, MiniMax and official Google Veo. Turn a story into a visual hook, motivated shots and a reviewed cut, or improve an existing video's opening, coverage and pacing while reusing assets.
---

# Create a social video

Use Codex's own reasoning to develop the user's story and prompts. The plugin supplies model guides and reliable execution. Keep their creative choices; discuss in their language. Use 9:16 for a social short unless they request another format. Do not impose a fixed genre, shot count, or an approval after every step.

Resolve [../../scripts/studio.js](../../scripts/studio.js) relative to this SKILL.md into an absolute, correctly quoted path. Below, LAUNCHER means that path. The user can work in any local creative folder; they do not need to open the plugin's source repository.

## Prepare

- Run `node LAUNCHER start`. It starts or reuses the service and reports paths/readiness. If setup is missing, follow the sibling [setup skill](../setup/SKILL.md). Ask for missing credentials through the local config file, not the chat. Respect the user's existing budget and generation authorization.
- Run `node LAUNCHER guide directing` before developing or revising the film. It supplies visual-storytelling, opening-hook, coverage, format and review guidance. Apply the format relevant to the user's brief; do not impose a universal shot count or cut frequency.
- Run `node LAUNCHER models` and `node LAUNCHER guide MODEL` for each selected model before writing its prompts. Read only the selected guides. They give official sources, capabilities and model-specific reference syntax. Let Codex write the prompts; do not append whole manuals to them.
- Prefer Seedance 2.0 for the project's usual short-video workflow; MiniMax for a lower-cost reference-based draft; use the user's chosen model when specified. Flare generates/edits reference images at medium quality and approximately 2048px long edge. Veo uses the official Google API, defaults to native 1080p and requires 8 seconds for 1080p/reference mode. Do not invent unsupported durations or upscale requests.

## Execute

Translate scene prose into visible actions and reactions; do not automatically burn scene descriptions onto the image. Keep useful dialogue captions, essential context and product copy. Internally compare a few hook ideas and choose one with a clear early question, conflict or benefit and a related payoff. Do not generate paid alternatives unless authorized.

Write a short production note in plansDir: selected hook, each shot's new information, action/reaction, scale/viewpoint, motivated movement or stillness, continuity, sound/text, intended edit duration and model-valid source duration. Keep this creative metadata out of the strict API manifests. Establish identity references, then create shot-specific keyframes when composition changes. Preserve deliberate long takes and first-person viewpoints. The user need not call a separate director skill or approve every shot.

Use `node LAUNCHER upload /absolute/image-or-video-path` for user-provided local assets. Never send sensitive or unrelated local files. Generated outputs can be reused directly by their Studio asset URL.

Write manifests yourself in the reported plansDir, using unique filenames per production. Read the bundled `examples/social-video.json` or `docs/API.md` under the reported projectRoot for the exact schema. Use `@step:ID` to pass an earlier image into later shots. Never ask the user to write, paste, copy or import JSON.

```text
node LAUNCHER preview-workflow /absolute/plan.json
node LAUNCHER workflow /absolute/plan.json --key stable-production-key
node LAUNCHER workflow-status WORKFLOW_ID
```

Preview before submitting. Explain known cost plus unpriced steps; Flare has variable pricing. Do not claim a strict budget is guaranteed from an incomplete estimate. If the user requested only planning or a preview, stop before generation; if they already authorized generation, proceed within that scope without inventing additional approvals.

Save the workflow ID and key with the plan. Poll workflow-status for long jobs without repeatedly sending creation requests. The service persists progress, but the computer/service must stay running. Reuse the same submission key after a network interruption. `unknown` means provider acceptance is uncertain: inspect provider history, do not blindly pay again. `paused` jobs can use `resume JOB_ID` to continue polling/downloading.

## Review and revise

Prefer generating sources, inspecting them and making a separate edit. Use `node LAUNCHER inspect /outputs/CLIP.mp4` for timestamped frames, or `--times 0,0.5,1,2,3` within the clip's duration. Open the returned frames using available image tools; use playback/listening tools for motion, cuts and audio. These are Studio URLs; on this machine, returned frame basenames are inside the reported outputsDir. For a shared server, use the authenticated media URL. The tool supplies evidence, not an automatic review. State any inspection limitation honestly.

Review the first three seconds, visual legibility without explanatory prose, new information per shot, performance-based cut timing, continuity, text/UI placement, sound and the promised payoff. Keep concise notes and asset/job IDs with the production note. Try re-cutting before regenerating; revise only affected shots within authorization and budget.

Read the composition schema in projectRoot/docs/API.md. Clips accept `{url, start, end, volume}` in seconds; old whole-clip URLs still work. Keep only useful moments rather than retaining every generated second. Independent audioTracks support source ranges, timeline position, volume and fades, including sound bridges when appropriate. Avoid duplicating source dialogue in both a clip and a separate track. The compositor does not synthesize audio, burn captions or create visual transition effects; use available editing tools when those are needed for the requested film.

Run `node LAUNCHER preview-composition /absolute/composition.json`, then `node LAUNCHER compose /absolute/composition.json --key unique-edit-key`. Preview validates source bounds and reports the resulting timeline. Neither command regenerates media; generation cost still includes discarded source seconds. Preserve the cut manifest with the sources so later revisions can reuse both.

Deliver the final MP4 with a usable link or absolute local path from outputsDir, relevant reference images and any remaining issue. The optional webpage is for preview; it is never a required creation step. Do not publish to social accounts without explicit authorization.
