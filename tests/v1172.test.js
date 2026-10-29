// v1.172: chain-of-custody gaps, the arrest against the case, Case Health, ready to close, the
// evidence and buys tables for templates, and the suspects' monikers as Known Aliases.
// All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('../js/case-health.js');
const D = require('../js/drafts/draft-core.js');

const ex = (custody, extra = {}) => ({ number: 1, inventory: '12345678', type: 'Narcotics', drug: 'Cocaine', custody, ...extra });

test('custody gaps: out and never back, court while out, after destruction, lab with no return', () => {
  const t = (list) => H.custodyGaps(ex(list)).map((g) => `${g.severity}: ${g.text.replace(/^Exhibit 1 \(Inventory #12345678\): /, '')}`);
  assert.deepStrictEqual(t([{ date: '2026-03-04', action: 'Received / Seized' }, { date: '2026-03-05', action: 'Checked Out', to: 'Det. Doe' }]),
    ['High: checked out on 2026-03-05 to Det. Doe and never returned.', 'Low: narcotics never sent to the lab.']);
  const court = t([{ date: '2026-03-04', action: 'Received / Seized' }, { date: '2026-03-05', action: 'Checked Out' }, { date: '2026-03-06', action: 'Taken to Court' }, { date: '2026-03-07', action: 'Destroyed' }, { date: '2026-03-08', action: 'Returned' }]);
  assert.ok(court.some((x) => /^High: taken to court on 2026-03-06 while still checked out/.test(x)));
  assert.ok(court.some((x) => /^High: "Returned" on 2026-03-08 comes after it was destroyed on 2026-03-07/.test(x)));
  assert.ok(!court.some((x) => /never returned|no return from court/.test(x)), 'nothing is "still out" once destroyed');
  assert.deepStrictEqual(t([{ date: '2026-03-04', action: 'Received / Seized' }, { date: '2026-03-05', action: 'Sent to Lab' }]), ['Medium: sent to the lab on 2026-03-05; no return from the lab yet.']);
  assert.deepStrictEqual(t([{ date: '2026-03-04', action: 'Received / Seized' }, { date: '2026-03-05', action: 'Returned' }]).filter((x) => /returned on/.test(x)), ['Medium: returned on 2026-03-05 with no checkout before it.']);
  assert.deepStrictEqual(t([{ date: '2026-03-04', action: 'Received / Seized' }, { date: '2026-03-05', action: 'Sent to Lab' }, { date: '2026-03-20', action: 'Returned from Lab' }]), [], 'a whole chain has no gaps');
  assert.deepStrictEqual(H.custodyGaps({ number: 3, description: 'Phone', custody: [] }).map((g) => g.severity), ['Medium']);
});

test('the arrest against the case: date of birth, Timeline date, charges, recovered inventory', () => {
  const arrest = { arrestees: [{ firstName: 'Rick', lastName: 'Poe', dob: '1990-01-03', date: '2026-04-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery of heroin' }], narcotics: [{ drug: 'Cocaine', inventory: '99999999' }] }, { firstName: 'Ann', lastName: 'Roe' }] };
  const got = H.arrestIssues({ arrest, caseObj: { suspects: [{ name: 'Rick Poe', dob: '1990-01-02' }] }, timeline: { events: [{ kind: 'buy', suspect: 'Rick Poe', drug: 'Cocaine' }, { kind: 'arrest', suspect: 'Rick Poe', date: '2026-04-02' }] }, evidence: [{ inventory: '12345678' }], today: '2026-10-29' });
  const t = got.map((x) => `${x.severity}: ${x.text}`);
  assert.ok(t.includes("High: Rick Poe's date of birth is 1990-01-03 on the Arrest tab but 1990-01-02 on the suspect."));
  assert.ok(t.some((x) => /^High: Rick Poe was arrested on 2026-04-01 on the Arrest tab, but the Timeline's arrest says 2026-04-02/.test(x)));
  assert.ok(t.includes('Medium: Rick Poe is charged with heroin, but no buy from Rick Poe or recovered narcotic is heroin.'));
  assert.ok(t.some((x) => /^Medium: Recovered Cocaine under Inventory #99999999/.test(x)));
  assert.ok(t.some((x) => /^Medium: Arrestee Ann Roe is not one of this case's suspects/.test(x)));
  // The Timeline's own arrest event made from the Arrest tab (auto) is not a second source.
  assert.ok(!H.arrestIssues({ arrest: { arrestees: [{ firstName: 'Rick', lastName: 'Poe', date: '2026-04-01' }] }, timeline: { events: [{ kind: 'arrest', auto: true, suspect: 'Rick Poe', date: '2026-04-01' }] } }).length);
});

test('Case Health: most serious first, each with where it is fixed; ready to close', () => {
  const items = H.caseHealth({
    timeline: { events: [{ kind: 'deadline', date: '2026-10-01', title: 'Lab results', done: false }] },
    checks: [{ open: 3, openHigh: 1, stale: true }], drafts: [{ title: 'Buy 1 Narrative', confirm: 2 }],
    evidence: [ex([{ date: '2026-03-04', action: 'Received / Seized' }, { date: '2026-03-05', action: 'Checked Out' }])], today: '2026-10-29',
  });
  assert.deepStrictEqual(items.map((x) => [x.area, x.severity, x.tab]).slice(0, 3), [['Deadlines', 'High', 'timeline'], ['Checks', 'High', 'checks'], ['Custody', 'High', 'draft']]);
  assert.ok(items.some((x) => /out of date/.test(x.text)) && items.some((x) => /"Buy 1 Narrative" still has 2/.test(x.text)) && items.some((x) => /no photo/.test(x.text)));
  assert.deepStrictEqual(H.caseHealth({}), []);
  const ready = H.closeReadiness([ex([{ date: '2026-03-04', action: 'Received / Seized' }])]).map((x) => x.text);
  assert.ok(/No lab result yet for Exhibit 1/.test(ready[0]) && /no final disposition/.test(ready[1]));
});

test('{{evidence}}, {{buys}}, {{buys.total}}, {{inventory}} in templates', () => {
  const v = H.templateValues({ evidence: [ex([{ date: '2026-03-04', action: 'Received / Seized' }], { weight: '3.5 g' })], events: [{ kind: 'buy', date: '2026-03-04', suspect: 'Rick Poe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' }, { kind: 'buy', date: '2026-03-11', paid: '300.50' }] });
  assert.match(v.evidence, /\| 1 \| 12345678 \| Cocaine \| 3\.5 g \| Received \/ Seized 2026-03-04 \|/);
  assert.match(v.buys, /\| 1 \| 2026-03-04 \| Rick Poe \| Cocaine \| 3\.5 g \| \$200 \|/);
  assert.match(v.buys, /\*\*Total\*\* \| \*\*\$500\.50\*\* \|$/);
  assert.deepStrictEqual([v['buys.count'], v['buys.total'], v.inventory], ['2', '$500.50', '#12345678']);
  const out = D.fillTemplate('Paid {{buys.total}} in {{buys.count}} buys. {{inventory}}', v);
  assert.strictEqual(out, 'Paid $500.50 in 2 buys. #12345678');
  assert.ok(D.placeholderGroups().some((g) => g.title === 'Evidence and buys' && g.keys.includes('buys')));
});

test('the suspects\' monikers as Known Aliases', () => {
  assert.deepStrictEqual(H.aliasLines([{ name: 'Richard Poe', info: { moniker: 'Rick, Ricky aka Slim; @rpoe' } }, { name: 'Ann Roe', info: {} }, { name: 'X', notIdentified: true, info: { moniker: 'Y' } }]), ['Richard Poe, Rick, Ricky, Slim, rpoe']);
});
