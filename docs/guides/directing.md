# Directing social videos

This is the studio's creative guidance, not a provider specification or a promise of engagement. Read it when developing a story or revising a cut. Preserve the user's plot, point of view, tone, audience, product claims and chosen format. A deliberate long take, slow mood film or text-led concept can be appropriate; do not replace it with a compulsory fast-cut template.

## From brief to observable events

Identify the intended audience response and the change the film should show: a decision, discovery, relationship shift, demonstration or payoff. Use what the user already supplied; ask only when a missing fact changes the creative direction. Make reasonable creative choices without requiring approval for each shot.

Translate prose into observable action, a revealing object, a reaction or a consequence. For example, reluctance might be a hand reaching and stopping; a decision might be an object deliberately returned. These are possible staging choices, not stock actions to add to every story. Preserve essential facts that cannot be communicated visually with concise dialogue or context.

Separate four kinds of text: internal scene directions, spoken dialogue/captions, essential context and product/CTA copy. Scene directions belong in the shot plan and model prompts, not automatically on screen. Keep readable dialogue captions when useful; do not ban text universally. Avoid opening paragraphs that explain feelings or spoil an upcoming reveal. Test whether the central action is legible with explanatory text hidden and sound muted; then restore captions and sound for accessibility and delivery.

## Design the opening before generating

For a social feed film, internally consider a few distinct openings and select one using immediate legibility, curiosity, relevance to the actual payoff and production feasibility. Do not generate every alternative or show the user a menu unless they ask. Budget permission for one film is not permission for a paid A/B campaign.

Useful starting points include an action already in progress, an unexpected reaction, a contradiction, a threatened outcome or a consequence whose cause is revealed later. The first visible frame should give the viewer something concrete to notice. Within roughly three seconds, establish a meaningful question, conflict or benefit. Avoid spending that window solely on a room tour, logo animation or background exposition unless that is the requested concept.

Three seconds is a design checkpoint, not a mandatory cut count or universal platform law. TikTok's performance-ad guidance recommends introducing the proposition in the first three seconds and prioritizing the hook in the first six; test against the actual audience and objective. [Official guidance](https://ads.tiktok.com/resources/help/article/creative-best-practices?lang=en) (consulted 2026-10-12).

The later film should satisfy the opening's promise. Do not manufacture a misleading hook, unrelated shock or a product capability that does not exist.

## Choose coverage for the story

Give every planned shot a purpose and new information. Decide what the viewer sees, notices and feels before choosing camera terminology.

| Choice                      | Use it when                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Wide or medium shot         | Space, distance, blocking or relationships need to become clear. An establishing shot need not come first. |
| Insert / extreme close-up   | A small object, gesture, clue or decision needs attention.                                                 |
| Close-up / reaction         | An expression changes the meaning of the preceding action.                                                 |
| Point-of-view / eyeline cut | The audience needs to discover what a character notices.                                                   |
| Push, pull, pan or reveal   | The movement changes information, pressure, intimacy or the viewer's access to the scene.                  |
| Held, still shot            | A reaction or moment of uncertainty needs time to register.                                                |

Action → reaction → decision → consequence is one useful pattern, not a mandatory sequence. Compare adjacent shots: a purposeful change of scale, angle, action or information earns a cut. Do not meet an arbitrary quota for close-ups or camera moves. A moving camera does not automatically create a new dramatic beat. Alternate intensity and breathing space according to the scene; every shot need not have the same length.

Maintain eyelines, screen direction, geography, prop state, hand positions and cause-and-effect continuity. First-person stories can vary between hands/objects, the other person's face and shared actions without inventing a reverse angle that exposes the viewer character. Do not break the chosen point of view just to get more coverage.

## Apply only the relevant format guidance

- **Narrative / relationship scene:** Identify whose decision changes the scene. Cover the triggering action and meaningful response; let emotion emerge through performance. Preserve ambiguity until the intended reveal. A close-up can hold longer than an action insert.
- **Product demonstration / advertisement:** Show the problem, transformation or useful result clearly. Prioritize evidence and an understandable benefit. Tie the ending to the real product and requested action. Do not invent comparative claims or fake app features. Branded UI may establish the product context, but should leave the central action legible.
- **Talking head / educational:** Keep the speaker's thought coherent. Use accurate captions and relevant inserts to clarify an example or reveal evidence. Do not replace necessary explanation with unrelated cinematic coverage.
- **Atmospheric / deliberately continuous film:** Preserve the chosen pace. Plan internal changes in blocking, focus, light, sound or revelation instead of forcing edits into a long take. A visible event can supply the hook without fast cutting.

## Plan generation separately from the edit

Keep a human-readable production note next to the internal manifests. For each selected shot record:

| Field                      | Decision                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Purpose / new information  | What does this shot add? Why cut to it?                                             |
| Visible action / emotion   | What changes on screen, and what response should it evoke?                          |
| Composition / movement     | Shot scale, viewpoint, subject position, motivated camera movement or stillness.    |
| Continuity                 | Identity, clothing, light, geography and prop state entering/leaving the shot.      |
| Source / delivery duration | Model-valid generated seconds and the shorter intended usable window.               |
| Sound / text               | Dialogue, sound cue or ambience; captions/context/CTA only where useful.            |
| Asset / edit               | Reference and resulting job/asset IDs; actual chosen in/out times after inspection. |

Use identity references to preserve the subject, then create shot-specific keyframes when scale or angle changes. Reusing one first frame for every shot tends to repeat its composition. Generate only the coverage justified by the story and budget; reuse existing suitable media. Digital cropping cannot create a missing angle, perspective or performance.

After directing decisions, read the selected models' guides and translate each shot into supported parameters and prompts. Request only the actions the model can plausibly execute in one source clip. Do not solve a complex scene by cramming many independent cuts and emotions into a short generation.

An eight-second generation can contribute two seconds to the final film. Budget for all generated seconds, not only the retained seconds. Leave useful action handles where appropriate, but avoid unnecessary paid coverage. Cost estimates may have unpriced items; do not promise a total that the tool cannot establish.

## Inspect, choose and assemble

Prefer generating source clips first, inspecting them and composing a separate cut. A workflow's automatic compose block is a provisional assembly, not proof that its planned in/out points match the performance actually generated.

Use `inspect` for timestamped preview frames, including the opening and important action/reaction moments. Open those images; the command itself does not perform visual evaluation. Watch available playback to assess movement and rhythm, and listen to audio when the environment supports it. Be explicit when only frames were inspected. Never describe unheard dialogue, music or timing as verified.

Write a composition with selected source ranges. Choose cut points at meaningful action, attention or emotional changes; remove empty lead-in and tails without clipping essential dialogue. Prefer clean cuts and motivated action/eyeline matches. Use flashy transitions only when the format warrants them. Preserve the intended point of view and continuity across boundaries.

For a sound bridge, mute or lower the duplicated clip's original audio and place that source's audio as an independent `audioTracks` entry. `at` is the sound's position in the assembled film; `start`/`end` select its source. This permits J-cuts (next sound arrives before its picture) and L-cuts (sound continues after its picture). Use available authorized audio; this tool does not create music or dialogue. Keep tracks inside the video duration and check the mix for intelligibility. A limiter prevents overload, but is not mastering or a substitute for listening.

Read `docs/API.md` for exact composition fields. Run `preview-composition` to check source bounds and timeline duration, then `compose` with a stable edit key. Local editing does not regenerate sources. Do not add creative metadata to strict generation or composition schemas; keep it in the production note. All manifests and notes are written by the agent, never imported manually by the user.

## Review the film, not just successful jobs

Check the opening alone, then the whole cut:

- Can a new viewer notice the intended question, conflict or benefit early?
- Does the main action remain understandable without a paragraph explaining it? Are necessary dialogue captions still readable?
- Does each shot add information, emotion or a justified pause? Does its length follow the actual performance rather than the model's minimum duration?
- Are important actions and reactions visible, with continuity across cuts and no accidental change of identity or props?
- Are captions, branded UI and platform overlays leaving faces and key actions legible? Avoid assuming one fixed safe zone works everywhere.
- Do cuts, dialogue and sound agree? Are there duplicated voices, abrupt music changes, clipped words or unintended silence?
- Does the payoff answer the hook and connect naturally to the requested ending or CTA?

Try re-cutting existing material before regenerating. Correct only affected shots within existing authorization and budget. A failed edit is not grounds to repeat paid generation. Keep the source assets, selected edit and brief review notes so another chat can revise the same production. Do not assign fabricated engagement scores or claim that a hook is proven without audience data. When later testing is requested, change a clear variable such as the opening while reusing the body where appropriate.
