// Tests for the in-browser engine shim: WebLLM answers Ollama-style calls, so the checker and the
// drafting copilot run unchanged. A fake engine stands in for WebLLM (no GPU or model needed).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/ai/ollama-shim.js');
const AI = require('../js/checker/ai.js');
const C = require('../js/drafts/copilot.js');
const T = require('../js/checker/nlp.js');

// Fake WebLLM engine with the OpenAI-style API. It answers from simple rules and records requests.
function fakeEngine({ delayMs = 0 } = {}) {
  const e = {
    requests: [], interrupted: 0, busy: 0, maxBusy: 0,
    interruptGenerate() { e.interrupted++; },
    chat: {
      completions: {
        async create(req) {
          e.requests.push(req);
          e.busy++; e.maxBusy = Math.max(e.maxBusy, e.busy);
          try {
            if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
            const user = req.messages.filter((m) => m.role === 'user').pop().content;
            let content;
            if (req.response_format) {
              // Checker review: contradict "three shots" using a sentence from the passages.
              const passage = (/\[1\] \([^)]*\)\n([^\n]+)/.exec(user) || [])[1] || '';
              const sent = T.sentences(passage)[0];
              content = /three shots/.test(user) && sent
                ? JSON.stringify({ verdict: 'contradicted', passage: 1, quote: sent.text, explanation: 'The report says two shots.' })
                : JSON.stringify({ verdict: 'not_found', passage: 0, quote: '', explanation: 'Not mentioned.' });
            } else if (/TEXT SO FAR/.test(user)) {
              content = ' responded to the scene.';
            } else {
              content = '# Draft\n\nI, [CONFIRM: affiant name], state the facts.\n';
            }
            if (!req.stream) return { choices: [{ message: { role: 'assistant', content } }] };
            const pieces = content.match(/[\s\S]{1,7}/g);
            return (async function* gen() { for (const p of pieces) { await new Promise((r) => setTimeout(r, 1)); yield { choices: [{ delta: { content: p } }] }; } })();
          } finally { e.busy--; }
        },
      },
    },
  };
  return e;
}

function shimWith(engine, id = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC') {
  let loads = 0;
  const fetchImpl = S.createShim({ modelId: id, sizeB: S.sizeFromId(id), getEngine: async () => { loads++; return engine; } });
  return { fetchImpl, loads: () => loads };
}

test('sizeFromId reads the model size from WebLLM model ids', () => {
  assert.strictEqual(S.sizeFromId('Qwen2.5-1.5B-Instruct-q4f16_1-MLC'), 1.5);
  assert.strictEqual(S.sizeFromId('Llama-3.2-3B-Instruct-q4f16_1-MLC'), 3);
  assert.strictEqual(S.sizeFromId('Qwen2.5-0.5B-Instruct-q4f16_1-MLC'), 0.5);
  assert.strictEqual(S.sizeFromId('Phi-3.5-mini-instruct-q4f16_1-MLC'), 3.8);
});

test('detect() sees the in-browser model as a Light profile, with no embedding model', async () => {
  const { fetchImpl } = shimWith(fakeEngine());
  const d = await AI.detect({ fetchImpl });
  assert.strictEqual(d.status, 'connected');
  assert.deepStrictEqual(d.profiles, { quick: null, thorough: null, light: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' });
  assert.strictEqual(d.embed, null);
  assert.strictEqual(AI.choose(d, 'auto').model, 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  assert.strictEqual(C.fastModel(d), 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
});

test('toCompletion maps Ollama options and JSON schema to the OpenAI-style request', () => {
  const req = S.toCompletion({ messages: [{ role: 'user', content: 'x' }], format: { type: 'object' }, options: { temperature: 0, seed: 7, num_predict: 40, stop: ['\n\n'] } }, { stream: false });
  assert.deepStrictEqual(req, { messages: [{ role: 'user', content: 'x' }], stream: false, temperature: 0, max_tokens: 40, stop: ['\n\n'], seed: 7, response_format: { type: 'json_object', schema: '{"type":"object"}' } });
});

test('the checker AI review runs unchanged through the shim (and the quote check still applies)', async () => {
  const engine = fakeEngine();
  const { fetchImpl } = shimWith(engine);
  const docs = [
    { docIndex: 0, name: 'Affidavit.docx', role: 'affidavit', paragraphs: [{ index: 0, page: 1, text: 'Witness Robert Lee told Officer Diaz that he heard three shots near the store.' }] },
    { docIndex: 1, name: 'Report.pdf', role: 'report', paragraphs: [{ index: 0, page: 1, text: 'Witness Robert Lee stated he heard two shots near the store.' }] },
  ];
  const out = await AI.review({ docs, engine: { base: 'http://webllm.local', model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', embed: null }, fetchImpl });
  assert.ok(out.complete);
  assert.strictEqual(out.flags.length, 1);
  assert.strictEqual(out.flags[0].severity, 'Medium');
  assert.strictEqual(out.flags[0].source.doc, 'Report.pdf');
  assert.ok(engine.requests[0].response_format, 'the JSON schema is passed to WebLLM');
});

test('drafting: suggestions and streamed drafts work through the shim', async () => {
  const engine = fakeEngine();
  const { fetchImpl } = shimWith(engine);
  const s = await C.suggest({ base: 'http://webllm.local', model: 'm', before: 'Officer Dias', fetchImpl });
  assert.strictEqual(s, ' responded to the scene.');
  assert.strictEqual(engine.requests[0].max_tokens, 40);
  assert.strictEqual(engine.requests[0].messages[0].role, 'system');
  let streamed = '';
  const full = await C.streamChat({ base: 'http://webllm.local', model: 'm', messages: [{ role: 'user', content: 'Write it' }], onText: (t) => { streamed += t; }, fetchImpl });
  assert.strictEqual(full, '# Draft\n\nI, [CONFIRM: affiant name], state the facts.\n');
  assert.strictEqual(streamed, full);
  assert.ok(engine.requests[1].stream);
});

test('embeddings are reported as unavailable, so retrieval falls back to keywords', async () => {
  const { fetchImpl } = shimWith(fakeEngine());
  const res = await fetchImpl('http://webllm.local/api/embed', { method: 'POST', body: JSON.stringify({ model: 'x', input: ['a'] }) });
  assert.strictEqual(res.status, 501);
  const docs = [{ name: 'R', docIndex: 0, paragraphs: [{ index: 0, page: 1, text: 'Officer Dias responded to the call on Oak Street.' }] }];
  const got = await C.relevantPassages({ docs, query: 'Dias Oak Street', engine: { base: 'http://webllm.local', embed: 'nomic-embed-text' }, fetchImpl });
  assert.strictEqual(got.length, 1);
});

test('requests are queued one at a time; the engine loads lazily', async () => {
  const engine = fakeEngine({ delayMs: 20 });
  const { fetchImpl, loads } = shimWith(engine);
  assert.strictEqual(loads(), 0, 'nothing loads until the first request');
  const body = (p) => JSON.stringify({ model: 'm', prompt: p, stream: false, options: { num_predict: 5 } });
  const rs = await Promise.all([1, 2, 3].map((i) => fetchImpl('http://webllm.local/api/generate', { method: 'POST', body: body(`TEXT SO FAR ${i}`) }).then((r) => r.json())));
  assert.strictEqual(engine.maxBusy, 1, 'never two generations at once');
  assert.deepStrictEqual(rs.map((r) => r.response), [' responded to the scene.', ' responded to the scene.', ' responded to the scene.']);
});

test('abort interrupts the running generation and rejects with AbortError', async () => {
  const engine = fakeEngine({ delayMs: 200 });
  const { fetchImpl } = shimWith(engine);
  const ctrl = new AbortController();
  const p = fetchImpl('http://webllm.local/api/generate', { method: 'POST', signal: ctrl.signal, body: JSON.stringify({ prompt: 'TEXT SO FAR x' }) });
  setTimeout(() => ctrl.abort(), 20);
  await assert.rejects(p, (err) => err.name === 'AbortError');
  assert.strictEqual(engine.interrupted, 1);
  // A request aborted while still waiting in the queue never reaches the engine.
  const before = engine.requests.length;
  const c2 = new AbortController(); c2.abort();
  await assert.rejects(fetchImpl('http://webllm.local/api/generate', { method: 'POST', signal: c2.signal, body: JSON.stringify({ prompt: 'x' }) }), (err) => err.name === 'AbortError');
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(engine.requests.length, before);
});
