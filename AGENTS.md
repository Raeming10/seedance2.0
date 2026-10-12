# Seedance Studio — agent workflow

This repository is a production tool for social videos. When asked to make a video, use the running Studio API/CLI or MCP tools; do not automate the webpage.

## Start from a natural-language request

The user only needs to describe the story in a Codex chat attached to this local project. Handle the technical setup and job submission yourself. Do not ask the user to write, copy, upload or import workflow JSON, click the webpage, or configure MCP when the local CLI is available. Workflows are internal execution manifests that you create and submit. Explain the shot list in ordinary language when useful.

Before planning a paid run:

- Work from this repository's root. Check Node.js (22+). Run `npm ci` if dependencies are missing or the lockfile has changed since installation.
- Run `node cli.js health`. If the local Studio is not running, start `node server.js` in a persistent background process using the available shell/process tools, then recheck health. Keep it running for generation and downloads. Store any server log under ignored `.studio/`; do not start another server when one is already healthy. If `STUDIO_URL` points to a shared service, connect to that service instead of starting a local one; a remote connection/authentication failure needs the address/token corrected.
- Use the health response to check whether the needed provider key is configured and FFmpeg is available. These booleans do not validate the provider's account, balance or permissions. Never print `.env`, environment values or keys. If a required key is missing, explain which field the user should fill in their local `.env` using `.env.example`; preserve existing configuration. Keys are not included in GitHub sync. Restart the local service after configuration changes, once any active work has finished.
- FFmpeg (including ffprobe) is needed for composition and silent delivery, not for native Veo 1080p with audio. If it is missing, help set it up within the user's environment permissions before beginning a workflow that needs it.
- Create your manifests under ignored `.studio/plans/` (create the directory if needed). Use unique filenames and stable submission keys so another chat does not overwrite or duplicate an existing run. Keep the workflow ID and query it to resume monitoring in a later chat.

## Create the video

1. Understand the user's story, audience, platform, visual identity and approximate length. Keep their creative choices. Use 9:16 for a social short unless specified otherwise.
2. Run `node cli.js models` and `node cli.js guide MODEL` for every chosen model BEFORE writing its prompts. Model IDs: flare, seedance, minimax, veo. The guides link to primary sources and distinguish official constraints from project advice. Never invent provider capabilities.
3. Design a short shot list with an opening hook, action and payoff. Use one main action per short shot. Preserve subject identity, wardrobe, props, lighting and screen direction. Reserve space for later captions.
4. Write the workflow file yourself following `examples/social-video.json`; the user does not need to import it anywhere. Generate identity/keyframe images with Flare Medium first. Reuse them using `@step:ID`; use Flare edit steps for alternative compositions. Read the exact model's reference naming convention. Do not mix reference and first/last-frame modes. Veo defaults to native 1080p; do not request 2K or generate 4K as a substitute.
5. Preview with `node cli.js preview-workflow FILE`. Explain the known cost plus unpriced steps. Follow the user's existing generation authorization and budget; don't add an unnecessary confirmation when generation is already authorized. Preflight does not charge.
6. Execute with `node cli.js workflow FILE --key STABLE_UNIQUE_KEY --wait`. Reuse the same key for a network retry. Never create another paid generation just because a poll timed out. `unknown` requires checking provider history; `paused` can be resumed without re-generation.
7. Inspect outputs, identify any quality issue honestly and revise only affected shots. A successful API response is not a visual quality check. Provide the final MP4 and relevant reference images. Never post to social accounts without explicit authorization.

The external agent (Codex/Claude/etc.) does story reasoning. Studio executes image/video jobs, persists progress and optionally assembles a film. No extra text-model API key is needed. `node cli.js help` lists all commands; MCP also offers a `storyboard` prompt.

Security and development: all provider keys live server-side in ignored `.env`. Never print/commit them. Keep the server bound to localhost unless a shared access token is configured. Run `npm test`; provider tests use fixtures and do not charge. Do not run legacy patch/test scripts. No need to change the app to make a video.
