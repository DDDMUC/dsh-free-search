// Persistent research cache. Missing SQLite/FTS5 disables caching, not the plugin.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STALE_MS = 7 * 24 * 3600 * 1000;
let db = null;
try {
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
  const dir = process.env.RESEARCH_CACHE_DIR || join(homedir(), ".cache", "dsh-free-search");
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(join(dir, "research.db"));
  db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE");
  db.exec("CREATE TABLE IF NOT EXISTS pages(url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, fetched_at INTEGER NOT NULL)");
  const indexed = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pages_fts'").get();
  db.exec(`
    CREATE INDEX IF NOT EXISTS pages_fetched_at ON pages(fetched_at);
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      title, content, content='pages', content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS pages_fts_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_fts_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_fts_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
      INSERT INTO pages_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
    END;
  `);
  // Backfill only on migration, under the same write lock as trigger creation.
  if (!indexed) db.exec("INSERT INTO pages_fts(pages_fts) VALUES ('rebuild')");
  db.exec("COMMIT");
} catch {
  if (db) {
    try { db.exec("ROLLBACK"); } catch { /* No open transaction. */ }
    try { db.close(); } catch { /* Best-effort initialization cleanup. */ }
  }
  db = null;
}

/** Return {title, content, fetched_at} when fresh, otherwise null. */
export function getFresh(url, maxAgeMs) {
  if (!db) return null;
  const r = db.prepare("SELECT title, content, fetched_at FROM pages WHERE url = ?").get(url);
  if (!r || Date.now() - r.fetched_at > maxAgeMs) return null;
  return r;
}

export function put(url, title, content) {
  if (!db) return;
  // One atomic statement preserves rowid and rolls back both page and index on error.
  db.prepare(`INSERT INTO pages(url, title, content, fetched_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET title=excluded.title, content=excluded.content, fetched_at=excluded.fetched_at`)
    .run(url, title || "", content, Date.now());
}

/** Ranked literal-token AND search; punctuation-only/non-string queries match nothing. */
export function search(query, limit = 8) {
  if (!db) return [];
  const cutoff = Date.now() - STALE_MS;
  // Lazy retention, including on empty queries; triggers delete index entries atomically.
  db.prepare("DELETE FROM pages WHERE fetched_at < ?").run(cutoff);
  // Reject oversized input rather than silently changing its meaning.
  if (typeof query !== "string" || query.length > 4096 || !Number.isSafeInteger(limit) || limit <= 0) return [];
  // Never expose MATCH syntax. Operators, quotes, hyphens and column selectors are
  // ordinary words/separators; separated terms may occur anywhere in either field.
  const tokens = query.match(/[\p{L}\p{N}\p{M}]+/gu) || [];
  if (!tokens.length || tokens.length > 64) return [];
  const unique = [...new Set(tokens)];
  const match = unique.map((token) => `"${token}"`).join(" AND ");
  const rows = db.prepare(`SELECT p.url, p.title, p.fetched_at,
      snippet(pages_fts, -1, '', '', '…', 32) AS excerpt
    FROM pages_fts JOIN pages p ON p.rowid = pages_fts.rowid
    WHERE pages_fts MATCH ? AND p.fetched_at >= ?
    ORDER BY bm25(pages_fts, 5.0, 1.0), p.fetched_at DESC, p.url
    LIMIT ?`).all(match, cutoff, limit);
  // unicode61 treats unspaced CJK text as one token. Only when FTS has no
  // hits, preserve literal CJK substring lookup. instr avoids LIKE wildcards
  // entirely: %, _ and backslashes in this fallback remain literal characters.
  if (!rows.length && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(query)) {
    const literal = query.trim();
    const extra = db.prepare(`SELECT url, title, content, fetched_at FROM pages
      WHERE fetched_at >= ? AND (instr(title, ?) > 0 OR instr(content, ?) > 0)
      ORDER BY fetched_at DESC, url LIMIT ?`)
      .all(cutoff, literal, literal, limit);
    const seen = new Set(rows.map(r => r.url));
    for (const r of extra) {
      if (seen.has(r.url) || rows.length >= limit) continue;
      const source = unique.some(token => r.content.includes(token)) ? r.content : r.title;
      const position = Math.max(0, source.indexOf(unique.find(token => source.includes(token)) || "") - 40);
      rows.push({ ...r, excerpt: (position ? "…" : "") + source.slice(position, position + 320) });
    }
  }
  return rows.map(r => {
    const excerpt = r.excerpt.replace(/\s+/g, " ");
    return { url: r.url, title: r.title,
      excerpt: excerpt.length > 320 ? excerpt.slice(0, 319) + "…" : excerpt,
      fetched_at: new Date(r.fetched_at).toISOString() };
  });
}
