// v1.85: the department letterhead on the PDFs and the Case Summary PDF. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/report-pdf.js');
const A = require('../js/arrest-pdf.js');
const S = require('../js/case-summary.js');
const K = require('../js/closing.js');

const text = (bytes) => Buffer.from(bytes).toString('latin1');
// Any bytes do as a "JPEG" here: the writer only wraps them in an image object.
const LOGO = { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 40, h: 20 };
const LH = { header: 'Example City Police\nNarcotics Unit', logo: LOGO };

test('v1.85: letterhead() draws the header lines and the logo, and nothing when empty', () => {
  const ops = [];
  const used = R.letterhead(ops, { header: 'Example City Police\nNarcotics Unit', logo: { ...LOGO, index: 3 } }, 36, 750, 540);
  assert.ok(used > 50);
  const all = ops.join('\n');
  assert.match(all, /Example City Police/);
  assert.match(all, /Narcotics Unit/);
  assert.match(all, /\/Im3 Do/);
  assert.strictEqual(R.letterhead([], { header: '  ', logo: null }, 36, 750, 540), 0);
  assert.strictEqual(R.withLogo(null, []), null);
  const list = [{}, {}];
  const lh = R.withLogo(LH, list);
  assert.strictEqual(lh.logo.index, 2);
  assert.strictEqual(list.length, 3);
});

test('v1.85: the Report and Arrest Report PDFs carry the letterhead in place of the agency line', () => {
  const rep = text(R.build({}, { letterhead: LH, agency: 'Agency From Profile' }));
  assert.match(rep, /Example City Police/);
  assert.doesNotMatch(rep, /AGENCY FROM PROFILE/);
  assert.match(rep, /\/Subtype \/Image/);
  const plain = text(R.build({}, { agency: 'Agency From Profile' }));
  assert.match(plain, /AGENCY FROM PROFILE/);
  const arr = text(A.build(K.emptyArrest(), { letterhead: { header: 'Example City Police', logo: null }, agency: 'Agency From Profile' }));
  assert.match(arr, /Example City Police/);
  assert.doesNotMatch(arr, /AGENCY FROM PROFILE/);
});

test('v1.85: Case Summary lists the case, arrestees and charges, exhibits, timeline and history', () => {
  const pdf = text(S.build({
    c: { number: 'EX-100', subject: 'John Doe', status: 'Closed', dates: { opened: '2026-01-02', closed: '2026-02-03' }, closure: { disposition: 'arrest', closedBy: 'Det. Example', note: '' } },
    op: { number: 'OP-1', name: 'Example Op' },
    arrest: { arrestees: [{ firstName: 'John', lastName: 'Doe', charges: [{ statute: 'TEST 1.01', description: 'Possession' }] }] },
    fields: { evidence: [{ number: 1, type: 'Narcotics', drug: 'Cocaine', weight: '5 g', description: 'Clear bag' }] },
    timeline: { events: [{ date: '2026-01-05', title: 'Controlled buy' }, { date: '2026-01-10', kind: 'deadline', title: 'Lab results', done: true }] },
    history: [{ at: '2026-02-03T15:00:00Z', what: 'Closed: Cleared by arrest' }],
  }, { letterhead: LH, printed: 'today' }));
  assert.ok(pdf.startsWith('%PDF-'));
  for (const s of ['CASE SUMMARY', 'EX-100', 'John Doe', 'OP-1 Example Op', 'Cleared by arrest', 'TEST 1.01', 'Exhibit 1', 'Controlled buy', 'deadline, done', 'Closed: Cleared by arrest', 'Example City Police']) assert.ok(pdf.includes(s), s);
  // Empty case: still one page that says so.
  const empty = text(S.build({ c: { number: 'EX-200' } }));
  assert.match(empty, /No arrestees entered/);
  assert.match(empty, /No timeline events/);
  assert.match(empty, /\/Count 1/);
});

test('v1.85: a long timeline goes onto more pages', () => {
  const events = Array.from({ length: 120 }, (_, i) => ({ date: '2026-03-01', title: `Event ${i + 1}` }));
  const pdf = text(S.build({ c: { number: 'EX-300' }, timeline: { events } }));
  const n = Number(/\/Count (\d+)/.exec(pdf)[1]);
  assert.ok(n >= 2, `pages: ${n}`);
  assert.match(pdf, /Event 120/);
  assert.match(pdf, /continued/);
});

// v1.86: the Officer's Report on the PDF, as laid out by the user.
const RF = require('../js/report-fields.js');
test('v1.86: State of Illinois victim and officer on one line; narcotics in columns; funds as a table', () => {
  const d = RF.normalize({
    victimsList: [{ name: 'State of Illinois', officer: 'John Doe' }],
    narcotics: [{ drug: 'Adderall', amount: '10', unit: 'pill', value: '100', price: '$100' }],
    funds: [{ denomination: '$20', quantity: '4', serials: ['AA00000001A', 'AA00000002A', 'AA00000003A', 'AA00000004A'] }, { denomination: '$10', quantity: '1', serials: ['BB00000001A', 'BB00000002A'] }],
    fundsRecovered: 'Not Recovered',
  });
  const s = text(R.build(d, {}));
  for (const x of ['(VICTIM:)', '(State of Illinois)', '(Officer Name: John Doe)', '(Adderall)', '(10 pills)', '(Street Value - $100)', '(Purchase Price - $100)', '(QTY)', '(Denomination)', '(Serial Number)', '(04)', '($20.00)', '(01)', '($10.00)', '(AA00000004A)', '(BB00000002A)', '(Not Recovered)']) assert.ok(s.includes(x), x);
  assert.ok(s.includes('(NARCOTICS RECOVERED \\(TOTAL WEIGHT &)') || /NARCOTICS RECOVERED/.test(s));
});

test('v1.86: no IR Number line (moved into the first offender); the secondary officer can be left out', () => {
  assert.ok(!RF.SECTIONS.find((x) => x.id === 'report').fields.some(([k]) => k === 'irNumber'));
  const d = RF.normalize({ irNumber: '1234567', offendersList: [{ name: 'Rick Poe' }] });
  assert.strictEqual(d.offendersList[0].irNumber, '1234567');
  assert.ok(!('irNumber' in d));
  const kept = RF.normalize({ irNumber: '1234567' });
  assert.strictEqual(kept.irNumber, '1234567', 'kept when there is no offender to move it to');
  const withSecond = text(R.build({ secondOfficer: 'Jane Roe' }, {}));
  assert.match(withSecond, /SECONDARY REPORTING OFFICER/);
  assert.match(withSecond, /SecondOfficerSignature/);
  const without = text(R.build({ secondOfficer: 'Jane Roe', hidden: ['secondOfficer'] }, {}));
  assert.doesNotMatch(without, /SECONDARY REPORTING OFFICER/);
  assert.doesNotMatch(without, /SecondOfficerSignature/);
  assert.match(without, /SupervisorSignature/);
});
