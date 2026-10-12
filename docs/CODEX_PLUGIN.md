# Codex 视频制作插件

Skill 是给 Codex 的任务说明，可以附带指南、脚本和示例。插件是把这些内容组织起来供用户安装的包。本项目插件名为 `social-video`，包含两个 skill：`setup`（配置视频工具）和 `create-video`（制作社媒视频）。它使用 Codex 本身理解剧情，不再调用另一套文本模型。

## 实习生使用

从团队提供的 Codex 插件分享入口安装 **Social Video · 社媒视频制作**，新建一个本地聊天。也可以使用下面的本地安装包流程。插件不依赖聊天的工作目录，不要求先打开源代码仓库。

首次发送：

> 使用 Social Video 的配置技能，帮我准备视频制作环境。检查依赖、启动服务，打开本地配置文件让我补齐 fal Key 和 Google 官方 Veo Key；先不要生成付费素材。

以后发送：

> 使用 Social Video 制作一支 10 秒的竖屏咖啡广告。清晨，蓝色陶瓷杯冒着热气，最后一只手端起杯子。用 Seedance 2.0、720p，请完成参考图、镜头生成和合成。

也可以在 Codex 的技能选择器里选“配置视频工具”或“制作社媒视频”。插件内技能可能带有 `social-video:` 命名空间，以选择器显示的名字为准。新安装后使用新聊天，以便载入插件。

首次需要 Node.js 22+ 和 npm；合成需要 FFmpeg/ffprobe。配置 skill 会协助检查和安装，但不能越过本机权限。密钥由用户在本地文件中填写；安装插件不附送模型额度，也不会自动验证供应商账户权限。

正常使用不需要 MCP 配置、不需要手动启动服务、不需要写或导入 JSON，也不需要打开网页。网页仍可用于预览。生成任务需要本机保持运行，退出浏览器不影响后台服务；电脑关机后，已提交任务可在下次启动时继续查询。

## 导演与剪辑流程

“制作社媒视频”自动读取导演指南。Codex 会将剧情转成可见动作、比较开场吸引点、安排有叙事目的的景别与运镜，并按题材保留合适的停顿。镜头时长由实际表演决定，生成素材不必整段使用。不会要求实习生另外调用导演技能、填分镜表或导入 JSON。

制作记录保留镜头目的、连续性、素材 ID 和剪辑入点／出点，便于后续只改某个镜头。`inspect` 提供预览帧，Codex 需要实际查看，并在具备工具时播放、听取成片；抽帧不能证明动态和声音质量。`preview-composition` 验证实际素材范围和时间线，`compose` 支持截取、原声音量和独立音轨的位置／淡入淡出。

已有实习生安装的插件不会因 GitHub 更新而自动变成新版。将新版完整插件包交给其 Codex，可以发送：

> 请更新我已安装的 Social Video 插件，优先使用附带的完整安装包；否则获取仓库 https://github.com/Raeming10/seedance2.0 的最新 main，按 docs/CODEX_PLUGIN.md 构建并通过 plugin-creator 的更新流程重装。保留我的两个 API Key、素材和创作记录。运行配置技能切换到新运行时，等待现有任务结束后再重启服务，检查导演指南和剪辑命令。不进行付费生成，最后提醒我新建聊天使用新版。

更新后可直接说：

> 使用 Social Video 实现这段剧情：[剧情]。请用画面表现动作和情绪，设计前三秒的视觉吸引点，根据叙事安排景别、运镜和声音衔接；生成后挑选有效片段并审片交付。预算：[预算]，时长：[时长]。

## 安装包与本地安装

维护者在源代码目录执行：

```sh
npm run plugin:build
```

输出为 `.studio/dist/social-video/`。脚本从明确的文件清单组装完整运行时，不复制 `.env`、历史素材、Git 数据或 node_modules。不要直接分发 `plugins/social-video/` 源码子目录：它尚未包含运行时。再次构建时请传入新的空输出目录：

```sh
npm run plugin:build -- /absolute/empty-output/social-video
```

将构建后的完整 social-video 文件夹交给 Codex，发送：

> 请按 plugin-creator 的个人插件规范安装这个 Social Video 包，并保留我已有的插件和配置。安装后告诉我如何在新聊天中运行配置技能。

若使用 Codex CLI，具体安装流程是：通过 Codex 内置 plugin-creator 脚手架创建个人插件与 marketplace 条目，将构建包复制到该插件位置，再运行 `codex plugin add social-video@个人市场名称`。个人市场名称应由 plugin-creator 的 read_marketplace_name.py 读取，不要假设所有人的名称都相同。默认个人 marketplace 自动发现，无需额外添加仓库级市场。

维护者安装并验证后，可在 Codex 的插件详情中使用分享入口分发给实习生；源代码仍通过 GitHub 维护。这里采用官方仍支持的 `.codex-plugin/plugin.json` 格式。它不依赖生命周期 hook，不改变 Codex 的审批或安全配置，也不需要发布到公共插件目录。

## 本地数据与运行时

默认的持久目录为 `~/.seedance-studio/`，可用 `SEEDANCE_STUDIO_HOME` 指定其他绝对路径：

| 路径                    | 内容                                      |
| ----------------------- | ----------------------------------------- |
| `config.json`           | 当前绑定的运行时位置                      |
| `.env`                  | 用户自己的密钥和端口，首次创建权限为 0600 |
| `runtimes/<bundle-id>/` | 按内容版本区分的代码与依赖                |
| `plans/`                | AI 自动生成的任务文件                     |
| `data/`                 | 持久化任务、参考素材、成片和服务日志      |

升级或重装插件不会覆盖密钥、plans 或 data。新的运行时代码会使用新的目录；已有工作未结束时不自动切换正在运行的服务。配置技能会在任务空闲后重启。旧运行时不自动删除。

需要沿用已有项目的密钥和历史时，配置技能可以运行 `setup --project /absolute/path/to/seedance2`。此时直接使用该项目的 `.env` 和 `.studio`，不复制其密钥。正常插件安装的默认服务端口为 8787，已有项目沿用其原配置。

## 配套命令（由 Codex 调用）

`LAUNCHER` 表示已安装插件内 scripts/studio.js 的绝对路径。不要把开发者电脑路径写进 skill。

```text
node LAUNCHER setup
node LAUNCHER doctor
node LAUNCHER start
node LAUNCHER restart
node LAUNCHER models
node LAUNCHER guide directing
node LAUNCHER guide seedance
node LAUNCHER preview-workflow /absolute/story.json
node LAUNCHER workflow /absolute/story.json --key production-v1
node LAUNCHER workflow-status WORKFLOW_ID
node LAUNCHER inspect /outputs/CLIP.mp4
node LAUNCHER preview-composition /absolute/cut.json
node LAUNCHER compose /absolute/cut.json --key edit-v1
```

普通生成命令先自动检查/启动服务，再转交原有 CLI。相对的素材和任务文件路径以用户当前创作目录为准。`restart` 会检查所有持久化任务并拒绝打断进行中的工作；未知端口或其他工作室的数据目录不会被自动接管。共享服务不可达时不会创建本地替代服务。

`doctor` 只报告配置状态，不输出 Key；`credentialsVerified: false` 明确表示没有执行账户鉴权验证。配置流程和预览不会调用付费生成 API。密钥或端口修改后需要重启本地服务；共享服务由管理员管理。

## 验证与依据

自动测试覆盖独立安装目录、包含空格的路径、后台启动与恢复、跨创作目录调用、配置保留、预览不生成、忙碌任务禁止重启、端口冲突和共享服务断线。Windows 使用固定 npm.cmd 命令启动方式，但开发验证环境为 macOS 和 Linux；Windows 尚未做真实安装验证。

- [Codex skill 说明与调用方式](https://learn.chatgpt.com/docs/build-skills)
- [官方插件打包指南](https://developers.openai.com/plugins/build/plugins)

当前包选择两个可主动调用的 skill，并提供首次配置提示；没有假设安装完成就已填好密钥或获得额外系统权限。
