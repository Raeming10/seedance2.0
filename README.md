# Seedance Studio

面向 AI agent 的社媒视频工具。实习生在 Codex 对话中描述剧情，agent 读取模型指南、制作参考图、执行分镜并合成 MP4。网页用于查看进度、预览结果，也保留手动素材工具。故事推理发生在你的 AI 客户端中；本项目不另外调用文本大模型，也不需要额外的文本模型 Key。

## 实习生：同步项目后，直接与 Codex 对话

1. 同步仓库，在 Codex App 中选择这个本地项目文件夹，再新建聊天。普通的、未关联项目的聊天不会自动获得这个仓库。
2. 首次在本机 `.env` 配置自己的 `FAL_KEY`；使用 Veo 时另外配置 `GOOGLE_GENERATIVE_AI_API_KEY`。密钥不随 GitHub 同步，已有 `.env` 不要覆盖。共享服务成员使用管理员提供的服务地址与访问令牌。
3. 描述想做的视频即可。`AGENTS.md` 指引 Codex 检查依赖、启动服务、读取模型指南、自动写入并提交分镜任务、查询进度和交付成片。本机需要 Node.js 22+，合成还需要 FFmpeg；可以让 Codex 协助安装。

可以直接说：

> 请用这个项目制作一支 10 秒、9:16 的咖啡杯社媒短片：清晨，一只蓝色陶瓷杯冒着热气，最后一只手端起杯子。用 Seedance 2.0、720p。请读取 AGENTS.md，检查环境并启动服务，按模型指南制作参考图和两个镜头，完成生成与合成，把成片给我。

这条指令会执行付费生成。只想讨论创意时，可以说“先只给我分镜和费用估算”。后续也可以直接说“第二个镜头改为缓慢推进，其他镜头沿用”。

**不需要手动导入 JSON，也不需要给 Codex 额外配置 MCP。** JSON 是 AI 与工具之间的任务清单，记录镜头顺序、素材依赖、参数和合成方式；Codex 自己写到 `.studio/plans/`，自己通过 CLI 提交。人看的是剧情、分镜和结果。网页里的 JSON 导入默认折叠，只用于高级调试或手动复用任务。

## 本地手动启动（也可交给 Codex）

需要 Node.js 22+。合成和静音需要 FFmpeg（包含 ffprobe）。

```sh
npm ci
cp .env.example .env
# 编辑 .env，填入 FAL_KEY；Google Veo 另外需要 GOOGLE_GENERATIVE_AI_API_KEY
npm start
```

已有 `.env` 时不要覆盖，直接补充缺少的字段。打开 http://127.0.0.1:8000。

- macOS 安装 FFmpeg：`brew install ffmpeg`
- Ubuntu / Debian：`sudo apt-get install ffmpeg`
- Windows：安装 FFmpeg 并把其 `bin` 目录加入 PATH，或者设置 `FFMPEG_PATH`、`FFPROBE_PATH`。
- 只有 fal Key 时即可使用 Flare、Seedance、MiniMax。Google 是独立的官方 Gemini API。
- 所有密钥只在服务端读取，网页不会获取密钥；不要提交 `.env`。

## AI 如何执行制作

以下是供 agent 和开发者参考的命令，不需要实习生逐条操作。Codex 在有项目访问和命令执行权限时，可以直接调用 `node cli.js`，无需点网页。

```sh
node cli.js models
node cli.js guide seedance
node cli.js preview-workflow examples/social-video.json
# 下一条会实际生成，并产生供应商费用
node cli.js workflow examples/social-video.json --key coffee-v1 --wait
```

每个工作流步骤有自己的任务 ID。生成图通过 `@step:hero` 自动传给后面的步骤。关闭浏览器不影响任务，服务器需要保持运行。正常重启会继续查询已提交任务和下载结果。

可只重做有问题的镜头，再通过 `compose_clips` MCP 工具或 `node cli.js compose composition.json --key edit-v2 --wait` 重新拼接现有镜头，不必重新生成整个工作流：

```json
{
  "name": "Revised film",
  "clips": ["/outputs/EXISTING-SHOT-1.mp4", "/outputs/REVISED-SHOT-2.mp4"],
  "aspectRatio": "9:16",
  "resolution": "1080p"
}
```

拼接会统一画幅、帧率、音轨，保留原镜头声音；缺失声音的镜头补静音。不同画幅使用留边适配，不裁掉主体。不会自动添加字幕、转场或背景音乐。低分辨率素材选择较高交付档只会缩放，不会增加真实细节。

## 可选：MCP 连接

Codex 在本地项目中使用 CLI 即可。若要通过 MCP 工具调用，先运行服务器，再把下列配置加入支持 stdio MCP 的 AI 客户端。将路径替换为实习生自己的绝对路径：

```json
{
  "mcpServers": {
    "seedance-studio": {
      "command": "node",
      "args": ["/absolute/path/to/seedance2/mcp.js"],
      "env": { "STUDIO_URL": "http://127.0.0.1:8000" }
    }
  }
}
```

工具包括模型发现、官方指南摘要、本地素材上传、费用预览、生成、工作流、任务查询和镜头拼接。`storyboard` MCP prompt 会把图像和所选视频模型的指南一起提供给 agent。各客户端的配置文件格式可能不同，核心设置都是 `node` + `mcp.js` 的绝对路径。

指南放在 `docs/guides/`，包含核对日期、官方来源、适用模式和本项目建议。网页、MCP、CLI 共用这些文件。指南不是偷偷追加到视频提示词的冗长文本：agent 应先阅读，再按模型习惯写提示词。无法强制任何第三方 agent 阅读文档，`AGENTS.md`、工具描述和 MCP prompt 会明确引导它执行这一步。

## 模型选择

| 模型                | 接入                   | 本项目支持                              | 分辨率                              |
| ------------------- | ---------------------- | --------------------------------------- | ----------------------------------- |
| GPT Image 2.5 Flare | fal                    | 文生图、参考图编辑，固定 medium         | 长边约 2048px；多种比例及自定义比例 |
| Seedance 2.0        | fal                    | 文生视频、首帧、首尾帧、多模态参考      | 720p / 1080p                        |
| MiniMax H3          | fal                    | 首帧、首尾帧、图片/视频/音频参考        | 原生 768P                           |
| Veo 3.1             | Google Gemini 官方 API | 文生视频、首帧、首尾帧、最多 3 张参考图 | 默认原生 1080p，也可选 720p         |

Veo 固定模型 ID：`veo-3.1-generate-preview`。Google 没有原生 2K 参数，因此本项目默认直接生成 1080p，仅开放 720p / 1080p。参考图、1080p 都要求 8 秒，标准版约 $3.20 / 8 秒。带声音的原生输出无需 FFmpeg，合成与静音仍需要。

Seedance 2.5 没有替换 2.0：同档 720p 更贵。最新 fal schema 已支持 1080p；本项目保留 2.0 的主要依据是短社媒内容的迭代成本。详细比较及来源见 [模型核对记录](docs/MODELS.md)。MiniMax 768P 的费用更低，可用于预算敏感的试稿；这里没有声称不同模型生成质量等同。

## 实习生协作：两种方式

**小团队起步：GitHub + 每人本地运行。** 每人自己的 fal Key、额度和素材互相独立。升级后执行 `git pull` 和 `npm ci`，再重启服务。无需 BytePlus Key、`config.local.js` 或 Cloudflare 隧道。

**团队长期使用：一台共享 Studio + Codex CLI / MCP 客户端。** 管理员在服务器配置 fal / Google Key、持久磁盘和 HTTPS；实习生在本地项目的 `.env` 设置 `STUDIO_URL`、`STUDIO_API_TOKEN`，由 Codex 使用 CLI 连接，也可选用 MCP。他们不需要拿到供应商 Key 或启动本地服务器。已提供 Dockerfile 和 Compose 模板：

```sh
# 在服务器 .env 里填写供应商 Key 和足够随机的 STUDIO_API_TOKEN
# 可用 node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 生成访问令牌
# HTTPS 反向代理后设置 COOKIE_SECURE=true
# 以下启动命令需要本机已安装 Docker

docker compose up --build -d
```

容器内安装 FFmpeg；`studio-data` 卷保存任务和输出；端口默认仅映射到宿主机 127.0.0.1。给远程同事使用时，在前面配置 HTTPS 反向代理或团队私网入口。项目不会自动创建公网隧道。

共享版目前是**可信团队共用的一个工作室**：同一访问令牌可看见全部任务，没有成员级权限、个人费用上限或账户隔离。不把这版直接当作多租户 SaaS。若要精确管理每个实习生的成本，先使用独立 Key / 独立部署，或后续接入团队身份和预算账本。

## 任务、费用与恢复

- `.studio/plans/` 保存 AI 编写的分镜任务清单；`.studio/records/` 持久化任务；`.studio/assets/` 保存上传；`.studio/outputs/` 保存生成结果与成片。备份整个 `.studio/`。
- 每个任务必须有 `Idempotency-Key`。网络重试沿用同一个 Key，防止重复生成；不同参数必须换新 Key。
- `unknown`：提交时网络中断，不能确认供应商是否已受理。先查供应商控制台，不能盲目重发。
- `paused`：重复查询或下载失败；使用 `resume_job` 或 `node cli.js resume ID` 恢复，不重新生成。
- `failed`：错误记录保留；工作流会停止后续步骤，避免继续消耗额度。修正后只重新生成受影响的素材。
- 费用是估算，不是账单承诺。Flare 按实际输入输出使用量计费，未填写虚构固定价格。包含参考视频的 Seedance 也会显示价格未确定。
- 只运行一个服务进程管理同一份数据目录；不要在同一卷启动多个副本。

原有 `.outputs/`、`.uploads/` 和浏览器旧历史没有删除。新版本使用新的持久任务目录，旧网页的 localStorage 历史不自动迁移。旧模型代理、一次性补丁脚本及前端密钥配置不再使用。

## 开发与验证

```sh
npm test
npm run format:check
```

测试覆盖模型参数、任务恢复/去重、分镜依赖、真实 MCP stdio 握手、HTTP 密钥隔离、媒体上传和 Range 播放。安装 FFmpeg 时还验证声音/静音片段混合拼接，以及 Veo 静音交付保持原生 1080p 尺寸；未安装时这两项会跳过。自动测试使用模拟供应商，不产生模型费用。

实现见 `lib/catalog.js`、`lib/providers.js`、`lib/engine.js`、`lib/media.js`；[HTTP API 说明](docs/API.md)。
