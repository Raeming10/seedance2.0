# Fidelity, reference roles and existing components

Preserve supplied dialogue verbatim, including speakers and order. First time the original events and selected library ending. If the requested duration is clearly longer than the complete source needs, compile prompts for the naturally paced complete story and tell the user the estimate without a length-only confirmation; never add dialogue to fill slots. Fast pacing means compressing screen time through efficient shot construction and editing while telling the entire supplied story clearly: overlap dialogue with relevant action, remove redundant coverage and retain causal links, key reactions and every supplied line. It does not mean arbitrary rapid cuts or omitting story information. Story-to-video requests do not imply rewrite permission. A call premise or propped-phone camera requires an explicit video-call brief.

Default to H3 reference mode; Veo 3.1 is the alternative. Use separate subject identities and an optional people-free environment. Multi-person staged frames are not a default reference requirement. In reference mode, specify new composition and motivated actor/camera movement without treating portraits as mandatory opening frames. Read `guide minimax` and the entire official Ref2VA/base sources. Keep all six Ref2VA text sections inside `prompt`, with stable labels mapped to actual fal assets. Defective references need repair or omission, not a negative sentence hoping to cancel their pixels.

In post use the existing kit `story` format: actual Captions, PovTitle and TemplateHeader. No custom subtitle boxes, watermark or invented choice component. Count the configured library end card separately.

# Video prompting: compile a shot, not the whole screenplay

Project-authored workflow, reviewed 2026-10-12. Read after the timed script and coverage decisions, together with the selected model guide. Model documentation defines supported inputs; the instructions here translate creative intent into those inputs. A prompt is a direction to render one source clip, not a synopsis of why an audience should like it.

## Inputs before writing a prompt

Have a completed timed script, the beat(s) this source serves, its intended retained range, reference roles and entering/exiting continuity. Do not start with “20 seconds / 8 seconds = three prompts” and then invent filler for those slots. Choose the model mode before composing prose:

| Need                                              | Studio inputs                               | Meaning                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Preserve identity, let the model stage the scene  | `mode: reference`, `images`                 | Subject assets. These are not an exact camera setup or a shot sequence.                                                       |
| A precise opening POV, scale, hand/prop placement | `mode: image`, `firstFrame`                 | Build and inspect a shot-specific keyframe first. A portrait identity image is not automatically the correct opening.         |
| A particular start and end composition            | `mode: frames`, `firstFrame`, `lastFrame`   | Physically plausible interpolation between two endpoints. Not arbitrary multi-shot storyboards.                               |
| Motion or audio reference                         | `videos` / `audios` with a supporting model | Bind the intended role explicitly; do not infer voice from a still portrait. Veo in this plugin does not expose these inputs. |

`@step:hero` is a Studio asset dependency, used in manifest fields. It is not a provider prompt token. fal MiniMax H3 binds real inputs as `Image 1`; Google asset references use natural-language subject descriptions without invented `@Image1` binding. Read the complete official H3 reference guide as well as its base conventions; a short guide summary alone is insufficient. References help but do not guarantee identity, voice, performance or endpoint fidelity.

## Compile one source clip

Write concise, chronological English for the default North American production. Include only relevant details, in this order:

1. **Reference binding / invariants:** which subject or object is preserved, and which aspect of an image is allowed to change. For first-frame input, start from its existing scene; avoid redescribing it in a contradictory way.
2. **Shot:** scale, viewpoint/eyeline, subject positions and one motivated camera behavior. “Cinematic, dramatic, dynamic” is not a shot instruction. A slow push cannot substitute for a new event.
3. **Visible action and performance:** a feasible physical sequence with an initial state, change and end state. Show an intention through a hand stopping, a glance redirected or a decision enacted, rather than “he shows vulnerability.” Do not add stock gestures to every scene.
4. **Sound:** identify each speaker, quote the exact spoken words, describe restrained delivery, place offscreen voices explicitly, then specify physical sounds and ambience separately. An image provides no voice identity; maintain the same voice description but still inspect consistency.
5. **Timing and constraints:** source-local time ranges fitting the API duration; keep dialogue inside the intended retained window with practical handles. Define only important exclusions (e.g. no reverse shot exposing the first-person viewer). Planned times are directions, not guaranteed output timings.

Keep story analysis, emotional marketing goals, final-film timestamps, job IDs, budgets, CTA instructions for the editor and whole model manuals out of provider prompts. Different source clips each start at zero. For a multi-shot source, specify only supported, manageable internal cuts; independent controlled angles generally need individual keyframes/sources.

## Original conversion example

Script: “He realizes she is serious and chooses her freedom over the alliance.” That belongs in the screenplay's change/turn field.

Veo image-to-video prompt for one insert: “Animate the supplied opening frame. Tight first-person insert of the ring on the walnut table; the man's right hand starts on the far side. Fixed camera. Between 0.5 and 2.5 seconds he slides the ring toward the viewer with one finger, then withdraws his hand, leaving the ring within reach. His hand never closes over the viewer's. A single soft metal scrape on wood; low room tone, no speech or music. Keep the table, sleeve and ring consistent. Preserve this viewpoint throughout. After 3 seconds, keep the completed state for a clean cut.” Source: 8 seconds; planned retention: 0.5–3.5 seconds. The remaining time is paid head/tail, not extra story.

The face close-up that establishes _why_ he does this is a different shot. Do not include that shot's dialogue, the opening hook or the end card in this insert prompt.

## Check the compiled packet before paying

- Can every action actually be visible from this camera? A hands-only insert cannot carry visible facial acting; an offscreen speaker must not acquire the lead's lip movements.
- Do assets and mode support the stated requirement? For strict first-person composition, inspect a matching keyframe; a face reference plus “POV” alone is weaker control.
- Are references ordered and named correctly for this provider? Preserve H3's official six-section structure and stable subject labels inside the prompt string, explicitly mapped to actual Image/Video/Audio array order; these are not extra API JSON fields.
- Are speech and motion plausible in the retained window? Shorten or split before generating. Read the dialogue at the intended pace; use overlap only when the actions genuinely can occur while someone speaks.
- Does this prompt produce the assigned beat instead of repeating an adjacent shot? Check prop state, screen direction and the ending that the next shot needs.
- Can the edit discard handles without losing a key word or event? Keep captions and UI as editing instructions.

Save a compact prompt audit alongside the production note: source step, guide/date, mode, reference roles, local timing, invariants and what will be checked in the result. Do not call the audit a quality score. After generation, compare the actual shot against these requirements. A wrong viewpoint is a failed requirement, not automatically an acceptable artistic variation.

## Preserve the shot contract during recovery

A reference-dependent shot stays reference-dependent when it fails. Before replacement, compare identity, wardrobe, prop state, geography/light, viewpoint, speaker and the action the story requires. Do not automatically remove the image and switch to text-to-video to finish a workflow. Respect provider restrictions; redesign an original fictional subject and affected continuity coherently or report the unavailable shot. Text-only generation remains valid when planned for independent material that does not require established continuity.

For an offscreen line with a visible listener, speaker attribution can fail even in a valid prompt. Prefer staging that can be checked and edited without sacrificing the character performance. Do not turn the entire film into anonymous hand inserts just to hide failed lip attribution. A changed viewpoint must still tell the intended story.

Preserve the generated footage’s native soundtrack (dialogue, ambience, effects and any generated score). Do not add the kit’s bundled background music or a replacement music bed. Set `music: false` for all formats unless the user explicitly requests additional music later. Append the supplied library CTA as-is, including its own audio.
