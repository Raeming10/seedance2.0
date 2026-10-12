# Original worked example: “Your Move”

Brief: a roughly 20-second mafia microdrama, North American adults, Prelulu social account, Google Veo 3.1. This is an original planning example, not a generated, approved or performance-tested advertisement. It illustrates the pipeline, not a plot to reuse for every request.

## Script before sources

Central contradiction: the person expected to enforce a marriage gives the viewer a genuine choice. The ring makes the refusal visible; family pressure gives his decision a cost; the opened doorway proves the choice is real. No opening paragraph explains this. The intimacy comes from a consequential response, not a sequence of reassurance lines.

| Film time | Picture / progression                                                                   | Sound                                                                      |
| --------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0–2s      | First-person insert: the ring lands on the desk. A commitment is being rejected.        | Viewer: “I'm not marrying you.” Metal tap.                                 |
| 2–7s      | Medium: his gaze moves from the ring to the door and back; the response is uncertain.   | Unseen aide: “The families are waiting.” Room tone; a purposeful reaction. |
| 7–10s     | Insert: he slides the ring back and withdraws his hand. He gives the choice back.       | Soft scrape, no dialogue.                                                  |
| 10–16s    | Close-up: he calmly rejects the pressure and reframes the relationship.                 | Lead: “Then let them wait. I asked for a wife, not a hostage.”             |
| 16–20s    | Medium-wide: he opens the door and steps aside. An actual exit, not a rhetorical offer. | Lead: “Your move.” Latch click.                                            |

At approximately 18.2–20 seconds, an editor can add “Choose your next chapter.” and “Prelulu” in available lower-left space, keeping the face and exit visible. This is a postproduction instruction; the runtime compositor does not draw this text. Confirm the actual scene has that space before placement. Dialogue captions, if used, follow actual recorded speech and do not replace visible action.

The 12-word turning line has six seconds; rehearse it with its pause, then verify the rendered speech. The five-second pressure beat includes a gaze decision and the aide's line; if the model makes it an empty hold, trim it and rebalance the film around usable events. Do not certify “20 seconds of tension” just because the arithmetic passes. A final 18–21-second cut can be more appropriate to “roughly 20” than a padded exact 20.

The seated-to-door position change is an intentional temporal cut. Preserve office geography and screen direction so the ellipse reads clearly. If it looks like a continuity accident in the result, revise the edit or staging. The first-person viewer never appears in a reverse angle.

## Derive calls from coverage

The companion JSON contains one identity image, five Flare edits for shot-specific keyframes, and five 8-second, 1080p Veo image-to-video sources. Source retention is 2 + 5 + 3 + 6 + 4 = 20 seconds. Generated video is 40 seconds, approximately $16 at the configured estimate, **plus six unpriced image steps**. No generation has been executed by this example or its tests.

Five calls are a consequence of the chosen controlled angles, not a minimum for all 20-second films. If the budget is closer to three calls, rewrite staging so the ring return happens visibly inside the medium shot and the lead rises/opens the nearby door in a coherent final take. Review whether those combined actions are feasible; do not preserve five imaginary angles in a three-call estimate or merely stretch the dialogue. The user's chosen Veo model remains the same.

Preview the full example with `node cli.js preview-workflow examples/prelulu-mafia-20s.json`. For an authorized production, submit the image-only phase first, inspect keyframes, then construct the video-phase manifest with the actual image URLs and the same production plan. Use different stable phase keys. The JSON is an agent-written internal manifest, never something the intern must import.

## Prompt and result review

The JSON separates the screenplay (`production.story` / `beats`) from source prompts (`steps[].request.prompt`). Each video prompt contains one camera setup, observable action, specifically attributed speech, source-local timings and continuity requirements. Each reference is a shot opening, so requests use `firstFrame`; no claim is made that a portrait asset locks viewpoint or voice.

Inspect the ring count and direction, aide/lead speaker attribution, lip movement, first-person eyeline, timing of the turn and the cleared exit. A beautiful result with a wrong POV or missing action is not a successful rendering of this plan. Extract frames for composition checks; use playback/listening for movement and speech when available. Report which checks were possible. Preserve source IDs and recut before generating replacements.

This example can check workflow wiring and timing. Only actual renders and audience data can test performance fidelity and social response.
