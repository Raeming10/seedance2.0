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
  'lib/providers.js',
  'docs/API.md',
  'docs/guides/flare.md',
  'docs/guides/seedance.md',
  'docs/guides/minimax.md',
  'docs/guides/veo.md',
  'examples/social-video.json',
];
const PLUGIN_FILES = [
  '.codex-plugin/plugin.json',
  'scripts/studio.js',
  'skills/setup/SKILL.md',
  'skills/setup/agents/openai.yaml',
  'skills/create-video/SKILL.md',
  'skills/create-video/agents/openai.yaml',
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
