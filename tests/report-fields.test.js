'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/report-fields.js');

test('Report Fields: exhibit numbers count on across cases and are never reused', () => {
  assert.strictEqual(F.nextExhibit([]), 1);
  assert.strictEqual(F.nextExhibit([1, 2, 3]), 4);
  assert.strictEqual(F.nextExhibit([1, '7', 0, 'N-12']), 13, 'numbers from other cases and a kept "last given" count too');
});

test('Report Fields: placeholders, AI text and a report made from them', () => {
  const d = { ...F.empty(), caseNumber: 'JH123456', offense: 'Delivery of a controlled substance', ucr: '2012 Delv: Cocaine', date: '2026-03-14', fire: 'No', method: 'On View',
    evidence: [{ number: 5, description: '3 bags of white powder', type: 'Narcotic' }], narrative: 'On 03.14.2026 TFO Sample purchased…' };
  const ctx = F.context(d);
  assert.strictEqual(ctx['report.ucr'], '2012 Delv: Cocaine');
  assert.strictEqual(ctx['report.date'], '03.14.2026');
  assert.strictEqual(ctx['report.evidence'], 'Exhibit 5: 3 bags of white powder (Narcotic)');
  const t = F.asText(d);
  assert.match(t, /Offense classification: Delivery/);
  assert.doesNotMatch(t, /Beat assigned/, 'empty fields are left out');
  const md = F.toMarkdown(d, 'Case Report');
  assert.match(md, /\| UCR code \| 2012 Delv: Cocaine \|/);
  assert.match(md, /\| 5 \| 3 bags of white powder \| Narcotic \|/);
  assert.match(md, /## Narrative\n\nOn 03\.14\.2026/);
  assert.ok(F.PLACEHOLDERS.includes('report.narrative'));
});
