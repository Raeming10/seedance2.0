#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
// Explicitly enumerate distributable source. Never copy a working directory recursively.
const RUNTIME_FILES = [
  'package.json',
  'package-lock.json',
  '.env.example',
  'server.js',
  'cli.js',
  'app.js',
  'index.html',
  'style.css',
  'lib/catalog.js',
  'lib/client.js',
  'lib/config.js',
  'lib/engine.js',
  'lib/media.js',
  'lib/timeline.js',
  'lib/providers.js',
  'lib/production.js',
  'docs/API.md',
  'docs/guides/directing.md',
  'docs/guides/prelulu.md',
  'docs/guides/video-prompting.md',
  'docs/examples/prelulu-mafia-20s.md',
  'docs/guides/flare.md',
  'docs/guides/minimax.md',
  'docs/guides/veo.md',
  'examples/social-video.json',
  'examples/prelulu-source-dialogue.json',
  'examples/prelulu-mafia-20s.json',
];
// The video-call kit (Remotion compositions, brand assets, cutting/caption/mix pipeline). It ships with the
// plugin rather than the Studio runtime: scripts/callkit.js installs it separately on first use.
const CALL_KIT_FILES = [
  'callkit/assets/app-icon.png',
  'callkit/assets/bgm_loop.flac',
  'callkit/assets/bgm_loop.json',
  'callkit/assets/endcard-continue.mp4',
  'callkit/assets/fonts/Nunito-OFL.txt',
  'callkit/assets/fonts/Nunito-VariableFont_wght.ttf',
  'callkit/assets/pip-loop.mp4',
  'callkit/assets/roster.json',
  'callkit/assets/roster/alexander.jpg',
  'callkit/assets/roster/andre.jpg',
  'callkit/assets/roster/dante.jpg',
  'callkit/assets/roster/henry.jpg',
  'callkit/assets/roster/james.jpg',
  'callkit/assets/roster/kai.jpg',
  'callkit/assets/roster/marcus.jpg',
  'callkit/assets/roster/nathan.jpg',
  'callkit/assets/roster/rafael.jpg',
  'callkit/assets/roster/sebastian.jpg',
  'callkit/docs/GUIDE.md',
  'callkit/examples/media/marcus_A.mp4',
  'callkit/examples/media/marcus_B.mp4',
  'callkit/kit.js',
  'callkit/lib/align.js',
  'callkit/lib/audio.js',
  'callkit/lib/build.js',
  'callkit/lib/plan.js',
  'callkit/lib/render.js',
  'callkit/lib/util.js',
  'callkit/package-lock.json',
  'callkit/package.json',
  'callkit/src/Call.tsx',
  'callkit/src/Story.tsx',
  'callkit/src/CallAd.tsx',
  'callkit/src/Formats.tsx',
  'callkit/src/Ring.tsx',
  'callkit/src/Root.tsx',
  'callkit/src/index.ts',
  'callkit/src/schema.ts',
];
const PLUGIN_FILES = [
  '.codex-plugin/plugin.json',
  'scripts/studio.js',
  'skills/setup/SKILL.md',
  'skills/setup/agents/openai.yaml',
  'skills/create-video/SKILL.md',
  'skills/create-video/agents/openai.yaml',
  'skills/video-prompting/SKILL.md',
  'skills/video-prompting/agents/openai.yaml',
  'skills/call-video/SKILL.md',
  'skills/call-video/agents/openai.yaml',
  'scripts/callkit.js',
  ...CALL_KIT_FILES,
];
function build(destination = path.join(ROOT, '.studio', 'dist', 'social-video'), root = ROOT) {
  const target = path.resolve(destination);
  if (target === root || target === path.join(root, 'plugins', 'social-video'))
    throw new Error('Build into a separate output directory.');
  fs.mkdirSync(target, { recursive: true });
  if (fs.readdirSync(target).length) throw new Error('Build destination must be empty.');
  const digest = createHash('sha256');
  for (const file of PLUGIN_FILES) {
    const bytes = fs.readFileSync(path.join(root, 'plugins', 'social-video', file));
    const output = path.join(target, file);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
    digest.update(file).update(bytes);
  }
  for (const file of RUNTIME_FILES) {
    const bytes = fs.readFileSync(path.join(root, file));
    const output = path.join(target, 'runtime', file);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
    digest.update(file).update(bytes);
  }
  const id = digest.digest('hex').slice(0, 20);
  fs.writeFileSync(
    path.join(target, 'bundle.json'),
    JSON.stringify({ id, files: RUNTIME_FILES }, null, 2) + '\n',
  );
  return { directory: target, bundleId: id, runtimeFiles: RUNTIME_FILES.length };
}
if (require.main === module) {
  try {
    console.log(JSON.stringify(build(process.argv[2]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { build, RUNTIME_FILES, PLUGIN_FILES };
