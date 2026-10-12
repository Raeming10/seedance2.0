# Seedance Studio — agent workflow

This repository is a production tool for social videos. When asked to make a video, use the running Studio API/CLI or MCP tools; do not automate the webpage.

1. Understand the user's story, audience, platform, visual identity and approximate length. Keep their creative choices. Use 9:16 for a social short unless specified otherwise.
2. Run `node cli.js models` and `node cli.js guide MODEL` for every chosen model BEFORE writing its prompts. Model IDs: flare, seedance, minimax, veo. The guides link to primary sources and distinguish official constraints from project advice. Never invent provider capabilities.
3. Design a short shot list with an opening hook, action and payoff. Use one main action per short shot. Preserve subject identity, wardrobe, props, lighting and screen direction. Reserve space for later captions.
4. Create a JSON workflow following `examples/social-video.json`. Generate identity/keyframe images with Flare Medium first. Reuse them using `@step:ID`; use Flare edit steps for alternative compositions. Read the exact model's reference naming convention. Do not mix reference and first/last-frame modes.
5. Preview with `node cli.js preview-workflow FILE`. Explain the known cost plus unpriced steps. Follow the user's existing generation authorization and budget; don't add an unnecessary confirmation when generation is already authorized. Preflight does not charge.
6. Execute with `node cli.js workflow FILE --key STABLE_UNIQUE_KEY --wait`. Reuse the same key for a network retry. Never create another paid generation just because a poll timed out. `unknown` requires checking provider history; `paused` can be resumed without re-generation.
7. Inspect outputs, identify any quality issue honestly and revise only affected shots. A successful API response is not a visual quality check. Provide the final MP4 and relevant reference images. Never post to social accounts without explicit authorization.

The external agent (Codex/Claude/etc.) does story reasoning. Studio executes image/video jobs, persists progress and optionally assembles a film. No extra text-model API key is needed. `node cli.js help` lists all commands; MCP also offers a `storyboard` prompt.

Security and development: all provider keys live server-side in ignored `.env`. Never print/commit them. Keep the server bound to localhost unless a shared access token is configured. Run `npm test`; provider tests use fixtures and do not charge. Do not run legacy patch/test scripts. No need to change the app to make a video.
