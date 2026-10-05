// MCP JSON-RPC 适配器（方案 v4.3 §2.7）：知乎开放平台等 streamable-http MCP 引擎共用。
// 零新依赖：网络只用 node 标准库（node:https；http:// 端点仅为本地单测保留——
// 不用 undici/fetch，部分网关按指纹拦 undici，见 research.js #crawl4ai 注记）。
// 协议要求全部落地：
//  - JSON 与 SSE（text/event-stream 的 data: 行）双响应格式解析；
//  - JSON-RPC error（envelope.error）与工具级 isError（result.isError）区分并各自抛错；
//  - 认证失败（HTTP 401/403）与超时/网络错误给出可被 classifyFailure 归类的消息；
//  - 不假定 HTTP 200 + JSON 解析成功即调用成功：envelope/result/content 逐层校验。
//
// 错误消息与 free-search 失败分类（classifyFailure）的约定：
//   认证 → "authentication failed (HTTP 401/403)" → auth（会话级冷却）
//   超时/网络 → "timed out"/"aborted"/"ECONN…" → transient（同引擎重试一次）
//   协议/解析 → "invalid JSON"/"unexpected"/"parse" → invalid-response

import https from "node:https";
import http from "node:http";

/**
 * 解析 MCP 响应体：先按纯 JSON 解析，失败再按 SSE 帧提取。
 * SSE 帧：多个 `data:` 行（同一事件内按规范以 \n 拼接）；这里同时兼容
 * “每行独立一个完整 JSON-RPC envelope”的服务端实现——两种都取能解析出的 envelope，
 * 优先带 result/error 字段的那条，否则取最后一条可解析的。
 * @param {string} rawText
 * @returns {object|null} JSON-RPC envelope，无法解析返回 null
 */
export function parseMcpResponseText(rawText) {
  if (typeof rawText !== "string" || rawText.length === 0) return null;
  const direct = tryJson(rawText);
  if (direct) return direct;

  // SSE：按空行切事件；事件内拼接 data: 行负载
  const events = rawText.split(/\r?\n\r?\n/);
  const payloads = [];
  for (const event of events) {
    const dataLines = [];
    for (const line of event.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length > 0) payloads.push(dataLines.join("\n"));
  }
  // 兼容没有空行分隔、每行一个 data: 的实现
  if (payloads.length === 0) {
    for (const line of rawText.split(/\r?\n/)) {
      if (line.startsWith("data:")) payloads.push(line.slice(5).replace(/^ /, ""));
    }
  }
  let fallback = null;
  for (const payload of payloads) {
    const parsed = tryJson(payload);
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.result !== undefined || parsed.error !== undefined) return parsed;
    fallback = fallback ?? parsed;
  }
  return fallback;
}

function tryJson(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 发送一次 JSON-RPC 2.0 请求并返回 envelope.result（工具调用的 CallToolResult）。
 * 任何失败路径都以 Error 抛出（消息见文件头分类约定），不返回部分结果。
 *
 * @param {string} endpoint MCP HTTP 端点（如 https://developer.zhihu.com/api/mcp/v1）
 * @param {object} headers 额外请求头（Authorization / 自定义 UA 等；Content-Type/Accept 内置可覆盖）
 * @param {string} method JSON-RPC 方法（"tools/call" / "initialize" / …）
 * @param {object|undefined} params JSON-RPC params
 * @param {{timeoutMs?: number, signal?: AbortSignal, id?: number|string, label?: string}} [options]
 *   timeoutMs 默认 30000，<=0 表示不限；label 用于错误消息前缀（默认取端点 hostname）
 * @returns {Promise<object>} JSON-RPC result 对象（tools/call 时为 {content, isError?}）
 */
export async function mcpCall(endpoint, headers = {}, method, params, options = {}) {
  const { timeoutMs = 30000, signal, id = 1 } = options;
  const label = options.label ?? safeHost(endpoint);
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    ...(params !== undefined ? { params } : {}),
  });

  const rawText = await httpsPost(endpoint, body, {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...headers,
  }, { timeoutMs, signal, label });

  const envelope = parseMcpResponseText(rawText);
  if (!envelope) {
    throw new Error(`${label} MCP response is not valid JSON or SSE (parse failed): ${rawText.slice(0, 200)}`);
  }
  if (envelope.error) {
    const { code, message } = envelope.error;
    throw new Error(`${label} MCP error ${code ?? "?"}: ${message ?? JSON.stringify(envelope.error)}`);
  }
  const result = envelope.result;
  if (result === null || result === undefined || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${label} MCP result missing or malformed: ${JSON.stringify(envelope).slice(0, 200)}`);
  }
  if (method === "tools/call" && result.isError) {
    // 工具级错误：isError=true，正文在 content 里，不能当搜索结果
    const errText = mcpContentText(result);
    throw new Error(`${label} MCP tool error (isError): ${errText.slice(0, 200) || JSON.stringify(result).slice(0, 200)}`);
  }
  return result;
}

/** 从 CallToolResult.content 里取第一条 text 类型的文本（无则返回空串）。 */
export function mcpContentText(result) {
  if (!result || !Array.isArray(result.content)) return "";
  const item = result.content.find((c) => c && c.type === "text" && typeof c.text === "string");
  return item ? item.text : "";
}

function safeHost(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return "MCP";
  }
}

// 真实引擎端点都是 https；http 仅为本地错误路径单测保留（同一套 node 标准库实现）
function transportFor(endpoint) {
  try {
    return new URL(endpoint).protocol === "http:" ? http : https;
  } catch {
    return https;
  }
}

function httpsPost(endpoint, body, headers, { timeoutMs, signal, label }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const onAbort = () => {
      req.destroy(new Error(`${label} MCP request aborted`));
    };
    const req = transportFor(endpoint).request(endpoint, {
      method: "POST",
      headers: { ...headers, "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        const text = Buffer.concat(chunks).toString("utf8");
        if (settled) return;
        settled = true;
        cleanup();
        if (status === 401 || status === 403) {
          reject(new Error(`${label} MCP authentication failed (HTTP ${status}) - check the API key`));
          return;
        }
        if (status < 200 || status >= 300) {
          reject(new Error(`${label} MCP HTTP ${status}: ${text.slice(0, 200)}`));
          return;
        }
        resolve(text);
      });
    });
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      // destroy(err) 的 err 带上下文直接透传；网络栈错误补前缀
      reject(error instanceof Error && /MCP/.test(error.message ?? "")
        ? error
        : new Error(`${label} MCP request failed: ${error?.message ?? String(error)}`));
    });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        req.destroy(new Error(`${label} MCP request timed out after ${timeoutMs}ms (timeout)`));
      }, timeoutMs);
    }
    if (signal?.aborted) {
      req.destroy(new Error(`${label} MCP request aborted`));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    req.end(body);
  });
}
