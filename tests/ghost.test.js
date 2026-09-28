// Tests for inline AI suggestions (ghost text): accept, dismiss, type-through, cancellation.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/drafts/ghost.js');
const C = require('../js/drafts/copilot.js');

// Manual timers so the test controls the 700 ms pause.
function harness(reply = () => ' responded to 1420 Oak Street.') {
  const timers = [];
  const calls = [];
  let changes = 0;
  const g = G.createGhost({
    delay: 700,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: (id) => { timers[id - 1] = null; },
    fetchSuggestion: (before, signal) => { const call = { before, signal }; calls.push(call); return Promise.resolve(reply(before, call)); },
    onChange: () => { changes++; },
  });
  const fire = async () => { const fns = timers.splice(0).filter(Boolean); for (const f of fns) f(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
  return { g, calls, fire, timers, changes: () => changes };
}

const TEXT = 'On March 14, 2026, Officer Diaz';

test('suggests after the pause, Tab accepts', async () => {
  const { g, calls, fire } = harness();
  g.update({ text: TEXT, cursor: TEXT.length });
  assert.strictEqual(calls.length, 0, 'nothing is asked before the pause');
  await fire();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].before, TEXT);
  assert.strictEqual(g.ghost, ' responded to 1420 Oak Street.');
  assert.strictEqual(g.anchor, TEXT.length);
  assert.deepStrictEqual(g.key('Tab'), { accept: ' responded to 1420 Oak Street.' });
  assert.strictEqual(g.ghost, '');
  assert.strictEqual(g.key('Tab'), null, 'Tab works normally when there is no suggestion');
});

test('Esc dismisses; other keys pass through', async () => {
  const { g, fire } = harness();
  g.update({ text: TEXT, cursor: TEXT.length });
  await fire();
  assert.strictEqual(g.key('ArrowLeft'), null);
  assert.deepStrictEqual(g.key('Escape'), { dismiss: true });
  assert.strictEqual(g.ghost, '');
});

test('typing the start of the suggestion keeps the rest; anything else dismisses', async () => {
  const { g, fire } = harness();
  g.update({ text: TEXT, cursor: TEXT.length });
  await fire();
  const t2 = `${TEXT} resp`;
  g.update({ text: t2, cursor: t2.length });
  assert.strictEqual(g.ghost, 'onded to 1420 Oak Street.');
  const t3 = `${t2}x`;
  g.update({ text: t3, cursor: t3.length });
  assert.strictEqual(g.ghost, '', 'a different character dismisses');
});

test('new typing cancels the in-flight request (AbortController) and stale answers never show', async () => {
  let release;
  const { g, calls, fire } = harness(() => new Promise((r) => { release = r; }));
  g.update({ text: TEXT, cursor: TEXT.length });
  await fire();
  assert.strictEqual(calls.length, 1);
  const t2 = `${TEXT} a`;
  g.update({ text: t2, cursor: t2.length });
  assert.ok(calls[0].signal.aborted, 'the first request was aborted');
  release(' responded quickly.');
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(g.ghost, '', 'the stale answer is ignored');
});

test('only suggests at the end of a line, with enough text, when enabled and focused', async () => {
  const { g, calls, fire } = harness();
  g.update({ text: `${TEXT} and more`, cursor: 5 });
  g.update({ text: 'Hi', cursor: 2 });
  g.update({ text: TEXT, cursor: TEXT.length, enabled: false });
  g.update({ text: TEXT, cursor: TEXT.length, focused: false });
  await fire();
  assert.strictEqual(calls.length, 0);
  assert.ok(G.eligible('line one\nline two text here', 'line one\nline two text here'.length));
  assert.ok(G.eligible('First line of text\nNext', 18) === true, 'end of a line with text after on the next line');
});

test('cleanSuggestion: one sentence, no quotes, no echo, correct spacing, ~40 tokens max', () => {
  assert.strictEqual(G.cleanSuggestion('"responded to the scene. Then he left."', 'Officer Diaz'), ' responded to the scene.');
  assert.strictEqual(G.cleanSuggestion('Continuation: responded quickly', 'Officer Diaz '), 'responded quickly');
  assert.strictEqual(G.cleanSuggestion('Officer Diaz responded.', 'On March 14, Officer Diaz'), ' responded.');
  assert.strictEqual(G.cleanSuggestion(', 2026, at 21:40.', 'On March 14'), ', 2026, at 21:40.');
  assert.strictEqual(G.cleanSuggestion('   \n\n', 'x'), '');
  const long = G.cleanSuggestion('word '.repeat(100), 'x ');
  assert.ok(long.length <= G.MAX_CHARS && !long.endsWith(' '));
});

test('fastModel picks the smallest installed chat model', () => {
  assert.strictEqual(C.fastModel({ status: 'offline' }), null);
  assert.strictEqual(C.fastModel({ status: 'connected', profiles: { light: 'llama3.2:3b', quick: 'qwen2.5:7b' }, chat: [] }), 'llama3.2:3b');
  assert.strictEqual(C.fastModel({ status: 'connected', profiles: {}, chat: [{ name: 'big', size: 14 }, { name: 'mid', size: 7 }] }), 'mid');
});

test('draft prompt: only case material, [CONFIRM: ...] rule, template and passages included', () => {
  const msgs = C.draftMessages({
    type: 'affidavit',
    template: 'Case {{x}} [CONFIRM: court]',
    instructions: 'Keep it short.',
    caseObj: { title: 'State v. Lee', number: 'CR-1', client: 'DA', status: 'Open', tags: [], dates: { opened: '2026-03-15' } },
    timeline: { events: [{ date: '2026-03-14', time: '21:40', kind: 'event', title: 'Shots fired call' }] },
    notes: 'Witness Robert Lee.',
    passages: [{ docName: 'Report.pdf', page: 1, text: 'Officer Dias responded.' }, { docName: 'log.xlsx', sheet: 'Evidence', row: 2, text: 'Evidence row 2: Plate=ABC-1284' }],
  });
  assert.strictEqual(msgs[0].role, 'system');
  assert.match(msgs[0].content, /Use ONLY facts/);
  assert.match(msgs[0].content, /\[CONFIRM: what is needed\]/);
  assert.match(msgs[0].content, /Never invent/);
  const u = msgs[1].content;
  for (const s of ['Case number: CR-1', '2026-03-14 21:40 [event] Shots fired call', 'Witness Robert Lee.', '[Report.pdf, page 1]', '[log.xlsx, Evidence row 2]', 'Affidavit', 'Keep it short.', 'Case {{x}} [CONFIRM: court]']) {
    assert.ok(u.includes(s), `prompt includes ${s}`);
  }
});
