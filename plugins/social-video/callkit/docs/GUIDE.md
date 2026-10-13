# Prelulu shared social-video kit

Default creative route: story text → cinematic shots → selected footage → existing components. **Do not consider video calling unless the user explicitly requests it.** Reusing a caption/title/header does not require a call premise. Preserve all supplied dialogue and story; if the requested length is clearly longer, independently compile the complete shorter story and explain its natural duration without a length-only confirmation. Expansion still requires explicit authorization.

## Story format (default for supplied scenes)

`format: story` reuses `Captions`, `PovTitle` and `TemplateHeader` from the existing templates, not similar-looking substitutes. It shows the character-name/app-icon/AI header, without a call timer or call buttons. No Prelulu wordmark watermark. The POV title appears first; the header replaces it afterwards to avoid overlap. Omit `povText` when it is not needed. Never invent a choice UI just to end a story.

Unlike call formats, story preserves explicit source ranges, silent action and original pacing. It does not cut pauses, zoom alternating portraits or discard sound after a line. `words` are measured source seconds from listening/transcription; the renderer does not recognize dialogue. A trim through a supplied word is rejected. Multiple clips with different speakers are supported.

```json
{
  "format": "story",
  "hero": { "name": "Vicenzo Santoro" },
  "povText": "POV: you entered without knocking",
  "povSeconds": 2,
  "clips": [
    {
      "video": "scene.mp4",
      "start": 0,
      "end": 7,
      "words": [{ "text": "Sir,", "start": 2.1, "end": 2.4 }]
    }
  ],
  "endCard": true,
  "out": "story.mp4"
}
```

The sample word is illustrative, not a transcript to paste over arbitrary footage. Supply all words actually spoken in the chosen range. A silent clip uses `words: []` and no `text`. Text accompanied by no timing is rejected for story captions.

The library ending should read `Continue this chat on` with `Prelulu` beneath, no store badges. A custom `endCard` absolute/relative video path overrides it; `false` explicitly disables it. Add the end card's actual duration to the story duration when communicating the total. Do not count its seconds as story development.

`callkit example story --dir /absolute/folder` makes a small local test configuration from a bundled demonstration. It is a layout fixture, not a production script. `stills` validates layout; `render` produces the MP4 without a generation API. Keep the config for revisions.

## Explicit video-call presentations

Use the following six only when video calling was explicitly requested. A genre/trope, Prelulu brand, POV title, or a character facing the viewer is insufficient. Preserve dialogue rather than replacing it with the example lines below.

## The six formats — only for explicit video-call requests

| Format        | How it plays                                                                                                                              | Length with two 8 s clips | What it is good for                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `call-first`  | The call opens on his face and first line; at the end it shrinks back into his card and a ring of other characters spins on → end card    | ≈ 15 s                    | Character intros, the strongest face-first hook                             |
| `cards-first` | A 3D ring of characters spins and lands on his card, which becomes the call → end card                                                    | ≈ 15 s                    | Roster or series posts ("Pick who calls you tonight"), choice as the hook   |
| `incoming`    | His video call rings on her phone (blurred preview of him, pulsing accept); a fingertip answers, the blur lifts into the call → end card  | ≈ 14 s                    | Character drops, anticipation: someone is calling _you_                     |
| `chat`        | A late-night chat in the app (her message, his "typing…", two replies); his call banner drops in; the call opens out of the accept button | ≈ 16 s                    | A relatable moment escalating to face to face; shows text and call together |
| `pov`         | Native POV text box over his face with no interface; after the hook the call interface slides in → end card                               | ≈ 11 s                    | Trend, trope and POV posts that read as feed-native                         |
| `mockup`      | The call plays inside a phone on the brand night sky, headline above, stickers popping beside it, wordmark below → end card               | ≈ 11 s                    | "What is this app" explainers, feature posts                                |

The ring formats need no portrait for him: his card is a frozen frame of the call. The other cards default to the ten bundled Prelulu characters (`assets/roster.json`); pass `roster` to feature others.

Choose by the post's purpose, and vary the opening across a series so the feed does not repeat itself. Variants of one call share the same source clips: changing the format, copy or roster never needs another paid generation.

## Workflow

1. **Source clips.** Choose source count after rehearsing the story and allowing for the selected format’s intro/end card. Clips show one character speaking straight to camera as the live feed of a video call: 9:16, 1080×1920, connected playable beats, no music, no captions, no on-screen text. Existing clips are fine. To generate them, use the create-video workflow with default H3 reference mode or explicitly selected Veo 3.1 with the pattern under "Generating source clips". Watch for Veo talking past the line or humming; the kit drops sound after the line when it is about as loud as the line.
2. **Check the speech.** `callkit analyse /abs/clip.mp4 --text "the exact line"` prints the speech stretches, word timings placed on them and any sound it will ignore. If the line was not spoken as written, put what was actually said in `text` (and use `drop` for a stutter) — never caption words he did not say.
3. **Write the config** in the user's working folder (see below). Inspect a frame of each clip first: set `face` to the centre of his face and `pipSide` to the top corner his head does not cross.
4. **Stills.** `callkit stills /abs/config.json --at 0,1.5,3,6` and open the PNGs. Check the first frame (thumbnail and hook), the opening's text against his face, captions, her window, and the stickers or banner.
5. **Render.** `callkit render /abs/config.json`. The JSON report gives length, loudness, caption pages with times on the video's timeline, which sound was ignored, and any frames redrawn after a browser glitch.
6. **Review** with the Studio `inspect` command on the output (or FFmpeg frames): the first three seconds, the opening → call transition, caption sync on the first and last words, the last look before the end card. Listen when possible; say so plainly if only frames were checked.

## Config

Paths are relative to the config file. Only `format`, `hero.name`, `clips` and `out` are required (and `hero.age` for formats that show it).

```json
{
  "format": "chat",
  "hero": { "name": "Marcus", "age": 38, "portrait": "marcus.jpg" },
  "clips": [
    {
      "video": "clips/marcus_A.mp4",
      "text": "You're still up? Good. I didn't want to sleep without seeing your face."
    },
    {
      "video": "clips/marcus_B.mp4",
      "text": "Come closer to the camera. Let me look at you for a minute."
    }
  ],
  "face": { "x": 554, "y": 706 },
  "pipSide": "right",
  "messages": [
    { "from": "her", "text": "long day. can't sleep 😮‍💨", "at": 0 },
    { "from": "him", "text": "Then don't. Stay up with me a little.", "at": 1.25 },
    { "from": "him", "text": "Can I see you?", "at": 2.45 }
  ],
  "out": "out/marcus_chat.mp4"
}
```

| Field                    | Meaning                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`                 | `story`, or one of the six explicit-call formats above.                                                                                                                                |
| `hero`                   | `name`, `age` (on his card in the ring formats and in the chat profile). `portrait` for the chat avatar, or `rosterId` of a bundled character; otherwise his first call frame is used. |
| `clips[]`                | `video`, `text` (what he actually says). Optional: `words` `[{text,start,end}]` measured elsewhere (replaces the estimate), `drop` (indexes of stuttered words to cut out), `face`.    |
| `face`                   | `{x,y}` in 1080×1920 pixels: the centre of the punch-in zoom. Default `{540,760}`.                                                                                                     |
| `pipSide` / `pip`        | `right` (default) or `left` for her camera window; `pip: false` removes it.                                                                                                            |
| `headline`, `subline`    | Ring text, the incoming-call line, the mockup headline and pill.                                                                                                                       |
| `messages[]`, `ringAt`   | Chat: `{from: "her" or "him", text, at}` in seconds from the start; his "typing…" shows 0.75 s before each of his messages; `ringAt` is when his call banner drops in.                 |
| `povText`, `povSeconds`  | POV: the text box, and when the call interface replaces it.                                                                                                                            |
| `chips[]`                | Mockup: up to three `{text, at}` stickers.                                                                                                                                             |
| `intro`                  | Seconds before the call opens in `incoming` and `chat` (defaults 2.7 and 4.3).                                                                                                         |
| `roster`, `cardsSeconds` | Ring formats: bundled ids (`marcus dante andre rafael kai james alexander henry nathan sebastian`) or `{name, age, portrait}`; ring length (default 3.6 s).                            |
| `endCard`                | `true` (the social library ending without store badges, default), `false`, or a path to another 1080×1920 end card.                                                                    |
| `music`                  | `false` by default in every format: keep native generated audio and add no music bed. `true` or a path is only for a later explicit request for extra music.                           |
| `timing`                 | Optional: `lead`, `tail` (his look before the first word / after the last), `maxGap` (pauses longer than this are trimmed; default 1.05 s), `pauseOut`, `pauseIn`.                     |

`callkit formats` prints each format's default copy; `callkit example <format> --dir /abs/folder` writes a complete config and copies the bundled demo clips beside it.

## Copy, claims and placement

- Write for the brief's audience and platform, within the bundled Prelulu brief's claim limits: real-time voice/video calls and conversation are supported; do not promise memory, availability, free access or prices; never invent comments, reviews, testimonials or statistics. The default copy stays inside those limits and is a starting point, not house style — adapt only unsupplied marketing copy for the post; never rewrite supplied dialogue without authorization.
- Keep the "AI" badge (call header, banner, chat header). Never remove or disguise that he is an AI character.
- Chat lines and POV text should set up his first spoken line, not repeat it.
- Keep text off his face: POV text sits at the top; the ringing and chat screens show him blurred or as an avatar. Check stills when his head sits unusually high or low and adjust `face` or `pipSide`.
- Social renders default to the user-supplied Continue-this-chat ending described below. Use `endCard: false` or a supplied finished end-card path as requested.
- Her camera window is a bundled clip of a young woman. When the audience is older, or the post is not about her side of the call, consider `pip: false` or ask the user for another clip.

## Generating explicitly requested video-call clips

The look depends on footage that reads as a real video call. The working pattern from earlier Prelulu call videos (Veo 3.1, image-to-video from a portrait):

- **Portrait** (Flare or an existing character image): ultra-photorealistic vertical 9:16, taken late at night by a phone propped at his eye level an arm's length away; head and shoulders, top of the head about one fifth down, face centred, shoulders filling the lower half; hands out of frame; looking into the lens; a specific setting and practical light; tack-sharp eyes, natural skin; no phone frame, interface, text or logo.
- **Video prompt**: "The live camera feed of a late-night video call, vertical, from a phone propped up and completely still in front of him. [one-sentence look]. [setting]. He holds intimate eye contact with the camera the whole time and speaks directly to the viewer, slowly and quietly, close to the microphone, in a [voice]. He says: "[line]" Acting: [controlled performance]; eyes stay open and on the camera; hands stay out of frame. No camera movement, no cuts, no zoom. Audio: only his voice and [ambience]. He speaks in a natural speaking voice; he never sings or hums. No music. No subtitles and no on-screen text."
- **Negative**: blurry, background music, subtitles, captions, on-screen text, watermark, cartoon, teenager, big grin, laughing, distorted face, camera shake, phone frame, singing, humming, music.
- Derive clips from the rehearsed exchange, not one clip per line or a fixed two-clip recipe. Several short lines can belong to one continuous performance when feasible. Preserve the same portrait, voice and ambience so the cut sounds like one call. Model duration is source capacity; trim unused handles and include the kit intro/end card in the delivery length. Lines should react to a specific moment (late night, her day, an event) and carry the character's own agenda rather than generic reassurance.

## Limits and troubleshooting

- Word timing is estimated from the audio against the known line (energy and pitch periodicity, then an alignment that prefers breaks at punctuation). On earlier Prelulu call clips it lands within about 0.07 s median and 0.2 s at the 90th percentile of a forced aligner. If captions drift, pass measured `words` from any transcription or alignment tool the user has.
- There is no face tracking: cuts sit inside pauses, not on matched poses, and the punch-in centres on `face`. Inspect and set it.
- Output is 1080×1920 at 30 fps. 24 fps sources are fine.
- A frame with missing raster tiles (a Chrome glitch) is detected and redrawn automatically; the report lists them.
- Remotion is free for individuals and companies of up to three people; larger companies need a Remotion company license (remotion.dev/license).

### Library ending provenance

`assets/endcard-continue.mp4` is a byte-for-byte copy of the user-supplied `endcard_continue_chat_original.mp4`: 1080×1920, approximately 3.118 seconds, with its original animation and audio. This is the default social CTA. Never substitute the former static-frame reconstruction. Set `endCard` to another supplied finished MP4, or `false` to omit. Probe the actual asset and include its duration in the export estimate.

All formats default to `music: false`. Preserve generated dialogue, ambient sound, effects and generated score; do not overlay the bundled music bed. Story mode also bypasses the call-specific voice EQ/compressor. Keep the supplied CTA's own audio as-is. Extra music requires a later explicit request. Video-only sources become silence. Supply measured source-time `words` for captions; do not infer timings from written dialogue.
