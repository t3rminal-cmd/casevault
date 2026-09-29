'use strict';
const test = require('node:test');
const assert = require('node:assert');
const TF = require('../js/timefield.js');

test('time boxes accept typed times and keep "HH:MM" (24-hour)', () => {
  const cases = {
    '09:30': '09:30', '9:30': '09:30', '930': '09:30', '0930': '09:30', '2130': '21:30', '21.30': '21:30', '9': '09:00',
    '9:30 pm': '21:30', '9:30pm': '21:30', '12 am': '00:00', '12:15 a.m.': '00:15', '12 pm': '12:00', '7p': '19:00', ' 23:59 ': '23:59',
  };
  for (const [typed, want] of Object.entries(cases)) assert.strictEqual(TF.parse(typed), want, typed);
  for (const bad of ['', '24:00', '9:60', '13 pm', 'noon', '12:3', 'abc']) assert.strictEqual(TF.parse(bad), '', bad);
});
