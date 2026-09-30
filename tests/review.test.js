'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/drafts/review.js');

test('Review: totals in a list, a sentence and a table are added up (money and weight)', () => {
  const text = [
    'On 03.14.2026 TFO Sample made three purchases:',
    '- Buy 1: $1,200.00 for 28 grams',
    '- Buy 2: $1,500',
    '- Buy 3: $1,000.50',
    'Total buy money: $3,800.00',
    '',
    'The UC paid $200, $300 and $400, totaling $900.',
    '',
    '| Exhibit | Weight | Value |',
    '|---|---|---|',
    '| N-1 | 28 g | $1,200 |',
    '| N-2 | 1.2 kg | $30,000 |',
    '| Total | 1,228 g | $31,000 |',
  ].join('\n');
  const r = R.check(text);
  assert.strictEqual(r.issues.length, 2, JSON.stringify(r.issues));
  assert.strictEqual(r.issues[0].line, 5);
  assert.strictEqual(r.issues[0].computed, 3700.5);
  assert.strictEqual(r.issues[1].line, 13);
  assert.strictEqual(r.issues[1].kind, 'money');
  assert.match(R.describe(r), /Line 5: says \$3,800\.00, but \$1,200\.00 \+ \$1,500 \+ \$1,000\.50 = \$3,700\.50/);
});

test('Review: totals that add up, and single amounts, raise nothing', () => {
  assert.deepStrictEqual(R.check('- $100\n- $250.25\nTotal: $350.25').issues, []);
  assert.deepStrictEqual(R.check('A total of $500 was seized.').issues, [], 'one amount alone is not checked');
  assert.match(R.describe(R.check('No money here.')), /No totals/);
});
