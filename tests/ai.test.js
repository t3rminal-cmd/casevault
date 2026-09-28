// Tests for the AI review layer against a mock Ollama. Run: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const AI = require('../js/checker/ai.js');
const mock = require('./mock-ollama.js');

const doc = (docIndex, name, role, ...paras) => ({ docIndex, name, role, paragraphs: paras.map((text, index) => ({ index, page: 1, text })) });

test('detects models and maps them to profiles', async (t) => {
  const server = await mock.start(0);
  t.after(() => server.close());
  const port = server.address().port;
  const fetchImpl = (url, o) => fetch(url.replace(':11434', `:${port}`), o);
  const d = await AI.detect({ fetchImpl });
  assert.strictEqual(d.status, 'connected');
  assert.deepStrictEqual(d.profiles, { quick: 'qwen2.5:7b', thorough: 'qwen2.5:14b', light: 'llama3.2:3b' });
  assert.strictEqual(d.embed, 'nomic-embed-text:latest');
  assert.deepStrictEqual(AI.choose(d, 'auto'), { profile: 'quick', model: 'qwen2.5:7b', requested: 'auto', fallback: false });
  assert.strictEqual(AI.choose(d, 'thorough').model, 'qwen2.5:14b');
  assert.strictEqual(AI.choose(d, 'rules-only'), null);
});

test('offline when nothing is listening', async () => {
  const d = await AI.detect({ fetchImpl: () => Promise.reject(new TypeError('refused')) });
  assert.strictEqual(d.status, 'offline');
  assert.strictEqual(AI.choose(d, 'auto'), null);
});

test('review: contradictions, not-found, and hallucinated quotes are discarded', async (t) => {
  const server = await mock.start(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const docs = [
    doc(0, 'Affidavit.docx', 'affidavit',
      'Witness Robert Lee told Officer Diaz that he heard three shots and saw a male run south on Oak Street.',
      'Officer Diaz observed a blue Honda Civic parked in the driveway of the house.',
      'The affiant saw a hallucinated figure climbing the fence behind the garage.',
      'The suspect later posted bail at the county courthouse on Friday morning.',
      'Sworn and subscribed before me this day.'),
    doc(1, 'Report 26-4481.pdf', 'report',
      'Officer Dias observed a blue Honda Civic parked in the driveway. The vehicle was unoccupied.',
      'Witness Robert Lee stated he heard two shots and saw a male run north on Oak Street toward Elm Avenue.',
      'The garage door was closed and the fence was undamaged.'),
  ];
  const progress = [];
  const out = await AI.review({ docs, engine: { base, model: 'qwen2.5:7b', embed: 'nomic-embed-text:latest' }, onProgress: (p) => progress.push(p) });
  assert.ok(out.complete);
  assert.strictEqual(out.stats.statements, 4, 'the jurat line is skipped');
  const byText = (s) => out.flags.filter((f) => f.statement.text.includes(s));

  const contra = byText('three shots');
  assert.strictEqual(contra.length, 1);
  assert.strictEqual(contra[0].severity, 'Medium');
  assert.strictEqual(contra[0].source.doc, 'Report 26-4481.pdf');
  assert.strictEqual(contra[0].source.text, 'Witness Robert Lee stated he heard two shots and saw a male run north on Oak Street toward Elm Avenue.');
  const [h0, h1] = contra[0].source.highlight;
  assert.ok(contra[0].source.text.slice(h0, h1).includes('two shots'));

  assert.strictEqual(byText('blue Honda').length, 0, 'supported statements produce no flag');
  assert.strictEqual(byText('hallucinated').length, 0, 'made-up quote is discarded');
  assert.strictEqual(out.stats.discarded, 1);
  const nf = byText('posted bail');
  assert.strictEqual(nf.length, 1);
  assert.strictEqual(nf[0].severity, 'Low');
  assert.strictEqual(nf[0].source, null);
  assert.ok(progress.some((p) => p.phase === 'review' && p.done === p.total));
});

test('review can be cancelled', async (t) => {
  const server = await mock.start(0);
  t.after(() => server.close());
  const ctrl = new AbortController();
  ctrl.abort();
  const out = await AI.review({
    docs: [doc(0, 'A', 'affidavit', 'The suspect ran north on Oak Street after the shots.'), doc(1, 'R', 'report', 'The suspect ran north on Oak Street.')],
    engine: { base: `http://127.0.0.1:${server.address().port}`, model: 'm' },
    signal: ctrl.signal,
  });
  assert.strictEqual(out.complete, false);
});

test('parseAnswer tolerates stray text but rejects nonsense', () => {
  assert.strictEqual(AI.parseAnswer('Sure! {"verdict":"Not Found","passage":0,"quote":"","explanation":"x"}').verdict, 'not_found');
  assert.strictEqual(AI.parseAnswer('{"verdict":"maybe"}'), null);
  assert.strictEqual(AI.parseAnswer('no json'), null);
});
