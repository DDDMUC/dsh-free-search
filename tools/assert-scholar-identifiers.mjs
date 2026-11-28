import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { ENGINES } from '../lib/domain_engines.js';
import { doiIdentifier, arxivIdentifier } from '../lib/scholar_identifiers.js';

// Mock the existing transport, not the adapters: no request can reach a network.
const original = https.request;
const originalHttp = http.request;
let fixture;
let calls = [];
https.request = (options, callback) => {
  calls.push(options);
  const req = new EventEmitter();
  req.write = () => {};
  req.destroy = (error) => req.emit('error', error);
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
async function run(engine, query, response) {
  fixture = response;
  calls = [];
  return ENGINES[engine].run(query);
}
const json = (message) => ({ status: 200, text: JSON.stringify({ message }) });
const atom = (id) => ({ status: 200, text: `<feed xmlns="http://www.w3.org/2005/Atom">${id ? `<entry><id>http://arxiv.org/abs/${id}</id><title>Fixture title</title><summary>Fixture abstract</summary><published>2024-01-01</published></entry>` : ''}</feed>` });
try {
  for (const input of ['10.1000/ABC', 'doi: 10.1000/ABC', 'https://doi.org/10.1000%2FABC?x=1#top']) {
    assert.equal(doiIdentifier(input), '10.1000/abc');
    const result = await run('crossref', input, json({ DOI: '10.1000/ABC', title: ['Fixture title'], issued: { 'date-parts': [[2024]] } }));
    assert.equal(result[0].title, 'Fixture title');
    assert.equal(calls[0].path, '/works/10.1000%2Fabc');
  }
  for (const [input, id] of [['1706.03762', '1706.03762'], ['arXiv:1706.03762v2', '1706.03762v2'], ['https://arxiv.org/pdf/hep-th/9901001v2.pdf', 'hep-th/9901001v2'], ['https://doi.org/10.48550/arXiv.1706.03762', '1706.03762']]) {
    assert.equal(arxivIdentifier(input), id);
    const result = await run('arxiv', input, atom(id));
    assert.equal(result[0].title, 'Fixture title');
    assert.equal(calls[0].path, `/api/query?id_list=${encodeURIComponent(id)}&max_results=3`);
  }
  for (const [engine, query, response] of [['crossref', 'papers about 10.1000/abc', json({ items: [] })], ['arxiv', 'Results for 1706.03762 tokens', atom(null)]]) {
    assert.deepEqual(await run(engine, query, response), []);
    assert.match(calls[0].path, engine === 'crossref' ? /\?query=/ : /\?search_query=all:/);
  }
  for (const [engine, query] of [['crossref', '10.1000/abc'], ['arxiv', '1706.03762']]) {
    assert.deepEqual(await run(engine, query, { status: 404, text: 'not found' }), []);
    assert.equal(calls.length, 1, 'exact miss must never fall back');
    await assert.rejects(run(engine, query, { status: 503, text: '' }), /HTTP 503/);
    await assert.rejects(run(engine, query, new Error('fixture network failure')), /fixture network failure/);
    await assert.rejects(run(engine, query, { status: 200, text: 'not a response' }), /malformed/);
  }
  await assert.rejects(run('crossref', '10.1000/abc', json({ DOI: '10.1000/unrelated' })), /mismatched/);
  await assert.rejects(run('crossref', '10.1000/abc', json({})), /malformed/);
  await assert.rejects(run('arxiv', '1706.03762', atom('2401.12345')), /mismatched/);
  await assert.rejects(run('arxiv', '1706.03762v2', atom('1706.03762v3')), /mismatched/);
  assert.equal((await run('arxiv', '1706.03762', atom('1706.03762v7'))).length, 1);
  assert.deepEqual(await run('arxiv', '1706.03762', atom(null)), []);
  for (const [engine, query] of [['crossref', 'doi:bad'], ['crossref', 'https://doi.org/10.1000%ZZ'], ['arxiv', 'arxiv:bad']]) {
    await assert.rejects(run(engine, query, atom(null)), /Malformed/);
    assert.equal(calls.length, 0);
  }
  await assert.rejects(run('arxiv', '1706.03762', { status: 200, text: '<feed><entry><id>bad</id></feed>' }), /malformed/);
  await assert.rejects(run('arxiv', '1706.03762', { status: 200, text: '<feed><entry extra="yes"><id>bad</id></entry></feed>' }), /malformed/);
  console.log('scholar identifier adapters: offline fixtures passed');
} finally {
  https.request = original;
  http.request = originalHttp;
}
