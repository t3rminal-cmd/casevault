// v1.171: the order of events of a Buy and a Surveillance report, a narrative started from a
// Timeline buy, one record per person, and the backup test kept. All data is synthetic.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/checker/rules.js');
const F = require('../js/drafts/draft-facts.js');
const P = require('../js/person-view.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('order of events: sentences under their time, the two reports side by side', () => {
  const a = { paragraphs: [{ text: 'BUY REPORT. At 1:15 PM the UC met Rick Poe. Rick Poe handed the UC a bag. At 1:25 PM the UC left.' }] };
  const b = { paragraphs: [{ text: 'Surveillance set up at 12:50 PM. At 1:15 PM Rick Poe arrived on foot. At 1:30 PM Rick Poe left.' }] };
  assert.deepStrictEqual(R.eventsByTime(a).map((g) => [g.time, g.sentences.length]), [['', 1], ['13:15', 2], ['13:25', 1]]);
  const rows = R.orderOfEvents(a, b);
  assert.deepStrictEqual(rows.map((r) => [r.time, r.a.length, r.b.length]), [['', 1, 0], ['12:50', 0, 1], ['13:15', 2, 1], ['13:25', 1, 0], ['13:30', 0, 1]]);
});

test('a narrative from a Timeline buy: what is known filled in, the rest to confirm', () => {
  const buy = { date: '2026-03-04', time: '13:15', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' };
  const ev = [{ number: 1, inventory: '12345678', drug: 'Cocaine' }, { number: 2, inventory: '55555555', type: 'Currency' }];
  const md = F.buySkeleton(buy, { evidence: ev, title: 'Buy 1 Narrative' });
  assert.match(md, /^# Buy 1 Narrative/);
  assert.match(md, /On March 4, 2026, at approximately 1:15 PM, the undercover officer \(UC\) met Rick Poe at \[CONFIRM: location\]\./);
  assert.match(md, /purchased 3\.5 grams of suspect cocaine from Rick Poe for \$200 in pre-recorded funds/);
  assert.match(md, /inventoried under Inventory #12345678\./, 'the exhibit of this drug, not the cash');
  const sv = F.buySkeleton({ date: '2026-03-04', suspect: 'Rick Poe' }, { kind: 'surveillance' });
  assert.match(sv, /^# Surveillance Report/);
  assert.match(sv, /surveillance observed the undercover officer \(UC\) meet Rick Poe/);
  assert.match(sv, /Inventory #\[CONFIRM: inventory number\]/);
  // The facts it fills in agree with the Timeline (no mismatch flagged).
  const flags = R.compare([{ name: 'Draft', role: 'affidavit', paragraphs: [{ index: 0, page: 1, text: md.replace(/[#*]/g, '') }] }], { buys: [buy] });
  assert.deepStrictEqual(flags.filter((f) => f.type === 'buy'), []);
});

test('one record per person: what differs, and the update only where this case has a detail', () => {
  const mine = { name: 'Rick Poe', dob: '1990-01-02', residence: '200 Example Ave', info: { height: '6 ft', hair: '' } };
  const theirs = { name: 'Rick Poe', dob: '1990-01-02', residence: '100 Example St', info: { hair: 'Brown', eyes: 'Blue' } };
  assert.deepStrictEqual(P.personDiff(mine, theirs).map((d) => [d.key, d.from, d.to]), [['residence', '100 Example St', '200 Example Ave'], ['info.height', '', '6 ft']]);
  assert.strictEqual(P.updateFrom(theirs, mine), 2);
  assert.deepStrictEqual(theirs, { name: 'Rick Poe', dob: '1990-01-02', residence: '200 Example Ave', info: { hair: 'Brown', eyes: 'Blue', height: '6 ft' } });
  // The cases of the same Mission count for an update (not for "on another case").
  const self = { id: 'a', operationId: 'op1' };
  const cases = [{ id: 'b', operationId: 'op1', suspects: [{ name: 'Rick Poe' }] }];
  assert.strictEqual(P.duplicates({ name: 'Rick Poe' }, cases, self).length, 0);
  assert.strictEqual(P.duplicates({ name: 'Rick Poe' }, cases, self, { sameMission: true }).length, 1);
});

test('backups: the reminder interval chosen, and the last Test Restore kept', () => {
  const app = read('js/app.js');
  assert.match(app, /const BACKUP_EVERY = \[3, 7, 14, 30\]/);
  assert.ok(!/FULL_BACKUP_DAYS/.test(app));
  assert.match(app, /function backupTestDue\(\)/);
  assert.match(read('js/backup-ui.js'), /lastBackupTest: \{ at: new Date\(\)\.toISOString\(\), ok: !!verdict\.ok/);
});
