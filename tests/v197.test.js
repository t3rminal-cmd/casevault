// v1.97: Subject Names read "LAST, First" in the case lists; the saved name is kept as typed.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { subjectLabel } = require('../js/operation.js');

test('v1.97: a person\'s name reads LAST, First however it was typed', () => {
  assert.strictEqual(subjectLabel('John Doe'), 'DOE, John');
  assert.strictEqual(subjectLabel('doe, john'), 'DOE, John');
  assert.strictEqual(subjectLabel('JANE ROE'), 'ROE, Jane');
  assert.strictEqual(subjectLabel('Roe, Mary Ann'), 'ROE, Mary Ann');
  assert.strictEqual(subjectLabel('Mary Ann Roe'), 'ROE, Mary Ann');
  assert.strictEqual(subjectLabel('  Rick   Poe  '), 'POE, Rick');
  assert.strictEqual(subjectLabel('DOE-ROE, Jonathan'), 'DOE-ROE, Jonathan');
});

test('v1.97: suffixes and family-name particles stay with the right part', () => {
  assert.strictEqual(subjectLabel('john doe jr'), 'DOE, John Jr');
  assert.strictEqual(subjectLabel('Rick Poe III'), 'POE, Rick III');
  assert.strictEqual(subjectLabel('Doe, John, Jr'), 'DOE, John Jr');
  assert.strictEqual(subjectLabel('Juan de la Poe'), 'DE LA POE, Juan');
});

test('v1.97: anything that is not one person\'s name shows as typed', () => {
  for (const s of ['Doe', 'Unknown Offender', 'Not Identified', 'Example City Gang', 'John Doe & Jane Roe', 'EX 100 crew', 'Doe/Roe', '']) {
    assert.strictEqual(subjectLabel(s), s.trim(), s);
  }
  assert.strictEqual(subjectLabel(null), '');
});

test('v1.97: a case caption or a government party is never turned around', () => {
  for (const s of ['State v. John Doe', 'People vs Jane Roe', 'United States', 'Example County']) assert.strictEqual(subjectLabel(s), s, s);
  assert.strictEqual(subjectLabel('John Doe V'), 'DOE, John V');
});
