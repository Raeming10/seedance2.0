# 模型与价格核对

核对日期：2026-10-11。价格可能变化；这里是选型依据，最终以供应商账单为准。没有对两个 Seedance 版本进行付费、同提示词盲测，因此以下结论是基于价格与能力适配的判断，不是宣称某版本的视觉质量绝对更好。

## 为什么保留 Seedance 2.0

| 同供应商 fal 对比        |           Seedance 2.0 | Seedance 2.5 |
| ------------------------ | ---------------------: | -----------: |
| 720p 每 1,000 输出 token |                 $0.014 |      $0.0214 |
| 720p 每秒估算            |                $0.3034 |      $0.4730 |
| 10 秒 720p 估算          |                 $3.034 |       $4.730 |
| 1080p 每秒估算           |                 $0.682 |       $1.164 |
| 文档最高分辨率           | 4K（本项目限制 1080p） |        1080p |
| 单次最长                 |                  15 秒 |        30 秒 |
| 参考文件总数             |                     12 |           50 |

Token 单价 2.5 高约 53%；按 fal 文档的 720p 秒价估算高约 56%。2.5 适合超过 15 秒的连续镜头或大量参考素材。2.5 的 1080p 档使用 $0.0234/千 token，约 $1.164/秒，比 2.0 的 $0.682/秒更高。最新 fal 机器可读 schema 已经增加 1080p（早期对比文章仍写最高 720p，以 schema 为准）。当前以短社媒片段、多次迭代为主，基于成本保留 2.0。不要因为版本号较新就假定更划算。

来源：

- [fal 官方对比](https://fal.ai/learn/devs/seedance-2-5-vs-seedance-2-0)
- [2.0 API](https://fal.ai/models/bytedance/seedance-2.0/text-to-video/api)
- [2.5 API](https://fal.ai/models/bytedance/seedance-2.5/text-to-video/api) · [最新机器可读 schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/text-to-video)
- 只读价格 API `GET https://api.fal.ai/v1/models/pricing?endpoint_id=…` 在核对日返回上述两个 token 单价。

## MiniMax

保留 `minimax/h3`，新增 `minimax/h3/reference-to-video`。接口的参考字段必须带 `reference_` 前缀。图库中模型网页的公开结构化数据列出：768P $0.06/秒；参考模式前 5 张图片免费，此后每张 $0.08。默认 5 秒约 $0.30，不包含未来价格变化。`GET /v1/models/pricing` 的 $0.05/秒是 480P 起步价，不能直接当作 768P 的费用。

官方 fal schema 的分辨率为 480P、768P、2K、4K；2K/4K 是 768P 上采样。按本项目对 fal 视频 720p–1080p 的限制，只开放原生 768P。

[参考模式页面](https://fal.ai/models/minimax/h3/reference-to-video) · [接口 Schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3/reference-to-video)

## Flare

端点为 `openai/gpt-image-2.5/flare/text-to-image` 与 `/edit`，固定 `quality: medium`。fal 允许自定义尺寸：16 的倍数、最大边 3840px、最大比例 3:1、655,360–8,294,400 像素。本项目使用约 2048px 长边，短边按 16px 对齐。图像“2K”与视频“2K/1440p”采用不同常见口径，界面分别注明尺寸。

Flare 的价格随输入、输出与复杂度变化；固定 medium 不意味着固定单价。报价 API 返回的 $1/unit 不是每张图片 $1，因此没有将它误用成图片报价。

[Flare API](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api) · [Flare 编辑](https://fal.ai/models/openai/gpt-image-2.5/flare/edit/api)

## Google 官方 Veo

`veo-3.1-generate-preview` 经 `@google/genai` 直连 Gemini API，不通过 fal。支持最多 3 张参考图，也支持首尾帧；二者不能混用。没有原生 2K 档，2K 交付使用 4K → 1440p 的本地转换。

当前标准版价格：720p/1080p $0.40/秒；4K $0.60/秒。8 秒 2K 交付按 4K 生成计费，约 $4.80。高分辨率、参考图固定 8 秒；模型原生带音频，静音是在本地去音轨，价格不下降。

[Google API 与提示词指南](https://ai.google.dev/gemini-api/docs/veo) · [Google 价格](https://ai.google.dev/gemini-api/docs/pricing#veo-3.1)

## 当前验证边界

fal 价格 API 已通过现有 Key 的只读鉴权。模型参数核对官方 schema；自动化测试使用模拟供应商。没有为测试发起付费视频生成。开发机器到 Google API 的 TLS 连接中断，尚不能确认所提供 Key 的 Veo 权限或完成 Google 的端到端生成。
