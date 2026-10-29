// v1.173: the calendar file, Paste From Text, the prosecutor packet, evidence labels read from photos
// and an inventory number shared by two case numbers. All data is synthetic (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/mission-tools.js');

test('calendar file: open deadlines and court dates, all day or timed, a reminder the day before', () => {
  const ics = M.icsCalendar([
    { id: 'd1', kind: 'deadline', date: '2026-11-05', title: 'Lab results, due', note: 'Call the lab; ask for Exhibit 1' },
    { id: 'c1', kind: 'court', date: '2026-11-10', time: '09:30', title: 'Preliminary hearing', caseNumber: 'EX-100' },
    { id: 'x', kind: 'deadline', date: '2026-11-06', title: 'Done already', done: true },
    { id: 'e', kind: 'event', date: '2026-11-01', title: 'Not a date to keep' },
  ], { name: 'CaseVault Case EX-100', now: new Date(Date.UTC(2026, 9, 29, 12, 0, 0)) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106\r\n/);
  assert.match(ics, /SUMMARY:Deadline: Lab results\\, due\r\nDESCRIPTION:Call the lab\\; ask for Exhibit 1\r\n/);
  assert.match(ics, /DTSTART:20261110T093000\r\nDTEND:20261110T103000\r\nSUMMARY:Court: Preliminary hearing \(EX-100\)/);
  assert.strictEqual((ics.match(/TRIGGER:-P1D/g) || []).length, 2);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n') && ics.split('\r\n').every((l) => l.length <= 75));
});

test('Paste From Text: a buy from CAD text, an arrest, a court date', () => {
  const x = M.smartPaste('CAD 26-123456. On 03/04/2026 at 1415 hours the UC purchased 3.5 grams of crack cocaine from Rick Poe for $200 at 100 Example Street. Vehicle IL plate EXA1234. Inventory #12345678.');
  assert.deepStrictEqual([x.date, x.time, x.kind, x.drug, x.qty, x.unit, x.paid], ['2026-03-04', '14:15', 'buy', 'Cocaine', '3.5', 'g', '200']);
  assert.match(x.title, /^On 03\/04\/2026 at 1415 hours the UC purchased/);
  assert.ok(x.found.includes('Inventory: #12345678') && x.found.includes('Plate: EXA1234'));
  assert.match(x.note, /^CAD 26-123456\./);
  assert.strictEqual(M.smartPaste('Ann Roe was arrested on May 2, 2026 at 9:40 PM.').kind, 'arrest');
  assert.strictEqual(M.smartPaste('Preliminary hearing set for 11/10/2026 in Branch 44.').kind, 'court');
  assert.strictEqual(M.smartPaste('Met the witness at the office on 05/01/2026.').kind, 'event');
});

test('prosecutor packet: buys and totals per suspect, evidence with lab status, custody with gaps', () => {
  const md = M.packetMarkdown([
    { number: 'EX-1', events: [{ kind: 'buy', date: '2026-03-04', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }, { kind: 'buy', date: '2026-03-11', suspect: 'Rick Poe', drug: 'Cocaine', qty: '7', unit: 'g', paid: '400' }],
      evidence: [{ number: 1, inventory: '12345678', type: 'Narcotics', drug: 'Cocaine', weight: '3.5 g', custody: [{ date: '2026-03-04', action: 'Received / Seized' }, { date: '2026-03-05', action: 'Sent to Lab' }] }], labReports: ['Lab Results.pdf'] },
    { number: 'EX-2', events: [{ kind: 'buy', date: '2026-03-20', suspect: 'Ann Roe', drug: 'Heroin', qty: '1', unit: 'g', paid: '100' }], evidence: [] },
  ], { label: 'Mission OP-1', made: '2026-10-29' });
  assert.match(md, /^# Prosecutor Packet\n\n\*\*Mission OP-1 · Made 2026-10-29\*\*/);
  assert.match(md, /\| 1 \| 2026-03-04 \| EX-1 \| Rick Poe \| Cocaine \| 3\.5 g \| \$200 \|/);
  assert.match(md, /\| Rick Poe \| 2 \| Cocaine \| 10\.5 g \| \$600 \|/);
  assert.match(md, /\| \*\*All\*\* \| \*\*3\*\* \| \| \| \*\*\$700\*\* \|/);
  assert.match(md, /\| 1 \| EX-1 \| 12345678 \| Cocaine \| 3\.5 g \| Sent 2026-03-05, not back \| Sent to Lab 2026-03-05 \|/);
  assert.match(md, /- EX-1: Lab Results\.pdf/);
  assert.match(md, /### Exhibit 1, Inventory #12345678 \(EX-1\)/);
  assert.match(md, /- \*\*Gap:\*\* sent to the lab on 2026-03-05; no return from the lab yet\./);
});

test('evidence labels: the number read, matching or not; an inventory number on two case numbers', () => {
  assert.deepStrictEqual(M.labelNumbers('CHICAGO POLICE\nINV # 12345678\nEXHIBIT 1\n87654321\n'), ['12345678', '87654321']);
  assert.deepStrictEqual(M.labelVerdict('12345678', ['12345678']), { state: 'match', number: '12345678' });
  assert.deepStrictEqual(M.labelVerdict('12345678', ['12345687']), { state: 'differs', number: '12345687', near: true });
  assert.deepStrictEqual(M.labelVerdict('', ['12345678']), { state: 'unlisted', number: '12345678', near: false });
  assert.deepStrictEqual(M.labelVerdict('12345678', []), { state: 'none' });
  assert.deepStrictEqual(M.sharedInventory([{ number: 'EX-1', evidence: [{ inventory: '111111' }, { inventory: '222222' }] }, { number: 'EX-2', evidence: [{ inventory: '#111111' }] }]), [{ inventory: '111111', cases: ['EX-1', 'EX-2'] }]);
});
