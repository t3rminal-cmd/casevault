'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/formats.js');

test('phone numbers are written 123.456.7890, also while typing', () => {
  for (const [typed, want] of Object.entries({
    '3125550142': '312.555.0142', '(312) 555-0142': '312.555.0142', '312-555-0142': '312.555.0142', '1 312 555 0142': '312.555.0142',
    '312': '312', '3125': '312.5', '312555': '312.555', '3125550': '312.555.0', '312-555-0142 x12': '312.555.0142 x12', '': '',
  })) assert.strictEqual(F.phone(typed), want, typed);
  assert.strictEqual(F.phone('+44 20 7946 0958'), '+44 20 7946 0958', 'international numbers stay as typed');
  assert.strictEqual(F.phone('call desk'), 'call desk');
});

test('SSNs are written 123.45.6789', () => {
  assert.strictEqual(F.ssn('123456789'), '123.45.6789');
  assert.strictEqual(F.ssn('123-45-6789'), '123.45.6789');
  assert.strictEqual(F.ssn('1234'), '123.4');
});

test('dates are shown long (v1.32) and typed several ways', () => {
  assert.strictEqual(F.dateText('2026-12-01'), 'December 1, 2026');
  assert.strictEqual(F.dateText('2026-09-30'), 'September 30, 2026');
  for (const [typed, want] of Object.entries({
    '12.01.2026': '2026-12-01', '12/1/2026': '2026-12-01', '12-01-26': '2026-12-01', '12012026': '2026-12-01', '2026-12-01': '2026-12-01', '1.5.1990': '1990-01-05', 'December 1, 2026': '2026-12-01', 'Sep 30 2026': '2026-09-30',
  })) assert.strictEqual(F.parseDate(typed), want, typed);
  for (const bad of ['', '13.01.2026', '02.30.2026', '12.01', 'soon']) assert.strictEqual(F.parseDate(bad), '', bad);
});

test('v1.50 calendar: six weeks from the Sunday on or before the 1st', () => {
  const F = require('../js/formats.js');
  const g = F.monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.strictEqual(g.length, 42);
  assert.deepStrictEqual(g.slice(0, 5).map((d) => [d.iso, d.inMonth]), [['2026-09-27', false], ['2026-09-28', false], ['2026-09-29', false], ['2026-09-30', false], ['2026-10-01', true]]);
  assert.strictEqual(g.filter((d) => d.inMonth).length, 31);
  assert.strictEqual(F.monthGrid(2028, 1).filter((d) => d.inMonth).length, 29, 'leap year February');
});
