// Headless engine dispatch for the MCP server. Free engines stay keyless;
// keyed engines read credentials from the MCP process environment and are only
// used when the caller names them (auto never spends paid quota).
import { searchBing } from "./engines/bing.js";
import { searchDdgHtml } from "./engines/ddg.js";
import { searchDdgLite } from "./engines/ddg-lite.js";
import { searchGoogle } from "./engines/google.js";
import { searchBaidu } from "./engines/baidu.js";
import { searchBrave } from "./engines/brave.js";
import { searchMetaso } from "./engines/metaso.js";
import { searchZhipu } from "./engines/zhipu.js";
import { searchYandex } from "./engines/yandex.js";
import { searchYuanbao } from "./engines/yuanbao.js";
import { searchDeepSeekTools } from "./engines/deepseek-tools.js";
import { parseTimeRange } from "./engines/shared.js";

export const MCP_ENGINE_IDS = [
  "auto",
  "bing",
  "ddg",
  "ddg-lite",
  "google",
  "baidu",
  "brave",
  "metaso",
  "yandex",
  "yuanbao",
  "deepseek-tools",
  "zhipu",
];

export const MCP_FREE_ENGINES = ["bing", "ddg", "ddg-lite"];
export const MCP_KEYED_ENGINES = ["google", "baidu", "brave", "metaso", "yandex", "yuanbao", "deepseek-tools", "zhipu"];

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requireEnv(name, label) {
  const value = env(name);
  if (!value) throw new Error(`${label} requires ${name}`);
  return value;
}

function timeRangeOf(args) {
  return parseTimeRange(args?.time_range);
}

export async function runMcpEngine(id, query, options = {}) {
  const engine = String(id ?? "").trim().toLowerCase() || "auto";
  if (!MCP_ENGINE_IDS.includes(engine)) throw new Error(`unknown engine "${engine}"`);
  const maxResults = Math.min(Math.max(Number(options.maxResults) || 8, 1), 20);
  const safeSearch = String(options.safeSearch ?? env("MCP_SAFE_SEARCH", "off")).trim().toLowerCase();
  const lang = env("MCP_LANG", "zh");
  const timeRange = timeRangeOf(options);
  const signal = options.signal;

  if (engine === "auto") {
    const errors = [];
    for (const candidate of MCP_FREE_ENGINES) {
      try {
        const result = await runMcpEngine(candidate, query, options);
        if (result.sources.length > 0) return result;
        errors.push(`${candidate}: no results`);
      } catch (error) {
        errors.push(`${candidate}: ${error?.message ?? String(error)}`);
      }
    }
    throw new Error(`all free engines failed (${errors.join("; ")})`);
  }

  switch (engine) {
    case "bing":
      return {
        engine,
        ...(await searchBing(query, maxResults, {
          lang,
          safeSearch,
          ...(env("MCP_BING_MARKET") ? { bingMarket: env("MCP_BING_MARKET") } : {}),
        }, signal)),
      };
    case "ddg":
      return { engine, ...(await searchDdgHtml(query, maxResults, { safeSearch, timeRange }, signal)) };
    case "ddg-lite":
      return { engine, ...(await searchDdgLite(query, maxResults, { safeSearch, timeRange }, signal)) };
    case "google": {
      const key = requireEnv("GOOGLE_CSE_API_KEY", "Google");
      const cx = requireEnv("GOOGLE_CSE_ID", "Google");
      return {
        engine,
        ...(await searchGoogle(query, maxResults, key, cx, timeRange, { lang, safeSearch }, signal)),
      };
    }
    case "baidu":
      return { engine, ...(await searchBaidu(query, maxResults, requireEnv("BAIDU_API_KEY", "Baidu"), timeRange, signal)) };
    case "brave":
      return { engine, ...(await searchBrave(query, maxResults, requireEnv("BRAVE_API_KEY", "Brave"), timeRange, signal)) };
    case "metaso": {
      const key = requireEnv("METASO_API_KEY", "Metaso");
      return {
        engine,
        ...(await searchMetaso(query, maxResults, key, env("MCP_METASO_SCOPE", "webpage"), timeRange, signal)),
      };
    }
    case "yandex": {
      const key = requireEnv("YANDEX_API_KEY", "Yandex");
      const folderId = requireEnv("YANDEX_FOLDER_ID", "Yandex");
      return {
        engine,
        ...(await searchYandex(query, maxResults, key, folderId, {
          searchType: env("MCP_YANDEX_SEARCH_TYPE", "auto"),
          lang,
          safeSearch,
        }, timeRange, signal)),
      };
    }
    case "yuanbao": {
      const key = requireEnv("TENCENTCLOUD_WSA_APIKEY", "Yuanbao");
      return {
        engine,
        ...(await searchYuanbao(query, maxResults, key, {
          mode: env("MCP_YUANBAO_MODE", "0"),
          site: env("MCP_YUANBAO_SITE"),
        }, timeRange, signal)),
      };
    }
    case "deepseek-tools": {
      const key = env("DEEPSEEK_TOOLS_API_KEY") || requireEnv("DEEPSEEK_API_KEY", "DeepSeek");
      return {
        engine,
        ...(await searchDeepSeekTools(query, maxResults, key, timeRange, signal, env("MCP_DEEPSEEK_TOOLS_URL"))),
      };
    }
    case "zhipu": {
      const key = requireEnv("ZHIPU_API_KEY", "Zhipu");
      return {
        engine,
        ...(await searchZhipu(query, maxResults, key, timeRange, signal, env("MCP_ZHIPU_SEARCH_ENGINE", "search_std"))),
      };
    }
    default:
      throw new Error(`unknown engine "${engine}"`);
  }
}
