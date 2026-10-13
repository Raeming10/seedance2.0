const $ = (id) => document.getElementById(id);
const state = {
  models: [],
  assets: [],
  history: '',
  guideVersion: 0,
  busy: false,
  workflowKey: null,
  jobKey: null,
};
const modes = {
  text: '文字生成',
  edit: '参考图编辑',
  image: '首帧生视频',
  frames: '首尾帧',
  reference: '多模态参考',
};
const statuses = {
  pending: '等待提交',
  preparing: '准备素材',
  submitting: '提交中',
  queued: '供应商排队',
  running: '生成中',
  downloading: '保存成片',
  composing: '合成中',
  completed: '已完成',
  failed: '失败',
  unknown: '待核对提交',
  paused: '等待恢复',
};
function toast(message, error = false) {
  $('toast').textContent = message;
  $('toast').className = 'toast' + (error ? ' error' : '');
  clearTimeout(state.toast);
  state.toast = setTimeout(() => $('toast').classList.add('hidden'), error ? 14000 : 5000);
}
async function api(route, data, key) {
  const res = await fetch(route, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (res.status === 401) $('login').classList.remove('hidden');
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out;
}
const selected = () => state.models.find((m) => m.id === $('model').value);
function options(id, values, labels = {}, preferred) {
  const select = $(id),
    current = preferred || select.value;
  select.replaceChildren(...values.map((v) => new Option(labels[v] || v, v)));
  if (values.includes(current)) select.value = current;
}
async function updateModel() {
  const m = selected();
  if (!m) return;
  options('mode', m.modes, modes, m.defaultMode);
  options('ratio', [...m.ratios, ...(m.kind === 'image' ? ['custom'] : [])], { custom: '自定义…' });
  options(
    'resolution',
    m.resolutions,
    { '2k': '2K · 长边约 2048', '768p': '768P · 原生' },
    m.resolutions[0],
  );
  $('durationField').classList.toggle('hidden', m.kind === 'image');
  $('audioField').classList.toggle('hidden', m.kind === 'image');
  options(
    'duration',
    (m.durations || []).map(String),
    Object.fromEntries((m.durations || []).map((d) => [d, d + ' 秒'])),
    m.id === 'veo' ? '8' : '5',
  );
  $('modelNote').textContent = m.note;
  state.assets = [];
  updateMode();
  updateDuration();
  const version = ++state.guideVersion;
  const g = await api('/api/guides/' + m.id);
  if (version === state.guideVersion) $('guide').textContent = g.content;
}
function updateDuration() {
  const m = selected();
  if (!m) return;
  const fixed =
    m.id === 'veo' && ($('resolution').value !== '720p' || $('mode').value === 'reference');
  if (fixed) $('duration').value = '8';
  $('duration').disabled = fixed;
  $('customRatioField').classList.toggle('hidden', $('ratio').value !== 'custom');
}
function updateMode() {
  const mode = $('mode').value,
    m = selected();
  $('referenceSection').classList.toggle('hidden', mode === 'text');
  $('referenceHelp').textContent =
    mode === 'frames'
      ? '按顺序添加首帧、尾帧，各一张图片。'
      : mode === 'image'
        ? '添加一张图片作为起始画面。MiniMax 会沿用图片比例。'
        : m.id === 'veo'
          ? '最多 3 张主体参考图；不与首尾帧混用。'
          : mode === 'edit'
            ? '最多 16 张图片；在提示词里说明需要改变和保留的内容。'
            : '图片 / 视频 / 音频按各自上传顺序编号。请在提示词中注明用途。';
  const imageOnly = m.kind === 'image' || m.id === 'veo' || mode !== 'reference';
  $('files').accept = imageOnly
    ? 'image/png,image/jpeg,image/webp'
    : 'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav';
  options('urlType', imageOnly ? ['image'] : ['image', 'video', 'audio'], {
    image: '图片',
    video: '视频',
    audio: '音频',
  });
  renderAssets();
  updateDuration();
}
function renderAssets() {
  $('estimate').classList.add('hidden');
  $('assets').replaceChildren();
  const counts = { image: 0, video: 0, audio: 0 };
  state.assets.forEach((a, i) => {
    const box = document.createElement('div');
    box.className = 'asset';
    if (a.kind === 'image') {
      const img = document.createElement('img');
      img.src = a.url;
      img.alt = a.name;
      box.append(img);
    }
    const label = document.createElement('span');
    const index = ++counts[a.kind];
    label.textContent =
      $('mode').value === 'frames'
        ? i
          ? '尾帧'
          : '首帧'
        : `${a.kind === 'image' ? 'Image' : a.kind === 'video' ? 'Video' : 'Audio'} ${index}`;
    const name = document.createElement('span');
    name.textContent = a.name;
    name.title = a.name;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.ariaLabel = '移除 ' + a.name;
    remove.onclick = () => {
      state.assets.splice(i, 1);
      renderAssets();
    };
    box.append(label, name, remove);
    $('assets').append(box);
  });
}
function request() {
  const m = selected(),
    mode = $('mode').value;
  const r = {
    model: m.id,
    mode,
    prompt: $('prompt').value,
    aspectRatio: $('ratio').value === 'custom' ? $('customRatio').value : $('ratio').value,
    resolution: $('resolution').value,
  };
  if (m.kind === 'video') {
    r.duration = Number($('duration').value);
    r.audio = $('audio').checked;
  }
  if (['image', 'frames'].includes(mode)) {
    if (
      state.assets.some((a) => a.kind !== 'image') ||
      state.assets.length !== (mode === 'frames' ? 2 : 1)
    )
      throw new Error(
        mode === 'frames' ? '请添加两张图片：首帧、尾帧。' : '请只添加一张首帧图片。',
      );
    r.firstFrame = state.assets[0]?.url;
    if (mode === 'frames') r.lastFrame = state.assets[1]?.url;
  } else if (['edit', 'reference'].includes(mode))
    for (const [kind, key] of [
      ['image', 'images'],
      ['video', 'videos'],
      ['audio', 'audios'],
    ])
      r[key] = state.assets.filter((a) => a.kind === kind).map((a) => a.url);
  return r;
}
function showEstimate(id, value, workflow = false) {
  $(id).classList.remove('hidden');
  $(id).textContent = workflow
    ? `已知视频费用约 $${value.knownUsd.toFixed(2)}${value.unpricedSteps.length ? `，另有 ${value.unpricedSteps.length} 个步骤按供应商实际用量计费` : ''}。最终账单以供应商为准。`
    : value.usd === null
      ? '此模型按供应商实际用量计费，当前没有固定报价。参数校验通过。'
      : `预计约 $${value.usd.toFixed(2)} / 次。实际费用以供应商账单为准。`;
}
function bind(id, fn) {
  $(id).addEventListener('click', async () => {
    const b = $(id);
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(e.message, true);
    } finally {
      b.disabled = false;
    }
  });
}
$('model').onchange = () => updateModel().catch((e) => toast(e.message, true));
$('mode').onchange = () => {
  state.assets = [];
  updateMode();
};
$('resolution').onchange = updateDuration;
$('ratio').onchange = updateDuration;
$('files').onchange = async (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  $('generate').disabled = true;
  try {
    for (const file of files) {
      toast('上传素材…');
      const res = await fetch('/api/assets?filename=' + encodeURIComponent(file.name), {
        method: 'POST',
        body: file,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      state.assets.push({ url: result.url, kind: file.type.split('/')[0], name: file.name });
      renderAssets();
    }
    toast('素材已保存。');
  } catch (e) {
    toast(e.message, true);
  } finally {
    $('generate').disabled = false;
  }
};
bind('addUrl', () => {
  const u = new URL($('referenceUrl').value);
  if (u.protocol !== 'https:' || u.username || u.password)
    throw new Error('请输入不含凭据的 HTTPS 链接。');
  state.assets.push({
    url: u.href,
    kind: $('urlType').value,
    name: u.pathname.split('/').pop() || u.hostname,
  });
  $('referenceUrl').value = '';
  renderAssets();
});
bind('preview', async () => {
  const r = request(),
    p = await api('/api/preview', r);
  if (JSON.stringify(request()) === JSON.stringify(r)) showEstimate('estimate', p.estimate);
});
bind('generate', async () => {
  const r = request();
  showEstimate('estimate', (await api('/api/preview', r)).estimate);
  const signature = JSON.stringify(r);
  if (state.jobSignature !== signature) {
    state.jobKey = crypto.randomUUID();
    state.jobSignature = signature;
  }
  const job = await api('/api/jobs', r, state.jobKey);
  state.jobSignature = null;
  toast('生成任务已保存，关闭网页后仍会继续。');
  await refresh();
});
function workflowInput() {
  try {
    return JSON.parse($('workflowJson').value);
  } catch {
    throw new Error('请载入或粘贴有效的工作流 JSON。');
  }
}
function renderStoryboard(manifest) {
  $('storyboard').replaceChildren();
  manifest.steps.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'shot';
    const n = document.createElement('span');
    n.textContent = String(i + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = s.id + ' · ' + s.request.model;
    const p = document.createElement('p');
    p.textContent = s.request.prompt;
    item.append(n, name, p);
    $('storyboard').append(item);
  });
}
bind('sampleWorkflow', async () => {
  const w = await api('/api/example');
  $('workflowJson').value = JSON.stringify(w, null, 2);
  renderStoryboard(w);
});
$('workflowFile').onchange = async (e) => {
  try {
    const w = JSON.parse(await e.target.files[0].text());
    $('workflowJson').value = JSON.stringify(w, null, 2);
    renderStoryboard(w);
  } catch {
    toast('无法读取工作流 JSON。', true);
  }
  e.target.value = '';
};
bind('previewWorkflow', async () => {
  const p = await api('/api/workflows/preview', workflowInput());
  renderStoryboard(p.manifest);
  showEstimate('workflowEstimate', p.estimate, true);
});
bind('runWorkflow', async () => {
  const input = workflowInput(),
    p = await api('/api/workflows/preview', input);
  renderStoryboard(p.manifest);
  showEstimate('workflowEstimate', p.estimate, true);
  const signature = JSON.stringify(input);
  if (state.workflowSignature !== signature) {
    state.workflowKey = crypto.randomUUID();
    state.workflowSignature = signature;
  }
  await api('/api/workflows', input, state.workflowKey);
  state.workflowSignature = null;
  toast('工作流已启动。参考图、镜头和成片将依次出现。');
  await refresh();
});
bind('copyPrompt', async () => {
  await navigator.clipboard.writeText($('agentPrompt').textContent);
  toast('已复制创作指令。');
});
for (const button of document.querySelectorAll('[data-tab]'))
  button.onclick = () => {
    document
      .querySelectorAll('[data-tab]')
      .forEach((b) => b.classList.toggle('active', b === button));
    document
      .querySelectorAll('.tab-content')
      .forEach((c) => c.classList.toggle('hidden', c.id !== button.dataset.tab + 'Tab'));
  };
function safeOutput(url) {
  return /^\/(outputs|assets)\/[a-zA-Z0-9_-]+\.(mp4|png|jpg|webp|jpeg)$/.test(url);
}
function recordCard(record) {
  const card = document.createElement('article');
  card.className = 'record';
  const top = document.createElement('div');
  top.className = 'record-top';
  const title = document.createElement('div'),
    h = document.createElement('h3');
  h.textContent =
    record.type === 'workflow'
      ? record.name
      : state.models.find((m) => m.id === record.model)?.name || '生成素材';
  const id = document.createElement('span');
  id.className = 'record-id';
  id.textContent = record.id;
  title.append(h, id);
  const status = document.createElement('span');
  status.className = 'status ' + record.status;
  status.textContent = statuses[record.status] || record.status;
  top.append(title, status);
  card.append(top);
  if (record.steps) {
    const progress = document.createElement('div');
    progress.className = 'record-progress';
    progress.textContent = record.steps
      .map((s) => s.id + ' · ' + (statuses[s.status] || s.status))
      .join(' → ');
    card.append(progress);
  }
  for (const output of record.outputs || []) {
    if (!safeOutput(output.url)) continue;
    const media = document.createElement(output.kind === 'image' ? 'img' : 'video');
    media.src = output.url;
    if (output.kind === 'image') {
      media.alt = '生成的参考图';
      media.loading = 'lazy';
    } else {
      media.controls = true;
      media.preload = 'metadata';
    }
    card.append(media);
    const links = document.createElement('div');
    links.className = 'record-footer';
    const download = document.createElement('a');
    download.href = output.url;
    download.download = '';
    download.textContent = '下载 ' + (output.kind === 'image' ? '图片' : '视频');
    links.append(download);
    if (output.kind === 'image') {
      const use = document.createElement('button');
      use.className = 'small-button';
      use.textContent = '用作视频首帧';
      use.onclick = async () => {
        $('model').value = 'minimax';
        await updateModel();
        $('mode').value = 'image';
        state.assets = [{ url: output.url, kind: 'image', name: '已生成参考图' }];
        updateMode();
        document.querySelector('[data-tab="create"]').click();
      };
      links.append(use);
    }
    card.append(links);
  }
  if (record.error || record.pollError) {
    const error = document.createElement('div');
    error.className = 'record-error';
    error.textContent = record.error || record.pollError;
    card.append(error);
  }
  if (record.status === 'paused' && record.type === 'job') {
    const resume = document.createElement('button');
    resume.className = 'small-button';
    resume.textContent = '恢复查询 / 下载';
    resume.onclick = async () => {
      try {
        await api('/api/jobs/' + record.id + '/resume', {});
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
    card.append(resume);
  }
  return card;
}
async function refresh() {
  const [jobs, workflows] = await Promise.all([api('/api/jobs'), api('/api/workflows')]);
  const all = [...workflows.workflows, ...jobs.jobs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  // Exclude changing timestamps so a poll never interrupts playing video.
  const visible = all.map(
    ({ type, id, name, model, status, outputs, steps, error, pollError }) => ({
      type,
      id,
      name,
      model,
      status,
      outputs,
      steps,
      error,
      pollError,
    }),
  );
  const signature = JSON.stringify(visible);
  if (signature === state.history) return;
  state.history = signature;
  if (all.length) $('records').replaceChildren(...visible.map(recordCard));
}
bind('refresh', refresh);
bind('loginButton', async () => {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + $('accessToken').value },
  });
  if (!res.ok) throw new Error('访问令牌不正确。');
  $('accessToken').value = '';
  $('login').classList.add('hidden');
  await init();
});
async function init() {
  const [health, catalog] = await Promise.all([api('/api/health'), api('/api/models')]);
  $('health').replaceChildren(
    ...[
      ['fal', health.fal],
      ['Google', health.google],
      ['FFmpeg', health.ffmpeg],
    ].map(([label, ready]) => {
      const s = document.createElement('span');
      s.textContent = label + (ready ? ' 已配置' : ' 未配置');
      if (!ready) s.className = 'missing';
      return s;
    }),
  );
  state.models = catalog.models;
  options(
    'model',
    state.models.map((m) => m.id),
    Object.fromEntries(state.models.map((m) => [m.id, m.name])),
    'minimax',
  );
  await updateModel();
  await refresh();
}
init().catch((e) => toast(e.message, true));
for (const type of ['input', 'change'])
  $('createTab').addEventListener(type, () => $('estimate').classList.add('hidden'));
$('workflowJson').addEventListener('input', () => {
  $('workflowEstimate').classList.add('hidden');
  $('storyboard').replaceChildren();
});
setInterval(() => {
  if (!document.hidden) refresh().catch(() => {});
}, 5000);
