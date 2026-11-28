import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { ENGINES } from '../lib/domain_engines.js';

// Exercise the real adapter and shared fetch helper, intercepting only transport.
const original = https.request;
const originalHttp = http.request;
let fixture;
let calls = [];
https.request = (options, callback) => {
  calls.push(options);
  const req = new EventEmitter();
  req.write = () => {};
  req.destroy = error => req.emit('error', error);
  req.end = () => queueMicrotask(() => {
    if (fixture instanceof Error) return req.emit('error', fixture);
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
const json = value => ({ status: 200, text: JSON.stringify(value) });
async function run(response, query = 'Pride and Prejudice') {
  calls = [];
  fixture = response;
  return ENGINES.openlibrary.run(query);
}
const book = { key: '/works/OL66554W', title: '<b>Pride and Prejudice</b>', author_name: ['Jane Austen'], edition_count: 2, first_publish_year: 1813 };
try {
  const query = 'title & author + 中文 / "quoted"?#%';
  assert.deepEqual(await run(json({ docs: [book] }), `  ${query}  `), [{ url: 'https://openlibrary.org/works/OL66554W', title: 'Pride and Prejudice', snippet: 'Jane Austen · 2 editions', publishedAt: '1813' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hostname, 'openlibrary.org');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].timeout, 20000);
  assert.equal(calls[0].headers.Accept, 'application/json');
  const url = new URL(calls[0].path, 'https://openlibrary.org');
  assert.equal(url.pathname, '/search.json');
  assert.equal(url.searchParams.get('q'), query);
  assert.equal(url.searchParams.get('limit'), '3');
  assert.equal(url.searchParams.get('fields'), 'key,title,author_name,first_publish_year,edition_count');
  assert.deepEqual(await run(json({ docs: [] })), []);
  assert.equal((await run(json({ docs: Array(5).fill(book) }))).length, 3);
  assert.deepEqual(await run(json({ docs: [{ key: 'OL66554W', title: 'Book' }] })), [{ url: 'https://openlibrary.org/works/OL66554W', title: 'Book', snippet: '', publishedAt: '' }]);
  assert.equal((await run(json({ docs: [{ ...book, author_name: ['x'.repeat(500), null] }] })))[0].snippet.length, 280);
  for (const status of [400, 404, 429, 503]) await assert.rejects(run({ status, text: 'failure' }), new RegExp(`HTTP ${status}`));
  await assert.rejects(run(new Error('fixture network failure')), /fixture network failure/);
  await assert.rejects(run({ status: 200, text: '<html>challenge</html>' }), SyntaxError);
  for (const value of [null, {}, { docs: {} }, { error: 'rejected', docs: [] }, { docs: [null] }, { docs: [{}] }, { docs: [{ ...book, key: '//evil.test' }] }, { docs: [{ ...book, title: ' ' }] }]) {
    await assert.rejects(run(json(value)), /malformed|API error/);
  }
  for (const query of ['', '  ', null, 42]) {
    await assert.rejects(run(json({ docs: [] }), query), /non-empty query/);
    assert.equal(calls.length, 0);
  }
  console.log('Open Library: offline mapping, query, empty, malformed and failure fixtures passed');
} finally {
  https.request = original;
  http.request = originalHttp;
}
