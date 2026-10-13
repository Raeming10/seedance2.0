---
name: setup
description: 'Set up or diagnose the Social Video plugin in Codex: configure local provider keys, install runtime dependencies, and start its video generation service. Use for first-time setup or a broken connection, not for creating a video.'
---

# Set up Social Video

Configure this plugin so the user can make videos by describing a story in Codex. Discuss setup in the user's language. Do the setup using tools; do not hand the user a list of shell commands.

The launcher is [../../scripts/studio.js](../../scripts/studio.js), relative to this skill directory. Resolve its absolute path from this SKILL.md location; installed plugin caches move between versions. In the commands below, LAUNCHER means that absolute path, shell-quoted when needed. Never assume the user's current folder is the plugin source.

1. Check Node.js 22+ and npm. Install missing prerequisites from their official distribution within available environment permissions. Check FFmpeg and ffprobe for composition; if absent, install via the platform's normal package manager or official distribution. Use a bundled runtime when available and suitable. Never change security or approval settings to make setup succeed.
2. Run `node LAUNCHER setup`. It installs the bundled runtime into a stable local directory, creates a private config file, and starts Studio. No model generation occurs. If the user is intentionally reusing an existing Seedance Studio checkout, use `setup --project /absolute/project/path` instead; never clone a repository just to use the installed plugin. Existing configuration is preserved.
3. The JSON result reports `envFile`, `projectRoot`, `plansDir`, `outputsDir` and readiness. Keys and output stay outside the plugin cache. For the complete toolset, configure both `FAL_KEY` (Flare, MiniMax H3) and `GOOGLE_GENERATIVE_AI_API_KEY` (official Veo). Preserve existing keys; open the reported `envFile` for the user to fill missing fields. Only configure a subset if the user requests it; do not silently defer Google setup. Do not ask them to paste keys in the chat or print secret values. Continue independent preparation while waiting. Key configuration is not verification of balance, access or authentication.
4. After local keys are edited, run `node LAUNCHER restart`. It refuses to interrupt active jobs. For a shared Studio, configure STUDIO_URL and STUDIO_API_TOKEN in the same local file; the administrator restarts the remote service. Never start a substitute local service after a remote connection failure.
5. Validate with `doctor`, `models`, `guide prelulu`, `guide directing`, `guide video-prompting`, selected model guides (including Veo for a complete setup) and `preview-workflow` against the example at the reported projectRoot/examples/prelulu-mafia-20s.json. Verify its productionReview reports 20 planned seconds and 40 generated video seconds; known cost is only the video portion, with unpriced image steps. None of these requests generate paid media. Report any missing provider or FFmpeg honestly. End with a short natural-language video request the user can send next.

The launcher starts the local service automatically for ordinary commands. If setup after a plugin update reports a different running runtime, run `restart` once jobs are idle. A port owned by another service or another Studio data directory must not be killed: help choose an unused PORT in the reported envFile. Preserve existing media and plans.

No MCP registration, webpage automation, manual JSON import or additional text-model API key is required. Run no paid generations just to validate setup.
