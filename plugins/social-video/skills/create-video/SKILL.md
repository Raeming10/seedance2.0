---
name: create-video
description: Direct, generate and edit social videos in Codex using fal Flare, Seedance, MiniMax and official Google Veo. Default to Prelulu brand context; write a timed story before deriving model calls, then compile shot prompts and review the cut, or improve an existing video's opening, coverage and pacing while reusing assets.
---

# Create a social video

Use Codex's own reasoning to develop the user's story and prompts. This installation defaults to Prelulu official-account content; an explicit different brand or unbranded request overrides that default. The plugin supplies model guides and reliable execution. Keep their creative choices; discuss in their language. Use 9:16 for a social short unless they request another format. Do not impose a fixed genre, shot count, or an approval after every step.

Resolve [../../scripts/studio.js](../../scripts/studio.js) relative to this SKILL.md into an absolute, correctly quoted path. Below, LAUNCHER means that path. The user can work in any local creative folder; they do not need to open the plugin's source repository.

## Prepare

- Run `node LAUNCHER start`. It starts or reuses the service and reports paths/readiness. If setup is missing, follow the sibling [setup skill](../setup/SKILL.md). Ask for missing credentials through the local config file, not the chat. Respect the user's existing budget and generation authorization.
- Run `node LAUNCHER guide prelulu` to load the bundled audience, character-led romance positioning, format choices and claim boundaries. Do not require access to a separate Prelulu repository or ask the user to repeat this context.
- Run `node LAUNCHER guide directing` before developing or revising the film. It supplies visual-storytelling, opening-hook, coverage, format and review guidance. Apply the format relevant to the user's brief; do not impose a universal shot count or cut frequency.
- Run `node LAUNCHER models` and `node LAUNCHER guide MODEL` for each selected model before writing its prompts. Read only the selected guides. They give official sources, capabilities and model-specific reference syntax. Let Codex write the prompts; do not append whole manuals to them.
- Prefer Seedance 2.0 for the project's usual short-video workflow; MiniMax for a lower-cost reference-based draft; use the user's chosen model when specified. Flare generates/edits reference images at medium quality and approximately 2048px long edge. Veo uses the official Google API, defaults to native 1080p and requires 8 seconds for 1080p/reference mode. Do not invent unsupported durations or upscale requests.

## Write the film before choosing the generation count

Translate scene prose into visible actions and reactions; do not automatically burn scene descriptions onto the image. Keep useful dialogue captions, essential context and product copy. Internally compare a few hook ideas and choose one with a clear early question, conflict or benefit and a related payoff. Do not generate paid alternatives unless authorized.

Write a complete timed audiovisual script in plansDir **before writing API prompts**. Define the desire, obstacle, consequential choice/reversal and payoff for a narrative short. Give each beat a visible action, new information/change, dialogue and a justified duration. Rehearse the actual English lines at their intended pace, accounting for physical actions and pauses; concurrent actions do not add extra time. A 20-second request needs roughly 20 seconds of meaningful material, not three eight-second descriptions of the same feeling. Do not fill the gap with long holds merely to hit a runtime.

Challenge the script: can the viewer identify a concrete question/conflict early, does something change midway, does the payoff resolve or develop that question, and why does each beat take its allotted time? If removing a beat loses nothing, rewrite or remove it. For another format, use its appropriate progression rather than forcing a dramatic plot. Do this internally; no compulsory user approval step.

Only then derive coverage and model calls. One call can cover several connected beats, and one beat may need multiple angles. `ceil(final seconds / model seconds)` is a capacity lower bound, not a creative plan. Keep identity references separate from shot-specific keyframes. Preserve deliberate long takes and first-person viewpoints. Budget for generated seconds, including discarded handles; simplify staging if necessary without padding a thin story. Include the Prelulu ending/CTA in the actual timeline unless the brief overrides branding.

Read the sibling [video-prompting skill](../video-prompting/SKILL.md) and run `node LAUNCHER guide video-prompting` before compiling the selected model prompts. The user does not need to invoke another skill. Save a prompt audit with mode, reference roles, source-local action/dialogue timing, invariants and the specific requirements to inspect.

## Preview and execute

Include a `production` object in each new full-film workflow: brand, targetDuration, story, timed beats and ordered coverage tied to video step IDs. See projectRoot/docs/API.md and the non-generating example projectRoot/examples/prelulu-mafia-20s.json, with creative rationale in projectRoot/docs/examples/prelulu-mafia-20s.md. The API validates timeline coverage and source bounds and reports planning warnings. It does not decide whether a script is compelling. Review the warnings and record a concrete justification for any retained warning. For image-only preparation or an isolated shot revision, the full-film production object is unnecessary; keep its connection to the parent script in the note.

Use `node LAUNCHER upload /absolute/image-or-video-path` for user-provided local assets. Never send sensitive or unrelated local files. Generated outputs can be reused directly by their Studio asset URL.

Write manifests yourself in the reported plansDir, using unique filenames per production. Read the bundled `examples/social-video.json` or `docs/API.md` under the reported projectRoot for the exact schema. Use `@step:ID` to pass an earlier image into later shots. Never ask the user to write, paste, copy or import JSON.

```text
node LAUNCHER preview-workflow /absolute/plan.json
node LAUNCHER workflow /absolute/plan.json --key stable-production-key
node LAUNCHER workflow-status WORKFLOW_ID
```

Preview before submitting. Inspect `productionReview`: planned duration, generated seconds, calls and warnings. Fix timing/coverage errors before paying. Explain known cost plus unpriced steps; Flare has variable pricing. Do not claim a strict budget is guaranteed from an incomplete estimate. If the user requested only planning or a preview, stop before generation; if they already authorized generation, proceed within that scope without inventing additional approvals.

When composition or identity is critical, execute the image/keyframe phase first, inspect those images, then prepare the video-phase workflow using their actual asset URLs. Preview the full plan for cost before these phases; stage execution does not expand the budget. Do not submit a dependency chain that generates all video shots before the agent can inspect its keyframes. Keep production metadata with the video-phase workflow and use distinct stable keys for each phase.

Save the workflow ID and key with the plan. Poll workflow-status for long jobs without repeatedly sending creation requests. The service persists progress, but the computer/service must stay running. Reuse the same submission key after a network interruption. `unknown` means provider acceptance is uncertain: inspect provider history, do not blindly pay again. `paused` jobs can use `resume JOB_ID` to continue polling/downloading.

## Review and revise

Prefer generating sources, inspecting them and making a separate edit. Use `node LAUNCHER inspect /outputs/CLIP.mp4` for timestamped frames, or `--times 0,0.5,1,2,3` within the clip's duration. Open the returned frames using available image tools; use playback/listening tools for motion, cuts and audio. These are Studio URLs; on this machine, returned frame basenames are inside the reported outputsDir. For a shared server, use the authenticated media URL. The tool supplies evidence, not an automatic review. State any inspection limitation honestly.

Review the first three seconds, visual legibility without explanatory prose, new information per shot, performance-based cut timing, continuity, text/UI placement, sound and the promised payoff. Keep concise notes and asset/job IDs with the production note. Log planned versus actual viewpoint, event, speech and timing. A shot that breaks a critical POV, omits the turning action or attributes dialogue to the wrong speaker has not passed just because generation completed. Repair with existing footage if possible; otherwise regenerate only within existing authorization/budget or disclose the unresolved deviation. Do not silently relabel it as intentional coverage. Try re-cutting before regenerating; revise only affected shots within authorization and budget.

Map actual speech to source and edit time before adding captions. Use available local transcription/alignment tools, then check against listening where possible; planned dialogue alone is not verified speech. Keep branding, captions and UI editable in post. Do not auto-install a paid text/voice service just for review.

Read the composition schema in projectRoot/docs/API.md. Clips accept `{url, start, end, volume}` in seconds; old whole-clip URLs still work. Keep only useful moments rather than retaining every generated second. Independent audioTracks support source ranges, timeline position, volume and fades, including sound bridges when appropriate. Avoid duplicating source dialogue in both a clip and a separate track. The compositor does not synthesize audio, burn captions or create visual transition effects; use available editing tools when those are needed for the requested film.

Run `node LAUNCHER preview-composition /absolute/composition.json`, then `node LAUNCHER compose /absolute/composition.json --key unique-edit-key`. Preview validates source bounds and reports the resulting timeline. Neither command regenerates media; generation cost still includes discarded source seconds. Preserve the cut manifest with the sources so later revisions can reuse both.

Deliver the final MP4 with a usable link or absolute local path from outputsDir, relevant reference images and any remaining issue. The optional webpage is for preview; it is never a required creation step. Do not publish to social accounts without explicit authorization.
