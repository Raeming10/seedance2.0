---
name: create-video
description: Turn supplied story text into social videos while preserving its dialogue and plot. Direct shots, camera movement, acting and sound; compile MiniMax H3 reference prompts (default) or Veo 3.1, reuse Prelulu components, generate and edit authorized media.
---

# Turn a story into a social video

The plugin is a director and production assistant for the user's story. Its creative work is audiovisual translation: shot breakdowns, viewpoint, camera movement, blocking, expressions, physical actions, sound and editing. It is not permission to rewrite the story. Discuss in the user's language; use 9:16 by default. North American targeting affects visual pacing and presentation, not permission to alter supplied dialogue.

Resolve `../../scripts/studio.js` relative to this SKILL.md as LAUNCHER. Resolve `../../scripts/callkit.js` as KIT. The user need not manage manifests, technical configuration or model input files themselves.

Fast pacing means compressing screen time through efficient shot construction and editing while telling the entire supplied story clearly: overlap dialogue with relevant action, remove redundant coverage and retain causal links, key reactions and every supplied line. It does not mean arbitrary rapid cuts or omitting story information.

## Preserve the source before directing

1. Extract supplied plot facts, relationships, point of view, **exact dialogue with speakers**, and separately any narration, tagline and marketing copy. Preserve words, punctuation, language, line order and speaker by default. Do not add greetings, flirtation, threats, an extra reply or a new ending. A tagline is not automatically spoken dialogue. Do not turn narration into new speech. Translation, shortening, omission, new dialogue and plot expansion require explicit user authorization; a request to make it viral, faster, cinematic or a given length is not that authorization.
2. Lock the source in the production note. Put the exact spoken lines in `production.sourceDialogue` (including `[]` when the source has no dialogue) and in the timed beats. Set `dialogueChangesApproved` only when the user explicitly approves dialogue changes; record which changes were authorized. Compare prompt `<d>` contents with the locked lines before submission. The runtime checks beat text, not every provider prompt or creative implication.
3. Time the source at a natural performance speed, with concurrent movement counted once. Include any selected library ending separately. Tell the user the natural story duration and total export estimate. If the requested runtime is clearly longer than the natural complete story, use your directing judgment to compile prompts for the shorter coherent cut and tell the user the estimated story and total durations. Proceed within existing generation authorization; this mismatch alone does not require a confirmation question. Do not silently write extra events, stretch reactions, add long UI holds, speed up speech or cut supplied lines to hit the target. If a shorter requested runtime cannot contain the complete source, explain that constraint rather than silently losing content. Plot or dialogue expansion still requires explicit authorization.
4. With no source story (an explicit original-writing brief), construct the requested story. With a supplied story, construct its audiovisual script from those events. Visible acting can express an existing emotional change; it cannot invent a consequential new decision or relationship. Preserve ambiguity in the source ending rather than inventing an answer.

## Choose presentation without a call assumption

Start from the story and its strongest visible hook, not the platform's feature list. **Do not consider video calls as a creative element unless the user explicitly asks for a video call.** Mafia, romance, POV, a character addressing the viewer, Prelulu branding and reuse of a call component do not imply a call. The usual result is a cinematic scene or social story teaser. State the selected presentation briefly, without a routine approval gate.

Read the [shared component workflow](../call-video/SKILL.md) and `node KIT guide`. Reuse the actual `Captions`, `PovTitle` and `TemplateHeader` components through `format: story`; do not redraw them with ad hoc fonts, caption boxes or choice cards. A new edit structure is not a new visual design system. Do not add a Prelulu wordmark watermark. The existing character-name/app-icon/AI header may frame a story without a timer or call buttons. Product branding belongs in the configured library ending. Use a user-supplied replacement end-card file if the required asset is unavailable; report the missing asset rather than inventing a substitute. Count its duration in the budgeted timeline.

Only for an explicit call request, use the six call formats and their camera constraints. A narrative scene must not inherit a propped-phone camera, mandatory lens contact, immobilized hands, or no-cuts direction from those formats.

## Prepare and direct

- Run `node LAUNCHER start`. For missing setup use [setup](../setup/SKILL.md). Keep keys local, never print them. This does not generate media. Follow existing generation authorization and budget; plugin-only or prompt-only work must not submit paid jobs.
- Load `guide prelulu`, `guide directing`, `models`, `guide flare`, and each selected video model's guide. Default to **MiniMax H3 (`minimax`), reference mode**; retain **Google Veo 3.1 (`veo`)** when explicitly selected. Flare Medium makes reference images. Seedance is not supported.
- Write the timed audiovisual script before deriving calls. For every shot record its source event/line, purpose, scale/viewpoint, entering state, visible change, camera movement with direction and useful speed/amplitude, continuity, sound, source-local duration and intended edit range. Use action to motivate a reveal, a move or a cut. Avoid defaulting to static frontal portraits with alternating mouths.
- Read [video-prompting](../video-prompting/SKILL.md) and `guide video-prompting`. For H3 Ref2VA read the **complete official reference guide and base conventions** linked in `guide minimax`; do not substitute the base guide or a search excerpt for the reference guide.
- Plan references by role. In H3 reference mode, favor separate clean subject identities and a **people-free environment reference if needed**. Never require a multi-character staged office tableau just because a scene contains several characters. Such a frame can pin blocking, duplicate people or transfer clothes/tattoos. A pose/state in a picture is not automatically the state of the target shot. Use a composition anchor only when that exact staging has a clear purpose and is explicitly mapped. Inspect references, replace or omit a defective optional reference before paying for video; negative prose alone is not a repair.
- H3 multi-shot reference generation may combine connected events. Declare shot-specific blocking and motivated cuts rather than splitting every line into a frozen portrait. Do not confuse a reusable identity with a first frame. Never silently replace a reference request with text-only or frame generation.

## Preview, execute and edit

Save unique manifests and notes in plansDir. Follow `examples/social-video.json`, `examples/prelulu-source-dialogue.json` and `docs/API.md`. Include `production` timing, source dialogue and coverage in full-film workflows. Separate image preparation from the video phase when references need inspection; do not submit all dependent videos before inspecting them.

Run `node LAUNCHER preview-workflow FILE`. Resolve timing/coverage errors and review warnings. Explain known costs and unpriced image/reference steps. Sparse dialogue is a cue to re-evaluate natural duration, **not to invent dialogue**. No automatic score proves an engaging or faithful film.

Submit the already-authorized plan with `workflow FILE --key STABLE_KEY`, record workflow ID, and monitor with `workflow-status ID`. Reuse the key after a network interruption. A poll timeout does not authorize another generation. Check provider history for `unknown`; resume `paused` jobs without recreating them.

Inspect timestamped frames with `inspect`, and playback/listening when available. Review entry/action, hook, movement, eyelines, speaker identity, original lines, continuity and payoff. Transcribe actual speech before captions. If a model changes a locked line, flag or repair it within authorization; never silently change the source/script/caption to legitimize it. Re-cut before regenerating; preserve sources and manifests. A crop hiding a duplicate character or a subtitle hiding a failed line is not an accepted repair.

Select actual `{url,start,end,volume}` ranges, preview with `preview-composition`, then `compose`. Pass selected footage and source-time words to the shared kit's `story` renderer, which preserves the selected ranges, action and sound. It does not apply call pause trimming to a dramatic scene. Use existing components, not custom Pillow/FFmpeg overlay artwork. Keep edit configs for free local revisions. End-card and captions stay editable.

Deliver the MP4 and relevant references with limits. Frames and ASR do not establish lip sync, speaker identity, acting, music or audio continuity; without continuous playback/listening label it a review draft. Never publish without explicit permission.

Preserve the generated footage’s native soundtrack (dialogue, ambience, effects and any generated score). Do not add the kit’s bundled background music or a replacement music bed. Set `music: false` for all formats unless the user explicitly requests additional music later. Append the supplied library CTA as-is, including its own audio.
