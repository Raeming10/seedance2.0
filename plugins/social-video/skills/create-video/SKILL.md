---
name: create-video
description: Create or revise social videos in Codex using fal Flare images, Seedance or MiniMax clips, and official Google Veo. Turn a user's story into consistent reference images, video shots and an assembled MP4, or revise selected shots while reusing existing assets.
---

# Create a social video

Use Codex's own reasoning to develop the user's story and prompts. The plugin supplies model guides and reliable execution. Keep their creative choices; discuss in their language. Use 9:16 for a social short unless they request another format. Do not impose a fixed genre, shot count, or an approval after every step.

Resolve [../../scripts/studio.js](../../scripts/studio.js) relative to this SKILL.md into an absolute, correctly quoted path. Below, LAUNCHER means that path. The user can work in any local creative folder; they do not need to open the plugin's source repository.

## Prepare

- Run `node LAUNCHER start`. It starts or reuses the service and reports paths/readiness. If setup is missing, follow the sibling [setup skill](../setup/SKILL.md). Ask for missing credentials through the local config file, not the chat. Respect the user's existing budget and generation authorization.
- Run `node LAUNCHER models` and `node LAUNCHER guide MODEL` for each selected model before writing its prompts. Read only the selected guides. They give official sources, capabilities and model-specific reference syntax. Let Codex write the prompts; do not append whole manuals to them.
- Prefer Seedance 2.0 for the project's usual short-video workflow; MiniMax for a lower-cost reference-based draft; use the user's chosen model when specified. Flare generates/edits reference images at medium quality and approximately 2048px long edge. Veo uses the official Google API, defaults to native 1080p and requires 8 seconds for 1080p/reference mode. Do not invent unsupported durations or upscale requests.

## Execute

Plan an opening, action and payoff that fit the user's length. Establish subject identity, wardrobe, props and visual style; reuse reference images across shots. One clear main action per short shot is usually easier to control, but the story determines the structure.

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

Inspect generated images and available video previews or extracted frames using the environment's tools. A successful API response is not a quality check. Be explicit about anything you could not visually inspect. Keep regeneration within the user's authorization; revise only affected shots.

For a revised cut, submit `compose /absolute/composition.json --key unique-edit-key`, with the existing and replacement MP4 URLs in order. This does not regenerate the unchanged clips. Read the composition schema in docs/API.md when needed. The built-in compositor joins clips and normalizes audio/size; it does not automatically add subtitles, music or transitions. Use available editing tools only when the user requests those additions.

Deliver the final MP4 with a usable link or absolute local path from outputsDir, relevant reference images and any remaining issue. The optional webpage is for preview; it is never a required creation step. Do not publish to social accounts without explicit authorization.
