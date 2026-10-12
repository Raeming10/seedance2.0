const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
function readEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}
function loadEnv() {
  for (const [name, value] of Object.entries(
    readEnv(process.env.STUDIO_ENV_FILE || path.join(ROOT, '.env')),
  ))
    if (process.env[name] === undefined) process.env[name] = value;
}
function redact(value) {
  let s = String(value);
  for (const name of ['FAL_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'STUDIO_API_TOKEN'])
    if (process.env[name]) s = s.split(process.env[name]).join('[REDACTED]');
  return s.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[media]').slice(0, 1500);
}
module.exports = { ROOT, readEnv, loadEnv, redact };
