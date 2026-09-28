// A tiny stand-in for Ollama, used by the tests (no real model needed).
// Behaves deterministically and includes one deliberately hallucinated answer, so the
// anti-hallucination check can be tested. Run standalone: node tests/mock-ollama.js [port]
'use strict';
const http = require('node:http');
const T = require('../js/checker/nlp.js');

const MODELS = [
  { name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } },
  { name: 'qwen2.5:14b', details: { parameter_size: '14.8B', family: 'qwen2' } },
  { name: 'llama3.2:3b', details: { parameter_size: '3.2B', family: 'llama' } },
  { name: 'nomic-embed-text:latest', details: { parameter_size: '137M', family: 'nomic-bert' } },
];

function vec(text) {
  const v = new Array(64).fill(0);
  for (const t of T.terms(text)) { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 64] += 1; }
  return v;
}

function answer(prompt) {
  const statement = /STATEMENT FROM THE AFFIDAVIT:\n([^\n]+)/.exec(prompt)[1];
  const passages = [...prompt.matchAll(/\[(\d+)\] \([^)]*\)\n([^\n]+)/g)].map((m) => ({ n: Number(m[1]), text: m[2] }));
  if (/hallucinat|ninja/i.test(statement)) {
    return { verdict: 'contradicted', passage: 1, quote: 'The officer saw a ninja climb the fence.', explanation: 'Made-up quote.' };
  }
  const sw = new Set(T.terms(statement));
  let best = null;
  for (const p of passages) {
    for (const s of T.sentences(p.text)) {
      const shared = T.terms(s.text).filter((t) => sw.has(t)).length;
      if (!best || shared > best.shared) best = { p, s, shared };
    }
  }
  if (!best || best.shared < 3) return { verdict: 'not_found', passage: 0, quote: '', explanation: 'The reports do not mention this.' };
  const numsA = statement.match(/\b(one|two|three|four|five|north|south|east|west)\b/gi) || [];
  const numsB = best.s.text.match(/\b(one|two|three|four|five|north|south|east|west)\b/gi) || [];
  const conflict = numsA.some((a) => numsB.length && !numsB.map((x) => x.toLowerCase()).includes(a.toLowerCase()));
  return conflict
    ? { verdict: 'contradicted', passage: best.p.n, quote: best.s.text, explanation: `The report says "${numsB.join(', ')}", not "${numsA.join(', ')}".` }
    : { verdict: 'supported', passage: best.p.n, quote: best.s.text, explanation: 'Same facts.' };
}

function start(port = 11434) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      server.calls = (server.calls || 0) + 1;
      if (req.url === '/api/tags') return json({ models: MODELS });
      const data = body ? JSON.parse(body) : {};
      if (req.url === '/api/embed') return json({ embeddings: [].concat(data.input).map(vec) });
      if (req.url === '/api/chat') {
        const prompt = data.messages.find((m) => m.role === 'user').content;
        return json({ message: { role: 'assistant', content: JSON.stringify(answer(prompt)) }, done: true });
      }
      res.writeHead(404); res.end('{}');
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { start };
if (require.main === module) start(Number(process.argv[2]) || 11434).then(() => console.log('mock ollama ready'));
