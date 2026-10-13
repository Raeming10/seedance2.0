#!/usr/bin/env node
// This launcher needs only Node.js built-ins; provider packages are installed by setup.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const PLUGIN = path.resolve(__dirname, '..');
const HOME_DIR = path.resolve(
  process.env.SEEDANCE_STUDIO_HOME || path.join(os.homedir(), '.seedance-studio'),
);
const SETTINGS = path.join(HOME_DIR, 'config.json');
const secretNames = ['FAL_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'STUDIO_API_TOKEN'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let activeEnv = process.env;
function fail(message) {
  throw new Error(message);
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function clean(message, env = activeEnv) {
  let text = String(message);
  for (const name of secretNames) if (env[name]) text = text.split(env[name]).join('[REDACTED]');
  return text.slice(-2000);
}
function bundle() {
  const file = path.join(PLUGIN, 'bundle.json');
  if (!fs.existsSync(file))
    fail(
      'This is the plugin source. Install a built plugin, or use setup --project /absolute/path/to/seedance2.',
    );
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!/^[a-f0-9]{20}$/.test(data.id) || !Array.isArray(data.files)) fail('Invalid plugin bundle.');
  for (const file of data.files)
    if (
      typeof file !== 'string' ||
      path.isAbsolute(file) ||
      file.split(/[\\/]/).includes('..') ||
      file === '.env'
    )
      fail('Invalid runtime file in bundle.');
  return data;
}
function settings() {
  return fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : null;
}
function context(config = settings()) {
  if (!config || !path.isAbsolute(config.projectRoot || '')) fail('Run setup first.');
  const root = config.projectRoot;
  if (!fs.existsSync(path.join(root, 'server.js')))
    fail('Configured runtime is missing. Run setup again.');
  const envFile = config.managed ? path.join(HOME_DIR, '.env') : path.join(root, '.env');
  const { readEnv } = require(path.join(root, 'lib', 'config.js'));
  const env = { ...readEnv(envFile), ...process.env, STUDIO_ENV_FILE: envFile };
  const dataDir = path.resolve(
    root,
    env.STUDIO_DATA_DIR || (config.managed ? path.join(HOME_DIR, 'data') : '.studio'),
  );
  env.STUDIO_DATA_DIR = dataDir;
  env.STUDIO_RUNTIME_ID = config.bundleId || 'project';
  const port = Number(env.PORT || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    fail('PORT must be between 1 and 65535.');
  const base = (env.STUDIO_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['http:', 'https:'].includes(url.protocol)
  )
    fail('STUDIO_URL must be an HTTP(S) address without credentials, query or fragment.');
  activeEnv = env;
  return {
    root,
    envFile,
    env,
    dataDir,
    base,
    port,
    managed: config.managed,
    remote: Boolean(env.STUDIO_URL),
    plansDir: path.join(config.managed ? HOME_DIR : dataDir, 'plans'),
    instanceId: createHash('sha256').update(dataDir).digest('hex').slice(0, 16),
  };
}
async function health(ctx) {
  let response;
  try {
    response = await fetch(ctx.base + '/api/health', {
      headers: ctx.env.STUDIO_API_TOKEN
        ? { Authorization: `Bearer ${ctx.env.STUDIO_API_TOKEN}` }
        : {},
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    return null;
  }
  if (!response.ok)
    fail(`Studio health returned HTTP ${response.status}. Check the address and access token.`);
  let result;
  try {
    result = await response.json();
  } catch {
    fail('The configured address is not a Studio service.');
  }
  if (result.service !== 'seedance-studio')
    fail(
      'The address belongs to another service or an older Studio. Do not stop it automatically.',
    );
  if (!ctx.remote && result.instanceId !== ctx.instanceId)
    fail(
      'This port is used by a different Studio data directory. Choose another PORT in the local configuration.',
    );
  return result;
}
async function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const end = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.once('connect', () => end(true));
    socket.once('error', () => end(false));
    socket.setTimeout(1500, () => end(true));
  });
}
function dependenciesReady(ctx) {
  return [
    '@fal-ai/client',
    '@google/genai',
    '@modelcontextprotocol/sdk/server/mcp.js',
    'zod',
  ].every((name) => {
    try {
      require.resolve(name, { paths: [ctx.root] });
      return true;
    } catch {
      return false;
    }
  });
}
async function command(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: 'inherit', ...options });
    let errorText = '';
    child.stderr?.on('data', (bytes) => {
      errorText = (errorText + bytes).slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command exited with status ${code}. ${clean(errorText)}`)),
    );
  });
}
async function installDependencies(ctx) {
  const fingerprint = createHash('sha256')
    .update(fs.readFileSync(path.join(ctx.root, 'package-lock.json')))
    .digest('hex');
  const marker = path.join(ctx.root, 'node_modules', '.studio-lock-hash');
  if (
    dependenciesReady(ctx) &&
    fs.existsSync(marker) &&
    fs.readFileSync(marker, 'utf8') === fingerprint
  )
    return;
  const env = { ...process.env };
  for (const name of secretNames) delete env[name];
  // npm.cmd needs a shell on Windows. The command and arguments here are fixed, never user input.
  await command(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['ci', '--no-audit', '--no-fund', ...(ctx.managed ? ['--omit=dev'] : [])],
    {
      cwd: ctx.root,
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  fs.writeFileSync(marker, fingerprint);
}
async function ensure(ctx) {
  const existing = await health(ctx);
  if (existing) {
    if (!ctx.remote && existing.runtimeId !== ctx.env.STUDIO_RUNTIME_ID)
      fail('Studio is running a different runtime. Run restart after active jobs finish.');
    return existing;
  }
  if (ctx.remote)
    fail(
      'Cannot reach shared Studio. Check STUDIO_URL and network access; no local server was started.',
    );
  if (await portBusy(ctx.port))
    fail('PORT is occupied. Choose another PORT; no existing process was stopped.');
  if (!dependenciesReady(ctx)) fail('Runtime dependencies are missing. Run setup.');
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  const log = fs.openSync(path.join(ctx.dataDir, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, [path.join(ctx.root, 'server.js')], {
    cwd: ctx.root,
    env: ctx.env,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  let startupError;
  child.on('error', (error) => {
    startupError = error;
  });
  child.unref();
  fs.closeSync(log);
  for (let attempt = 0; attempt < 40; attempt++) {
    if (startupError) throw startupError;
    await sleep(250);
    const status = await health(ctx);
    if (status) {
      if (status.runtimeId !== ctx.env.STUDIO_RUNTIME_ID)
        fail('A different Studio runtime started concurrently. Run doctor before continuing.');
      return status;
    }
  }
  fail(
    `Studio did not start. Inspect the local log at ${path.join(ctx.dataDir, 'server.log')} with credentials redacted.`,
  );
}
async function stopIdle(ctx) {
  if (ctx.remote) fail('Manage shared Studio on its server; this plugin will not restart it.');
  const current = await health(ctx);
  if (!current) return;
  // Read every persisted record, not the truncated recent-jobs API.
  const records = path.join(ctx.dataDir, 'records');
  for (const name of fs.readdirSync(records).filter((v) => v.endsWith('.json'))) {
    const item = JSON.parse(fs.readFileSync(path.join(records, name), 'utf8'));
    if (!['completed', 'failed', 'unknown', 'paused'].includes(item.status))
      fail('There are active jobs or workflows. Wait for them to finish before restarting.');
  }
  const lock = path.join(ctx.dataDir, 'server.lock');
  const pid = Number(fs.readFileSync(lock, 'utf8'));
  if (!Number.isSafeInteger(pid) || pid <= 1) fail('Invalid Studio process lock.');
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alive = false;
    }
    if (!(await portBusy(ctx.port)) && !alive) return;
  }
  fail('Studio has not stopped yet; no replacement process was started.');
}
function report(ctx, status) {
  const ffmpeg = [
    ctx.env.FFMPEG_PATH || 'ffmpeg',
    ctx.env.FFPROBE_PATH ||
      (ctx.env.FFMPEG_PATH
        ? path.join(
            path.dirname(ctx.env.FFMPEG_PATH),
            process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
          )
        : 'ffprobe'),
  ].every((binary) => spawnSync(binary, ['-version'], { stdio: 'ignore' }).status === 0);
  return {
    configFile: SETTINGS,
    projectRoot: ctx.root,
    envFile: ctx.envFile,
    plansDir: ctx.plansDir,
    outputsDir: ctx.remote ? null : path.join(ctx.dataDir, 'outputs'),
    studioUrl: ctx.base,
    dependenciesInstalled: dependenciesReady(ctx),
    serviceRunning: Boolean(status),
    configured: {
      fal: status ? status.fal : Boolean(ctx.env.FAL_KEY),
      google: status ? status.google : Boolean(ctx.env.GOOGLE_GENERATIVE_AI_API_KEY),
    },
    ffmpeg: status ? status.ffmpeg : ffmpeg,
    credentialsVerified: false,
    note: 'Configured keys are not proof of provider authorization. Setup does not generate paid media.',
  };
}
async function setupUnlocked(project) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  let config = settings();
  if (project) {
    const root = path.resolve(project);
    if (!fs.existsSync(path.join(root, 'lib', 'config.js')))
      fail('Select the Seedance Studio repository.');
    config = { projectRoot: root, managed: false };
  } else if (!config || config.managed) {
    const data = bundle();
    const root = path.join(HOME_DIR, 'runtimes', data.id);
    for (const file of data.files) {
      const output = path.join(root, file);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(path.join(PLUGIN, 'runtime', file), output);
    }
    config = { projectRoot: root, managed: true, bundleId: data.id };
  }
  const envFile = config.managed
    ? path.join(HOME_DIR, '.env')
    : path.join(config.projectRoot, '.env');
  if (!fs.existsSync(envFile)) {
    const template = fs.readFileSync(path.join(config.projectRoot, '.env.example'), 'utf8');
    fs.writeFileSync(
      envFile,
      config.managed ? template.replace('PORT=8000', 'PORT=8787') : template,
      { mode: 0o600, flag: 'wx' },
    );
  }
  writeJson(SETTINGS, config);
  const ctx = context(config);
  await installDependencies(ctx);
  fs.mkdirSync(ctx.plansDir, { recursive: true });
  return report(ctx, await ensure(ctx));
}
async function setup(project) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  const lock = path.join(HOME_DIR, 'setup.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 1)
      fail('Invalid setup lock; inspect the local setup.lock before continuing.');
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alive = false;
    }
    if (alive) fail('Another setup is running. Wait for it to finish, then retry.');
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  try {
    return await setupUnlocked(project);
  } finally {
    fs.unlinkSync(lock);
  }
}
async function main(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < 22)
    fail('Install Node.js 22 or newer, then retry setup.');
  const [action, ...args] = argv;
  if (action === 'setup') {
    if (args.length && (args[0] !== '--project' || args.length !== 2))
      fail('Usage: setup [--project /absolute/project/path]');
    return setup(args[1]);
  }
  if (!action || action === 'help')
    return {
      usage:
        'node <plugin>/scripts/studio.js setup | doctor | start | restart | <Studio CLI command>',
      examples: [
        'models',
        'guide minimax',
        'preview-workflow /absolute/plan.json',
        'workflow /absolute/plan.json --key unique-key --wait',
      ],
      note: 'Commands automatically start the local service. Configuration and output live outside the plugin cache.',
    };
  const ctx = context();
  if (action === 'doctor') return report(ctx, await health(ctx));
  if (action === 'restart') {
    await stopIdle(ctx);
    return report(ctx, await ensure(ctx));
  }
  const status = await ensure(ctx);
  if (action === 'start') return report(ctx, status);
  // Keep the caller's directory: relative upload and workflow filenames refer to their creative workspace.
  await command(process.execPath, [path.join(ctx.root, 'cli.js'), action, ...args], {
    env: ctx.env,
  });
}
if (require.main === module)
  main()
    .then((result) => {
      if (result) console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ error: clean(error.message) }));
      process.exitCode = 1;
    });
module.exports = { context, health, ensure, setup, main, clean };
