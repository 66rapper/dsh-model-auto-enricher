/**
 * dsh-model-auto-enricher — Host 端 Cordis 插件入口
 * =============================================================================
 *
 * 1. 通过 `webServer` 服务注册前缀路由 `/api/model-enricher`：
 *    - GET  /api/model-enricher/status
 *           → 渠道数、模型数、待优化清单、逐模型检测结果 + 自动监听状态（只读，零写入）
 *    - GET  /api/model-enricher
 *           → 端点索引（便于人工排障）
 *    - POST /api/model-enricher/run
 *           → 执行智能补齐；写前自动时间戳备份，返回变更明细与备份路径，并触发宿主配置热重载
 *
 * 2. 全自动增量监听（Auto-Watch & Auto-Enrich）：
 *    - 订阅宿主 `settings/document-updated`（当用户在「模型」设置页新增/修改模型并点击应用时触发）
 *      与 `app-boot/config-reload`，以及插件启动后的首次巡检。
 *    - 一旦检测到新加入且尚未补齐的模型（`pendingCount > 0`），自动在后台完成规格补齐并触发
 *      宿主配置热重载（`hmr.reconcileProfile` / `settings.describe`），无需用户再手动去点按钮。
 *
 * 生命周期：路由与事件监听的 disposer 一律挂进 `ctx.effect()`，插件卸载 / HMR 时自动注销。
 *
 * @module dsh-model-auto-enricher/lib/index
 */

import { API_PREFIX, PLUGIN_ID, inspectConfig, resolveConfigPath, runEnrich } from './core.js';

/** 插件标识（cordis.yml 行与 loader 条目均使用该名字）。 */
export const name = PLUGIN_ID;

/** 依赖声明：只把确定存在的 webServer 放进静态 inject，其余服务一律运行期软读取。 */
export const inject = ['webServer'];

/** 服务读取（不依赖属性访问语义，缺服务时如实返回 undefined 而非抛错）。 */
function readService(ctx, key) {
  try {
    if (ctx && typeof ctx.get === 'function') {
      const service = ctx.get(key);
      if (service !== undefined && service !== null) return service;
    }
  } catch {
    /* 落到下面的属性读取 */
  }
  try {
    return ctx ? ctx[key] : undefined;
  } catch {
    return undefined;
  }
}

function loggerOf(ctx) {
  try {
    const logger = ctx?.logger;
    if (logger && typeof logger.warn === 'function') return logger;
  } catch {
    /* ignore */
  }
  return console;
}

/** 写入 cordis.patch.yml 后通知宿主热重载配置，使新规格立即在模型选择器与设置页生效。 */
async function notifyHostConfigReload(ctx) {
  const log = loggerOf(ctx);
  try {
    const hmr = readService(ctx, 'hmr');
    if (hmr && typeof hmr.reconcileProfile === 'function') {
      await hmr.reconcileProfile();
    }
  } catch (error) {
    log.warn?.(`[${PLUGIN_ID}] 触发 hmr.reconcileProfile 警告：${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const settings = readService(ctx, 'settings');
    if (settings && typeof settings.describe === 'function') {
      settings.describe();
    }
  } catch {
    /* ignore */
  }
}

/** loopback 围栏：与 DSH 既有路由同一口径（本机 127.0.0.1 / ::1 且同源）。 */
function isLoopbackRequest(req) {
  const address = req?.socket?.remoteAddress;
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false;
  const host = req.headers?.host;
  if (typeof host !== 'string') return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') {
    return false;
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  try {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
  } catch {
    /* 头部已发出时忽略 */
  }
  res.end(payload);
}

/** 读取可选 JSON 请求体（空体 / 非法体一律当作 {}，不因此失败）。 */
function readJsonBody(req) {
  return new Promise((resolvePromise) => {
    const chunks = [];
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolvePromise(value);
    };
    try {
      req.on('data', (chunk) => {
        chunks.push(chunk);
        if (Buffer.concat(chunks).length > 65536) finish({});
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (!text) return finish({});
        try {
          const parsed = JSON.parse(text);
          finish(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
        } catch {
          finish({});
        }
      });
      req.on('error', () => finish({}));
    } catch {
      finish({});
    }
  });
}

/**
 * 构建 `/api/model-enricher` 前缀处理器。
 * @param ctx 宿主 cordis 上下文
 * @param config 插件配置（可选 `{ file }` 覆盖目标配置文件）
 * @param state 运行期共享状态（记录最近一次自动补齐信息）
 */
export function createHandler(ctx, config = {}, state = {}) {
  const configuredFile = typeof config?.file === 'string' && config.file.trim() ? config.file.trim() : undefined;

  return async function modelEnricherHandler(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rel = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '');
    const segments = rel.split('/').filter(Boolean);

    if (!isLoopbackRequest(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden: loopback-only' });
      return;
    }

    try {
      // GET /api/model-enricher — 端点索引
      if (segments.length === 0) {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          engine: PLUGIN_ID,
          file: resolveConfigPath(configuredFile),
          autoWatch: state.autoWatch !== false,
          lastAutoEnrich: state.lastAutoEnrich ?? null,
          endpoints: [
            { method: 'GET', path: `${API_PREFIX}/status`, description: '只读体检：渠道数 / 模型数 / 待优化清单' },
            { method: 'POST', path: `${API_PREFIX}/run`, description: '执行补齐（写前自动时间戳备份）；body { dryRun?: boolean }' },
          ],
        });
        return;
      }

      // GET /api/model-enricher/status
      if (segments[0] === 'status') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` });
          return;
        }
        const status = await inspectConfig({ file: configuredFile });
        sendJson(res, 200, {
          ...status,
          readOnly: true,
          autoWatch: state.autoWatch !== false,
          lastAutoEnrich: state.lastAutoEnrich ?? null,
        });
        return;
      }

      // POST /api/model-enricher/run
      if (segments[0] === 'run') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` });
          return;
        }
        const body = await readJsonBody(req);
        const result = await runEnrich({ file: configuredFile, dryRun: body.dryRun === true });
        if (result.changed && !body.dryRun) {
          state.lastAutoEnrich = {
            at: new Date().toISOString(),
            trigger: 'manual',
            changedCount: result.changedCount,
            changedModelCount: result.changedModelCount,
            backupPath: result.backupPath,
            summary: result.summary,
          };
          // 异步通知宿主热重载，不阻塞 HTTP 响应返回
          setTimeout(() => {
            notifyHostConfigReload(ctx).catch(() => {});
          }, 80);
        }
        sendJson(res, 200, {
          ...result,
          autoWatch: state.autoWatch !== false,
          lastAutoEnrich: state.lastAutoEnrich ?? null,
        });
        return;
      }

      sendJson(res, 404, { ok: false, error: `not found: ${url.pathname}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loggerOf(ctx).warn?.(`[${PLUGIN_ID}] ${API_PREFIX}${rel ? `/${rel}` : ''} 失败：${message}`);
      sendJson(res, 500, { ok: false, error: message });
    }
  };
}

/**
 * 插件装配：注册前缀路由 + 自动监听新模型补齐，并把 disposer 交给 `ctx.effect` 管理生命周期。
 * @param ctx 宿主 cordis 上下文
 * @param config 插件配置
 */
export function apply(ctx, config = {}) {
  const log = loggerOf(ctx);
  const webServer = readService(ctx, 'webServer');
  const configuredFile = typeof config?.file === 'string' && config.file.trim() ? config.file.trim() : undefined;
  const autoWatch = config?.autoWatch !== false;

  const state = {
    autoWatch,
    lastAutoEnrich: null,
    running: false,
  };

  if (!webServer || typeof webServer.register !== 'function') {
    log.warn?.(`[${PLUGIN_ID}] webServer 服务不可用：跳过 ${API_PREFIX} 路由注册`);
    return;
  }

  const handler = createHandler(ctx, config, state);

  // 后台自动巡检与补齐（带重入锁与幂等保护：若 pendingCount === 0 则 0 写入、0 副作用）
  async function checkAndAutoEnrich(trigger) {
    if (!state.autoWatch || state.running) return;
    state.running = true;
    try {
      const status = await inspectConfig({ file: configuredFile });
      if (status && status.pendingCount > 0) {
        log.info?.(
          `[${PLUGIN_ID}] 检测到新加入或待优化的模型（触发源: ${trigger}，共 ${status.pendingModelCount} 个模型 / ${status.pendingCount} 处），正在自动智能补齐...`,
        );
        const result = await runEnrich({ file: configuredFile, dryRun: false });
        if (result.changed) {
          state.lastAutoEnrich = {
            at: new Date().toISOString(),
            trigger,
            changedCount: result.changedCount,
            changedModelCount: result.changedModelCount,
            backupPath: result.backupPath,
            summary: result.summary,
          };
          log.info?.(`[${PLUGIN_ID}] 自动补齐完成：${result.summary}`);
          await notifyHostConfigReload(ctx);
        }
      }
    } catch (error) {
      log.warn?.(`[${PLUGIN_ID}] 自动巡检补齐失败（${trigger}）：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      state.running = false;
    }
  }

  ctx.effect(() => {
    const disposers = [];
    let debounceTimer = null;

    const scheduleAutoEnrich = (trigger, delayMs = 600) => {
      if (!state.autoWatch) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        checkAndAutoEnrich(trigger).catch(() => {});
      }, delayMs);
    };

    const disposeRoute = webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler,
    });
    if (typeof disposeRoute === 'function') disposers.push(disposeRoute);

    // 监听设置页保存事件（当用户在「模型」设置页新增或修改模型时，ns === 'llm-pi-ai'）
    try {
      if (typeof ctx.on === 'function') {
        const offSettings = ctx.on('settings/document-updated', (ns) => {
          if (!ns || String(ns).startsWith('llm')) {
            scheduleAutoEnrich(`settings/document-updated(${ns})`, 650);
          }
        });
        if (typeof offSettings === 'function') disposers.push(offSettings);

        const offReload = ctx.on('app-boot/config-reload', () => {
          scheduleAutoEnrich('app-boot/config-reload', 800);
        });
        if (typeof offReload === 'function') disposers.push(offReload);
      }
    } catch (error) {
      log.warn?.(`[${PLUGIN_ID}] 注册配置变更监听失败：${error instanceof Error ? error.message : String(error)}`);
    }

    // 插件挂载后做一次初始巡检，若当前已有未补齐的新模型则立即自动补齐
    scheduleAutoEnrich('plugin-startup', 500);

    log.info?.(`[${PLUGIN_ID}] 已注册路由 ${API_PREFIX} 并开启新模型自动监听补齐`);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const dispose of disposers) {
        try {
          dispose();
        } catch (error) {
          log.warn?.(`[${PLUGIN_ID}] 清理资源失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
  }, `${PLUGIN_ID}: ${API_PREFIX} routes & auto-watch`);
}

export default { name, inject, apply, createHandler };
