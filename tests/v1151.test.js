// v1.151: scrambled addresses (js/route-key.js), the shared date helpers, the helper's key and
// Windows device names. All data is synthetic (Doe / Roe names).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
globalThis.CVDiscovery = require('../js/discovery-core.js');
const R = require('../js/route-key.js');
const F = require('../js/formats.js');

test('addresses: plain before a vault is open, scrambled after, and read back', () => {
  R.setSecret('');
  assert.strictEqual(R.enc('2026-EX-100'), '2026-EX-100');
  assert.strictEqual(R.enc('Doe Family'), 'Doe%20Family');
  R.setSecret('ab'.repeat(24));
  const t = R.enc('2026-EX-100');
  assert.match(t, /^~[A-Za-z0-9_-]+$/);
  assert.ok(!t.includes('EX') && !t.includes('100'));
  assert.strictEqual(R.enc('2026-EX-100'), t, 'the same text always gives the same address');
  assert.notStrictEqual(R.enc('2026-EX-101'), t);
  assert.strictEqual(R.dec(t), '2026-EX-100');
  for (const s of ['Doe Family', 'John Doe search warrant', 'Ünïcödé Roe', 'a']) assert.strictEqual(R.dec(R.enc(s)), s);
  assert.strictEqual(R.dec('2026-EX-100'), '2026-EX-100', 'an old plain address still reads');
  assert.strictEqual(R.dec('Doe%20Family'), 'Doe Family');
  const tampered = `${t.slice(0, -2)}${t.slice(-2) === 'AA' ? 'BB' : 'AA'}`;
  assert.strictEqual(R.dec(tampered), null, 'a changed address is refused');
  R.setSecret('cd'.repeat(24));
  assert.strictEqual(R.dec(t), null, 'another vault\'s key cannot read it');
  R.setSecret('not hex');
  assert.strictEqual(R.active, false);
});

test('one shared YYYY-MM-DD helper', () => {
  assert.strictEqual(F.isoDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.strictEqual(F.addDays('2026-02-28', 1), '2026-03-01');
  assert.strictEqual(F.addDays('2026-03-08', 1), '2026-03-09', 'a clock change does not skip a day');
  assert.strictEqual(F.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(F.addDays('2026-10-24', -30), '2026-09-24');
  const files = ['js/app.js', 'js/locker-ui.js', 'js/closing-ui.js', 'js/case-timeline.js'];
  for (const f of files) assert.ok(!/padStart\(2, '0'\)\}-\$\{String/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), `${f} uses the shared helper`);
});

test('helper 1.16: a key on every API request, device names refused, its own browser profile', () => {
  const ps = fs.readFileSync(path.join(__dirname, '../tools/casevault-helper/casevault-helper.ps1'), 'utf8');
  const [maj, min] = (/\$HelperVersion = '(\d+)\.(\d+)/.exec(ps) || []).slice(1).map(Number);
  assert.ok(maj > 1 || min >= 16, 'helper 1.16 or later');
  assert.match(ps, /Test-SessionKey \$req/);
  assert.match(ps, /RandomNumberGenerator/);
  assert.match(ps, /\(con\|prn\|aux\|nul\|com\[0-9\]\|lpt\[0-9\]\)/);
  assert.match(ps, /--user-data-dir=/);
  assert.match(ps, /CaseVault-Browser/);
  const hfs = fs.readFileSync(path.join(__dirname, '../js/helper-fs.js'), 'utf8');
  assert.match(hfs, /X-CaseVault-Key/);
  assert.ok(!/headers: \{ 'X-CaseVault': '1' \}/.test(hfs), 'every helper request sends the key');
});
