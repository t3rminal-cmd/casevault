// v1.163: Document Anonymizer: better names (hyphens, particles, capitals, titles), addresses and
// phones; known terms first; redaction styles; the preview's segments; keeping a detail. All data
// is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/secure/pii.js');
const O = require('../js/options.js');

const found = (t, type) => P.scan(t).filter((f) => !type || f.type === type).map((f) => f.value);

test('names: hyphens, Mc / O\', particles, capitals, titles', () => {
  assert.deepStrictEqual(found('Ofc. Maria de la Cruz met Ana Roe-Poe-Doe and Sean O\'Roe near the park.', 'person'), ['Maria de la Cruz', 'Ana Roe-Poe-Doe', 'Sean O\'Roe']);
  assert.deepStrictEqual(found('Witness DE LA CRUZ, Maria called.', 'person'), ['DE LA CRUZ, Maria']);
  assert.deepStrictEqual(found('Then the UC arrested JOHN DOE near the park.', 'person'), ['JOHN DOE']);
  assert.deepStrictEqual(found('Det. Jan McDoe wrote it.', 'person'), ['Jan McDoe']);
  assert.deepStrictEqual(found('Cousin Rick Poe drove.', 'person'), ['Rick Poe']);
  // Words that are not names are trimmed off both ends: "Monday John Doe Police" finds John Doe.
  assert.deepStrictEqual(found('He saw Monday John Doe Police at noon.', 'person'), ['John Doe']);
});

test('names: headings and report words in capitals are not names', () => {
  assert.deepStrictEqual(found('PROBABLE CAUSE\nCONTROLLED BUY\nThe DEA TASK FORCE met.', 'person'), []);
  assert.deepStrictEqual(found('A CONTROLLED BUY took place.', 'person'), []);
  assert.deepStrictEqual(found('He ran 3 blocks down the street to the Example City Police Department.'), []);
});

test('addresses: compass points, floors, PO Box #', () => {
  assert.deepStrictEqual(found('At 1420 NW Oak Street, Apt. 3B today.', 'address'), ['1420 NW Oak Street, Apt. 3B']);
  assert.deepStrictEqual(found('At 55 North Example Avenue Fl 2 today.', 'address'), ['55 North Example Avenue Fl 2']);
  assert.deepStrictEqual(found('Mail to 12 Oak Street NE, Example City, IL 60601 today.', 'address'), ['12 Oak Street NE, Example City, IL 60601']);
  assert.deepStrictEqual(found('Mail to PO Box #42 now.', 'address'), ['PO Box #42']);
});

test('phones: extensions, +1, dots, labels', () => {
  assert.deepStrictEqual(found('Call +1 (555) 201-0142 ext. 12 or 555.201.0199 x7.', 'phone'), ['+1 (555) 201-0142 ext. 12', '555.201.0199 x7']);
  assert.deepStrictEqual(found('Contact: 555 201 0150.', 'phone'), ['555 201 0150']);
});

test('known terms come first: a known name beats a guessed one, but not an address it sits in', () => {
  const f = P.scan('Suspect Alex Sample ran.', { known: [{ value: 'Alex Sample', type: 'known' }] });
  assert.deepStrictEqual(f.map((x) => [x.type, x.value, x.locked]), [['known', 'Alex Sample', true]]);
  const g = P.scan('He lives at 1420 Sample Avenue now.', { known: [{ value: 'Alex Sample', type: 'known' }] });
  assert.deepStrictEqual(g.map((x) => x.type), ['address']);
});

test('styles: placeholder, REDACTED, black bar, initials (names only)', () => {
  const t = 'Ofc. Maria de la Cruz called 555-201-0142 about John Doe.';
  const f = P.scan(t);
  assert.strictEqual(P.redact(t, f).text, 'Ofc. [NAME_1] called [PHONE_1] about [NAME_2].');
  assert.strictEqual(P.redact(t, f, { style: 'redacted' }).text, 'Ofc. REDACTED called REDACTED about REDACTED.');
  assert.strictEqual(P.redact(t, f, { style: 'blackbar' }).text, 'Ofc. ████████████████ called ████████████ about ████████.');
  // Initials only for names: the phone number gets its placeholder, never its first digit.
  assert.strictEqual(P.redact(t, f, { style: 'initials' }).text, 'Ofc. M. C. called [PHONE_1] about J. D..');
  // The same value is replaced the same way every time; placeholder maps still rehydrate.
  const t2 = 'Later, John Doe met Jane Roe and John Doe.';
  const r = P.redact(t2, P.scan(t2));
  assert.strictEqual(r.text, 'Later, [NAME_1] met [NAME_2] and [NAME_1].');
  assert.strictEqual(P.rehydrate(r.text, r.map), t2);
  assert.deepStrictEqual(Object.keys(P.STYLES), ['placeholder', 'redacted', 'blackbar', 'initials']);
});

test('preview: segments and highlightHTML (escaped, kept and locked marks)', () => {
  const t = 'Call <b>555-201-0142</b> for John Doe.';
  const f = P.scan(t);
  const seg = P.segments(t, f);
  assert.strictEqual(seg.map((g) => g.text).join(''), t);
  assert.deepStrictEqual(seg.filter((g) => g.finding).map((g) => [g.i, g.text]), [[0, '555-201-0142'], [1, 'John Doe']]);
  const html = P.highlightHTML(t, f, new Set([1]));
  assert.match(html, /^Call &lt;b&gt;<mark class="pii-high pii-locked" data-idx="0" title="Phone number">555-201-0142<\/mark>&lt;\/b&gt;/);
  assert.match(html, /<mark class="pii-skip" data-idx="1"[^>]*>John Doe<\/mark>/);
});

test('Anonymizer: keep a guessed name (every mention); critical details and known names are always replaced', () => {
  const t = 'Ana Roe-Poe called. SSN 123-45-6789. Ana Roe-Poe left with Alex Sample.';
  const all = O.anonymize(t, { known: ['Alex Sample'], style: 'placeholder' });
  assert.strictEqual(all.text, '[NAME_1] called. SSN [SSN_1]. [NAME_1] left with [NAME_2].');
  const keep = new Set(['ana roe-poe', '123-45-6789', 'alex sample']);
  const r = O.anonymize(t, { known: ['Alex Sample'], style: 'placeholder', kept: keep });
  assert.strictEqual(r.text, 'Ana Roe-Poe called. SSN [SSN_1]. Ana Roe-Poe left with [NAME_1].');
  const fic = O.anonymize(t, { known: ['Alex Sample'], style: 'fictitious', kept: keep });
  assert.match(fic.text, /^Ana Roe-Poe called\. SSN 000-00-0000\. Ana Roe-Poe left with John Doe\.$/);
  assert.strictEqual(fic.replaced, 2);
  assert.ok(O.canKeep({ level: 'high', type: 'phone' }) && !O.canKeep({ level: 'critical', type: 'ssn' }) && !O.canKeep({ level: 'high', type: 'known' }));
});
