# Studio HTTP API

Base: `http://127.0.0.1:8000`. Shared servers require `Authorization: Bearer <STUDIO_API_TOKEN>`. Provider credentials are never sent to clients. JSON keys are camelCase; adapters translate them to provider-specific fields. Unknown fields are rejected.

## Discovery and preview

- `GET /api/health`: configured providers, FFmpeg availability. These booleans report configuration, not provider authentication or network success.
- `GET /api/models`: model IDs, modes, ratios, resolutions, duration and reference limits.
- `GET /api/guides/{flare|seedance|minimax|veo}`: guide Markdown and source links.
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

Optional `mode` is inferred from inputs. Frame modes use `firstFrame` and optional `lastFrame` instead of reference arrays. Flare defaults to medium, one image and `2k`, and does not accept duration. Flare's `edit` mode uses `images`. Video defaults are 5 seconds except Veo (8 seconds). Explicit incompatible parameters fail before submission; the API does not silently change them.

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

`compose` in a workflow names the video step IDs to concatenate. To reassemble existing shots without generating them again, use `POST /api/compose`:

```json
{
  "name": "Revised film",
  "clips": ["/outputs/SHOT-A.mp4", "/outputs/SHOT-B.mp4"],
  "aspectRatio": "9:16",
  "resolution": "1080p"
}
```

It also requires `Idempotency-Key`, returns 202 and a workflow ID, and is queried through `/api/workflows/{id}`. FFmpeg runs asynchronously; no generation provider is called. The result contains one video stream and one stereo audio stream.

This server is a single-process local/trusted-team service. It has no per-user authorization or budget enforcement. Provider files are copied locally so expiring CDN links are not the only copy of a result.
