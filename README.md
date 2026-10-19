# dsh-model-auto-enricher

[中文说明](./README.zh.md) | English

**Model Auto Enricher (`dsh-model-auto-enricher`)** is a DeepSeek Harness (`dsh`) plugin that automatically restores **1M context windows**, **64k–128k max output tokens**, **multimodal image input (`[text, image]`)**, and **reasoning effort tiers (`{ low, high, max }`)** across every model channel in your `cordis.patch.yml`.

When adding third-party or relay-station (`openai-responses`, `openai-completions`, `anthropic-messages`) models in DSH, the stock UI leaves new models with truncated context windows (`128k` / `200k` / `256k` / `272k`), text-only modality (unable to send images), missing `maxTokens`, or incomplete `reasoningEfforts`. **Model Auto Enricher** fixes all of them automatically.

---

## ✨ Key Features

1. **⚡ Live Auto-Watch & Auto-Enrich**:
   - Listens to `settings/document-updated` and `app-boot/config-reload` on the Host.
   - As soon as you add or edit a model in **Settings → Models** and click **Apply**, the plugin automatically enriches the new model in the background and triggers `hmr.reconcileProfile()` so the updated specs take effect immediately without restarting DSH.
2. **🧠 Full Series Matrix + Universal New-Model Fallback (`v2.0`)**:
   - Built-in series rules for **Gemini**, **Claude (4 / 4.5 / 4.6 / 5 / 5.5+ / Opus / Sonnet)**, **DeepSeek (V3 / V4 / V4.1 / R1 / R2)**, **GLM (5 / 5.2 / 5.3 / Z1)**, **Kimi (K2.6 / K2.7 / K2.8 / K3)**, **GPT (GPT-4o / GPT-5 / GPT-6 / o1–o9 / Codex)**, **Hunyuan (Hy3 / Hy4)**, and **Mainstream LLMs (MiniMax / Step / Qwen / Grok / Doubao / Llama / Mistral)**.
   - **Universal New-Model Fallback (`FALLBACK_SERIES_RULE`)**: Any brand-new or codenamed model not matched by known family regexes automatically receives flagship specs (`1,000,000` context window, `64,000` max output tokens, `['text', 'image']` multimodal input, and `{ low, high, max }` reasoning tiers).
   - **Incomplete Reasoning Tier Completion**: Any model that already has partial `reasoningEfforts` (e.g., `{ off, low, medium, high }` missing `max`, or `{ max, xhigh, medium, low }` missing `high`) automatically has `{ low, high, max }` completed while preserving all custom tiers.
3. **🛡️ Strict Safety Guarantees**:
   - **Monotonic Upgrade-Only**: Never lowers an existing larger `contextWindow` or `maxTokens`; never removes existing `input` modalities or custom `reasoningEfforts` keys (`off`, `minimal`, `medium`, `xhigh`).
   - **Timestamped Backup Before Every Write**: Creates `cordis.patch.yml.bak-auto-enrich-YYYYMMDD-HHmmss` before modifying a single byte.
   - **Strictly Idempotent**: Re-running when all models are already optimal performs zero writes and creates zero redundant backups.
4. **🖥️ Native Settings UI (`Settings → Model Auto Enricher`)**:
   - Displays live health status, provider & model counts, auto-watch badge, one-click manual enrich button, backup file path, before/after diff log, and an expandable per-model inspection table with recognized series tags.

---

## 📦 Installation

```sh
dsh plugin --profile desktop add 66rapper/dsh-model-auto-enricher
```

Or for the `web` profile:

```sh
dsh plugin --profile web add 66rapper/dsh-model-auto-enricher
```

---

## 📊 Built-in Rule Matrix (`v2.0`)

| Series | Match Pattern | `contextWindow` | `maxTokens` | `input` | `reasoningEfforts` |
|---|---|---:|---:|---|---|
| **Gemini** | `gemini / gemma` | `1,000,000` | `64,000` | `[text, image]` | Enabled on all except `lite` / `image` |
| **Claude** | `claude` | `1,000,000` (`200,000` for legacy Claude 2/3) | `64,000` | `[text, image]` | `4.5+ / 5+ / opus / sonnet / thinking / high` |
| **DeepSeek** | `deepseek` | `1,000,000` | `128,000` | `[text, image]` | `v4 / v5 / r1 / r2 / pro / flash / thinking` |
| **GLM** | `glm / chatglm` | `1,000,000` | `128,000` (`flash`) / `64,000` | `[text, image]` | `5.2 / 5.3 / 6 / z1 / flash / high` |
| **Kimi** | `kimi / moonshot` | `256,000` (`k2.6/k2.7`) / `1,000,000` | `64,000` (`k2.8/k3+`) / `32,000` | `[text, image]` | `k2.8 / k3 / k4 / preview` |
| **GPT** | `gpt-* / chatgpt / o1~o9 / codex` | `1,000,000` | `64,000` | `[text, image]` | `gpt-5 / 6 / 7+ / o1~o9 / codex / astra / sol` |
| **Hunyuan** | `hy3 / hy4 / hunyuan` | `192,000` (`hy3`) / `1,000,000` | `64,000` | `[text, image]` | `hy3 / hy4+ / preview / thinking` |
| **Mainstream** | `minimax / step / qwen / grok / doubao / llama / mistral` | `1,000,000` | `64,000` | `[text, image]` | `step-5+ / grok-3+ / qwen-3+ / m3+ / thinking` |
| **Universal New Model** | *Any unrecognized / new model (Fallback)* | `1,000,000` | `64,000` | `[text, image]` | `{ low, high, max }` (except `lite / image / embed`) |
| **GPT Open-Source** | `gpt-oss` | `128,000` | `64,000` | `[text]` | None |

---

## 🔌 HTTP Endpoints (Loopback-Only)

- `GET /api/model-enricher/status` — Read-only health inspection of all providers and models in `cordis.patch.yml`.
- `POST /api/model-enricher/run` — Execute enrichment (supports `{ "dryRun": true }` for zero-write preview).

---

## 📄 License

[MIT](./LICENSE)
