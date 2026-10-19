# ⚡ DSH 模型补齐助手（dsh-model-auto-enricher）

**让你在 DeepSeek Harness (DSH) 里添加的任何第三方/中转站模型，自动拥有「100 万长上下文 + 发图能力 + 思考强度档位（low / high / max）」！**

---

## 🤔 为什么需要这个插件？（解决三大痛点）

在 DSH 的「设置 → 模型」里添加中转站或自定义 API 模型时，默认配置经常会遇到三个让人头疼的问题：

| 痛点 | 默认现象 | 本插件自动帮你做什么 |
|---|---|---|
| **1. 上下文被截断或缺失** | 默认没填，或者被中转站截断在 `128k` / `200k` / `256k`，聊几句长代码就爆上下文 | 自动拉满到 **100 万长上下文（`1,000,000`）** |
| **2. 不能发图片 / 识图** | 新加的模型默认只有纯文本（`text`），聊天框里发不出截图 | 自动开启 **多模态图片输入（`[text, image]`）** |
| **3. 没有思考强度调节档位** | 没配 `reasoningEfforts`，或者开关默认只开了 `low/medium/high` 缺少最高 `max` 档 | 自动配齐 **`{ low, high, max }` 思考强度档位**（并保留你原有的自定义档位） |

---

## ✨ 核心亮点（v2.0 中文友好 · 全自动版）

1. **⚡ 添加新模型保存即自动生效（无需手动点按钮、无需重启 DSH）**
   - 插件在后台自动监听 DSH 的模型设置保存事件。
   - 只要你在 **「设置 → 模型」** 里添加了新模型并点击「应用」，插件会在 **0.6 秒内自动在后台帮你把百万上下文、64k+ 最大输出、发图支持、思考档位全部补齐**，并立即热重载生效！
2. **🧠 认识所有新模型（内置全系列规则 + 通用新模型兜底）**
   - 不仅完整识别 **GPT-4o / GPT-5 / GPT-6 / o1~o9 / Codex**、**Claude 4 / 4.5 / 4.6 / 5 / 5.5+ (Opus / Sonnet)**、**Gemini 2.5 / 3 / 3.5 / 4**、**DeepSeek V3 / V4 / V4.1 / R1 / R2**、**GLM 5 / 5.2 / 5.3 / Z1**、**Kimi K2.6 / K2.7 / K2.8 / K3**、**腾讯混元 Hy3 / Hy4**、**MiniMax / Step / Qwen / Grok / 豆包 / Llama / Mistral** 等全系模型；
   - **哪怕是你以后新加的、名字从来没见过的全新模型或内部代号模型**（如 `space-bunny`、`argon`、`astra`、`sol` 等），也会自动触发**「通用新模型规则」**，默认按顶配规格（`1M 上下文 + 64k 最大输出 + 支持发图 + low/high/max 思考档位`）一步到位补齐！
3. **🛡️ 100% 安全，只升不降，写前自动备份**
   - **只升不降**：如果你某个模型已经设了更大的上下文或更大的输出（如 `128000`），绝不会给你改小；已有的自定义思考档位（如 `off`、`medium`、`xhigh`）一律原样保留。
   - **自动备份**：每次修改配置文件前，都会自动在同目录生成带时间戳的备份文件（`cordis.patch.yml.bak-auto-enrich-YYYYMMDD-HHmmss`）。
   - **严格幂等**：所有模型已经是最佳状态时，不会改动任何字节，也不会产生多余备份。
4. **🖥️ 内置可视化管理面板（设置 → 模型补齐助手）**
   - 在 DSH 设置页左侧导航栏新增 **「模型补齐助手」** 面板，随时查看所有渠道与模型的健康状态、识别系列标签、上下文容量、多模态与思考档位明细，也支持手动一键补齐。

---

## 📦 一键安装

### 方式一：在 DSH 插件市场（dshmarket）中安装
打开 DSH **设置 → 插件市场**，搜索 **`dsh-model-auto-enricher`** 或 **模型补齐助手**，点击**安装**即可。

### 方式二：命令行一键安装

桌面版（`desktop` profile）：
```sh
dsh plugin --profile desktop add 66rapper/dsh-model-auto-enricher
```

网页版（`web` profile）：
```sh
dsh plugin --profile web add 66rapper/dsh-model-auto-enricher
```

---

## 📊 内置智能补齐规则表（v2.0）

| 模型系列 | 自动识别关键词 | 补齐上下文 (`contextWindow`) | 补齐最大输出 (`maxTokens`) | 模态支持 (`input`) | 思考强度档位 (`reasoningEfforts`) |
|---|---|---:|---:|---|---|
| **Gemini 系列** | `gemini / gemma` | `1,000,000` (1M) | `64,000` | `[text, image]` | 除纯 `lite` / `image` 生图小模型外全系开启 |
| **Claude 系列** | `claude` | `1,000,000` (老款 Claude 2/3 为 `200,000`) | `64,000` | `[text, image]` | `4.5+ / 5+ / opus / sonnet / thinking / high` 全系开启 |
| **DeepSeek 系列** | `deepseek` | `1,000,000` (1M) | `128,000` | `[text, image]` | `v4 / v5 / r1 / r2 / pro / flash / thinking` 全系开启 |
| **GLM 智谱系列** | `glm / chatglm` | `1,000,000` (1M) | `flash` `128,000`；其余 `64,000` | `[text, image]` | `5.2 / 5.3 / 6 / z1 / flash / high` 开启 |
| **Kimi 系列** | `kimi / moonshot` | `k2.6 / k2.7` 为 `256,000`；其余 `1,000,000` | `k2.8 / k3+` 为 `64,000`；其余 `32,000` | `[text, image]` | `k2.8 / k3 / k4 / preview` 开启 |
| **GPT 系列** | `gpt-* / chatgpt / o1~o9 / codex` | `1,000,000` (1M) | `64,000` | `[text, image]` | `gpt-5 / 6 / 7+ / o1~o9 / codex / astra / sol` 开启 |
| **腾讯混元系列** | `hy3 / hy4 / hunyuan` | `hy3` 为 `192,000`；`hy4+` 为 `1,000,000` | `64,000` | `[text, image]` | `hy3 / hy4+ / preview / thinking` 开启 |
| **主流大模型系列** | `minimax / step / qwen / grok / doubao / llama / mistral` | `1,000,000` (1M) | `64,000` | `[text, image]` | `step-5+ / grok-3+ / qwen-3+ / m3+ / thinking` 开启 |
| **🌟 通用新模型规则** | **任何未见过的全新模型 / 内部代号模型（自动兜底）** | **`1,000,000` (1M)** | **`64,000`** | **`[text, image]`** | **默认开启 `{ low, high, max }`** |
| **GPT 开源版** | `gpt-oss` | `128,000` | `64,000` | `[text]`（纯文本） | 不开启 |
| **残缺档位自动补全** | 任何已开启部分思考档位的模型 | 保持原值或拉升 | 保持原值或拉升 | 保持或补齐图片 | 自动补齐缺失的 `{ low, high, max }`，保留原有档位 |

---

## 📄 开源协议

[MIT License](./LICENSE)
