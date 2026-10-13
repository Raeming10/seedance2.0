#!/usr/bin/env node
// Prelulu Call Kit. Run through the plugin launcher (scripts/callkit.js), which installs this directory.
//   kit.js render <config.json>                  -> the finished MP4 and a JSON report
//   kit.js stills <config.json> --at 0,1.5,3     -> PNG frames, to check a layout before rendering
//   kit.js analyse <clip.mp4> --text "the line"  -> where the line is spoken, and any extra sound
//   kit.js formats                               -> the six formats and their default copy
const { build, stillsOf, analyse, DEFAULTS } = require('./lib/build');

async function main([cmd, arg, ...rest]) {
  const flag = (name) => {
    const i = rest.indexOf(name);
    if (i < 0) return undefined;
    if (rest[i + 1] === undefined) throw new Error(`${name} needs a value.`);
    return rest[i + 1];
  };
  if (cmd === 'render') return build(arg);
  if (cmd === 'stills') {
    const at = (flag('--at') || '0,1,2,3').split(',').map(Number);
    if (at.some((t) => !Number.isFinite(t) || t < 0))
      throw new Error('--at takes comma-separated seconds.');
    return stillsOf(arg, at);
  }
  if (cmd === 'analyse' || cmd === 'analyze') {
    const text = flag('--text');
    if (!arg || !text) throw new Error('Usage: analyse <clip.mp4> --text "the scripted line"');
    return analyse(arg, text);
  }
  if (cmd === 'formats') return DEFAULTS;
  throw new Error(
    'Commands: render <config.json> | stills <config.json> --at 0,1,2 | analyse <clip> --text "..." | formats',
  );
}

main(process.argv.slice(2))
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error(JSON.stringify({ error: e.message }));
    process.exitCode = 1;
  });
