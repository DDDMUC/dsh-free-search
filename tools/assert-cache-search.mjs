// Offline cache assertions. Each child exits before its temporary database is removed.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Module from 'node:module';

const scenario = process.argv[2];
if (!scenario) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cache-search-'));
  try {
    for (const name of ['cache', 'missing-sqlite', 'missing-fts']) {
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], {
        env: { ...process.env, RESEARCH_CACHE_DIR: join(root, name) }, stdio: 'inherit',
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${name} child failed`);
    }
    console.log('PASS cache-search: migration, ranking, snippets, literal queries, atomic updates/deletes, expiry, reopen, graceful fallback');
  } finally {
    // root is the exact directory returned by mkdtempSync above, never a user cache.
    rmSync(root, { recursive: true, force: true });
  }
} else if (scenario.startsWith('missing-')) {
  const load = Module._load;
  let failedDb;
  Module._load = function (id, ...args) {
    if (id === 'node:sqlite') {
      if (scenario === 'missing-sqlite') throw new Error('Simulated unavailable node:sqlite');
      const { DatabaseSync } = load.call(this, id, ...args);
      return { DatabaseSync: class extends DatabaseSync {
        constructor(...params) { super(...params); failedDb = this; }
        exec(sql) {
          if (sql.includes('CREATE VIRTUAL TABLE')) throw new Error('no such module: fts5');
          return super.exec(sql);
        }
      } };
    }
    return load.call(this, id, ...args);
  };
  const cache = await import('../lib/cache.js');
  Module._load = load;
  assert.equal(cache.getFresh('url', 1000), null);
  assert.equal(cache.put('url', 'title', 'content'), undefined);
  assert.deepEqual(cache.search('content'), []);
  if (failedDb) {
    assert.throws(() => failedDb.prepare('SELECT 1'), /closed|not open/i);
    const { DatabaseSync } = await import('node:sqlite');
    const check = new DatabaseSync(join(process.env.RESEARCH_CACHE_DIR, 'research.db'));
    assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='pages'").get().n, 0, 'failed migration rolled back');
    check.close();
  }
  console.log(`PASS ${scenario}`);
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(process.env.RESEARCH_CACHE_DIR, { recursive: true });
  const db = new DatabaseSync(join(process.env.RESEARCH_CACHE_DIR, 'research.db'));
  const now = 1800000000000;
  Date.now = () => now;
  const week = 7 * 24 * 3600 * 1000;
  db.exec("CREATE TABLE pages(url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, fetched_at INTEGER NOT NULL)");
  const insert = db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)');
  insert.run('legacy', 'Orion', 'Voyager travels across the distant galaxy', now - 1000);
  insert.run('expired', '', 'expireduniquetoken', now - week - 1);
  insert.run('boundary', '', 'boundaryuniquetoken', now - week);
  const cache = await import('../lib/cache.js');
  assert.equal(cache.getFresh('legacy', 1000).content, 'Voyager travels across the distant galaxy');
  assert.equal(cache.getFresh('legacy', 999), null);
  assert.equal(cache.getFresh('absent', week), null);
  assert.equal(cache.search('Orion galaxy')[0].url, 'legacy', 'migration and separated cross-field terms');
  assert.equal(cache.search('Voyager galaxy')[0].url, 'legacy', 'non-adjacent body terms');
  assert.deepEqual(Object.keys(cache.search('galaxy')[0]).sort(), ['excerpt', 'fetched_at', 'title', 'url']);
  assert.equal(cache.search('galaxy')[0].fetched_at, new Date(now - 1000).toISOString());
  assert.equal(cache.search('boundaryuniquetoken').length, 1);
  assert.equal(cache.search('expireduniquetoken').length, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM pages WHERE url='expired'").get().n, 0);
  const oldRowid = db.prepare("SELECT rowid FROM pages WHERE url='legacy'").get().rowid;
  cache.put('legacy', 'Replacement', 'newuniquetoken');
  assert.equal(db.prepare("SELECT rowid FROM pages WHERE url='legacy'").get().rowid, oldRowid);
  assert.deepEqual(cache.search('galaxy'), []);
  assert.equal(cache.search('newuniquetoken')[0].url, 'legacy');
  assert.throws(() => cache.put('legacy', 'Invalid', null));
  assert.equal(cache.search('newuniquetoken')[0].title, 'Replacement', 'failed replacement leaves page/index intact');
  cache.put('title-rank', 'rankterm', 'neutral');
  cache.put('body-rank', 'neutral', 'rankterm');
  assert.equal(cache.search('rankterm', 1)[0].url, 'title-rank', 'BM25 title boost');
  cache.put('snippet', '', `${'padding '.repeat(100)}snippetneedle ${'tail '.repeat(100)}`);
  assert.match(cache.search('snippetneedle')[0].excerpt, /snippetneedle/);
  assert.ok(cache.search('snippetneedle')[0].excerpt.length < 400);
  cache.put('syntax', '', 'alpha OR beta NOT gamma NEAR title café foo bar');
  cache.put('partial', '', 'alpha');
  for (const query of ['alpha OR beta', 'alpha NOT gamma', 'NEAR(alpha beta)', 'title:alpha', '"alpha" (beta)*', 'foo-bar', 'cafe']) {
    assert.deepEqual(cache.search(query).map(r => r.url), ['syntax'], query);
  }
  for (const query of ['', '  ', '"', '() : * % _ -', '\u0000', '\u0301', null, undefined, {}, [], 123]) {
    assert.deepEqual(cache.search(query), [], `empty/malformed ${String(query)}`);
  }
  for (const limit of [0, -1, 1.5, NaN, Infinity, '2', null]) assert.deepEqual(cache.search('alpha', limit), []);
  cache.put('cjk', '', '这是中文搜索缓存测试内容');
  assert.deepEqual(cache.search('搜索缓存').map(r => r.url), ['cjk'], 'CJK substring fallback');
  cache.put('cjk-literal', '', '前缀中文%_\\后缀');
  assert.deepEqual(cache.search('中文%_\\').map(r => r.url), ['cjk-literal'], 'fallback punctuation is literal');
  assert.deepEqual(cache.search('中文%X'), [], 'percent is not a wildcard');
  cache.put('long-token', '', `longneedle ${'x'.repeat(2000)}`);
  assert.ok(cache.search('longneedle')[0].excerpt.length <= 320, 'bounded FTS excerpt');
  cache.put('long-cjk', '', `${'前'.repeat(500)}中文片段${'后'.repeat(500)}`);
  assert.ok(cache.search('中文片段')[0].excerpt.length <= 320, 'bounded CJK excerpt');
  assert.match(cache.search('中文片段')[0].excerpt, /中文片段/);
  assert.deepEqual(cache.search('x'.repeat(4097)), [], 'oversized query rejected');
  assert.deepEqual(cache.search(Array.from({ length: 65 }, (_, i) => `term${i}`).join(' ')), [], 'too many terms rejected');
  db.exec("DELETE FROM pages WHERE url='syntax'");
  assert.deepEqual(cache.search('beta'), [], 'direct deletion trigger');
  db.prepare('UPDATE pages SET fetched_at=? WHERE url=?').run(now - week - 1, 'legacy');
  cache.search('');
  assert.equal(cache.getFresh('legacy', week * 2), null, 'empty searches still prune');
  db.exec("INSERT INTO pages_fts(pages_fts, rank) VALUES ('integrity-check', 1)");
  const reopened = await import('../lib/cache.js?reopen');
  assert.equal(reopened.search('rankterm', 1)[0].url, 'title-rank', 'idempotent initialization');
  reopened.put('body-rank', '', 'updatedafterreopen');
  assert.equal(cache.search('updatedafterreopen')[0].url, 'body-rank');
  db.exec("INSERT INTO pages_fts(pages_fts, rank) VALUES ('integrity-check', 1)");
  db.close();
  console.log('PASS cache');
}
