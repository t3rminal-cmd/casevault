// Tests for the AI activity tracker (js/ai/activity.js) and the small-GPU settings:
// per-profile context size, keep_alive, passage trimming, and the shared queue.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createActivity, fmtElapsed } = require('../js/ai/activity.js');
const AI = require('../js/checker/ai.js');
const CP = require('../js/drafts/copilot.js');

const clock = () => { let t = 1000; return { now: () => t, advance: (ms) => { t += ms; } }; };
const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('idle shows nothing; a task shows its label, model and elapsed time', () => {
  const c = clock();
  const A = createActivity({ now: c.now });
  assert.strictEqual(A.state(), null);
  const t = A.begin('check', { label: 'Checking…', model: 'qwen2.5:7b' });
  t.set('Checking 11 of 16');
  c.advance(4200);
  const s = A.state();
  assert.deepStrictEqual([s.label, s.model, s.elapsedMs, s.kind], ['Checking 11 of 16', 'qwen2.5:7b', 4200, 'check']);
  t.end();
  assert.strictEqual(A.state(), null, 'hidden again when idle');
  assert.strictEqual(fmtElapsed(4200), '4 s');
  assert.strictEqual(fmtElapsed(75000), '1:15');
});

test('the heavy task wins the label over a suggestion', () => {
  const A = createActivity();
  const s = A.begin('suggest', { label: 'Suggesting…' });
  const d = A.begin('draft', { label: 'Drafting…' });
  assert.strictEqual(A.state().label, 'Drafting…');
  d.end();
  assert.strictEqual(A.state().label, 'Suggesting…');
  s.end();
});

test('shared queue: a check and a draft run one at a time; suggestions wait it out', async () => {
  const A = createActivity();
  const order = [];
  let release;
  const first = A.exclusive('check', async (task) => {
    order.push('check start');
    task.set('Checking 1 of 2');
    await new Promise((r) => { release = r; });
    order.push('check end');
    return 'checked';
  });
  const second = A.exclusive('draft', async () => { order.push('draft start'); return 'drafted'; });
  await tick();
  assert.ok(A.heavyBusy(), 'suggestions are skipped while heavy work runs or waits');
  assert.deepStrictEqual(order, ['check start'], 'the draft waits for the check');
  assert.strictEqual(A.state().label, 'Checking 1 of 2');
  release();
  assert.deepStrictEqual(await Promise.all([first, second]), ['checked', 'drafted']);
  assert.deepStrictEqual(order, ['check start', 'check end', 'draft start']);
  assert.ok(!A.heavyBusy());
  assert.strictEqual(A.state(), null);
});

test('a failed task does not block the queue', async () => {
  const A = createActivity();
  await assert.rejects(A.exclusive('check', async () => { throw new Error('engine down'); }), /engine down/);
  assert.strictEqual(await A.exclusive('draft', async () => 'ok'), 'ok');
  assert.strictEqual(A.state(), null);
});

test('wrap: non-AI requests pass straight through; AI requests are counted', async () => {
  const A = createActivity();
  let resolve;
  const f = A.wrap(async (url) => (/tags/.test(url) ? json({ models: [] }) : new Promise((r) => { resolve = () => r(json({ response: 'x', eval_count: 120, eval_duration: 2e9 })); })));
  await f('http://127.0.0.1:11434/api/tags');
  assert.strictEqual(A.state(), null, '/api/tags is not tracked');
  const p = f('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: 'llama3.2:3b', stream: false }) });
  assert.strictEqual(A.state().inFlight, 1);
  assert.strictEqual(A.state().model, 'llama3.2:3b');
  resolve();
  const res = await p;
  assert.strictEqual((await res.json()).response, 'x', 'the caller still gets the body');
  await tick(); await tick();
  assert.strictEqual(A.state(), null);
  assert.strictEqual(A.lastStats.tps, 60, 'tokens/s from eval_count / eval_duration');
});

test('wrap: streaming responses pass through unchanged and report tokens/s at the end', async () => {
  const A = createActivity();
  const lines = [
    { message: { content: 'Hello' }, done: false },
    { message: { content: ' world' }, done: false },
    { message: { content: '' }, done: true, eval_count: 30, eval_duration: 1.5e9 },
  ].map((o) => `${JSON.stringify(o)}\n`).join('');
  const f = A.wrap(async () => new Response(lines, { status: 200 }));
  const t = A.begin('draft', { label: 'Drafting…', model: 'qwen2.5:7b' });
  const res = await f('http://127.0.0.1:11434/api/chat', { method: 'POST', body: JSON.stringify({ model: 'qwen2.5:7b', stream: true }) });
  assert.strictEqual(await res.text(), lines);
  assert.strictEqual(A.state().inFlight, 0);
  assert.strictEqual(A.state().tokensPerSec, 20);
  t.end();
});

test('"Loading model…" after 10 s without a first response, unless the model is already loaded', async () => {
  const c = clock();
  const A = createActivity({ now: c.now });
  const pending = [];
  const f = A.wrap(() => new Promise((r) => pending.push(() => r(json({ message: { content: '{}' } })))));
  const t = A.begin('check', { label: 'Checking 1 of 5', model: 'qwen2.5:7b' });
  const body = JSON.stringify({ model: 'qwen2.5:7b', stream: false });
  const req = f('http://127.0.0.1:11434/api/chat', { method: 'POST', body });
  c.advance(9000);
  assert.strictEqual(A.state().label, 'Checking 1 of 5');
  c.advance(2000);
  assert.strictEqual(A.state().label, 'Loading model…');
  assert.ok(A.state().loading);
  pending.shift()();
  await req;
  await tick();
  assert.strictEqual(A.state().label, 'Checking 1 of 5', 'back to the task once it answers');
  // The next slow answer from the same (now loaded) model is just slow, not loading.
  const req2 = f('http://127.0.0.1:11434/api/chat', { method: 'POST', body });
  c.advance(15000);
  assert.strictEqual(A.state().label, 'Checking 1 of 5');
  pending.shift()();
  await req2;
  t.end();
});

test('per-profile context size: Light and Quick 4096, Thorough 8192', () => {
  assert.strictEqual(AI.numCtxFor('light'), 4096);
  assert.strictEqual(AI.numCtxFor('quick'), 4096);
  assert.strictEqual(AI.numCtxFor('thorough'), 8192);
  assert.strictEqual(AI.numCtxFor('custom'), 4096);
  const det = { chat: [{ name: 'qwen2.5:14b', size: 14.8 }, { name: 'llama3.2:3b', size: 3.2 }], profiles: { thorough: 'qwen2.5:14b', light: 'llama3.2:3b' } };
  assert.strictEqual(CP.numCtxForModel(det, 'qwen2.5:14b'), 8192, 'suggestions use the same num_ctx as the model\'s profile (no reload)');
  assert.strictEqual(CP.numCtxForModel(det, 'llama3.2:3b'), 4096);
  assert.ok(CP.isSmallModel(det, 'llama3.2:3b'));
  assert.ok(!CP.isSmallModel(det, 'qwen2.5:14b'));
});

test('retrieved passages are trimmed to fit the context window', () => {
  const st = { text: 'Officer Alex Sample arrived at 100 Example Street at 21:40 on 03/14/2026.' };
  const big = (i) => ({ doc: 0, paragraph: i, start: 0, docName: 'Report.pdf', page: 1, text: `Passage ${i}. ${'The test unit recorded more synthetic detail here. '.repeat(70)}` });
  const passages = [0, 1, 2, 3, 4, 5, 6, 7].map(big);
  const small = AI.fitPassages(st, passages, 4096);
  const large = AI.fitPassages(st, passages, 8192);
  assert.ok(small.length < passages.length, `4096 keeps fewer (${small.length})`);
  assert.ok(large.length > small.length, `8192 keeps more (${large.length})`);
  for (const [list, ctx] of [[small, 4096], [large, 8192]]) {
    const prompt = AI.userPrompt(st, list);
    assert.ok(AI.tokensOf(prompt) < ctx - 300, `prompt fits in ${ctx}`);
    assert.strictEqual(list[0].paragraph, 0, 'best passages first');
  }
  // One huge passage is shortened for the prompt but keeps its full text for quote checking.
  const huge = [{ ...big(9), text: 'x '.repeat(20000) }];
  const [only] = AI.fitPassages(st, huge, 4096);
  assert.ok(only.promptText.length < only.text.length);
});

test('requests ask Ollama to keep the model loaded for 10 minutes, with the profile\'s num_ctx', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body);
    bodies.push({ url, b });
    if (/embed/.test(url)) return json({ embeddings: b.input.map(() => [1, 0, 0]) });
    if (/generate/.test(url)) return json({ response: ' next words' });
    return json({ message: { content: JSON.stringify({ verdict: 'not_found', passage: 0, quote: '', explanation: 'n/a' }) } });
  };
  const docs = [
    { name: 'A.txt', role: 'affidavit', docIndex: 0, paragraphs: [{ index: 0, page: 1, text: 'Officer Alex Sample arrived at the example address on the test date.' }] },
    { name: 'R.txt', role: 'report', docIndex: 1, paragraphs: [{ index: 0, page: 1, text: 'Officer Alex Sample arrived at the example address on the test date.' }] },
  ];
  await AI.review({ docs, engine: { base: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', embed: 'nomic-embed-text', numCtx: 4096 }, fetchImpl });
  await CP.suggest({ base: 'http://127.0.0.1:11434', model: 'llama3.2:3b', before: 'On the test date', fetchImpl, numCtx: 4096 });
  assert.ok(bodies.length >= 3);
  for (const { url, b } of bodies) {
    assert.strictEqual(b.keep_alive, '10m', url);
    if (!/embed/.test(url)) assert.strictEqual(b.options.num_ctx, 4096, url);
  }
  assert.strictEqual(CP.KEEP_ALIVE, '10m');
});

test('Draft with AI material shrinks with a smaller context window', () => {
  const passages = Array.from({ length: 40 }, (_, i) => ({ docName: 'Report.pdf', page: 1, text: `Synthetic passage ${i}. ${'Example detail for the test. '.repeat(20)}` }));
  const len = (numCtx) => CP.draftMessages({ type: 'affidavit', passages, numCtx })[1].content.length;
  assert.ok(len(4096) < len(8192));
  assert.ok(AI.tokensOf(CP.draftMessages({ type: 'affidavit', passages, numCtx: 4096 }).map((m) => m.content).join('')) < 4096 * 0.75, 'leaves room for the answer');
});
