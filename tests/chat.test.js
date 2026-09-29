// Ask AI (js/ai/chat.js): the case material, the messages and their size, and the transcript.
// Made-up content only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/ai/chat.js');

const caseObj = { title: 'Operation Example', fileNumber: 'F-1', number: '00123', status: 'Open', dates: { opened: '2026-03-01' }, tags: ['narcotics'] };
const timeline = { events: [{ date: '2026-03-14', time: '21:45', kind: 'event', title: 'Traffic stop', note: 'Sample Street' }, { date: '2026-04-01', kind: 'deadline', title: 'Lab results' }] };

test('case material: details, timeline, notes and file passages', () => {
  const m = C.caseMaterial({ caseObj, timeline, notes: 'Made-up notes.', passages: [{ docName: 'Report.pdf', page: 2, text: 'Officer Alex Sample observed…' }] });
  assert.match(m, /## Case details\nTitle: Operation Example\nFile number: F-1\nCase number: 00123/);
  assert.match(m, /- 2026-03-14 21:45 Traffic stop \(Sample Street\)\n- 2026-04-01 \[deadline\] Lab results/);
  assert.match(m, /## Notes\nMade-up notes\./);
  assert.match(m, /\[Report\.pdf, page 2\]\nOfficer Alex Sample/);
  assert.strictEqual(C.caseMaterial({}), '', 'no case, no material');
  const big = C.caseMaterial({ caseObj, notes: 'x'.repeat(50000), passages: [{ docName: 'A', text: 'y'.repeat(50000) }] }, 4000);
  assert.ok(big.length < 4500, `kept within the budget (${big.length})`);
});

test('messages: system, earlier turns that fit, and the question with the case', () => {
  const history = [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'answer one' }];
  const msgs = C.buildMessages({ history, question: 'And then?', material: 'CASE', numCtx: 8192 });
  assert.deepStrictEqual(msgs.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.match(msgs[0].content, /Never invent case facts/);
  assert.strictEqual(msgs[3].content, 'CASE MATERIAL\n\nCASE\n\n---\n\nQUESTION\n\nAnd then?');
  assert.strictEqual(C.buildMessages({ question: 'Hi' })[1].content, 'Hi', 'no case: just the question');
  const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'z'.repeat(2000)}` }));
  const cut = C.buildMessages({ history: long, question: 'q', numCtx: 4096 });
  assert.ok(cut.length < 12, 'old turns are dropped first');
  assert.match(cut[cut.length - 2].content, /^turn 39 /, 'the newest turns are kept');
});

test('transcript for saving to a case', () => {
  const t = C.transcript([{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }], { title: 'Ask AI', model: 'qwen2.5:7b', when: new Date(2026, 8, 29, 10, 0) });
  assert.match(t, /^# Ask AI\n\n> AI-assisted conversation \(qwen2\.5:7b\)/);
  assert.match(t, /\*\*Question:\*\*\n\nQ1\n\n\*\*Answer:\*\*\n\nA1\n$/);
});

test('case material lists the contacts', () => {
  const m = C.caseMaterial({ caseObj: { title: 'Test case', number: 'TEST-1', contacts: { officer: { name: 'Det. Alex Sample', phone: '555-0100' }, prosecutor: { title: 'AUSA', name: 'Jordan Example', email: 'jordan@usao.example' }, others: [{ role: 'Narcotic Team Supervisor', name: 'Sgt. Pat Placeholder' }, { role: '', name: '' }] } } });
  assert.match(m, /Case officer: Det\. Alex Sample, 555-0100/);
  assert.match(m, /AUSA: Jordan Example, jordan@usao\.example/);
  assert.match(m, /Narcotic Team Supervisor: Sgt\. Pat Placeholder/);
  assert.doesNotMatch(m, /Contact:/, 'empty rows are left out');
});
