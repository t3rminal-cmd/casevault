// Tests for the v1.9 safeguards: the PII scanner/redactor, department mail, and the memory
// indicator's summary. All names, numbers and addresses are made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/secure/pii.js');
const M = require('../js/secure/mail.js');
const Mem = require('../js/ai/memory.js');
const CF = require('../js/casefiles.js');

const SAMPLE = `On March 14, 2026 at 21:40, Det. John Smith and Officer Maria Lopez-Diaz responded to 1423 N Oak Street, Apt 4B, Richmond, VA 23220 regarding case no. 2026-00123.
The suspect, DOE, Jane (DOB 04/12/1990, SSN 123-45-6789) was driving a black Honda Civic, VA plate UXK-4412, VIN 1HGCM82633A004352.
Her cell is (804) 555-0142 and email jane.doe@example.com. Cash in the amount of $4,500 was seized. Card 4111 1111 1111 1111.
Driver's license T12345678. The Police Department notified Richmond Circuit Court. Witness Carlos Mendez said he saw 3 bags.
Routing number 051000017. Report # RMS26-4417.`;

test('PII: finds the usual personal and case details', () => {
  const found = P.scan(SAMPLE);
  const by = (type) => found.filter((f) => f.type === type).map((f) => f.value);
  assert.deepStrictEqual(by('ssn'), ['123-45-6789']);
  assert.deepStrictEqual(by('dob'), ['04/12/1990']);
  assert.deepStrictEqual(by('phone'), ['(804) 555-0142']);
  assert.deepStrictEqual(by('email'), ['jane.doe@example.com']);
  assert.deepStrictEqual(by('card'), ['4111 1111 1111 1111']);
  assert.deepStrictEqual(by('vin'), ['1HGCM82633A004352']);
  assert.deepStrictEqual(by('plate'), ['UXK-4412']);
  assert.deepStrictEqual(by('dl'), ['T12345678']);
  assert.deepStrictEqual(by('bank'), ['051000017']);
  assert.deepStrictEqual(by('address'), ['1423 N Oak Street, Apt 4B, Richmond, VA 23220']);
  assert.deepStrictEqual(by('casenum'), ['2026-00123', 'RMS26-4417']);
  assert.deepStrictEqual(by('person'), ['John Smith', 'Maria Lopez-Diaz', 'DOE, Jane', 'Carlos Mendez']);
});

test('PII: leaves ordinary police wording alone', () => {
  const text = 'At 21:40 the Police Department recovered $4,500 and 3 bags. The Honda Civic was towed to the County Impound. On Monday Officers Arrived.';
  assert.deepStrictEqual(P.scan(text).map((f) => f.value), []);
  assert.ok(!P.scan('Call 911 at 21:40 on 2026-03-14.').some((f) => f.type === 'phone'));
  assert.ok(!P.scan('Order 4111 1111 1111 1112').some((f) => f.type === 'card'), 'fails the Luhn check');
});

test('PII: known names from the case are found in every form, and win over patterns', () => {
  const known = P.knownTerms({ caseObj: { client: 'Maria Lopez', number: '00123', id: '2026-00123' }, watchlist: ['Big Mike'] });
  const found = P.scan('LOPEZ, Maria met big mike. Lopez left. Case 00123.', { known });
  assert.deepStrictEqual(found.map((f) => [f.type, f.value]), [['known', 'LOPEZ, Maria'], ['known', 'big mike'], ['known', 'Lopez'], ['casenum', '00123']]);
});

test('PII: a known word inside an address or email hides the whole address or email (v1.9.1 leak)', () => {
  // v1.9 kept only the known surname and sent the rest: "1420 [NAME_1] Avenue", "casey.[NAME_1]@…".
  const known = P.knownTerms({ affiant: { name: 'Detective Casey Example', email: 'casey.example@agency.example' } });
  const text = 'Vehicle TST-1284 at 1420 Example Avenue. Call me at 555-0142 or casey.example@agency.example.';
  const r = P.redact(text, P.scan(text, { known }));
  assert.strictEqual(r.text, 'Vehicle [PLATE_1] at [ADDRESS_1] Call me at [PHONE_1] or [EMAIL_1].');
  assert.strictEqual(P.rehydrate(r.text, r.map), text);
  // The agency's city is also a word in the street address.
  const known2 = P.knownTerms({ affiant: { name: 'Det. Sam Austin' } });
  const t2 = 'He lives at 1420 Oak Street, Austin, TX 78701. Det. Sam Austin took the call.';
  const r2 = P.redact(t2, P.scan(t2, { known: known2 }));
  assert.ok(!/1420|Oak/.test(r2.text), r2.text);
  assert.ok(r2.text.startsWith('He lives at [ADDRESS_1].'), r2.text);
});

test('PII: local phone numbers and plates without the word "plate"', () => {
  const found = P.scan('Call 555-0142 or 555.0199. Plates TST-1284, ABC1234, 7ABC123 and 123-XYZ.');
  const by = (type) => found.filter((f) => f.type === type).map((f) => f.value);
  assert.deepStrictEqual(by('phone'), ['555-0142', '555.0199']);
  assert.deepStrictEqual(by('plate'), ['TST-1284', 'ABC1234', '7ABC123', '123-XYZ']);
  // Not plates or phones: standards, fiscal years, times, dates, amounts, case numbers, versions.
  const quiet = P.scan('ISO 9001, FY2026, 21:40, 03/14/2026, $2,540, item 3, version 1.2.3, Room 101, page 12-2026.');
  assert.deepStrictEqual(quiet.map((f) => f.value), []);
});

test('PII: redaction is consistent, reversible, and keeps locked types hidden', () => {
  const found = P.scan(SAMPLE);
  const everyName = new Set(found.map((f, i) => (f.type === 'person' ? i : -1)).filter((i) => i >= 0));
  const r = P.redact(SAMPLE, found, { skip: everyName });
  assert.ok(r.text.includes('Det. John Smith'), 'an un-ticked possible name is left as it is');
  assert.ok(!r.text.includes('123-45-6789') && r.text.includes('[SSN_1]'));
  assert.ok(!r.text.includes('(804) 555-0142') && r.text.includes('[PHONE_1]'));

  const all = P.redact(SAMPLE, found);
  for (const f of found) assert.ok(!all.text.includes(f.value), `${f.value} hidden`);
  assert.strictEqual(P.rehydrate(all.text, all.map), SAMPLE);

  // Same value, same placeholder, across messages that share the map.
  const again = P.redact('Call (804) 555-0142 again.', P.scan('Call (804) 555-0142 again.'), { map: all.map });
  assert.strictEqual(again.text, 'Call [PHONE_1] again.');
  const next = P.redact('New number 703-555-0199.', P.scan('New number 703-555-0199.'), { map: all.map });
  assert.strictEqual(next.text, 'New number [PHONE_2].');
  assert.strictEqual(P.rehydrate('Unknown [NAME_99] stays.', all.map), 'Unknown [NAME_99] stays.');
});

test('PII: every type is labelled and has a placeholder tag', () => {
  for (const [k, t] of Object.entries(P.TYPES)) {
    assert.ok(t.label && /^[A-Z]+$/.test(t.tag), k);
    assert.ok(['critical', 'high', 'medium'].includes(t.level), k);
  }
  assert.ok(P.hasCritical(P.scan('SSN 123-45-6789')));
  assert.ok(!P.hasCritical(P.scan('call (804) 555-0142')));
});

/* ---------- department mail ---------- */

test('mail: addresses and the department domain rules', () => {
  const list = M.parseAddresses('Jane Doe <Jane.Doe@Agency.gov>; bob@pd.agency.gov, not-an-email, x@gmail.com');
  assert.deepStrictEqual(list.map((r) => r.email), ['jane.doe@agency.gov', 'bob@pd.agency.gov', null, 'x@gmail.com']);
  assert.deepStrictEqual(M.parseDomains('@agency.gov, *.county.gov  bad_domain'), ['agency.gov', '*.county.gov']);

  assert.ok(M.domainAllowed('a@agency.gov', ['agency.gov']));
  assert.ok(!M.domainAllowed('a@pd.agency.gov', ['agency.gov']), 'exact domain only');
  assert.ok(M.domainAllowed('a@pd.agency.gov', ['*.agency.gov']));
  assert.ok(M.domainAllowed('a@agency.gov', ['*.agency.gov']));
  assert.ok(!M.domainAllowed('a@agency.gov.evil.com', ['agency.gov', '*.agency.gov']));
  assert.ok(!M.domainAllowed('a@notagency.gov', ['*.agency.gov']));

  const r = M.checkRecipients(list, ['agency.gov', '*.agency.gov']);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.blocked, ['x@gmail.com']);
  assert.deepStrictEqual(r.invalid, ['not-an-email']);
  assert.ok(M.checkRecipients(M.parseAddresses('a@agency.gov'), ['agency.gov']).ok);
  assert.ok(!M.checkRecipients([], ['agency.gov']).ok, 'no recipients is not ok');
});

test('mail: flags attachments that carry another case number', () => {
  const names = ['Arrest Report/2026-00123 Arrest Report.pdf', 'Other/2026-00999 Case Report.pdf', 'Maps/area.png', 'Email/2026-00123-2 Email - x.eml'];
  assert.deepStrictEqual(M.otherCaseFiles(names, '2026-00123', CF.prefixInName), ['Other/2026-00999 Case Report.pdf']);
  assert.deepStrictEqual(M.otherCaseFiles(names, null, CF.prefixInName), []);
});

test('mail: builds an unsent Outlook draft with attachments', () => {
  const eml = M.buildEml({
    to: [{ name: 'Jane Doe', email: 'jane@agency.gov' }], cc: [{ name: '', email: 'unit@agency.gov' }],
    subject: '[LES] 2026-00123 – Arrest report', body: 'Hello,\nSee attached.',
    attachments: [{ name: '2026-00123 Arrest Report.pdf', type: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }],
    date: new Date(Date.UTC(2026, 8, 28, 14, 0, 0)), boundary: 'BOUNDARY',
  });
  assert.match(eml, /^To: Jane Doe <jane@agency\.gov>\r\n/);
  assert.match(eml, /\r\nCc: unit@agency\.gov\r\n/);
  assert.match(eml, /\r\nX-Unsent: 1\r\n/);
  assert.match(eml, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/, 'non-ASCII subject is encoded');
  assert.match(eml, /Content-Type: multipart\/mixed; boundary="BOUNDARY"/);
  assert.match(eml, /Content-Disposition: attachment; filename="2026-00123 Arrest Report\.pdf"/);
  assert.ok(eml.includes(Buffer.from('%PDF').toString('base64')));
  assert.ok(eml.includes(Buffer.from('Hello,\r\nSee attached.').toString('base64')), 'body is CRLF, base64');
  assert.ok(eml.trimEnd().endsWith('--BOUNDARY--'));
  assert.ok(!/[^\r]\n/.test(eml), 'CRLF line endings only');
  // Decoding the subject gives it back.
  const enc = /Subject: ((?:=\?UTF-8\?B\?[^?]+\?=(?:\r\n )?)+)/.exec(eml)[1];
  const dec = enc.split(/\r\n /).map((w) => Buffer.from(/\?B\?([^?]+)\?=/.exec(w)[1], 'base64').toString('utf8')).join('');
  assert.strictEqual(dec, '[LES] 2026-00123 – Arrest report');

  const plain = M.buildEml({ to: [{ email: 'a@agency.gov' }], subject: 'Hi', body: 'x' });
  assert.match(plain, /\r\nSubject: Hi\r\n/);
  assert.ok(!plain.includes('multipart'));
});

test('mail: mailto link, and none when too long', () => {
  const url = M.mailtoUrl({ to: [{ email: 'a@agency.gov' }], cc: [{ email: 'b@agency.gov' }], subject: 'A & B', body: 'line1\nline2' });
  assert.strictEqual(url, 'mailto:a@agency.gov?cc=b%40agency.gov&subject=A%20%26%20B&body=line1%0D%0Aline2');
  assert.strictEqual(M.mailtoUrl({ to: [{ email: 'a@agency.gov' }], body: 'x'.repeat(3000) }), null);
});

/* ---------- memory indicator ---------- */

test('memory: summary of app, AI model, RAM and disk', () => {
  const GB = 1024 ** 3;
  const s = Mem.summarize({
    heap: { used: 180 * 1024 * 1024, limit: 4 * GB },
    models: [{ name: 'qwen2.5:7b', size: 5.2 * GB, size_vram: 5.2 * GB }],
    sys: { ramTotal: 32 * GB, ramFree: 20 * GB, diskTotal: 850 * GB, diskFree: 700 * GB },
  });
  assert.strictEqual(s.text, 'RAM 38% · App 180 MB · AI 5.2 GB');
  assert.strictEqual(s.level, 'ok');
  assert.ok(s.lines.some((l) => l.includes('qwen2.5:7b') && l.includes('100% GPU')));

  const split = Mem.summarize({ models: [{ name: 'qwen2.5:14b', size: 10 * GB, size_vram: 5 * GB }] });
  assert.ok(split.lines[0].includes('5.0 GB in RAM') && split.lines[0].includes('50% GPU'));

  assert.strictEqual(Mem.summarize({ sys: { ramTotal: 16 * GB, ramFree: 0.5 * GB } }).level, 'high');
  assert.strictEqual(Mem.summarize({ heap: { used: 3.0 * GB, limit: 4 * GB } }).level, 'warn');
  assert.strictEqual(Mem.summarize({ sys: { diskTotal: 100 * GB, diskFree: 2 * GB } }).level, 'high');
  assert.strictEqual(Mem.summarize({}).text, 'Memory');
});

/* ---------- the outbound gate ---------- */

test('outbound: nothing goes out offline, without a review, or to another host', async () => {
  const { load, get } = require('./helpers/load-app.js');
  globalThis.CVPii = P;
  load('js/secure/outbound.js');
  const O = get('CVOutbound');
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...a) => { calls.push(a); return new Response('{}'); };
  try {
    assert.strictEqual(O.isOnline(), false, 'offline at start');
    await assert.rejects(O.send('no-ticket', 'https://api.anthropic.com/v1/messages', { body: '{}' }), /offline/);
    assert.throws(() => O.goOnline(), /turned off/, 'needs "Allow going online" first');
    await assert.rejects(O.sendMeta('https://api.anthropic.com/v1/models'), /offline/);
    assert.deepStrictEqual(O.leaks('{"content":"Call [PHONE_1] about DOE, Jane"}', ['(804) 555-0142', 'DOE, Jane']), ['DOE, Jane']);
    assert.deepStrictEqual(O.leaks('{"content":"all [NAME_1]"}', ['Jane Doe']), []);
    assert.deepStrictEqual(O.ALLOWED_HOSTS, ['api.anthropic.com']);
    assert.strictEqual(calls.length, 0, 'no request was made');
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ---------- API key ---------- */

test('API key: accepts a real-looking key, explains the usual mistakes', () => {
  const K = require('../js/secure/apikey.js');
  const good = `sk-ant-api03-${'aB3_-x'.repeat(15)}AAAA`;
  assert.deepStrictEqual(K.check(`  "${good}"\n`), { ok: true, key: good, problem: '' }, 'spaces and quotes are trimmed');
  assert.match(K.check('').problem, /Paste/);
  assert.match(K.check('sk-ant-admin01-abcdefghijklmnopqrstuvwxyz').problem, /Admin key/);
  assert.match(K.check('sk-ant-oat01-abcdefghijklmnopqrstuvwxyz').problem, /subscription/);
  assert.match(K.check('sk-proj-abcdefghijklmnop').problem, /starts with "sk-ant-api"/);
  assert.match(K.check('sk-ant-api03-short').problem, /complete/);
  assert.strictEqual(K.mask(good), 'sk-ant-api03-…AAAA');
  assert.ok(!K.mask(good).includes('aB3_'), 'the mask never shows the middle');
});

test('API key: locked with a passphrase on the SSD, never stored readable', async () => {
  const K = require('../js/secure/apikey.js');
  const key = `sk-ant-api03-${'Zq9'.repeat(30)}wXyZ`;
  const rec = await K.lock(key, 'correct horse battery');
  const text = JSON.stringify(rec);
  assert.ok(!text.includes(key) && !text.includes('Zq9Zq9'), 'no readable key in the record');
  assert.strictEqual(rec.kind, 'locked');
  assert.strictEqual(rec.masked, 'sk-ant-api03-…wXyZ');
  assert.strictEqual(rec.kdf.iterations, K.ITERATIONS);
  assert.strictEqual(await K.unlock(rec, 'correct horse battery'), key);
  await assert.rejects(K.unlock(rec, 'wrong horse battery'), /Wrong passphrase/);
  await assert.rejects(K.lock(key, 'short'), /at least 8/);
  const again = await K.lock(key, 'correct horse battery');
  assert.notStrictEqual(again.data, rec.data, 'fresh salt and IV each time');

  assert.deepStrictEqual(K.describe(rec), { kind: 'locked', masked: 'sk-ant-api03-…wXyZ', saved: rec.saved });
  assert.strictEqual(K.describe(K.plainRecord(key)).kind, 'plain');
  assert.strictEqual(K.describe({ key }).kind, 'plain', 'a v1.9 record still reads');
  assert.strictEqual(K.describe(null).kind, null);
});
