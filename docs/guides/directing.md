# Source fidelity comes before directing

The user owns the plot and dialogue. Lock exact supplied lines and speaker/order. Design cinematic action, camera and sound to express those events, not to add new ones. If a requested runtime clearly exceeds the complete source’s natural duration, independently direct and compile the shorter coherent cut, report its estimated duration, and proceed within existing authorization without asking for a duration-only confirmation. Do not use a narrative formula as permission to invent conflict or a reply. No call premise or fixed phone camera unless the user explicitly requests video calling. Reuse existing subtitle, POV-title and character-header components; no Prelulu watermark or improvised UI. Count the selected library end card separately in the total.

# Directing social videos

This is the studio's creative guidance, not a provider specification or a promise of engagement. Read it when developing a story or revising a cut. Preserve the user's plot, point of view, tone, audience, product claims and chosen format. A deliberate long take, slow mood film or text-led concept can be appropriate; do not replace it with a compulsory fast-cut template.

## From brief to observable events

Fast pacing means compressing screen time through efficient shot construction and editing while telling the entire supplied story clearly: overlap dialogue with relevant action, remove redundant coverage and retain causal links, key reactions and every supplied line. It does not mean arbitrary rapid cuts or omitting story information.

Identify the intended audience response and the change the film should show: a decision, discovery, relationship shift, demonstration or payoff. Use what the user already supplied; ask only when a missing fact changes the creative direction. Make reasonable creative choices without requiring approval for each shot.

Translate prose into observable action, a revealing object, a reaction or a consequence. For example, reluctance might be a hand reaching and stopping; a decision might be an object deliberately returned. These are possible staging choices, not stock actions to add to every story. Preserve essential facts that cannot be communicated visually with concise dialogue or context.

Separate four kinds of text: internal scene directions, spoken dialogue/captions, essential context and product/CTA copy. Scene directions belong in the shot plan and model prompts, not automatically on screen. Keep readable dialogue captions when useful; do not ban text universally. Avoid opening paragraphs that explain feelings or spoil an upcoming reveal. Test whether the central action is legible with explanatory text hidden and sound muted; then restore captions and sound for accessibility and delivery.

## Finish a timed script before counting API calls

Load the bundled Prelulu brief for this installation unless the user specifies another brand. For a supplied narrative, find its existing desire, obstacle and observable turn; do not invent missing events. Preserve all supplied dialogue word for word, speaker for speaker, in order. Only an explicitly authorized original-writing or expansion task may add new events. “He cancels a meeting; he says it is for you; he comforts you” may be one emotional proposition repeated three times. For an authorized original-writing task, a decision with a consequence can strengthen the middle; do not add it to a supplied story.

Make a timed audiovisual beat sheet first: final-film start/end, visible action, information or relationship change, exact dialogue and sound. Then rehearse it. As a rough planning aid, ordinary English speech often lands near 2–3 words/second; charged pauses and physical action need additional room. This is a working estimate, not an API limit, acting prescription or universal pace. Do not add sequential time for an action that occurs during a line, and do not use sparse dialogue alone to justify a long static hold. Silent action can fully earn its time.

Read the resulting scene as a viewer: what question arises, what makes the outcome uncertain, which choice changes the situation, and what does the viewer receive at the end? If the events naturally make a 10-second film, compile the complete shorter cut and tell the user its natural duration; do not stretch it to 20. A product demonstration, call or atmospheric film should have its own meaningful progression rather than a forced conflict formula.

Derive coverage **after** that script. A two-second insert might require an eight-second source; two adjacent beats might share a source when the camera and action remain coherent. A requested length divided by a model's maximum duration does not determine the ideal call count. Plan generated seconds, retained seconds and image preparation separately. Budget may justify simpler staging, not empty screen time.

For full-film workflows put the timed script and ordered source coverage in the optional API `production` object (required by this creation workflow, optional for older clients and isolated asset tasks). `preview-workflow` checks temporal coverage and returns warnings; creative review still belongs to the agent. See `docs/API.md` and the source-preserving H3 example `examples/prelulu-source-dialogue.json`. The older `docs/examples/prelulu-mafia-20s.md` is an original-writing example, not permission to replace supplied dialogue. Keep longer creative reasoning in the adjacent note.

## Rehearse the shortest coherent version

Before assigning the requested runtime, play the complete scene at natural speed with dialogue and simultaneous actions overlapping. Write its shortest coherent duration in the production note, then identify exactly what information or emotional change would disappear if it were shortened further. If a supplied 20-second brief naturally plays in about ten, compile the faithful ten-second story and tell the user its estimated duration plus the selected end card; continue within existing generation authorization without waiting for a length-only decision. Do not add discoveries, resistance, decisions, dialogue or results without that authorization. Do not add arbitrary twists, dialogue quotas, more angles or slower hands to occupy seconds. Deliberate stillness can work when attention or understanding actually changes during it.

For each cut, name the question raised by the preceding shot and what the next shot lets the viewer learn or feel. If both carry the same information, combine them. Avoid separating every small gesture into a source; a continuous exchange can preserve performance and causality better. A pretty insert is not automatically useful coverage.

Read the exchange as speech, not copywriting. Who wants what from whom, why this line now, and what changes in the response? If supplied lines seem generic, explain that as optional editorial feedback; do not replace them without approval. With sound and captions, a viewer should understand the literal conflict without a production note; muted viewing should still expose the main action. A prop whose meaning is essential needs legible context, not an unreadable “contract” the director alone understands.

### Failure case to challenge, not imitate

“Your family bought a bride. Not me.” → tear a sheet → “Then the deal is off.” → “One dance. Your choice.” does not establish why refusing a purchased marriage becomes accepting a dance. Assigning seven seconds to the tear and six to the hand cannot supply that missing cause. A ring, page and open palm do not by themselves establish mafia stakes. Adding a handsome reaction or brand caption does not fix this. For original writing, revise until the relationship change is intelligible. For supplied source material, report the missing causal link and ask before changing it.

Apply the same test to a call: a ringing screen, two generic lines and a long end card can be equally empty. The actual call must advance the story. Templates package a performance; they do not create one.

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

Use separate identity references to preserve subjects. In H3 reference mode, write new shot blocking and camera positions; a change of angle does not require another first-frame image. Add an empty environment reference only if needed. Create shot-specific keyframes only when using intentional frame anchors. Reusing one first frame for every shot tends to repeat its composition. Generate only the coverage justified by the story and budget; reuse existing suitable media. Digital cropping cannot create a missing angle, perspective or performance.

After directing decisions, read the shared video-prompting guide and the selected models' guides and translate each shot into supported parameters and prompts. Request only the actions the model can plausibly execute in one source clip. Do not solve a complex scene by cramming many independent cuts and emotions into a short generation.

An eight-second generation can contribute two seconds to the final film. Budget for all generated seconds, not only the retained seconds. Leave useful action handles where appropriate, but avoid unnecessary paid coverage. Cost estimates may have unpriced items; do not promise a total that the tool cannot establish.

## Inspect, choose and assemble

Prefer generating source clips first, inspecting them and composing a separate cut. A workflow's automatic compose block is a provisional assembly, not proof that its planned in/out points match the performance actually generated.

Use `inspect` for timestamped preview frames, including the opening and important action/reaction moments. Open those images; the command itself does not perform visual evaluation. Watch available playback to assess movement and rhythm, and listen to audio when the environment supports it. Be explicit when only frames were inspected. Never describe unheard dialogue, music or timing as verified.

Write a composition with selected source ranges. Choose cut points at meaningful action, attention or emotional changes; remove empty lead-in and tails without clipping essential dialogue. Prefer clean cuts and motivated action/eyeline matches. Use flashy transitions only when the format warrants them. Preserve the intended point of view and continuity across boundaries.

For a sound bridge, mute or lower the duplicated clip's original audio and place that source's audio as an independent `audioTracks` entry. `at` is the sound's position in the assembled film; `start`/`end` select its source. This permits J-cuts (next sound arrives before its picture) and L-cuts (sound continues after its picture). Use available authorized audio; this tool does not create music or dialogue. Keep tracks inside the video duration and check the mix for intelligibility. A limiter prevents overload, but is not mastering or a substitute for listening.

Read `docs/API.md` for exact composition fields. Run `preview-composition` to check source bounds and timeline duration, then `compose` with a stable edit key. Local editing does not regenerate sources. Do not add creative metadata to strict generation or composition schemas; the workflow-level `production` field holds the timed plan, and the production note holds its rationale. Planned ranges are provisional: write a separate composition from the actual performance after inspection. All manifests and notes are written by the agent, never imported manually by the user.

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

## Replacement and delivery decisions

Judge replacements against the same identity, clothing, setting, prop state, speaker and causal function as the original plan. Do not change a referenced continuing scene to text-only mode merely because the provider rejected a source. Respect the rejection; a new fictional design requires a coherent continuity revision, not a disguised retry. A crop can improve composition, but cannot certify a changed costume, restored torn contract or omitted action. Missing required material remains a failed beat. Recut coherently, revise within authorization or deliver a clearly identified draft with the unresolved gap.

Finally, review the whole edit at speed with sound. Frames and ASR do not establish understandable acting, timing or voice continuity. If those checks are unavailable, say which remain unchecked and label the result a review draft. Do not call an exact-duration export a finished social video solely because it has captions and a logo.
