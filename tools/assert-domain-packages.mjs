import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PACKAGE_ENGINES } from '../lib/domain_engines_packages.js';

// Offline fixtures replace only transport, exercising the actual adapter and httpsJson.
const original = https.request;
const originalHttp = http.request;
let fixture;
let calls = [];
https.request = (options, callback) => {
  calls.push(options);
  const req = new EventEmitter();
  req.write = () => { throw new Error('Unexpected body'); };
  req.destroy = error => req.emit('error', error);
  req.end = () => queueMicrotask(() => {
    if (fixture instanceof Error) return req.emit('error', fixture);
    if (fixture.timeout) return req.emit('timeout');
    const res = new EventEmitter();
    res.statusCode = fixture.status;
    res.headers = {};
    callback(res);
    res.emit('data', Buffer.from(fixture.text));
    res.emit('end');
  });
  return req;
};
http.request = () => { throw new Error('Unexpected HTTP request'); };
const json = data => ({ status: 200, text: JSON.stringify(data) });
async function run(response, q = 'phoenix') {
  fixture = response;
  calls = [];
  return PACKAGE_ENGINES.hex_pm.run(q);
}
const pkg = { name: 'phoenix', latest_stable_version: '1.8.0', latest_version: '1.9.0-rc.1', meta: { description: '<p>Web &amp; framework</p>' }, downloads: { all: 123 }, updated_at: '2026-01-01T00:00:00Z', html_url: 'javascript:alert(1)' };
try {
  assert.deepEqual(Object.keys(PACKAGE_ENGINES), ['hex_pm']);
  assert.equal(typeof PACKAGE_ENGINES.hex_pm.desc, 'string');
  const q = 'name:phoenix* & + 中文 😀 / "quoted"?#%';
  assert.deepEqual(await run(json([pkg]), ` ${q} `), [{ url: 'https://hex.pm/packages/phoenix', title: 'phoenix 1.8.0 on Hex.pm', snippet: 'Web & framework · downloads 123', publishedAt: '' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hostname, 'hex.pm');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].timeout, 20000);
  assert.deepEqual(calls[0].headers, { 'User-Agent': 'dsh-free-search/0.8 (plugin)', Accept: 'application/json' });
  const url = new URL(calls[0].path, 'https://hex.pm');
  assert.equal(url.pathname, '/api/packages');
  assert.deepEqual([...url.searchParams], [['search', q], ['sort', 'total_downloads'], ['page', '1'], ['per_page', '3']]);
  assert.deepEqual(await run(json([])), []);
  assert.equal((await run(json(Array(5).fill(pkg)))).length, 3);
  for (const status of [301, 400, 401, 403, 404, 422, 429, 500, 503]) {
    await assert.rejects(run({ status, text: 'failure' }), new RegExp(`HTTP ${status}`));
    assert.equal(calls.length, 1);
  }
  await assert.rejects(run(new Error('fixture network failure')), /fixture network failure/);
  await assert.rejects(run({ timeout: true }), /timeout after 20000ms/);
  await assert.rejects(run({ status: 200, text: '<html>challenge</html>' }), /malformed JSON/);
  for (const data of [null, {}, 'text', 1, { packages: [] }, { error: 'rejected' }, { status: 429 }, [null], [{}], [[]]]) {
    await assert.rejects(run(json(data)), /malformed/);
  }
  for (const query of ['', '  ', null, 42, {}, [], undefined]) {
    calls = [];
    await assert.rejects(PACKAGE_ENGINES.hex_pm.run(query), /non-empty query/);
    assert.equal(calls.length, 0);
  }
  for (const name of ['', '..', 'a/b', 'a?b', 'a#b', 'a%2fb', 'a\\b', 'javascript:alert(1)', '<b>x</b>', 12, '中文']) {
    await assert.rejects(run(json([{ ...pkg, name }])), /malformed package name/);
  }
  const minimal = (await run(json([{ name: 'a_b1' }])))[0];
  assert.deepEqual(minimal, { url: 'https://hex.pm/packages/a_b1', title: 'a_b1 on Hex.pm', snippet: '', publishedAt: '' });
  assert.equal((await run(json([{ ...pkg, latest_stable_version: null }])))[0].title, 'phoenix 1.9.0-rc.1 on Hex.pm');
  const hostile = (await run(json([{ ...pkg, latest_stable_version: '<script>gone</script><b>1.0</b>', meta: { description: '<script>evil()</script>&lt;b&gt;Safe\u0000 ' + '😀'.repeat(300) } }])))[0];
  assert.equal(hostile.title, 'phoenix 1.0 on Hex.pm');
  assert.equal(Array.from(hostile.snippet).length, 280);
  assert.equal(hostile.snippet.startsWith('bSafe '), true);
  assert.equal(hostile.snippet.endsWith('😀'), true);
  assert.equal(hostile.snippet.includes('\ufffd'), false);
  for (const all of [-1, 1.5, '123', null, {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await run(json([{ name: 'pkg', downloads: { all }, meta: { description: 4 } }])))[0].snippet, '');
  }
  assert.equal((await run(json([{ name: 'pkg', downloads: { all: 0 } }])))[0].snippet, 'downloads 0');
  const long = (await run(json([{ name: 'a'.repeat(400), latest_version: '😀'.repeat(100), meta: { description: '😀'.repeat(400) } }])))[0];
  assert.equal(Array.from(long.title).length, 280);
  assert.equal(Array.from(long.snippet).length, 280);
  console.log('package domain adapters: offline fixtures passed (1 adapter; transport, errors, query escaping, canonical URLs, Unicode limits)');
} finally {
  https.request = original;
  http.request = originalHttp;
}
