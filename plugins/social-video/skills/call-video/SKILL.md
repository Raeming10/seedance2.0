---
name: call-video
description: Reuse Prelulu's existing captions, POV title, character header and library ending for social-story footage; use the six video-call presentations only when a user explicitly requests a video call. Local rendering does not generate paid media.
---

# Prelulu shared video components

The kit is a reusable presentation layer, not the source of the story. A social video or a character talking toward the viewer does **not** imply a video call. Do not introduce a call premise unless the user explicitly requests it. Preserve original story/dialogue under [create-video](../create-video/SKILL.md).

Resolve `../../scripts/callkit.js` as KIT. Run `node KIT doctor`, `setup` if needed, then `guide`. Setup installs local rendering dependencies, no generation. Read `guide prelulu` through the Studio launcher for brand context.

## Story footage (the usual route)

Use `format: story` on selected footage. Reuse the exact existing `Captions`, `PovTitle` and `TemplateHeader` implementations: same typography, word highlighting, title shape, app icon, character name and AI badge. The story header omits the call timer/camera label. No Prelulu wordmark watermark, new caption boxes, invented buttons or bespoke choice cards. Changing narrative structure is not permission to redesign these components.

The story renderer takes explicit clip `start`/`end` ranges and preserves action and silence. It never applies call speech-pause trimming or alternating talking-head punch-ins. Supply verified source-time `words` for captions; leave words empty for a genuinely silent shot. It rejects trims through word boundaries. Caption style stays shared; dialogue content stays faithful to source. Do not caption a missing or altered spoken line as if the model performed it.

Use the configured library ending with `Continue this chat on` and `Prelulu` below, no store badges. Include the actual ending length when reporting total duration. If the required ending is unavailable, tell the user and request their finished replacement rather than recreating a new design. A custom `endCard` path can replace the default without changing the renderer. Preserve editable configs.

Run `stills FILE --at ...`, inspect faces, title, header and subtitles, then render authorized outputs with `render FILE`. No full-film generation is needed to test the plugin: use bundled fixtures. Report review limits, not just file dimensions.

## Explicit video-call requests only

Then choose among `call-first`, `cards-first`, `incoming`, `chat`, `pov`, `mockup`, as described by `guide`. Reuse the same components. Only this branch uses a phone-height fixed camera, call timer, camera-window insert or call controls. Generate sources with the user's chosen model, default H3 reference; Veo 3.1 is optional. Do not force Veo simply because an older demonstration used it.

Keep supplied words intact. Check speech through listening/transcription, then `analyse CLIP --text "actual words"` for timing. This aligns provided text; it is not speech recognition. Set `face` and `pipSide` based on inspected frames. Render local layout changes without regenerating footage. A failed original line must be reported/repaired within authorization, not silently rewritten. Never post without explicit user permission.

Preserve the generated footage’s native soundtrack (dialogue, ambience, effects and any generated score). Do not add the kit’s bundled background music or a replacement music bed. Set `music: false` for all formats unless the user explicitly requests additional music later. Append the supplied library CTA as-is, including its own audio.
