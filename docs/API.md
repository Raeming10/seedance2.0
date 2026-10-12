# Studio HTTP API

Base: `http://127.0.0.1:8000`. Shared servers require `Authorization: Bearer <STUDIO_API_TOKEN>`. Provider credentials are never sent to clients. JSON keys are camelCase; adapters translate them to provider-specific fields. Unknown fields are rejected.

## Discovery and preview

- `GET /api/health`: configured providers, FFmpeg availability. These booleans report configuration, not provider authentication or network success.
- `GET /api/models`: model IDs, modes, ratios, resolutions, duration and reference limits.
- `GET /api/guides/{flare|seedance|minimax|veo}`: guide Markdown and source links.
- `GET /api/guides/directing`: visual storytelling, hooks, motivated coverage and review guidance. Read before planning shots; model guides translate those choices into provider-specific prompts.
- `GET /api/guides/prelulu`: portable default brand, audience, formats and claim boundaries.
- `GET /api/guides/video-prompting`: script-to-source compilation, reference intent and prompt auditing.
- `GET /api/example`: the example social workflow.
- `POST /api/preview`: validate a generation request and estimate cost; no provider call.
- `POST /api/workflows/preview`: validate every step and dependency before generating anything.

## Generation request

```json
{
  "model": "seedance",
  "mode": "reference",
  "prompt": "@Image1 defines the cup. Steam rises; the camera moves slowly forward.",
  "aspectRatio": "9:16",
  "resolution": "720p",
  "duration": 5,
  "images": ["/assets/UPLOADED-ID.png"],
  "videos": [],
  "audios": [],
  "audio": true
}
```

Optional `mode` is inferred from inputs. Frame modes use `firstFrame` and optional `lastFrame` instead of reference arrays. Flare defaults to medium, one image and `2k`, and does not accept duration. Flare's `edit` mode uses `images`. Video defaults are 5 seconds except Veo (8 seconds, native `1080p`). Veo accepts only `1080p` and `720p`; it does not convert a 2K request to 4K. Explicit incompatible parameters fail before submission; the API does not silently change them.

For images, `aspectRatio` can be a custom ratio between 1:3 and 3:1. Other models accept only their advertised ratios. MiniMax frame mode inherits the input picture's aspect ratio; use matching reference images or reference mode. The adapter does not silently crop uploaded frames.

Media strings accept Studio `/assets/...` or `/outputs/...` URLs, HTTPS URLs, or base64 data URIs. For Google remote reference images, only trusted fal CDN URLs can be fetched; upload other images through `/api/assets` first. This prevents the server fetching arbitrary internal URLs. Upstream providers check media content, duration and regional eligibility.

## Upload

`POST /api/assets?filename=hero.png` with the raw binary file body returns `{url, bytes}`. Max 512 MB per upload, supported extensions PNG/JPG/JPEG/WebP/MP4/MOV/MP3/WAV. Per-model input limits are smaller (Google images: 20 MB). The server uploads local references to fal storage as needed; there is no public tunnel.

## Submit and query

- `POST /api/jobs` with a generation request and an `Idempotency-Key` header.
- `GET /api/jobs/{id}`: full status, normalized request, provider receipt and outputs.
- `GET /api/jobs`: recent 100 jobs (compact).
- `POST /api/jobs/{id}/resume`: resume a paused poll/download without re-generating.

Every billable submission is saved before calling the provider. Repeating the same key and normalized request returns the original job. Reusing a key with changed input fails. Keys are limited to 1–160 characters: letters, digits, `.`, `_`, `:`, `-`.

Statuses: pending → preparing → submitting → queued/running → downloading → completed. `failed` is a known rejection. `unknown` means a submission acknowledgement was lost and requires checking provider history. The server never automatically retries an ambiguous paid submission. `paused` follows repeated polling/download failures and can be resumed safely. Restarting during a submission also yields `unknown`.

HTTP errors return `{error}`. API validation errors are 400, token errors 401, origin/host errors 403, missing credentials 503. Accepted submissions return 202. Outputs are local downloadable URLs with HTTP Range support.

## Workflows and revisions

`POST /api/workflows` accepts the structure in `examples/social-video.json`, plus an `Idempotency-Key`. Steps are sequential, at most 30. Media references like `@step:hero` select the first output of an earlier step. Forward references, cycles, duplicate IDs and wrong media types are rejected. All steps are validated and required provider credentials checked before execution.

`GET /api/workflows/{id}` returns progress and child job IDs. `GET /api/workflows` lists recent workflows. A failure stops later generation steps. Submitted jobs and downloaded outputs survive server restarts.

### Timed production plan

Full-film creation through the plugin includes a workflow-level `production` object; older clients and standalone assets can omit it. It never becomes part of a provider payload. See `examples/prelulu-mafia-20s.json` for a complete preview-only example and `docs/examples/prelulu-mafia-20s.md` for its script, prompt choices, staged execution and cost.

- `brand`: nonempty name. `targetDuration`: seconds, greater than 0 and at most 600.
- `story`: nonempty `setup`, `conflict`, `turn`, `payoff`. For a non-narrative format these describe its progression (e.g. problem, obstacle, demonstrated change, result), without inventing dramatic conflict.
- `beats`: ordered `{id,start,end,action,change,dialogue?}`. Each dialogue entry is `{speaker,text}`. Unique IDs follow step-ID syntax. Beats must cover the target continuously from zero, with positive lengths.
- `coverage`: ordered `{step,beatIds,start,end,framing,viewpoint,referenceIntent}`. `start/end` select **source** seconds; the array order establishes final-film positions. `beatIds` must name exactly the beats overlapping that edit position. `step` names a video generation step. A source can contribute multiple selected ranges. `referenceIntent` is `none`, `identity`, `composition`, `transition` or `motion`.

Preview and submission reject gaps/overlaps, missing beats, unknown/image sources, out-of-range trims, empty selections and duration mismatch (0.05s rounding tolerance). Coverage durations round to 24fps. If automatic `compose` is supplied, its ranges must agree with coverage. Prefer separate post-inspection composition; provisional timing is not a promise about rendered action.

`productionReview` in workflow preview reports the planned timeline, video calls, generated seconds and warnings about mismatched reference intent, repeated framing/viewpoint, unused paid sources and rough dialogue pacing. Warnings need creative judgment: repeated framing or a silent pause can be intentional. They are not an engagement score, automated directing or proof of a good prompt. No provider call is made by preview. Creative notes remain beside the manifest; unknown fields in requests/compositions are still rejected.

`compose` in a workflow names video step IDs, or objects `{step, start, end, volume}` for selected ranges. To edit existing shots without generating them again, use `POST /api/compose`:

```json
{
  "name": "Revised film",
  "clips": [
    { "url": "/outputs/SHOT-A.mp4", "start": 0.5, "end": 2.5, "volume": 0 },
    { "url": "/outputs/SHOT-B.mp4", "start": 1, "end": 4, "volume": 0 }
  ],
  "audioTracks": [
    {
      "url": "/assets/AMBIENCE.wav",
      "start": 0,
      "end": 5,
      "at": 0,
      "volume": 0.3,
      "fadeIn": 0.1,
      "fadeOut": 0.3
    },
    { "url": "/outputs/SHOT-B.mp4", "start": 0.5, "end": 3.5, "at": 1.5, "volume": 1 }
  ],
  "aspectRatio": "9:16",
  "resolution": "1080p"
}
```

It also requires `Idempotency-Key`, returns 202 and a workflow ID, and is queried through `/api/workflows/{id}`. FFmpeg runs asynchronously; no generation provider is called. The result contains one video stream and one stereo audio stream.

### Timeline rules

- Clip strings such as `"/outputs/SHOT-A.mp4"` remain valid and use the whole clip. Object clips select `[start, end)` in source seconds. `start` defaults to 0, omitted `end` uses the source end, and `volume` defaults to 1 (0 mutes; range 0–4). MP4s uploaded through `/api/assets` are also accepted. Reorder or repeat sources freely; at most 30 clip entries.
- Cuts use 24fps; selected durations round to the nearest frame. Ranges smaller than half a frame, reversed ranges and ranges beyond the source are rejected. Bounds allow 0.05 seconds for container rounding. Output resolution normalizes size; it cannot recover source detail.
- Up to 16 `audioTracks` accept local MP3/WAV or the audio stream from a local MP4/MOV. `start`/`end` select source seconds; `at` positions the sound on the assembled timeline. `fadeIn`/`fadeOut` are seconds within the selected track and default to 0. Fades must fit; the complete track must fit inside the assembled video (trim explicitly rather than silently dropping sound). Sources are limited to 600 seconds each.
- Clip audio and independent tracks are mixed at their specified volumes with overload limiting. Mute duplicated clip audio before adding it as a separate track. The example places shot B's sound 0.5 seconds before its picture: a J-cut. An L-cut uses sound continuing into a later picture. No automatic ducking, music generation, caption rendering or visual transition effects are added.
- Workflow `compose.audioTracks` uses the same fields. Its `url` may be `@step:ID` for a generated video with audio enabled, or an existing local media URL. Example: `"compose": {"steps": [{"step":"opening","start":0.5,"end":2.5}, "ending"], "audioTracks": []}`. Known ranges beyond a requested generation duration fail before paid submission; actual file bounds are checked after download.
- Source generation is billed for the full generated duration even when the final cut uses only part of it. Creative notes such as shot purpose, hook candidates and intended emotion belong in a separate production note, not in strict API requests.

### Preview and inspect before editing

`POST /api/compose/preview` accepts the same composition, needs no idempotency key, and reads the actual source metadata without rendering or submitting provider jobs. It returns the normalized `composition`, a `timeline` with source bounds, shot positions, selected durations and audio tracks, plus `generationCostUsd: 0`. The CLI equivalent is `node cli.js preview-composition cut.json`; MCP uses `preview_composition`.

`POST /api/inspect` accepts `{"url":"/outputs/SHOT-A.mp4","times":[0,0.5,1,2]}`. Times are optional: defaults sample the opening and the remainder, up to 12 frames. Explicit times allow 1–24 positions within the source duration. The result reports video metadata and `{time,url}` JPEG frames under `/outputs/`. It requires FFmpeg and performs no paid generation. CLI: `node cli.js inspect /outputs/SHOT-A.mp4 --times 0,0.5,1,2`; MCP: `inspect_video`.

Open the returned frames to review composition and continuity, and use playback/listening for motion and sound. Extraction is not a visual judgment or an engagement score. Sources remain untouched; preview frames are additional local files. For a local plugin, frame basenames are in its reported `outputsDir`; shared servers use the authenticated media URLs.

This server is a single-process local/trusted-team service. It has no per-user authorization or budget enforcement. Provider files are copied locally so expiring CDN links are not the only copy of a result.
