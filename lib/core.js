/**
 * dsh-model-auto-enricher — 智能补齐引擎核心逻辑（Host 端 / 纯 Node，无 UI 依赖）
 * =============================================================================
 *
 * 职责
 * ----
 * 读取并解析 DSH profile 的 `cordis.patch.yml`，扫描其中 llm provider 条目的
 * `config.providers[*].models[*]`，依据内置的「系列规则矩阵 + 通用新模型全量兜底规则」
 * 自动补齐每个模型的：
 *
 *   - `contextWindow`     —— 中转站常把上下文截断在 272k / 256k / 200k / 128k 或直接缺失
 *   - `maxTokens`         —— 最大输出常缺失
 *   - `input`             —— DSH 官方 Web 界面默认纯文本，补齐 `[text, image]` 支持发图/识图
 *   - `reasoningEfforts`  —— 思考模型补齐 `{ low, high, max }` 映射，前端可调推理强度
 *
 * v2.0 核心升级（彻底解决「新加入的模型不认识、不优化」）
 * --------------------------------------------------------
 *  1. **全系列代际扩展**：GPT 规则覆盖 `gpt-4o / gpt-5 / gpt-6 / gpt-7+ / o1~o9 / codex / chatgpt`；
 *     Claude 覆盖 `4 / 4.5 / 4.6 / 5 / 5.5+ / opus / sonnet`；新增腾讯混元 `hy3 / hy4 / hunyuan`、
 *     豆包 `doubao / seed`、`llama / mistral / qwen / grok / step / minimax` 等全量识别。
 *  2. **通用新模型全量兜底（`FALLBACK_SERIES_RULE`）**：任何未命中已知正则的全新模型或代号模型
 *     （如 `space-bunny`、`argon`、`astra`、`sol` 或未来新模型）不再被跳过（`series: null`），
 *     而是自动归入「通用新模型规则」，默认补齐 `1M 上下文 + 64k 最大输出 + [text, image] 多模态 +
 *     { low, high, max } 思考档位`（遵守只升不降）。
 *  3. **残缺思考档位自动补全**：凡已配置了部分 `reasoningEfforts`（如仅开启了 `low/medium/high` 缺 `max`，
 *     或仅 `max/xhigh/medium/low` 缺 `high`）的模型，一律自动补齐 `{ low, high, max }` 并保留自定义档位。
 *  4. **状态透视真实化**：未补齐前展示 `before` 真实配置，补齐后展示 `after` 规格，杜绝「未补齐却显示已最优」假象。
 *
 * 安全契约（全部为硬保证）
 * ------------------------
 *  1. **零静默写入**：`inspectConfig()` 完全只读；`runEnrich({ dryRun: true })` 零写入。
 *  2. **写前备份**：任何真实写入前先物理复制一份
 *     `cordis.patch.yml.bak-auto-enrich-YYYYMMDD-HHmmss`。
 *  3. **严格幂等**：二次执行 0 改动。所有字段遵循「只升不降」单调原则 ——
 *     已有更大值绝不回退，已有自定义思考档位（如 `xhigh` / `medium` / `off`）绝不删除。
 *  4. **注释头部保真**：文件顶部的注释块原样保留，仅重排其后的 YAML 主体。
 *
 * CLI 双胞胎
 * ----------
 * `~/.dsh/tools/model-enricher/model-enricher.mjs` 是本文件的独立 CLI 版本，
 * 持有**逐字相同**的规则矩阵。修改规则时**两处必须同步**。
 *
 * @module dsh-model-auto-enricher/lib/core
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 插件标识（loader 条目 id / 客户端模块 id / API 前缀的单一来源）。 */
export const PLUGIN_ID = 'dsh-model-auto-enricher';

/** 引擎版本，随规则矩阵变更递增。 */
export const ENGINE_VERSION = '2.0.0';

/** HTTP API 前缀（Host 端注册、Client 端请求共用）。 */
export const API_PREFIX = '/api/model-enricher';

/** 上下文「地板」：≤ 该值即视为被中转站截断，需要按规则上限突破。 */
export const CONTEXT_FLOOR = 272000;

/** 通用旗舰上下文上限。 */
export const DEFAULT_CONTEXT_CAP = 1000000;

/** 通用最大输出兜底上限。 */
export const DEFAULT_MAX_TOKENS = 64000;

/** DSH 标准思考档位：缺失即补齐，已有档位一律保留。 */
export const REASONING_TIERS = ['low', 'high', 'max'];

/** 模态的规范输出顺序（合并后按此排序，保证幂等与可读性）。 */
export const CANONICAL_MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'];

/* ------------------------------------------------------------------ 规则矩阵 */

/**
 * 系列规则矩阵。按序匹配 `id + ' ' + name` 的小写拼接串，**命中即停**，
 * 因此顺序有意义：`gpt-oss` 与 `non-chat` 必须放在最前。
 *
 * 字段语义：
 *  - `test`          命中该系列的正则
 *  - `contextWindow` 目标上下文（number 或 `(key) => number`）
 *  - `maxTokens`     目标最大输出（number 或 `(key) => number`）
 *  - `input`         目标模态（与现有模态取并集，绝不删减已有模态）
 *  - `reasoning`     boolean / RegExp / `(key) => boolean`，命中即要求补齐 reasoningEfforts
 */
export const SERIES_RULES = [
  {
    id: 'gpt-oss',
    label: 'GPT 开源版',
    test: /gpt-oss/,
    contextWindow: 128000,
    maxTokens: 64000,
    input: ['text'],
    reasoning: null,
  },
  {
    id: 'non-chat',
    label: '专用向量/语音模型',
    test: /\b(embed|embedding|rerank|reranker|bge-|whisper|tts|asr)\b/,
    contextWindow: null,
    maxTokens: null,
    input: ['text'],
    reasoning: null,
  },
  {
    id: 'claude',
    label: 'Claude 系列',
    test: /claude/,
    // 除老款 Claude 2/3 外，Claude 4 / 4.5 / 4.6 / 5 / 5.5+ 及所有 opus / sonnet 一律 1M
    contextWindow: (key) =>
      /claude-[123]\b|haiku-3/.test(key) && !/4|5|6|7|8|9|opus|sonnet/.test(key) ? 200000 : 1000000,
    maxTokens: 64000,
    input: ['text', 'image'],
    // Claude 4.5 / 4.6 / 5 / 5.5+ / Opus / Sonnet / Thinking / High 全系支持思考档位
    reasoning: /thinking|high|opus|sonnet|4-5|4-6|4\.5|4\.6|claude-[456789]|[56789]-[0-9]/,
  },
  {
    id: 'gemini',
    label: 'Gemini 系列',
    test: /gemini|\bgemma\b/,
    contextWindow: 1000000,
    maxTokens: 64000,
    input: ['text', 'image'],
    // 除纯 lite 轻量版与纯 image 生图版外，Gemini 全系（Flash / Pro / High / Thinking / Argon / 2.5 / 3 / 3.5 / 4+）均支持思考档位
    reasoning: (key) => !/\blite\b|-lite|\bimage\b|-image/.test(key) || /high|thinking|pro/.test(key),
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 系列',
    test: /deepseek/,
    contextWindow: 1000000,
    maxTokens: 128000,
    input: ['text', 'image'],
    reasoning: /v4|v5|v6|r1|r2|r3|reasoner|thinking|pro|flash|high/,
  },
  {
    id: 'glm',
    label: 'GLM 系列',
    test: /\bglm|chatglm/,
    contextWindow: 1000000,
    // flash 版输出更大（128k），其余 64k
    maxTokens: (key) => (/flash/.test(key) ? 128000 : 64000),
    input: ['text', 'image'],
    reasoning: /5\.2|5\.3|5\.4|5\.5|glm-[6789]|z1|flash|high|thinking|zero/,
  },
  {
    id: 'kimi',
    label: 'Kimi 系列',
    test: /kimi|moonshot/,
    // k2.6 / k2.7 是特化 256k 窗口，其余（k3 / k2.8 / 未来版本）1M
    contextWindow: (key) => (/k2\.6|k2\.7/.test(key) ? 256000 : 1000000),
    maxTokens: (key) => (/k2\.6|k2\.7|k3-1/.test(key) ? 32000 : 64000),
    input: ['text', 'image'],
    reasoning: /k2\.8|k3|k4|k5|preview|thinking|high/,
  },
  {
    id: 'gpt',
    label: 'GPT 系列',
    test: /\bgpt[-_.\d]|\bchatgpt|\bo[13456789]\b|\bcodex\b/,
    contextWindow: 1000000,
    maxTokens: 64000,
    input: ['text', 'image'],
    // GPT-5 / GPT-6 / GPT-7+ / o1~o9 / Codex 及带推理标识的模型全系开启思考档位
    reasoning: /gpt-[56789]|\bo[13456789]\b|codex|thinking|high|pro|astra|sol|max/,
  },
  {
    id: 'hunyuan',
    label: '混元系列',
    test: /\bhy\d|hunyuan/,
    contextWindow: (key) => (/\bhy3\b/.test(key) ? 192000 : 1000000),
    maxTokens: 64000,
    input: ['text', 'image'],
    reasoning: /hy[3456789]|hunyuan|thinking|high|preview/,
  },
  {
    id: 'mainstream',
    label: '主流大模型系列',
    test: /minimax|\bstep[-_.\d]|qwen|qwq|grok|doubao|seed|llama|mistral|pixtral|codestral|ernie|\byi[-_.\d]|nova|nemotron|\bphi[-_.\d]/,
    contextWindow: 1000000,
    maxTokens: 64000,
    input: ['text', 'image'],
    reasoning: /thinking|reasoner|r1|r2|high|qwq|step-[56789]|grok-[3456789]|qwen-?[345]|m[345]\b|preview|pro|max/,
  },
];

/**
 * 通用新模型全量兜底规则（当新加入的模型名字不属于任何已知系列，如内部代号模型 space-bunny / argon / astra / 未来新架构）：
 * 默认按旗舰多模态推理模型补齐（1M 上下文 + 64k 最大输出 + [text, image] 多模态 + { low, high, max } 思考档位），
 * 严格遵守「只升不降」单调原则，彻底解决「新加入的模型不认识、不优化」的问题。
 */
export const FALLBACK_SERIES_RULE = {
  id: 'universal',
  label: '通用新模型规则',
  contextWindow: DEFAULT_CONTEXT_CAP,
  maxTokens: DEFAULT_MAX_TOKENS,
  input: ['text', 'image'],
  reasoning: (key) => !/\blite\b|-lite|\bimage\b|-image|\bembed|\brerank|\bwhisper|\btts|\basr/.test(key),
};

/**
 * 通用底线规则（作用于任何系列，包括未命中任何系列规则的模型）。
 *  - `modality` 命中 → 保证 `input` 含 `image`
 *  - `thinking` 命中 → 保证 `reasoningEfforts` 含 `{ low, high, max }` 且保留自定义档位
 *  - 上下文底线见 `planModel()`：缺失或 ≤ CONTEXT_FLOOR 时按「规则上限」突破，
 *    且已有更大值绝不回退。
 */
export const UNIVERSAL_RULES = {
  modality: /vl|vision|image|multimodal/,
  thinking: /thinking|reasoner|r1|r2|high|qwq|pro|max|preview/,
};

/* -------------------------------------------------------------------- 工具 */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 取数值字段；非有限数一律视为「缺失」。 */
function numOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sortedModalities(list) {
  const rank = (m) => {
    const i = CANONICAL_MODALITIES.indexOf(m);
    return i === -1 ? CANONICAL_MODALITIES.length : i;
  };
  return list.slice().sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
}

function sameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function pickValue(spec, key) {
  if (typeof spec === 'function') return spec(key);
  return spec;
}

function matchReasoning(spec, key) {
  if (!spec) return false;
  if (spec === true) return true;
  if (spec instanceof RegExp) return spec.test(key);
  if (typeof spec === 'function') return Boolean(spec(key));
  return false;
}

/** `YYYYMMDD-HHmmss`（本地时间），与既有备份命名逐字一致。 */
export function timestamp(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

/** 展示用上下文标签：1000000 → `1M`，256000 → `256k`。 */
export function formatContext(value) {
  const n = numOrNull(value);
  if (n === null) return '—';
  if (n >= 1000000 && n % 1000000 === 0) return `${n / 1000000}M`;
  if (n % 1000 === 0) return `${n / 1000}k`;
  return String(n);
}

/* --------------------------------------------------------------- 配置定位 */

/** 本机 DSH 主目录（`$DSH_HOME` 优先，否则 `~/.dsh`）。 */
export function dshHome() {
  const env = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : '';
  return env.length > 0 ? env : join(homedir(), '.dsh');
}

/**
 * 解析目标配置文件路径。
 * 优先级：显式入参 → `$DSH_MODEL_ENRICHER_FILE` → `$DSH_HOME/profiles/desktop/cordis.patch.yml`
 * （本机即 `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`）。
 */
export function resolveConfigPath(explicit) {
  const candidate =
    (typeof explicit === 'string' && explicit.trim()) ||
    (typeof process.env.DSH_MODEL_ENRICHER_FILE === 'string' && process.env.DSH_MODEL_ENRICHER_FILE.trim()) ||
    '';
  if (candidate) {
    return isAbsolute(candidate) ? resolve(candidate) : resolve(process.cwd(), candidate);
  }
  return join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml');
}

/* ------------------------------------------------------------- js-yaml 装载 */

let yamlModule = null;
let yamlLoading = null;

/** js-yaml 候选位置：环境变量 → 配置文件向上的 node_modules → 规格指定常量路径。 */
function yamlCandidates() {
  const out = [];
  const fromEnv = typeof process.env.DSH_MODEL_ENRICHER_YAML === 'string' ? process.env.DSH_MODEL_ENRICHER_YAML.trim() : '';
  if (fromEnv) out.push(fromEnv);
  try {
    let dir = dirname(resolveConfigPath());
    for (let i = 0; i < 8 && dir; i += 1) {
      out.push(join(dir, 'node_modules', 'js-yaml', 'dist', 'js-yaml.mjs'));
      out.push(join(dir, 'node_modules', 'js-yaml', 'dist', 'js-yaml.js'));
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* 路径推导失败不影响下面的常量兜底 */
  }
  // 规格指定：DSH 托管 runtime 的 profile 依赖树
  out.push('C:\\Users\\Administrator\\.dsh\\profiles\\desktop\\node_modules\\js-yaml\\dist\\js-yaml.mjs');
  out.push('/Users/Administrator/.dsh/profiles/desktop/node_modules/js-yaml/dist/js-yaml.mjs');
  return [...new Set(out)];
}

/** 惰性装载 js-yaml（首次调用时才 import，且只装载一次）。 */
export async function loadYaml() {
  if (yamlModule) return yamlModule;
  if (!yamlLoading) {
    yamlLoading = (async () => {
      const tried = [];
      for (const candidate of yamlCandidates()) {
        if (!candidate) continue;
        if (!existsSync(candidate)) {
          tried.push(`(missing) ${candidate}`);
          continue;
        }
        try {
          const mod = await import(pathToFileURL(candidate).href);
          const y = mod && (mod.default ?? mod);
          if (y && typeof y.load === 'function' && typeof y.dump === 'function') {
            yamlModule = y;
            return y;
          }
          tried.push(`(bad api) ${candidate}`);
        } catch (error) {
          tried.push(`(${error instanceof Error ? error.message : String(error)}) ${candidate}`);
        }
      }
      // 最后兜底：裸说明符（core.js 若被放进 profile 的解析链即可命中）
      try {
        const mod = await import('js-yaml');
        const y = mod && (mod.default ?? mod);
        if (y && typeof y.load === 'function') {
          yamlModule = y;
          return y;
        }
      } catch (error) {
        tried.push(`(bare js-yaml) ${error instanceof Error ? error.message : String(error)}`);
      }
      throw new Error(`js-yaml 装载失败，已尝试：\n  - ${tried.join('\n  - ')}`);
    })();
  }
  return yamlLoading;
}

/** 供测试注入已装载的 yaml 实现。 */
export function __setYaml(mod) {
  yamlModule = mod || null;
  if (mod) yamlLoading = Promise.resolve(mod);
}

/* ------------------------------------------------------------ 读 / 序列化 */

/**
 * 拆出文件顶部的注释块（含紧邻空行），与其余 YAML 主体。
 * 主体之外的一切字节都由这里原样保留 —— 注释头部保真的唯一实现点。
 */
export function splitCommentHeader(raw) {
  const lines = String(raw).split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) i += 1;
    else break;
  }
  return { header: lines.slice(0, i).join('\n'), body: lines.slice(i).join('\n') };
}

/**
 * 用 js-yaml 序列化 YAML 主体，并回贴注释头部。
 * dump 选项与验证过的往返无损配置逐字一致（`indent: 2` / `lineWidth: -1` / `noRefs: true`）。
 */
export function serializeConfig(header, data, yaml) {
  const dumped = yaml.dump(data, { indent: 2, lineWidth: -1, noRefs: true });
  const body = dumped.endsWith('\n') ? dumped : `${dumped}\n`;
  const head = header && header.length > 0 ? `${header}\n` : '';
  return head + body;
}

/** 读取 + 解析配置文件（只读，永不写盘）。 */
export async function readConfig(explicitPath) {
  const file = resolveConfigPath(explicitPath);
  if (!existsSync(file)) {
    throw new Error(`配置文件不存在：${file}`);
  }
  const raw = readFileSync(file, 'utf8');
  const { header, body } = splitCommentHeader(raw);
  const yaml = await loadYaml();
  let data;
  try {
    data = yaml.load(body);
  } catch (error) {
    throw new Error(`cordis.patch.yml 解析失败（${file}）：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`cordis.patch.yml 顶层结构不是数组（期望 patch 行列表）：${file}`);
  }
  return { file, raw, header, body, data, yaml };
}

/**
 * 遍历配置里的全部 `llm-*` provider 条目，产出 `{ entry, providerId, provider }` 三元组。
 * 只认 `config.providers` 结构 —— 其他 patch 行完全不被触碰。
 */
export function* iterateProviders(data) {
  const list = Array.isArray(data) ? data : [];
  for (const entry of list) {
    const providers = isPlainObject(entry?.config?.providers) ? entry.config.providers : null;
    if (!providers) continue;
    for (const [providerId, provider] of Object.entries(providers)) {
      if (!isPlainObject(provider)) continue;
      yield { entry, providerId, provider };
    }
  }
}

/* ---------------------------------------------------------------- 规划核心 */

/**
 * 为单个模型计算补齐计划。
 *
 * @param providerId 渠道 id（仅用于报告）
 * @param model      模型对象（`apply === true` 时会被就地补齐）
 * @param apply      是否真正写回 model 对象（false = 纯预览，零副作用）
 * @returns 该模型的完整检测报告与变更明细
 */
export function planModel(providerId, model, apply = false) {
  const mutable = isPlainObject(model) ? model : {};
  const id = typeof mutable.id === 'string' ? mutable.id : String(mutable.id ?? '');
  const name = typeof mutable.name === 'string' ? mutable.name : '';
  const key = `${id} ${name}`.toLowerCase();

  // 优先匹配已知系列规则；若为全新/未知代号模型，自动落入 FALLBACK_SERIES_RULE 全量兜底规则
  const matchedSeries = SERIES_RULES.find((rule) => rule.test.test(key)) ?? null;
  const series = matchedSeries ?? FALLBACK_SERIES_RULE;
  const targetContext = numOrNull(pickValue(series.contextWindow, key));
  const targetMaxTokens = numOrNull(pickValue(series.maxTokens, key));
  const targetInput = Array.isArray(series.input) ? series.input.slice() : null;
  const seriesWantsReasoning = matchReasoning(series.reasoning, key);
  const modalityFloor = series.id !== 'gpt-oss' && series.id !== 'non-chat' && UNIVERSAL_RULES.modality.test(key);
  const thinkingFloor = series.id !== 'gpt-oss' && series.id !== 'non-chat' && UNIVERSAL_RULES.thinking.test(key);

  const before = {
    contextWindow: numOrNull(mutable.contextWindow),
    maxTokens: numOrNull(mutable.maxTokens),
    input: Array.isArray(mutable.input) ? mutable.input.filter((m) => typeof m === 'string') : null,
    reasoningEfforts: isPlainObject(mutable.reasoningEfforts) ? { ...mutable.reasoningEfforts } : null,
  };

  // 若模型本身已带有部分 reasoningEfforts（如手动开启了部分档位但缺 max 或 high），必定补全标准三档
  const alreadyHasReasoning =
    before.reasoningEfforts !== null && Object.keys(before.reasoningEfforts).length > 0;

  const changes = [];
  const push = (field, label, from, to) => {
    changes.push({ field, label, from: from === undefined ? null : from, to: to === undefined ? null : to });
  };

  /* --- 1) contextWindow：只升不降；缺失补齐；≤ 地板或低于目标上限时自动拉升 --- */
  let nextContext = before.contextWindow;
  if (before.contextWindow === null) {
    nextContext = targetContext ?? DEFAULT_CONTEXT_CAP;
  } else if (targetContext !== null) {
    nextContext = Math.max(targetContext, before.contextWindow);
  }
  if (nextContext !== before.contextWindow) {
    push('contextWindow', '上下文窗口', before.contextWindow, nextContext);
  }

  /* --- 2) maxTokens：同样只升不降，未知新模型兜底补齐 64,000 --- */
  let nextMaxTokens = before.maxTokens;
  if (before.maxTokens === null) {
    nextMaxTokens = targetMaxTokens;
  } else if (targetMaxTokens !== null) {
    nextMaxTokens = Math.max(targetMaxTokens, before.maxTokens);
  }
  if (nextMaxTokens !== before.maxTokens) {
    push('maxTokens', '最大输出', before.maxTokens, nextMaxTokens);
  }

  /* --- 3) input：并集补齐（绝不删减已有模态），保证多模态底线 --- */
  const desired = [];
  if (targetInput) desired.push(...targetInput);
  if (modalityFloor) desired.push('image');
  let nextInput = before.input;
  if (desired.length > 0) {
    const merged = before.input ? before.input.slice() : [];
    for (const modality of desired) if (!merged.includes(modality)) merged.push(modality);
    const canonical = sortedModalities([...new Set(merged)]);
    if (!sameStringArray(canonical, before.input ?? [])) nextInput = canonical;
  }
  if (!sameStringArray(nextInput ?? [], before.input ?? [])) {
    push('input', '模态支持', before.input, nextInput);
  }

  /* --- 4) reasoningEfforts：补齐 { low, high, max }，保留已有自定义档位 --- */
  const wantsReasoning = alreadyHasReasoning || seriesWantsReasoning || thinkingFloor;
  let nextReasoning = before.reasoningEfforts;
  const addedTiers = [];
  if (wantsReasoning) {
    const merged = before.reasoningEfforts ? { ...before.reasoningEfforts } : {};
    for (const tier of REASONING_TIERS) {
      if (!Object.prototype.hasOwnProperty.call(merged, tier)) {
        merged[tier] = tier;
        addedTiers.push(tier);
      }
    }
    if (addedTiers.length > 0) nextReasoning = merged;
  }
  if (addedTiers.length > 0) {
    push('reasoningEfforts', '思考档位', before.reasoningEfforts, nextReasoning);
  }

  /* --- 5) 写回（仅在 apply 时；预览零副作用） --- */
  if (apply && changes.length > 0) {
    for (const change of changes) mutable[change.field] = change.to;
  }

  /* --- 6) 报告 --- */
  const contextLimited = before.contextWindow === null || before.contextWindow <= CONTEXT_FLOOR;
  const issues = [];
  if (changes.some((c) => c.field === 'contextWindow')) {
    issues.push(before.contextWindow === null ? 'missingContext' : 'limitedContext');
  }
  if (changes.some((c) => c.field === 'input')) issues.push('missingMultimodal');
  if (changes.some((c) => c.field === 'reasoningEfforts')) issues.push('missingReasoning');
  if (changes.some((c) => c.field === 'maxTokens')) issues.push('missingMaxTokens');

  const effectiveContext = before.contextWindow === null ? nextContext : Math.max(before.contextWindow, nextContext ?? 0);
  const effectiveInput = (changes.some((c) => c.field === 'input') ? nextInput : before.input) ?? before.input;
  const effectiveReasoning =
    changes.some((c) => c.field === 'reasoningEfforts') ? nextReasoning : before.reasoningEfforts;

  return {
    provider: providerId,
    id,
    name: name || id,
    series: series ? series.id : null,
    seriesLabel: series ? series.label : null,
    // 「缺上下文 / 缺多模态 / 缺思考档位」三项检测结论
    hasContext: before.contextWindow !== null,
    hasMultimodal: Array.isArray(before.input) && before.input.includes('image'),
    hasReasoning: before.reasoningEfforts !== null && Object.keys(before.reasoningEfforts).length > 0,
    contextLimited,
    needsContext: changes.some((c) => c.field === 'contextWindow'),
    needsMultimodal: changes.some((c) => c.field === 'input'),
    needsReasoning: changes.some((c) => c.field === 'reasoningEfforts'),
    needsMaxTokens: changes.some((c) => c.field === 'maxTokens'),
    needsEnrich: changes.length > 0,
    issues,
    changes,
    before,
    after: {
      contextWindow: changes.some((c) => c.field === 'contextWindow') ? nextContext : before.contextWindow,
      maxTokens: changes.some((c) => c.field === 'maxTokens') ? nextMaxTokens : before.maxTokens,
      input: changes.some((c) => c.field === 'input') ? nextInput : before.input,
      reasoningEfforts: effectiveReasoning,
    },
    // 折叠面板直接可用的展示派生值
    contextLabel: formatContext(effectiveContext),
    effectiveContext: numOrNull(effectiveContext),
    modalities: effectiveInput ?? [],
    reasoningTiers: effectiveReasoning ? Object.keys(effectiveReasoning) : [],
  };
}

/**
 * 全量分析：扫描全部渠道/模型，产出统计、逐模型报告与变更明细。
 * @param data  `cordis.patch.yml` 解析后的 patch 行数组
 * @param apply true = 就地补齐模型对象（真实写入前调用）
 */
export function analyze(data, apply = false) {
  const providers = [];
  const changes = [];
  const modelReports = [];
  let modelCount = 0;

  for (const { providerId, provider } of iterateProviders(data)) {
    const models = Array.isArray(provider.models) ? provider.models : [];
    const reports = [];
    for (const model of models) {
      const report = planModel(providerId, model, apply);
      reports.push(report);
      modelReports.push(report);
      modelCount += 1;
      for (const change of report.changes) {
        changes.push({
          provider: providerId,
          model: report.id,
          modelName: report.name,
          series: report.series,
          seriesLabel: report.seriesLabel,
          field: change.field,
          label: change.label,
          from: change.from,
          to: change.to,
        });
      }
    }
    providers.push({
      id: providerId,
      displayName: typeof provider.displayName === 'string' ? provider.displayName : providerId,
      baseURL: typeof provider.baseURL === 'string' ? provider.baseURL : null,
      modelCount: models.length,
      pendingCount: reports.filter((r) => r.needsEnrich).length,
      models: reports.map((r) => {
        // 只读检查时展示当前文件中的真实值（r.before）；写入应用后展示补齐后的值（r.after）
        const current = apply ? r.after : r.before;
        const currentModalities = Array.isArray(current.input) && current.input.length > 0 ? current.input : ['text'];
        const currentTiers = current.reasoningEfforts ? Object.keys(current.reasoningEfforts) : [];
        return {
          id: r.id,
          name: r.name,
          series: r.series,
          seriesLabel: r.seriesLabel,
          contextWindow: current.contextWindow,
          contextLabel: formatContext(current.contextWindow),
          maxTokens: current.maxTokens,
          modalities: currentModalities,
          multimodal: currentModalities.includes('image'),
          reasoningTiers: currentTiers,
          hasReasoning: currentTiers.length > 0,
          contextLimited: r.contextLimited,
          needsEnrich: r.needsEnrich,
          issues: r.issues,
          changes: r.changes,
        };
      }),
    });
  }

  return {
    providerCount: providers.length,
    modelCount,
    providers,
    changes,
    modelReports,
  };
}

/* ------------------------------------------------------------------ 公开 API */

/**
 * 只读体检：返回渠道数、模型数、待优化清单与逐模型检测结果。
 * **零写入、零备份。**
 */
export async function inspectConfig(options = {}) {
  const ctx = await readConfig(options.file);
  const analysis = analyze(ctx.data, false);
  return {
    ok: true,
    engine: PLUGIN_ID,
    engineVersion: ENGINE_VERSION,
    file: ctx.file,
    providerCount: analysis.providerCount,
    modelCount: analysis.modelCount,
    pendingCount: analysis.changes.length,
    pendingModelCount: analysis.modelReports.filter((r) => r.needsEnrich).length,
    health: analysis.changes.length === 0 ? 'optimal' : 'needs-attention',
    contextFloor: CONTEXT_FLOOR,
    providers: analysis.providers,
    pending: analysis.modelReports
      .filter((r) => r.needsEnrich)
      .map((r) => ({
        provider: r.provider,
        model: r.id,
        modelName: r.name,
        series: r.series,
        seriesLabel: r.seriesLabel,
        issues: r.issues,
        changes: r.changes,
      })),
  };
}

/**
 * 执行补齐。
 *  - `dryRun: true` → 零写入预览（不生成备份）
 *  - 否则：写前自动时间戳备份 → 幂等回写 → 返回变更明细与备份路径
 *
 * 无变更时不写盘、不备份，返回 `changed: false`。
 */
export async function runEnrich(options = {}) {
  const dryRun = options.dryRun === true;
  const ctx = await readConfig(options.file);
  const analysis = analyze(ctx.data, false);

  const base = {
    ok: true,
    engine: PLUGIN_ID,
    engineVersion: ENGINE_VERSION,
    file: ctx.file,
    dryRun,
    providerCount: analysis.providerCount,
    modelCount: analysis.modelCount,
    changedCount: analysis.changes.length,
    changedModelCount: analysis.modelReports.filter((r) => r.needsEnrich).length,
    changes: analysis.changes,
    providers: analysis.providers,
  };

  if (analysis.changes.length === 0) {
    return {
      ...base,
      changed: false,
      backupPath: null,
      bytesBefore: Buffer.byteLength(ctx.raw, 'utf8'),
      bytesAfter: Buffer.byteLength(ctx.raw, 'utf8'),
      summary: '✨ 所有模型规格已是最新最优状态，无需修改！',
    };
  }

  if (dryRun) {
    return {
      ...base,
      changed: false,
      backupPath: null,
      bytesBefore: Buffer.byteLength(ctx.raw, 'utf8'),
      bytesAfter: null,
      summary:
        `🔍 预览模式（零写入）：共发现 ${analysis.changes.length} 处可补齐项，` +
        `涉及 ${base.changedModelCount} 个模型；未生成备份、未改动任何字节。`,
    };
  }

  // 真实写入路径：重新在 apply 模式下规划（同一份 data 就地补齐）+ 写前备份
  const applied = analyze(ctx.data, true);
  if (applied.changes.length === 0) {
    return { ...base, changed: false, backupPath: null, summary: '✨ 无需修改（二次规划为空，已跳过写入）。' };
  }

  const backupPath = `${ctx.file}.bak-auto-enrich-${timestamp()}`;
  copyFileSync(ctx.file, backupPath);

  const next = serializeConfig(ctx.header, ctx.data, ctx.yaml);
  writeFileSync(ctx.file, next, 'utf8');

  return {
    ...base,
    providers: applied.providers,
    changed: true,
    backupPath,
    backupCreated: true,
    bytesBefore: Buffer.byteLength(ctx.raw, 'utf8'),
    bytesAfter: Buffer.byteLength(next, 'utf8'),
    summary:
      `✅ 补齐完成：共修复 ${applied.changes.length} 处、涉及 ` +
      `${applied.modelReports.filter((r) => r.needsEnrich).length} 个模型；` +
      `备份已生成：${backupPath}`,
  };
}

export default {
  PLUGIN_ID,
  API_PREFIX,
  SERIES_RULES,
  FALLBACK_SERIES_RULE,
  UNIVERSAL_RULES,
  inspectConfig,
  runEnrich,
  analyze,
  planModel,
};
