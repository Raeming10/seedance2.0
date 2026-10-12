#!/usr/bin/env node
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { api, upload, waitFor } = require('./lib/client');
const help = `Seedance Studio (start server with npm start)
  node cli.js models
  node cli.js health
  node cli.js guide <directing|flare|seedance|minimax|veo>
  node cli.js upload <local-file>
  node cli.js preview <request.json>
  node cli.js generate <request.json> --key <unique-key> [--wait]
  node cli.js preview-workflow <workflow.json>
  node cli.js workflow <workflow.json> --key <unique-key> [--wait]
  node cli.js compose <composition.json> --key <unique-key> [--wait]
  node cli.js preview-composition <composition.json>
  node cli.js inspect <Studio-video-url> [--times 0,0.5,1,2,3]
  node cli.js jobs | workflows
  node cli.js status <job-id>
  node cli.js workflow-status <workflow-id>
  node cli.js wait <job-id>
  node cli.js wait-workflow <workflow-id>
  node cli.js resume <paused-job-id>
All output is JSON except guide/help. A preview never calls a generation API.
Use STUDIO_URL and STUDIO_API_TOKEN to connect to a shared server.
Use the same --key to retry a submission without creating another paid job.`;
async function main(argv = process.argv.slice(2)) {
  const [command, arg] = argv;
  const flag = argv.indexOf('--key');
  if (flag >= 0 && !argv[flag + 1]) throw new Error('--key requires a value.');
  const key = flag < 0 ? randomUUID() : argv[flag + 1];
  const file = () => JSON.parse(fs.readFileSync(arg, 'utf8'));
  let result;
  if (!command || command === 'help' || command === '--help') return console.log(help);
  if (['models', 'health', 'jobs', 'workflows'].includes(command))
    result = await api('/api/' + command);
  else if (command === 'guide')
    return console.log((await api('/api/guides/' + encodeURIComponent(arg))).content);
  else if (command === 'upload') result = await upload(arg);
  else if (command === 'preview') result = await api('/api/preview', file());
  else if (command === 'preview-workflow') result = await api('/api/workflows/preview', file());
  else if (command === 'preview-composition') result = await api('/api/compose/preview', file());
  else if (command === 'inspect') {
    const timeFlag = argv.indexOf('--times');
    if (timeFlag >= 0 && !argv[timeFlag + 1])
      throw new Error('--times requires comma-separated seconds.');
    const times =
      timeFlag < 0
        ? undefined
        : argv[timeFlag + 1].split(',').map((s) => (s.trim() ? Number(s) : NaN));
    if (times?.some((t) => !Number.isFinite(t))) throw new Error('Invalid inspection timestamp.');
    result = await api('/api/inspect', { url: arg, times });
  } else if (['generate', 'workflow', 'compose'].includes(command)) {
    const kind = command === 'generate' ? 'jobs' : 'workflows';
    result = await api(command === 'compose' ? '/api/compose' : '/api/' + kind, file(), key);
    console.error(`Saved ${kind}/${result.id}; idempotency key: ${key}`);
    if (argv.includes('--wait')) result = await waitFor(kind, result.id);
  } else if (['status', 'workflow-status', 'wait', 'wait-workflow'].includes(command)) {
    const kind = command.includes('workflow') ? 'workflows' : 'jobs';
    result = command.startsWith('wait')
      ? await waitFor(kind, arg)
      : await api(`/api/${kind}/${encodeURIComponent(arg)}`);
  } else if (command === 'resume')
    result = await api(`/api/jobs/${encodeURIComponent(arg)}/resume`, {});
  else throw new Error('Unknown command. Run node cli.js help.');
  console.log(JSON.stringify(result, null, 2));
  if (['failed', 'unknown', 'paused'].includes(result?.status)) process.exitCode = 1;
}
if (require.main === module)
  main().catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
module.exports = { main };
