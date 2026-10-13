// v1.117: timeline colours by suspect. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const O = require('../js/operation.js');

test('v1.117: each suspect keeps a colour; events show their own or their suspect\'s', () => {
  const rows = O.mergeEvents([
    { caseId: 'a', events: [{ date: '2026-09-01', title: 'Buy 1', suspect: 'John Doe' }, { date: '2026-09-15', title: 'Buy 3', suspect: 'JOHN  doe', color: '#2a9d6f' }] },
    { caseId: 'b', events: [{ date: '2026-09-08', title: 'Buy 2', suspect: 'Rick Poe' }, { date: '2026-09-20', title: 'Surveillance' }] },
  ]);
  const colors = O.suspectColors(rows);
  assert.deepStrictEqual([...colors.keys()], ['john doe', 'rick poe']);
  assert.strictEqual(colors.get('john doe').color, '#2a9d6f', 'the latest colour set for the suspect');
  assert.strictEqual(colors.get('john doe').count, 2);
  assert.strictEqual(colors.get('rick poe').color, '#1f6fd1', 'the first free colour');
  assert.strictEqual(O.eventColor(rows[0].ev, colors), '#2a9d6f', 'an event without its own colour takes its suspect\'s');
  assert.strictEqual(O.eventColor({ suspect: 'Rick Poe', color: '#d14a8b' }, colors), '#d14a8b');
  assert.strictEqual(O.eventColor(rows[3].ev, colors), '');
  assert.strictEqual(O.isColor('red'), false);
  assert.strictEqual(O.TL_COLORS.length, 10);
  assert.ok(O.TL_COLORS.every(([, c]) => O.isColor(c)));
  // More suspects than colours: the palette starts over.
  const many = O.mergeEvents([{ caseId: 'a', events: Array.from({ length: 12 }, (_, i) => ({ date: '2026-01-01', suspect: `Example Person ${i}` })) }]);
  assert.strictEqual(O.suspectColors(many).size, 12);
});
