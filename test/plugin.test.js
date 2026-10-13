const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const { build, RUNTIME_FILES, PLUGIN_FILES } = require('../scripts/build-plugin');
const exec = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
async function port() {
  const s = http.createServer();
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const value = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return value;
}
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio plugin '));
  const built = build(path.join(directory, 'installed plugin', 'social-video'));
  const home = path.join(directory, 'private settings');
  const cwd = path.join(directory, 'creative workspace');
  const runtime = path.join(home, 'runtimes', built.bundleId);
  const data = path.join(home, 'data');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(path.join(runtime, 'node_modules'), { recursive: true });
  // Reuse already-installed test dependencies. Setup still exercises the real runtime copy and server.
  for (const entry of ['@fal-ai', '@google', '@modelcontextprotocol', 'zod'])
    fs.symlinkSync(
      path.join(ROOT, 'node_modules', entry),
      path.join(runtime, 'node_modules', entry),
      'junction',
    );
  fs.writeFileSync(
    path.join(runtime, 'node_modules', '.studio-lock-hash'),
    createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, 'package-lock.json')))
      .digest('hex'),
  );
  const chosenPort = await port();
  const envFile = path.join(home, '.env');
  fs.writeFileSync(
    envFile,
    `FAL_KEY=fixture-secret-do-not-print\nPORT=${chosenPort}\nHOST=127.0.0.1\n`,
    { mode: 0o600 },
  );
  const env = { ...process.env, SEEDANCE_STUDIO_HOME: home };
  for (const name of [
    'FAL_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'STUDIO_API_TOKEN',
    'STUDIO_URL',
    'STUDIO_ENV_FILE',
    'STUDIO_DATA_DIR',
    'STUDIO_RUNTIME_ID',
    'PORT',
    'HOST',
  ])
    delete env[name];
  const launcher = path.join(built.directory, 'scripts', 'studio.js');
  const run = async (...args) => {
    const result = await exec(process.execPath, [launcher, ...args], { cwd, env, timeout: 25000 });
    assert.ok(!result.stdout.includes('fixture-secret-do-not-print'));
    assert.ok(!result.stderr.includes('fixture-secret-do-not-print'));
    return JSON.parse(result.stdout);
  };
  const kill = async () => {
    const lock = path.join(data, 'server.lock');
    if (!fs.existsSync(lock)) return;
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
    for (let i = 0; i < 100; i++) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('Fixture server did not exit.');
  };
  t.after(async () => {
    await kill();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { ...built, home, cwd, runtime, data, envFile, chosenPort, run, kill };
}
test('plugin bundle is self-contained and excludes keys, generated history, node_modules and git files', (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-bundle-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const a = build(path.join(folder, 'a'));
  const b = build(path.join(folder, 'b'));
  assert.equal(a.bundleId, b.bundleId);
  const files = fs
    .readdirSync(a.directory, { recursive: true })
    .filter((file) => fs.statSync(path.join(a.directory, file)).isFile());
  const expected = [
    'bundle.json',
    ...PLUGIN_FILES,
    ...RUNTIME_FILES.map((file) => 'runtime/' + file),
  ];
  assert.deepEqual(files.map((file) => file.split(path.sep).join('/')).sort(), expected.sort());
  assert.equal(fs.existsSync(path.join(a.directory, 'runtime', '.env')), false);
  assert.throws(() => build(a.directory), /empty/);
});
test(
  'installed plugin starts from another working directory, previews without charging and preserves configuration',
  { timeout: 30000 },
  async (t) => {
    const x = await fixture(t);
    const before = fs.readFileSync(x.envFile, 'utf8');
    const setup = await x.run('setup');
    assert.equal(setup.serviceRunning, true);
    assert.equal(setup.configured.fal, true);
    assert.equal(setup.configured.google, false);
    assert.equal(setup.credentialsVerified, false);
    assert.equal(setup.projectRoot, x.runtime);
    assert.equal((await x.run('models')).models.length, 3);
    const manifest = {
      name: 'Preview only',
      steps: [{ id: 'hero', request: { model: 'flare', prompt: 'A cup' } }],
    };
    fs.writeFileSync(path.join(x.cwd, 'story.json'), JSON.stringify(manifest));
    const preview = await x.run('preview-workflow', 'story.json');
    assert.ok(preview);
    const film = await x.run(
      'preview-workflow',
      path.join(x.runtime, 'examples', 'prelulu-mafia-20s.json'),
    );
    assert.equal(film.productionReview.plannedDuration, 20);
    assert.equal(film.productionReview.generatedVideoSeconds, 40);
    assert.equal(film.estimate.knownUsd, 16);
    assert.equal(film.estimate.unpricedSteps.length, 6);
    assert.deepEqual((await x.run('jobs')).jobs, []);
    await x.run('setup');
    assert.equal(fs.readFileSync(x.envFile, 'utf8'), before);
    await x.kill();
    assert.equal((await x.run('models')).models.length, 3);
    assert.equal((await x.run('doctor')).serviceRunning, true);
  },
);
test(
  'restart refuses active work and keeps saved media and plans when idle',
  { timeout: 30000 },
  async (t) => {
    const x = await fixture(t);
    const result = await x.run('setup');
    const lock = path.join(x.data, 'server.lock');
    const firstPid = fs.readFileSync(lock, 'utf8');
    const record = path.join(x.data, 'records', 'pending-test.json');
    fs.writeFileSync(record, JSON.stringify({ status: 'pending' }));
    await assert.rejects(x.run('restart'), /active jobs/);
    assert.equal(fs.readFileSync(lock, 'utf8'), firstPid);
    fs.unlinkSync(record);
    const artifact = path.join(result.outputsDir, 'keep.mp4');
    fs.writeFileSync(artifact, 'existing media');
    const plan = path.join(result.plansDir, 'keep.json');
    fs.writeFileSync(plan, '{}');
    await x.run('restart');
    assert.notEqual(fs.readFileSync(lock, 'utf8'), firstPid);
    assert.equal(fs.readFileSync(artifact, 'utf8'), 'existing media');
    assert.equal(fs.readFileSync(plan, 'utf8'), '{}');
  },
);
test('an occupied port is not reused or stopped by plugin setup', { timeout: 30000 }, async (t) => {
  const x = await fixture(t);
  const foreign = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ service: 'other-app' }));
  });
  foreign.listen(x.chosenPort, '127.0.0.1');
  await once(foreign, 'listening');
  t.after(() => new Promise((resolve) => foreign.close(resolve)));
  await assert.rejects(x.run('setup'), /another service/);
  assert.equal((await fetch(`http://127.0.0.1:${x.chosenPort}/api/health`)).status, 200);
  assert.equal(fs.existsSync(path.join(x.data, 'server.lock')), false);
});
test(
  'shared service connection failure never starts a local replacement',
  { timeout: 30000 },
  async (t) => {
    const x = await fixture(t);
    fs.appendFileSync(x.envFile, `STUDIO_URL=http://127.0.0.1:${await port()}\n`);
    await assert.rejects(x.run('setup'), /Cannot reach shared Studio/);
    assert.equal(fs.existsSync(path.join(x.data, 'server.lock')), false);
  },
);
test(
  'plugin refuses a different Studio instance on the same port',
  { timeout: 30000 },
  async (t) => {
    const x = await fixture(t);
    await x.run('setup');
    fs.appendFileSync(x.envFile, `STUDIO_DATA_DIR=${path.join(x.home, 'different data')}\n`);
    await assert.rejects(x.run('models'), /different Studio data directory/);
    assert.equal(fs.existsSync(path.join(x.home, 'different data', 'server.lock')), false);
  },
);
