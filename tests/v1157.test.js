// v1.157: the alias drop-downs, the state of each ID, more email and mailing addresses (the one
// Mailbox box of v1.156 moves into the list), social media on a covert account, and the arrest flag
// in the case list. All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const L = require('../js/secure/locker-core.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const field = (t, k) => L.TABLES[t].fields.find((f) => f[0] === k);

test('aliases: gender, nationality, ethnicity, civil status, blood type and body type are drop-downs', () => {
  for (const k of ['gender', 'nationality', 'ethnicity', 'civilStatus', 'bloodType', 'bodyType']) {
    const f = field('aliases', k);
    assert.strictEqual(f[2], 'select', k);
    assert.strictEqual(f[3][0], '', `${k} starts empty`);
  }
  assert.ok(field('aliases', 'nationality')[3].includes('Mexican'));
  assert.ok(field('aliases', 'ethnicity')[3].includes('Hispanic or Latino'));
});

test('aliases: each ID has its state, in the Identification section', () => {
  const ids = L.TABLES.aliases.sections.find(([t]) => t === 'Identification')[1];
  for (const k of ['driversLicenseState', 'stateLicenseState', 'libraryCardState', 'idState']) {
    assert.strictEqual(field('aliases', k)[2], 'select', k);
    assert.ok(field('aliases', k)[3].includes('IL') && field('aliases', k)[3].includes('DC'), k);
    assert.ok(ids.includes(k), k);
  }
  assert.ok(ids.indexOf('driversLicenseState') === ids.indexOf('driversLicense') + 1, 'the state sits right after its ID');
  assert.strictEqual(L.US_STATES.length, 53); // 50 states, DC, PR and Other, none twice
  assert.strictEqual(new Set(L.US_STATES).size, L.US_STATES.length);
});

test('aliases: more email addresses and mailing addresses; the old Mailbox box becomes the first address', () => {
  const d = L.normalizeData({ aliases: [{ alias: 'Rick Poe', mailbox: 'Box 12, Example Mail Center', emails: [{ email: 'rick.poe@example.com' }, { email: '' }] }] });
  const a = d.aliases[0];
  assert.deepStrictEqual(a.mailboxes, [{ kind: 'Mailbox', address: 'Box 12, Example Mail Center', box: '', provider: '', key: '' }]);
  assert.ok(!('mailbox' in a));
  assert.deepStrictEqual(a.emails, [{ email: 'rick.poe@example.com', provider: '', notes: '' }]);
  // A list already there is kept as it is.
  const b = L.normalizeData({ aliases: [{ alias: 'Sam Roe', mailbox: 'old', mailboxes: [{ kind: 'Home', address: '1 Example St' }] }] }).aliases[0];
  assert.deepStrictEqual(b.mailboxes.map((x) => x.address), ['1 Example St']);
  assert.deepStrictEqual(L.TABLES.aliases.sections.find(([t]) => t === 'Contact')[1], ['address', 'phone', 'email', 'emails', 'mailboxes']);
});

test('accounts: social media for each covert account, found by search', () => {
  const rows = L.normalizeData({ accounts: [{ platform: 'Example Chat', social: [{ platform: 'Example Photos', handle: '@example_poe' }] }, { platform: 'Example Mail' }] }).accounts;
  assert.deepStrictEqual(rows[0].social, [{ platform: 'Example Photos', handle: '@example_poe', url: '' }]);
  assert.deepStrictEqual(L.filterRows('accounts', rows, 'example_poe').map((r) => r.platform), ['Example Chat']);
  assert.ok(L.TABLES.accounts.cols.indexOf('dept') === 1, 'Department is the second column');
});

test('case list: an arrest is flagged in the index; CLOSED, name columns and the rail are in place', () => {
  const vault = read('js/vault.js');
  assert.match(vault, /arrested: !!\(c\.arrest \|\| \(c\.closure && c\.closure\.disposition === 'arrest' && !c\.arrestRemoved\)\)/);
  const app = read('js/app.js');
  assert.match(app, /function closedFolder\(groups\)/);
  assert.match(app, /function sideName\(c\)/);
  const css = read('css/app.css');
  assert.match(css, /body\.sidebar-collapsed \.sidebar \{ width: 3rem; min-width: 3rem; max-width: 3rem; flex: 0 0 3rem;/);
  assert.match(read('css/theme.css'), /--arrest:/);
});
