// v1.156: Password Manager departments, alias profiles (age and zodiac worked out, work history and
// family lists), the chain of custody per exhibit, the Deadline Calendar, the Weekly Summary and the
// lazily loaded summaries. All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const L = require('../js/secure/locker-core.js');
const C = require('../js/custody.js');
const A = require('../js/agenda.js');
const F = require('../js/report-fields.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const pdfText = (bytes) => Buffer.from(bytes).toString('latin1');

test('locker: age from the date of birth, before and after the birthday', () => {
  assert.strictEqual(L.ageFrom('1990-06-15', '2026-06-14'), 35);
  assert.strictEqual(L.ageFrom('1990-06-15', '2026-06-15'), 36);
  assert.strictEqual(L.ageFrom('', '2026-06-15'), null);
  assert.strictEqual(L.autoValue('age', { dob: '2000-01-01' }, '2026-10-26'), '26');
});

test('locker: zodiac sign from the date of birth, including the year-end Capricorn', () => {
  assert.strictEqual(L.zodiacOf('1990-03-25'), 'Aries');
  assert.strictEqual(L.zodiacOf('1990-12-25'), 'Capricorn');
  assert.strictEqual(L.zodiacOf('1990-01-10'), 'Capricorn');
  assert.strictEqual(L.zodiacOf('1990-07-30'), 'Leo');
  assert.strictEqual(L.zodiacOf('nope'), '');
});

test('locker: departments across the tables, and the department filter', () => {
  const data = { passwords: [{ site: 'Example Portal', dept: 'DEA' }, { site: 'Example Mail', dept: 'cpd' }], aliases: [{ alias: 'Rick Poe', dept: 'CPD' }], accounts: [], files: [] };
  assert.deepStrictEqual(L.departments(data), ['cpd', 'DEA']);
  assert.deepStrictEqual(L.byDept(data.passwords, 'CPD').map((r) => r.site), ['Example Mail']);
  assert.strictEqual(L.byDept(data.passwords, '').length, 2);
  assert.ok(L.DEPARTMENTS.includes('USPIS'));
});

test('locker: search finds words in work history and family lists, and Linked to Google', () => {
  const rows = [{ alias: 'Rick Poe', work: [{ employer: 'Example Logistics', position: 'Driver' }], family: [{ name: 'Jane Poe', relation: 'Sister' }] }, { alias: 'Sam Roe' }];
  assert.deepStrictEqual(L.filterRows('aliases', rows, 'logistics').map((r) => r.alias), ['Rick Poe']);
  assert.deepStrictEqual(L.filterRows('aliases', rows, 'sister').map((r) => r.alias), ['Rick Poe']);
  const pw = [{ site: 'Example Portal', google: true }, { site: 'Example Bank', google: false }];
  assert.deepStrictEqual(L.filterRows('passwords', pw, 'google').map((r) => r.site), ['Example Portal']);
});

test('locker: the password table has PIN, Department, Email and Linked to Google', () => {
  const keys = L.TABLES.passwords.fields.map(([k]) => k);
  for (const k of ['pin', 'dept', 'email', 'google']) assert.ok(keys.includes(k), k);
  assert.ok(L.TABLES.passwords.cols.includes('pin') && L.TABLES.passwords.cols.includes('dept'));
});

test('custody: entries sorted by date and time, blanks dropped, where the exhibit is now', () => {
  const log = [
    { date: '2026-01-05', time: '09:00', action: 'Sent to Lab', from: 'Officer Roe', to: 'Example City Lab' },
    { date: '2026-01-02', time: '21:00', action: 'Received / Seized', from: 'John Doe', to: 'Officer Roe' },
    { date: '2026-01-03', action: '' },
  ];
  const n = C.normalize(log);
  assert.deepStrictEqual(n.map((x) => x.action), ['Received / Seized', 'Sent to Lab']);
  assert.strictEqual(C.status(log).state, 'out');
  assert.strictEqual(C.status([...log, { date: '2026-01-09', action: 'Returned from Lab' }]).state, 'in');
  assert.strictEqual(C.status([{ date: '2026-02-01', action: 'Destroyed' }]).state, 'gone');
  assert.strictEqual(C.status([]).state, 'none');
});

test('custody: the PDF has one table per exhibit with its entries', () => {
  const s = pdfText(C.build({ number: 'EX-100', exhibits: [
    { number: 1, description: 'Clear bag', custody: [{ date: '2026-01-02', action: 'Received / Seized', from: 'John Doe', to: 'Officer Roe', purpose: 'Seized' }] },
    { number: 2, description: 'Phone' },
  ] }, { printed: '2026-01-10' }));
  assert.ok(s.startsWith('%PDF'));
  assert.match(s, /CHAIN OF CUSTODY/);
  assert.match(s, /EXHIBIT 1/);
  assert.match(s, /EXHIBIT 2/);
  assert.match(s, /Officer Roe/);
  assert.match(s, /No custody entries/);
});

test('custody: the Draft form keeps each exhibit\'s log when it is saved', () => {
  const d = F.normalize({ evidence: [{ number: 3, description: 'Bag', custody: [{ date: '2026-01-02', action: 'Checked Out', to: 'Officer Poe', junk: 'x' }] }, { number: 4 }] });
  assert.deepStrictEqual(d.evidence[0].custody, [{ date: '2026-01-02', time: '', action: 'Checked Out', from: '', to: 'Officer Poe', purpose: '' }]);
  assert.strictEqual(d.evidence[1].custody, undefined);
});

test('calendar: items in the range, by kind, done deadlines left out, statute of limitations added', () => {
  const cases = [{ id: 'a', number: 'EX-100', status: 'Open', sol: { expires: '2026-10-20' } }, { id: 'b', number: 'EX-200', status: 'Pending' }];
  const tl = new Map([
    ['a', { events: [{ date: '2026-10-05', kind: 'deadline', title: 'Warrant return' }, { date: '2026-10-06', kind: 'deadline', title: 'Done one', done: true }, { date: '2026-11-02', kind: 'court', title: 'Later' }] }],
    ['b', { events: [{ date: '2026-10-05', time: '09:30', kind: 'court', title: 'Status hearing' }, { date: '2026-10-07', kind: 'buy', title: 'Buy 2' }] }],
  ]);
  const all = A.collect(cases, tl, '2026-10-01', '2026-10-31');
  assert.deepStrictEqual(all.map((x) => [x.date, x.kind, x.number]), [['2026-10-05', 'court', 'EX-200'], ['2026-10-05', 'deadline', 'EX-100'], ['2026-10-07', 'buy', 'EX-200'], ['2026-10-20', 'sol', 'EX-100']]);
  const due = A.collect(cases, tl, '2026-10-01', '2026-10-31', { kinds: new Set(['deadline']) });
  assert.deepStrictEqual(due.map((x) => x.title), ['Warrant return']);
  assert.strictEqual(A.byDay(all).get('2026-10-05').length, 2);
});

test('weekly summary: the week starts on Monday; changes, notes and Timeline items of that week', () => {
  assert.strictEqual(A.weekStart('2026-10-28'), '2026-10-26'); // a Wednesday
  assert.strictEqual(A.weekStart('2026-11-01'), '2026-10-26'); // a Sunday
  assert.strictEqual(A.weekStart('2026-10-26'), '2026-10-26');
  const entries = [{ id: 'a', number: 'EX-100', status: 'Open' }, { id: 'b', number: 'EX-200', status: 'Open', opened: '2026-10-27' }, { id: 'c', number: 'EX-300' }];
  const fulls = new Map([['a', { activity: [{ at: '2026-10-27T15:00:00', what: 'Status changed to Pending' }, { at: '2026-10-28T10:00:00', what: 'Met with Mary Poe', note: true }, { at: '2026-10-10T10:00:00', what: 'Old' }] }]]);
  const tl = new Map([['a', { events: [{ date: '2026-10-29', kind: 'court', title: 'Hearing' }, { date: '2026-11-05', kind: 'court', title: 'Next week' }] }]]);
  const s = A.weekly(entries, fulls, tl, '2026-10-26', (at) => at.slice(0, 10));
  assert.strictEqual(s.end, '2026-11-01');
  assert.deepStrictEqual(s.cases.map((r) => r.number), ['EX-100', 'EX-200']);
  assert.deepStrictEqual(s.cases[0].changes.map((x) => x.what), ['Status changed to Pending', 'Met with Mary Poe']);
  assert.deepStrictEqual(s.cases[0].events.map((x) => x.title), ['Hearing']);
  assert.ok(s.cases[1].opened);
  assert.deepStrictEqual(s.totals, { cases: 2, changes: 2, notes: 1, events: 1, opened: 1, closed: 0 });
  const pdf = pdfText(A.weeklyPdf(s, {}));
  assert.match(pdf, /WEEKLY SUMMARY/);
  assert.match(pdf, /Met with Mary Poe/);
  assert.match(pdf, /EX-200/);
});

test('lighter start-up: Year and Group Summary load on first use; the new parts are cached offline', () => {
  const html = read('index.html');
  assert.ok(!html.includes('js/year-summary.js') && !html.includes('js/group-summary.js'));
  const app = read('js/app.js');
  assert.match(app, /loadScripts\(\['js\/year-summary\.js'\]\)/);
  assert.match(app, /loadScripts\(\['js\/group-summary\.js'\]\)/);
  const sw = read('sw.js');
  for (const f of ['custody.js', 'agenda.js', 'agenda-ui.js', 'year-summary.js', 'group-summary.js']) assert.ok(sw.includes(`./js/${f}`), f);
});
