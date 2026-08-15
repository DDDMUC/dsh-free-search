// dsh-free-search 竞品雷达
// 监控搜索相关竞品：awesome 列表新增、已知竞品更新、GitHub dsh-plugin topic 新项目
// 用法: node tools/competitor-radar.mjs [--full]
//   --full  完整扫描（默认只输出变化）
// 输出: 新竞品 / 竞品更新 / 值得抄的功能建议
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, ".radar-state.json");
const FULL = process.argv.includes("--full");

// 已知竞品（持续监控）
const KNOWN_COMPETITORS = [
  ["anweat/dsh-web-search-pro", "重引擎+平台搜索"],
  ["anysearch-team/anysearch-dsh", "AnySearch 官方"],
  ["cinob/dsh-web-search-multi", "多引擎+免费额度API"],
  ["SZMY-haruhi/dsh-web-search-Tavily", "Tavily keyless"],
  ["TonyDua/dsh-web-search-exa", "Exa keyless"],
  ["us/dsh-crw", "fastCRW"],
  ["MCapricorns/dsh-web-querit", "Querit"],
  ["1624318455/dsh-plugin-tavily", "Tavily"],
  ["tonyd2wild/DeepSeek-Harness-Web-Tools", "DDG shim+fetch"],
  ["RealAlexandreAI/dsh-all-search", "AnySearch 社区版"],
];

// 关键词：判断插件是否"搜索相关"（精确匹配，避免误报）
const SEARCH_KEYWORDS = [
  "web_search", "web-search", "web search",
  "tavily", "exa", "duckduckgo", "serper", "brave", "bocha", "searxng",
  "querit", "crw", "anysearch", "jina", "search1api",
  "web_fetch", "web-fetch", "fetch", "crawl", "scrape", "爬取",
  "search engine", "search provider", "搜索插件", "搜索引擎",
  "reverse image search", "deep-research", "deep research",
  "search built for agents",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0";

async function ghFetch(path, token) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      "user-agent": UA,
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${path}`);
  return r.json();
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { known: {}, awesome: new Set() };
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return { known: s.known ?? {}, awesome: new Set(s.awesome ?? []) };
  } catch {
    return { known: {}, awesome: new Set() };
  }
}

function saveState(state) {
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ known: state.known, awesome: [...state.awesome] }, null, 2),
    "utf8"
  );
}

async function main() {
  const token = process.env.GH_TOKEN ?? "";
  const state = loadState();
  const report = [];
  const now = new Date().toISOString().slice(0, 10);

  console.log("=== dsh-free-search 竞品雷达 ===");
  console.log("时间:", now, FULL ? "(完整扫描)" : "(增量扫描)");
  console.log("");

  // 1. 已知竞品更新检查
  console.log("── 已知竞品状态 ──");
  for (const [repo, note] of KNOWN_COMPETITORS) {
    try {
      const info = await ghFetch(`/repos/${repo}`, token);
      const pushed = info.pushed_at?.slice(0, 10) ?? "?";
      const prev = state.known[repo];
      if (FULL || !prev || prev.pushed !== pushed) {
        const changed = prev && prev.pushed !== pushed ? " 🔄 有更新" : "";
        console.log(`  ${repo.padEnd(38)} ⭐${info.stargazers_count} 更新:${pushed}${changed} [${note}]`);
        if (changed) {
          // 有更新时抓最新提交，看看改了什么
          try {
            const commits = await ghFetch(`/repos/${repo}/commits?per_page=3`, token);
            console.log("     最近提交:");
            for (const c of commits) {
              console.log(`       - ${c.commit.message.split("\n")[0].slice(0, 90)}`);
            }
            report.push({ repo, type: "update", note, commits: commits.map((c) => c.commit.message.split("\n")[0]) });
          } catch {}
        }
      }
      state.known[repo] = { pushed, stars: info.stargazers_count };
    } catch (e) {
      console.log(`  ${repo}: 获取失败 (${e.message.slice(0, 40)})`);
    }
  }

  // 2. awesome-dsh-plugin 新增搜索类插件
  console.log("");
  console.log("── awesome 列表新增搜索类插件 ──");
  try {
    const readme = await (await fetch("https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/README.md", { headers: { "user-agent": UA } })).text();
    const lines = readme.split("\n");
    let newFound = 0;
    for (const line of lines) {
      if (!line.startsWith("- [")) continue;
      const url = line.match(/\(https:\/\/github\.com\/([^)]+)\)/)?.[1];
      if (!url) continue;
      const text = line.toLowerCase();
      if (!SEARCH_KEYWORDS.some((k) => text.includes(k))) continue;
      if (!state.awesome.has(url) && !KNOWN_COMPETITORS.some(([r]) => r === url)) {
        console.log(`  🆕 ${url}`);
        console.log(`     ${line.slice(0, 150)}`);
        state.awesome.add(url);
        report.push({ repo: url, type: "new", desc: line.slice(0, 200) });
        newFound++;
      }
    }
    if (newFound === 0) console.log("  （无新增）");
  } catch (e) {
    console.log(`  获取失败: ${e.message.slice(0, 60)}`);
  }

  // 3. GitHub dsh-plugin topic 新项目（最近创建）
  console.log("");
  console.log("── GitHub dsh-plugin topic 新项目 ──");
  try {
    const q = await ghFetch(
      `/search/repositories?q=topic:dsh-plugin+created:>${new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}&sort=created&order=desc&per_page=10`,
      token
    );
    let found = 0;
    for (const item of q.items ?? []) {
      const desc = `${item.description ?? ""} ${item.name}`.toLowerCase();
      if (SEARCH_KEYWORDS.some((k) => desc.includes(k))) {
        console.log(`  🆕 ${item.full_name} ⭐${item.stargazers_count} (${item.created_at.slice(0, 10)})`);
        console.log(`     ${(item.description ?? "").slice(0, 120)}`);
        report.push({ repo: item.full_name, type: "new", desc: item.description ?? "" });
        found++;
      }
    }
    if (found === 0) console.log("  （近7天无搜索类新项目）");
  } catch (e) {
    console.log(`  获取失败: ${e.message.slice(0, 60)}`);
  }

  saveState(state);

  console.log("");
  console.log("── 值得关注的功能方向 ──");
  const features = [];
  for (const item of report) {
    const d = (item.desc ?? "").toLowerCase();
    if (d.includes("platform") || d.includes("reddit") || d.includes("bilibili")) features.push("平台搜索扩展");
    if (d.includes("cache") || d.includes("history")) features.push("搜索缓存/历史");
    if (d.includes("fetch") || d.includes("crawl") || d.includes("scrape")) features.push("抓取增强");
    if (d.includes("keyless") || d.includes("anonymous")) features.push("更多 keyless 引擎");
    if (d.includes("screenshot") || d.includes("playwright")) features.push("截图/渲染");
    if (d.includes("rss") || d.includes("news")) features.push("RSS/新闻源");
    if (d.includes("voice")) features.push("语音输入");
    if (d.includes("multi") && d.includes("engine")) features.push("多引擎融合(RRF)");
  }
  const uniq = [...new Set(features)];
  if (uniq.length === 0) console.log("  （暂无新方向）");
  else for (const f of uniq) console.log(`  💡 ${f}`);

  console.log("");
  console.log(`雷达完成。${report.length} 条变化。状态已存 ${STATE_FILE}`);
}

main().catch((e) => {
  console.error("雷达失败:", e.message);
  process.exit(1);
});
