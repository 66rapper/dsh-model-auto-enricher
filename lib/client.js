// dsh-model-auto-enricher — browser half (client plugin bundle).
//
// Loaded by dsh-client-modules and executed through the vendored cordis Loader's
// lazy-CJS module table (window.__ModuleLoader__.load). The factory body is plain
// CJS with require() resolved against the shell's module table — the same shape
// the shipped ui-* packages emit. react is part of the platform base, so
// require("react") resolves to the shell-seeded React 18 instance; this bundle
// never ships its own copy.
//
// What it contributes: one `settings.section` page ("模型补齐助手") that
//   ① 标题区          — 图标 + 插件名 + 功能说明
//   ② 健康现状卡片     — 渠道数 / 模型数 / 状态徽章 + 「🔄 刷新状态」
//   ③ 核心操作区       — 渐变大按钮「⚡ 一键智能补齐全部模型」（内置 loading 防抖）
//   ④ 结果展示区       — 成功状态、备份路径、逐模型变更对比
//   ⑤ 模型透视折叠面板 — 全部模型的上下文容量 / 多模态 / 思考档位标签
//
// Transport: the host half exposes GET/POST /api/model-enricher/*.
(function (root) {
  "use strict";
  if (!root) return;
  if (!root.__ModuleLoader__ || typeof root.__ModuleLoader__.load !== "function") return;

  root.__ModuleLoader__.load({
    id: "dsh-model-auto-enricher",
    factory: function (require) {
      var module = { exports: {} };
      var exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

      // react is externalized into the loader module table — never bundled here.
      var React = null;
      try {
        React = require("react") || null;
      } catch (e) {
        React = null;
      }

      var NS = "dsh-model-auto-enricher";
      var API = "/api/model-enricher";
      var h = React && React.createElement ? React.createElement.bind(React) : null;

      /* ------------------------------------------------------------ 文案字典 */

      var UI_zh = {
        nav: "模型补齐助手",
        title: "模型补齐助手",
        subtitle: "一键为全部模型渠道补齐百万长上下文、多模态输入（发图）与深度思考档位",
        description:
          "自动扫描 cordis.patch.yml 中的全部渠道与模型，按系列规则矩阵补齐 contextWindow、maxTokens、input 与 reasoningEfforts。写入前自动生成时间戳备份，严格幂等，已有更大值绝不回退。",
        statusTitle: "健康现状",
        statusHint: "读取当前 profile 的 cordis.patch.yml 实际内容",
        providers: "渠道数",
        models: "模型数",
        unitModels: "个模型",
        pending: "待优化",
        healthy: "规格最优",
        needsAttention: "存在可补齐项",
        unknown: "状态未知",
        refresh: "🔄 刷新状态",
        refreshing: "读取中…",
        refreshedAt: "最近刷新",
        configFile: "配置文件",
        actionTitle: "智能补齐",
        actionButton: "⚡ 一键智能补齐全部模型",
        actionRunning: "⏳ 正在智能补齐…",
        actionHint:
          "将按规则矩阵补齐缺失或受限的规格；写入前自动生成 cordis.patch.yml.bak-auto-enrich-YYYYMMDD-HHmmss 时间戳备份。",
        actionHintDry: "已是最优状态时不会写入任何字节，也不会生成备份。",
        resultTitle: "执行结果",
        resultSuccess: "补齐完成",
        resultNoChange: "无需修改",
        resultFailed: "执行失败",
        changedCount: "变更处数",
        backupPath: "备份文件",
        noBackup: "（未写入，无备份）",
        noChanges: "✨ 所有模型规格已是最新最优状态，无需修改！",
        detailTitle: "模型明细",
        detailExpand: "展开全部模型",
        detailCollapse: "收起模型明细",
        colModel: "模型",
        colContext: "上下文",
        colMaxTokens: "最大输出",
        colModal: "模态",
        colReasoning: "思考档位",
        colStatus: "状态",
        tagText: "纯文本",
        tagMultimodal: "多模态",
        tagOptimal: "最优",
        tagCanEnrich: "可补齐",
        tagContextLimited: "上下文受限",
        tagNoContext: "缺上下文",
        tagNoReasoning: "缺思考档位",
        none: "无",
        yes: "是",
        no: "否",
        changeField: "字段",
        changeFrom: "变更前",
        changeTo: "变更后",
        footerNote:
          "规则来源：dsh-model-auto-enricher v2.0 内置全系列规则矩阵（GPT-4o~6+ / Claude 4~5.5+ / Gemini / DeepSeek / GLM / Kimi / 混元 / 主流大模型 + 通用新模型全量兜底规则，支持新加模型自动监听补齐）。",
        autoWatchOn: "⚡ 新模型自动监听补齐已开启",
      };

      var UI_en = {
        nav: "Model Auto Enricher",
        title: "Model Auto Enricher",
        subtitle:
          "One click to restore 1M context windows, image input and reasoning effort tiers on every model channel",
        description:
          "Scans every provider and model in cordis.patch.yml and fills in contextWindow, maxTokens, input and reasoningEfforts from the built-in series rule matrix + universal new-model fallback. Automatically watches newly added models and enriches them with a timestamped backup.",
        statusTitle: "Health",
        statusHint: "Reads the live cordis.patch.yml of this profile",
        providers: "Providers",
        models: "Models",
        unitModels: "models",
        pending: "Pending",
        healthy: "Specs optimal",
        needsAttention: "Enrichable items found",
        unknown: "Unknown",
        refresh: "🔄 Refresh",
        refreshing: "Reading…",
        refreshedAt: "Last refresh",
        configFile: "Config file",
        actionTitle: "Auto enrich",
        actionButton: "⚡ Enrich all models",
        actionRunning: "⏳ Enriching…",
        actionHint:
          "Fills missing or capped specs from the rule matrix. A cordis.patch.yml.bak-auto-enrich-YYYYMMDD-HHmmss backup is written first.",
        actionHintDry: "When everything is already optimal nothing is written and no backup is created.",
        resultTitle: "Result",
        resultSuccess: "Enriched",
        resultNoChange: "Nothing to change",
        resultFailed: "Failed",
        changedCount: "Changes",
        backupPath: "Backup",
        noBackup: "(no write — no backup)",
        noChanges: "✨ All model specs are already optimal — nothing to change.",
        detailTitle: "Model details",
        detailExpand: "Expand all models",
        detailCollapse: "Collapse model details",
        colModel: "Model",
        colContext: "Context",
        colMaxTokens: "Max output",
        colModal: "Modality",
        colReasoning: "Reasoning",
        colStatus: "Status",
        tagText: "Text only",
        tagMultimodal: "Multimodal",
        tagOptimal: "Optimal",
        tagCanEnrich: "Enrichable",
        tagContextLimited: "Capped context",
        tagNoContext: "No context",
        tagNoReasoning: "No reasoning tiers",
        none: "none",
        yes: "yes",
        no: "no",
        changeField: "Field",
        changeFrom: "Before",
        changeTo: "After",
        footerNote:
          "Rules: dsh-model-auto-enricher v2.0 series matrix (GPT-4o~6+ / Claude 4~5.5+ / Gemini / DeepSeek / GLM / Kimi / Hunyuan / mainstream + universal new-model fallback, with live auto-watch).",
        autoWatchOn: "⚡ Live Auto-Watch Active",
      };

      /* -------------------------------------------------------------- 样式表 */

      var C = {
        text: "#e7e9ef",
        dim: "#98a1b2",
        faint: "#6b7484",
        card: "rgba(255,255,255,0.028)",
        cardHover: "rgba(255,255,255,0.05)",
        border: "rgba(255,255,255,0.09)",
        ok: "#3ddc97",
        okBg: "rgba(61,220,151,0.12)",
        warn: "#f5c451",
        warnBg: "rgba(245,196,81,0.13)",
        bad: "#f87e7e",
        badBg: "rgba(248,126,126,0.13)",
        blue: "#6aa8ff",
        blueBg: "rgba(106,168,255,0.13)",
        mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      };

      var S = {
        root: { display: "flex", flexDirection: "column", gap: "14px", color: C.text, fontSize: "13px", lineHeight: 1.55 },
        header: { display: "flex", alignItems: "flex-start", gap: "12px" },
        headerText: { display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 },
        h1: { fontSize: "16px", fontWeight: 650, letterSpacing: "0.2px", margin: 0 },
        subtitle: { color: C.dim, fontSize: "12.5px" },
        desc: { color: C.faint, fontSize: "12px", marginTop: "2px" },
        card: {
          border: "1px solid " + C.border,
          background: C.card,
          borderRadius: "10px",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        },
        cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" },
        cardTitle: { fontSize: "13.5px", fontWeight: 620 },
        cardHint: { color: C.faint, fontSize: "11.5px" },
        statRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
        stat: {
          flex: "1 1 120px",
          minWidth: "110px",
          border: "1px solid " + C.border,
          background: "rgba(255,255,255,0.02)",
          borderRadius: "8px",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        },
        statValue: { fontSize: "20px", fontWeight: 700, lineHeight: 1.15 },
        statLabel: { color: C.dim, fontSize: "11.5px" },
        badge: {
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "3px 9px",
          borderRadius: "999px",
          fontSize: "11.5px",
          fontWeight: 600,
          border: "1px solid transparent",
          whiteSpace: "nowrap",
        },
        badgeOk: { color: C.ok, background: C.okBg, borderColor: "rgba(61,220,151,0.3)" },
        badgeWarn: { color: C.warn, background: C.warnBg, borderColor: "rgba(245,196,81,0.32)" },
        badgeBad: { color: C.bad, background: C.badBg, borderColor: "rgba(248,126,126,0.32)" },
        badgeDim: { color: C.dim, background: "rgba(255,255,255,0.05)", borderColor: C.border },
        badgeBlue: { color: C.blue, background: C.blueBg, borderColor: "rgba(106,168,255,0.3)" },
        btn: {
          border: "1px solid " + C.border,
          background: "rgba(255,255,255,0.05)",
          color: C.text,
          borderRadius: "7px",
          padding: "6px 12px",
          fontSize: "12.5px",
          cursor: "pointer",
          fontFamily: "inherit",
        },
        bigBtn: {
          border: "none",
          borderRadius: "9px",
          padding: "13px 18px",
          fontSize: "14.5px",
          fontWeight: 660,
          color: "#0b0e14",
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.2px",
          background: "linear-gradient(96deg, #7C5CFF 0%, #4C8DFF 48%, #22D3EE 100%)",
          boxShadow: "0 6px 20px -8px rgba(76,141,255,0.85)",
          transition: "filter 120ms ease, opacity 120ms ease",
        },
        bigBtnBusy: { opacity: 0.62, cursor: "progress" },
        path: { color: C.faint, fontSize: "11.5px", fontFamily: C.mono, wordBreak: "break-all" },
        pre: {
          margin: 0,
          padding: "9px 11px",
          border: "1px solid " + C.border,
          background: "rgba(0,0,0,0.22)",
          borderRadius: "7px",
          fontFamily: C.mono,
          fontSize: "11.5px",
          color: C.dim,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        },
        changeLine: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap", fontFamily: C.mono, fontSize: "11.5px" },
        changeField: { color: C.blue, minWidth: "112px", fontWeight: 600 },
        changeFrom: { color: C.bad, textDecoration: "line-through", opacity: 0.85 },
        changeTo: { color: C.ok },
        table: { border: "1px solid " + C.border, borderRadius: "8px", overflow: "hidden" },
        tr: { display: "grid", gridTemplateColumns: "minmax(150px,1.6fr) 88px 96px 92px minmax(110px,1.2fr) 96px", gap: "8px", padding: "7px 10px", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.05)" },
        thead: { background: "rgba(255,255,255,0.04)", borderTop: "none", color: C.dim, fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" },
        td: { overflow: "hidden", textOverflow: "ellipsis" },
        tdModel: { fontFamily: C.mono, fontSize: "11.5px" },
        tagRow: { display: "flex", gap: "4px", flexWrap: "wrap" },
        tag: { padding: "1px 6px", borderRadius: "5px", fontSize: "10.5px", border: "1px solid " + C.border, color: C.dim, whiteSpace: "nowrap" },
        provHead: { display: "flex", alignItems: "center", gap: "8px", margin: "10px 0 6px" },
        provName: { fontWeight: 620, fontSize: "12.5px" },
        link: { color: C.blue, cursor: "pointer", background: "none", border: "none", padding: 0, font: "inherit", textDecoration: "underline" },
        footer: { color: C.faint, fontSize: "11px" },
        err: {
          border: "1px solid rgba(248,126,126,0.35)",
          background: C.badBg,
          color: C.bad,
          borderRadius: "8px",
          padding: "9px 11px",
          fontSize: "12px",
        },
      };

      /* ---------------------------------------------------------------- 工具 */

      function bindT(dict) {
        return function t(key) {
          if (dict && Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
          if (UI_zh && Object.prototype.hasOwnProperty.call(UI_zh, key)) return UI_zh[key];
          return key;
        };
      }

      function ctxTranslator(ctx) {
        // 优先用宿主绑定的翻译器，缺失时退回内置 zh 字典（界面永不显示裸 key）。
        try {
          if (ctx && ctx.locale && typeof ctx.locale.bind === "function") {
            var bound = ctx.locale.bind(NS);
            if (typeof bound === "function") {
              return function t(key) {
                var value = null;
                try {
                  value = bound(key);
                } catch (e) {
                  value = null;
                }
                if (typeof value === "string" && value.length > 0 && value !== key) return value;
                return bindT(UI_zh)(key);
              };
            }
          }
        } catch (e) {
          /* 落到内置字典 */
        }
        return bindT(UI_zh);
      }

      function fmtContext(value) {
        if (typeof value !== "number" || !isFinite(value)) return "—";
        if (value >= 1000000 && value % 1000000 === 0) return value / 1000000 + "M";
        if (value % 1000 === 0) return value / 1000 + "k";
        return String(value);
      }

      function fmtValue(field, value) {
        if (value === null || value === undefined) return "—";
        if (field === "reasoningEfforts" && typeof value === "object") {
          var keys = Object.keys(value);
          if (!keys.length) return "—";
          return keys
            .map(function (k) {
              return k + ":" + String(value[k]);
            })
            .join(", ");
        }
        if (Array.isArray(value)) return "[" + value.join(", ") + "]";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      }

      function requestJson(path, init) {
        var f = root.fetch ? root.fetch.bind(root) : typeof fetch === "function" ? fetch : null;
        if (!f) return Promise.reject(new Error("fetch unavailable"));
        return f(path, init).then(function (res) {
          return res
            .json()
            .catch(function () {
              return null;
            })
            .then(function (body) {
              if (!res.ok) {
                var message = body && body.error ? body.error : "HTTP " + res.status;
                throw new Error(message);
              }
              if (!body || typeof body !== "object") throw new Error("invalid JSON response");
              return body;
            });
        });
      }

      /* -------------------------------------------------------------- 装饰件 */

      function Icon(props) {
        var size = (props && props.size) || 30;
        return h(
          "svg",
          { viewBox: "0 0 48 48", width: size, height: size, "aria-hidden": "true", style: { flex: "0 0 auto" } },
          h(
            "defs",
            null,
            h(
              "linearGradient",
              { id: "dmaeIcGrad", x1: "0", y1: "0", x2: "1", y2: "1" },
              h("stop", { offset: "0%", stopColor: "#7C5CFF" }),
              h("stop", { offset: "52%", stopColor: "#4C8DFF" }),
              h("stop", { offset: "100%", stopColor: "#22D3EE" }),
            ),
          ),
          h("path", {
            d: "M24 3.2 40.8 13.6v20.8L24 44.8 7.2 34.4V13.6z",
            fill: "url(#dmaeIcGrad)",
            fillOpacity: 0.18,
            stroke: "url(#dmaeIcGrad)",
            strokeWidth: 2,
            strokeLinejoin: "round",
          }),
          h("path", {
            d: "M26.9 11.4 15.2 26.9h6.9L19.5 36.9 32.8 20.6h-7.3z",
            fill: "#FFF4CF",
            stroke: "#FFFFFF",
            strokeOpacity: 0.35,
            strokeWidth: 0.7,
            strokeLinejoin: "round",
          }),
        );
      }

      function Badge(props) {
        var tone = (props && props.tone) || "dim";
        var toneStyle =
          tone === "ok" ? S.badgeOk : tone === "warn" ? S.badgeWarn : tone === "bad" ? S.badgeBad : tone === "blue" ? S.badgeBlue : S.badgeDim;
        var merged = {};
        var k;
        for (k in S.badge) merged[k] = S.badge[k];
        for (k in toneStyle) merged[k] = toneStyle[k];
        return h("span", { style: merged }, props.children);
      }

      function Stat(props) {
        return h(
          "div",
          { style: S.stat },
          h("div", { style: S.statValue }, String(props.value === null || props.value === undefined ? "—" : props.value)),
          h("div", { style: S.statLabel }, props.label),
        );
      }

      function Tag(props) {
        var style = {};
        var k;
        for (k in S.tag) style[k] = S.tag[k];
        if (props && props.tone) {
          if (props.tone === "blue") {
            style.color = C.blue;
            style.borderColor = "rgba(106,168,255,0.32)";
            style.background = C.blueBg;
          } else if (props.tone === "warn") {
            style.color = C.warn;
            style.borderColor = "rgba(245,196,81,0.32)";
            style.background = C.warnBg;
          } else if (props.tone === "ok") {
            style.color = C.ok;
            style.borderColor = "rgba(61,220,151,0.3)";
            style.background = C.okBg;
          }
        }
        return h("span", { style: style }, props.children);
      }

      /* ------------------------------------------------------------ 模型行 */

      function ModelRow(props) {
        var m = props.m;
        var t = props.t;
        var tiers = Array.isArray(m.reasoningTiers) ? m.reasoningTiers : [];
        return h(
          "div",
          { style: S.tr },
          h(
            "div",
            { style: Object.assign({}, S.td, S.tdModel, { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }), title: m.name || m.id },
            h("span", null, m.id),
            m.seriesLabel ? h(Tag, { tone: m.series === "universal" ? "blue" : undefined }, m.seriesLabel) : null,
          ),
          h("div", { style: S.td, title: String(m.contextWindow) }, m.contextLabel || fmtContext(m.contextWindow)),
          h("div", { style: S.td }, m.maxTokens ? String(m.maxTokens) : "—"),
          h(
            "div",
            { style: S.td },
            h(
              "div",
              { style: S.tagRow },
              h(Tag, { tone: m.multimodal ? "blue" : undefined }, m.multimodal ? t("tagMultimodal") : t("tagText")),
            ),
          ),
          h(
            "div",
            { style: S.td },
            tiers.length
              ? h(
                  "div",
                  { style: S.tagRow },
                  tiers.map(function (tier) {
                    return h(Tag, { key: tier }, tier);
                  }),
                )
              : h("span", { style: { color: C.faint } }, t("none")),
          ),
          h(
            "div",
            { style: S.td },
            m.needsEnrich ? h(Tag, { tone: "warn" }, t("tagCanEnrich")) : h(Tag, { tone: "ok" }, t("tagOptimal")),
          ),
        );
      }

      function ProviderBlock(props) {
        var p = props.p;
        var t = props.t;
        return h(
          "div",
          null,
          h(
            "div",
            { style: S.provHead },
            h("span", { style: S.provName }, p.displayName || p.id),
            h(Tag, null, p.id),
            h(Tag, null, p.modelCount + " " + t("unitModels")),
            p.pendingCount ? h(Tag, { tone: "warn" }, p.pendingCount + " " + t("pending")) : h(Tag, { tone: "ok" }, t("tagOptimal")),
          ),
          h(
            "div",
            { style: S.table },
            h(
              "div",
              { style: Object.assign({}, S.tr, S.thead) },
              h("div", { style: S.td }, t("colModel")),
              h("div", { style: S.td }, t("colContext")),
              h("div", { style: S.td }, t("colMaxTokens")),
              h("div", { style: S.td }, t("colModal")),
              h("div", { style: S.td }, t("colReasoning")),
              h("div", { style: S.td }, t("colStatus")),
            ),
            (p.models || []).map(function (m) {
              return h(ModelRow, { key: p.id + "/" + m.id, m: m, t: t });
            }),
          ),
        );
      }

      /* ------------------------------------------------------------ 结果区 */

      function ResultBlock(props) {
        var result = props.result;
        var t = props.t;
        var changes = Array.isArray(result.changes) ? result.changes : [];
        var failed = result.ok === false;
        var changed = result.changed === true;
        return h(
          "div",
          { style: S.card },
          h(
            "div",
            { style: S.cardHead },
            h("div", { style: S.cardTitle }, t("resultTitle")),
            h(
              Badge,
              { tone: failed ? "bad" : changed ? "ok" : "blue" },
              failed ? t("resultFailed") : changed ? t("resultSuccess") : t("resultNoChange"),
            ),
          ),
          h("div", { style: { fontSize: "12.5px" } }, result.summary || (changed ? t("resultSuccess") : t("noChanges"))),
          h(
            "div",
            { style: S.statRow },
            h(Stat, { value: result.changedCount === undefined ? 0 : result.changedCount, label: t("changedCount") }),
            h(Stat, { value: result.modelCount === undefined ? "—" : result.modelCount, label: t("models") }),
            h(Stat, { value: result.providerCount === undefined ? "—" : result.providerCount, label: t("providers") }),
          ),
          h(
            "div",
            { style: S.td },
            h("div", { style: S.cardHint }, t("backupPath")),
            h("div", { style: S.path }, result.backupPath || t("noBackup")),
          ),
          changes.length
            ? h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "6px", maxHeight: "260px", overflowY: "auto" } },
                changes.map(function (c, index) {
                  return h(
                    "div",
                    { key: String(index), style: S.changeLine },
                    h("span", { style: S.changeField }, c.label || c.field),
                    h("span", { style: { color: C.dim, minWidth: "150px" } }, c.provider + " / " + c.model),
                    h("span", { style: S.changeFrom }, fmtValue(c.field, c.from)),
                    h("span", { style: { color: C.faint } }, "→"),
                    h("span", { style: S.changeTo }, fmtValue(c.field, c.to)),
                  );
                }),
              )
            : null,
        );
      }

      /* ------------------------------------------------------------- 主视图 */

      function ModelEnricherView(props) {
        var t = (props && props.t) || bindT(UI_zh);
        var useState = React.useState;
        var useEffect = React.useEffect;
        var useCallback = React.useCallback;

        var statusState = useState(null);
        var status = statusState[0];
        var setStatus = statusState[1];

        var loadingState = useState(true);
        var loading = loadingState[0];
        var setLoading = loadingState[1];

        var runningState = useState(false);
        var running = runningState[0];
        var setRunning = runningState[1];

        var resultState = useState(null);
        var result = resultState[0];
        var setResult = resultState[1];

        var errorState = useState(null);
        var error = errorState[0];
        var setError = errorState[1];

        var expandedState = useState(true);
        var expanded = expandedState[0];
        var setExpanded = expandedState[1];

        var refreshedState = useState(null);
        var refreshedAt = refreshedState[0];
        var setRefreshedAt = refreshedState[1];

        var load = useCallback(function () {
          setLoading(true);
          return requestJson(API + "/status", { headers: { accept: "application/json" }, cache: "no-store" })
            .then(function (data) {
              setStatus(data);
              setError(null);
              setRefreshedAt(new Date());
              return data;
            })
            .catch(function (err) {
              setError((err && err.message) || String(err));
            })
            .then(function () {
              setLoading(false);
            });
        }, []);

        useEffect(
          function () {
            load();
          },
          [load],
        );

        var run = useCallback(
          function () {
            if (running) return;
            setRunning(true);
            setError(null);
            requestJson(API + "/run", {
              method: "POST",
              headers: { "content-type": "application/json", accept: "application/json" },
              body: "{}",
            })
              .then(function (data) {
                setResult(data);
                return load();
              })
              .catch(function (err) {
                setError((err && err.message) || String(err));
                setResult({ ok: false, changed: false, changedCount: 0, summary: (err && err.message) || String(err), changes: [] });
              })
              .then(function () {
                setRunning(false);
              });
          },
          [running, load],
        );

        var pendingCount = status ? status.pendingCount : null;
        var healthTone = status ? (status.health === "optimal" ? "ok" : "warn") : "dim";
        var healthLabel = status ? (status.health === "optimal" ? t("healthy") : t("needsAttention")) : t("unknown");
        var providers = status && Array.isArray(status.providers) ? status.providers : [];
        var totalModels = status ? status.modelCount : null;

        return h(
          "div",
          { style: S.root, "data-dsh-plugin": NS },

          /* ① 标题区 */
          h(
            "div",
            { style: S.header },
            h(Icon, { size: 32 }),
            h(
              "div",
              { style: S.headerText },
              h("h2", { style: S.h1 }, "⚡ " + t("title")),
              h("div", { style: S.subtitle }, t("subtitle")),
              h("div", { style: S.desc }, t("description")),
            ),
          ),

          /* 错误横幅 */
          error ? h("div", { style: S.err }, "⚠ " + error) : null,

          /* ② 健康现状卡片 */
          h(
            "div",
            { style: S.card },
            h(
              "div",
              { style: S.cardHead },
              h(
                "div",
                null,
                h("div", { style: S.cardTitle }, t("statusTitle")),
                h("div", { style: S.cardHint }, t("statusHint")),
              ),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                status && status.autoWatch !== false ? h(Badge, { tone: "blue" }, t("autoWatchOn")) : null,
                h(Badge, { tone: healthTone }, healthLabel),
                h(
                  "button",
                  {
                    type: "button",
                    style: Object.assign({}, S.btn, loading ? { opacity: 0.6, cursor: "progress" } : {}),
                    disabled: loading,
                    onClick: function () {
                      if (!loading) load();
                    },
                  },
                  loading ? t("refreshing") : t("refresh"),
                ),
              ),
            ),
            h(
              "div",
              { style: S.statRow },
              h(Stat, { value: status ? status.providerCount : "—", label: t("providers") }),
              h(Stat, { value: totalModels === null ? "—" : totalModels, label: t("models") }),
              h(Stat, { value: pendingCount === null ? "—" : pendingCount, label: t("pending") }),
            ),
            h(
              "div",
              null,
              h("div", { style: S.cardHint }, t("configFile")),
              h("div", { style: S.path }, (status && status.file) || "—"),
            ),
            refreshedAt ? h("div", { style: S.cardHint }, t("refreshedAt") + " · " + refreshedAt.toLocaleTimeString()) : null,
          ),

          /* ③ 核心操作区 */
          h(
            "div",
            { style: S.card },
            h(
              "div",
              { style: S.cardHead },
              h("div", { style: S.cardTitle }, t("actionTitle")),
              status && status.health ? h(Badge, { tone: healthTone }, healthLabel) : null,
            ),
            h(
              "button",
              {
                type: "button",
                disabled: running,
                style: Object.assign({}, S.bigBtn, running ? S.bigBtnBusy : {}),
                onClick: run,
              },
              running ? t("actionRunning") : t("actionButton"),
            ),
            h("div", { style: S.cardHint }, t("actionHint")),
            h("div", { style: S.cardHint }, t("actionHintDry")),
          ),

          /* ④ 结果展示区 */
          result ? h(ResultBlock, { result: result, t: t }) : null,

          /* ⑤ 模型透视折叠面板 */
          h(
            "div",
            { style: S.card },
            h(
              "div",
              { style: S.cardHead },
              h("div", { style: S.cardTitle }, t("detailTitle")),
              h(
                "button",
                {
                  type: "button",
                  style: S.btn,
                  onClick: function () {
                    setExpanded(!expanded);
                  },
                },
                expanded ? "▾ " + t("detailCollapse") : "▸ " + t("detailExpand"),
              ),
            ),
            expanded
              ? providers.length
                ? h(
                    "div",
                    null,
                    providers.map(function (p) {
                      return h(ProviderBlock, { key: p.id, p: p, t: t });
                    }),
                  )
                : h("div", { style: S.cardHint }, loading ? t("refreshing") : t("none"))
              : h(
                  "div",
                  { style: S.cardHint },
                  (totalModels === null ? "—" : totalModels) + " " + t("models") + " · " + (providers.length || "—") + " " + t("providers"),
                ),
          ),

          /* 页脚规则说明 */
          h("div", { style: S.footer }, t("footerNote")),
        );
      }

      /* ------------------------------------------------------------- 装配 */

      var inject = ["locale", "slots"];

      /**
       * Client plugin body: contribute the 模型补齐助手 settings page.
       * @param ctx - client root context (locale + slots services).
       */
      function apply(ctx) {
        try {
          // slots 是硬依赖；react 缺失时整个页面无意义，直接早退（核心能力在 Host 端，不受影响）。
          if (!React || typeof React.createElement !== "function" || !h) return;
          if (!ctx || !ctx.slots || typeof ctx.slots.inject !== "function") return;

          var t = ctxTranslator(ctx);

          // 字典注册挂在 effect 上：client-plugin 重载（HMR）时先注销再重注册，
          // 避免 locale.register 对同名 namespace 重复注册报错。
          try {
            if (ctx.locale && typeof ctx.locale.register === "function") {
              ctx.effect(function () {
                return ctx.locale.register(NS, { zh: UI_zh, en: UI_en });
              }, NS + ": dictionaries");
            }
          } catch (e) {
            try {
              console.warn("[dsh-model-auto-enricher] locale register failed", e);
            } catch (e2) {}
          }

          ctx.slots.inject("settings.section", function () {
            return ctx.slots.register(
              {
                name: "settings.section",
                id: "model-enricher-section",
                order: 65,
                label: function () {
                  var label = null;
                  try {
                    label = t("nav");
                  } catch (e) {
                    label = null;
                  }
                  return typeof label === "string" && label.length > 0 && label !== "nav" ? label : "模型补齐助手";
                },
                locale: NS,
                inject: function () {
                  return { t: t };
                },
              },
              function () {
                return React.createElement(ModelEnricherView, { ctx: ctx, t: t });
              },
            );
          });

          try {
            console.log("[dsh-model-auto-enricher] settings.section 已注册（id=model-enricher-section, order=65）");
          } catch (e) {}
        } catch (error) {
          try {
            console.error("[dsh-model-auto-enricher] settings page unavailable", error);
          } catch (e2) {}
        }
      }

      exports.inject = inject;
      exports.apply = apply;
      exports.NS = NS;
      exports.ModelEnricherView = ModelEnricherView;
      return module.exports;
    },
  });
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : null);
