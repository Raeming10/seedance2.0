const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { createStudio } = require('../server');
test(
  'real MCP stdio handshake exposes tools, guides, previews and storyboard prompt',
  { timeout: 15000 },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-mcp-'));
    const studio = createStudio({ dataDir: root, ffmpeg: true });
    studio.server.listen(0, '127.0.0.1');
    await once(studio.server, 'listening');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve(__dirname, '../mcp.js')],
      env: {
        ...process.env,
        STUDIO_URL: `http://127.0.0.1:${studio.server.address().port}`,
        STUDIO_API_TOKEN: '',
        FAL_KEY: '',
        GOOGLE_GENERATIVE_AI_API_KEY: '',
      },
    });
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    t.after(async () => {
      await client.close();
      await new Promise((r) => studio.server.close(r));
      fs.rmSync(root, { recursive: true, force: true });
    });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === 'create_workflow'));
    assert.ok(tools.tools.some((t) => t.name === 'preview_composition'));
    assert.ok(tools.tools.some((t) => t.name === 'inspect_video'));
    const guide = await client.callTool({ name: 'get_prompt_guide', arguments: { model: 'veo' } });
    assert.match(guide.content[0].text, /ai.google.dev/);
    const directing = await client.callTool({
      name: 'get_prompt_guide',
      arguments: { model: 'directing' },
    });
    assert.equal(directing.isError, undefined);
    assert.match(directing.content[0].text, /Directing social videos/);
    const preview = await client.callTool({
      name: 'preview_generation',
      arguments: { request: { model: 'flare', prompt: 'Cup' } },
    });
    assert.equal(preview.isError, undefined);
    assert.equal(JSON.parse(preview.content[0].text).request.resolution, '2k');
    const story = await client.getPrompt({
      name: 'storyboard',
      arguments: { idea: 'A robot waters a flower', model: 'minimax' },
    });
    assert.match(story.messages[0].content.text, /reference_image_urls/);
    assert.match(story.messages[0].content.text, /Flare/);
    assert.equal(studio.engine.jobs.size, 0);
  },
);
