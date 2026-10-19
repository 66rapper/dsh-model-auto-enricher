# dsh-model-auto-enricher（DSH 模型补齐助手）

中文说明 | [English](./README.md)

**模型补齐助手（`dsh-model-auto-enricher`）** 是一款专为 DeepSeek Harness (`dsh`) 打造的全自动模型规格增强插件：一键（或在后台全自动）为 `cordis.patch.yml` 中的所有模型渠道补齐 **100 万长上下文（`contextWindow: 1000000`）**、**最大输出（`maxTokens: 64000 / 128000`）**、**多模态发图支持（`input: [text, image]`）** 与 **深度思考强度档位（`reasoningEfforts: { low, high, max }`）**。

---

## ✨ 核心特性（v2.0）

1. **⚡ 新增模型保存即自动补齐（Auto-Watch & Live Reload）**：
   - 宿主端自动监听 `settings/document-updated` 与 `app-boot/config-reload` 事件。
   - 当你在 DSH **「设置 → 模型」** 中添加完任何新模型并点击「应用」后，插件会在后台自动完成备份、补齐规格并触发 `hmr.reconcileProfile()` 热重载，无需重启 DSH、甚至无需手动点击补齐按钮。
2. **🧠 全系列代际识别 + 通用新模型全量兜底（彻底解决新模型「不认识、不优化」）**：
   - 内置覆盖 **Gemini**、**Claude（4 / 4.5 / 4.6 / 5 / 5.5+ / Opus / Sonnet）**、**DeepSeek（V3 / V4 / V4.1 / R1 / R2）**、**GLM（5 / 5.2 / 5.3 / Z1）**、**Kimi（K2.6 / K2.7 / K2.8 / K3）**、**GPT（GPT-4o / GPT-5 / GPT-6 / o1~o9 / Codex）**、**腾讯混元（Hy3 / Hy4）** 以及 **主流大模型（MiniMax / Step / Qwen / Grok / 豆包 / Llama / Mistral）**。
   - **通用新模型全量兜底（`FALLBACK_SERIES_RULE`）**：任何未命中已知系列正则的全新模型或中转站内部代号模型（如 `space-bunny`、`argon`、`astra`、`sol` 或未来新发布的模型），一律自动按旗舰规格补齐：`1,000,000` 上下文 + `64,000` 最大输出 + `[text, image]` 多模态发图 + `{ low, high, max }` 思考档位。
   - **残缺思考档位自动补全**：凡已开启部分思考档位（例如设置页默认生成的 `{ off, low, medium, high }` 缺 `max`，或 `{ max, xhigh, medium, low }` 缺 `high`）的模型，自动补齐 `{ low, high, max }` 并 100% 保留原有自定义档位。
3. **🛡️ 硬性安全保证**：
   - **只升不降**：已有更大的 `contextWindow` / `maxTokens` 绝不回退；已有自定义思考档位（`off`、`medium`、`xhigh`）与已有模态绝不删减。
   - **写前必备份**：每次真实写入前自动生成 `cordis.patch.yml.bak-auto-enrich-YYYYMMDD-HHmmss` 时间戳备份。
   - **严格幂等**：所有模型已是最佳状态时执行 0 写入、0 备份。
4. **🖥️ 可视化设置面板（`设置 → 模型补齐助手`）**：
   - 直观展示健康状态、渠道/模型计数、自动监听开关状态、一键智能补齐按钮、变更前后对比日志以及带系列识别标签的模型明细表。

---

## 📦 安装方式

```sh
dsh plugin --profile desktop add 66rapper/dsh-model-auto-enricher
```

或针对 `web` profile：

```sh
dsh plugin --profile web add 66rapper/dsh-model-auto-enricher
```

---

## 📄 开源协议

[MIT](./LICENSE)
