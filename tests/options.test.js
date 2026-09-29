'use strict';
const test = require('node:test');
const assert = require('node:assert');
const O = require('../js/options.js');

test('Dev Tools: personal details become consistent fictitious fillers', () => {
  const text = 'On 03/14/2026 Det. Alex Sample met Casey Placeholder (DOB 04/12/1990) at 742 Evergreen Terrace. '
    + 'Call (312) 555-8841 or email casey.p@mail.example. Casey Placeholder drove plate IL ZX98765. PLACEHOLDER, Casey signed.';
  const r = O.fictitious(text, { known: ['Casey Placeholder'] });
  assert.doesNotMatch(r.text, /Casey|Placeholder|PLACEHOLDER|Evergreen|8841|mail\.example|04\/12\/1990/i);
  assert.match(r.text, /John Doe/);
  assert.match(r.text, /\(555\) 555-01\d\d/);
  assert.match(r.text, /@example\.com/);
  assert.match(r.text, /Main Street|Oak Avenue/);
  // The same person gets the same filler every time.
  assert.strictEqual((r.text.match(/Jane Doe/g) || []).length, 2, r.text);
  assert.match(r.text, /DOE, Jane signed\./, '"LAST, First" is the same person, in the same shape');
  assert.match(O.fictitious('Det. Alex Sample wrote it. ALEX SAMPLE signed.').text, /JOHN DOE signed/);
  assert.ok(r.map.length >= 4 && r.replaced >= r.map.length);
  assert.strictEqual(O.fictitious('Nothing personal here.').text, 'Nothing personal here.');
});

test('Dev Tools: templates keep their placeholders', () => {
  const r = O.fictitious('I, {{affiant.name}}, spoke to [CONFIRM: witness name] about {{case.number}}.');
  assert.match(r.text, /\{\{affiant\.name\}\}/);
  assert.match(r.text, /\{\{case\.number\}\}/);
  assert.match(r.text, /\[CONFIRM: witness name\]/);
});
