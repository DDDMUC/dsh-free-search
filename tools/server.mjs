import http from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PORT = 4789;
const PATCH_FILE = join(homedir(), ".dsh", "profiles", "web", "cordis.patch.yml");
const HTML_FILE = new URL("./switch-engine.html", import.meta.url);

const ENGINES = ["ddg", "ddg-lite", "bing", "mojeek", "exa", "perplexity", "deepseek-official"];

function readCurrentEngine() {
  if (!existsSync(PATCH_FILE)) return null;
  const content = readFileSync(PATCH_FILE, "utf8");
  const m = content.match(/searchProvider:\s*([^\s]+)/);
  return m ? m[1] : null;
}

function writeEngine(engine) {
  if (!existsSync(PATCH_FILE)) {
    throw new Error(`配置文件不存在: ${PATCH_FILE}`);
  }
  let content = readFileSync(PATCH_FILE, "utf8");
  const re = /^(\s*- id: web\r?\n\s*config:\r?\n\s*searchProvider: )[^\r\n]*/m;
  if (re.test(content)) {
    content = content.replace(re, `$1${engine}`);
  } else {
    content += `\n# ============================================================\n# 搜索引擎 provider（由 dsh-free-search 切换工具写入）\n# ============================================================\n- id: web\n  config:\n    searchProvider: ${engine}\n`;
  }
  writeFileSync(PATCH_FILE, content, "utf8");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(HTML_FILE, "utf8"));
      return;
    }
    if (url.pathname === "/api/current" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, engine: readCurrentEngine() }));
      return;
    }
    if (url.pathname === "/api/switch" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { engine } = JSON.parse(body || "{}");
      if (!ENGINES.includes(engine)) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: `未知引擎: ${engine}` }));
        return;
      }
      writeEngine(engine);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, engine }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`DSH 搜索引擎切换器已启动: http://127.0.0.1:${PORT}`);
  console.log("按 Ctrl+C 关闭");
});
