#!/usr/bin/env node
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { api, upload } = require('./lib/client');
const { requestSchema } = require('./lib/catalog');
const { workflowSchema, compositionSchema } = require('./lib/engine');
const server = new McpServer({ name: 'seedance-studio', version: '2.0.0' });
const result = (data) => ({
  content: [
    { type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) },
  ],
});
function tool(name, description, inputSchema, fn, readOnly = false) {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: !readOnly },
    },
    async (args) => {
      try {
        return result(await fn(args));
      } catch (e) {
        return { ...result({ error: e.message }), isError: true };
      }
    },
  );
}
tool(
  'list_models',
  'Discover supported modes, resolutions, ratios and reference limits before planning shots.',
  {},
  () => api('/api/models'),
  true,
);
tool(
  'get_prompt_guide',
  'Read this BEFORE writing prompts for the selected model. Includes official source links and mode-specific conventions.',
  { model: z.enum(['flare', 'seedance', 'minimax', 'veo']) },
  ({ model }) => api('/api/guides/' + model),
  true,
);
tool(
  'upload_asset',
  'Upload a local image/video/audio file to Studio. Returns a local asset URL usable by either provider.',
  { path: z.string() },
  ({ path }) => upload(path),
);
tool(
  'preview_generation',
  'Validate without charging. Returns normalized parameters and approximate cost (null means unpriced).',
  { request: requestSchema },
  ({ request }) => api('/api/preview', request),
  true,
);
tool(
  'generate_media',
  'Submit a paid image or video generation authorized by the user. Read the model guide first. Reuse the idempotency key when retrying. Returns immediately; poll get_job.',
  { request: requestSchema, idempotencyKey: z.string().min(1) },
  ({ request, idempotencyKey }) => api('/api/jobs', request, idempotencyKey),
);
tool(
  'get_job',
  'Read durable job status and local output URLs. Polling never regenerates. unknown means inspect provider history; paused supports resume_job.',
  { id: z.string() },
  ({ id }) => api('/api/jobs/' + encodeURIComponent(id)),
  true,
);
tool(
  'resume_job',
  'Resume polling/downloading a paused job without another generation.',
  { id: z.string() },
  ({ id }) => api('/api/jobs/' + encodeURIComponent(id) + '/resume', {}),
);
tool(
  'preview_workflow',
  'Validate a storyboard workflow without charging. References use @step:ID and must point to earlier steps. Check all unpriced steps as well as known cost.',
  { workflow: workflowSchema },
  ({ workflow }) => api('/api/workflows/preview', workflow),
  true,
);
tool(
  'create_workflow',
  'Execute a user-authorized storyboard: generate reference images, generate dependent video shots, optionally concatenate an MP4. Read every selected model guide first. Paid generation begins immediately. Reuse idempotencyKey on network retries.',
  { workflow: workflowSchema, idempotencyKey: z.string().min(1) },
  ({ workflow, idempotencyKey }) => api('/api/workflows', workflow, idempotencyKey),
);
tool(
  'get_workflow',
  'Read storyboard progress, child job IDs and final video URL.',
  { id: z.string() },
  ({ id }) => api('/api/workflows/' + encodeURIComponent(id)),
  true,
);
tool(
  'compose_clips',
  'Join existing local MP4 outputs in order without paying to generate them again. Use this after revising an individual shot. Returns a workflow ID; poll get_workflow.',
  { composition: compositionSchema, idempotencyKey: z.string().min(1) },
  ({ composition, idempotencyKey }) => api('/api/compose', composition, idempotencyKey),
);
tool(
  'list_jobs',
  'List recent generation jobs and workflows to recover existing work before submitting new work.',
  {},
  async () => ({ ...(await api('/api/jobs')), ...(await api('/api/workflows')) }),
  true,
);
server.registerPrompt(
  'storyboard',
  {
    description: 'Turn an intern’s story into a reference-consistent social video workflow.',
    argsSchema: { idea: z.string(), model: z.enum(['seedance', 'minimax', 'veo']).optional() },
  },
  async ({ idea, model = 'seedance' }) => {
    const [video, image] = await Promise.all([
      api('/api/guides/' + model),
      api('/api/guides/flare'),
    ]);
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create a social-video storyboard from this idea: ${idea}\nUse 9:16 unless requested otherwise. Preserve the creative intent. Plan a hook, action and payoff, generate a reusable Flare reference, and keep identity consistent across shots. Use @step:ID references in an ordered workflow. Read the following model guides, call preview_workflow, then execute only within the user's generation authorization. Inspect the final outputs before claiming visual quality.\n\n${image.content}\n\n${video.content}`,
          },
        },
      ],
    };
  },
);
server.connect(new StdioServerTransport()).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
