// v1.111: the Secure Locker's encryption, cases on the same suspect, and name columns.
// Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/secure/locker-core.js');
const K = require('../js/closing.js');
const O = require('../js/operation.js');

test('v1.111: a locker opens with its password or its recovery key, and nothing else', async () => {
  assert.ok(L.passwordProblem('short'));
  assert.ok(L.passwordProblem('aaaaaaaaaaaa'));
  assert.strictEqual(L.passwordProblem('correct horse 42', 'correct horse 42'), '');
  await assert.rejects(L.create('short'), /At least 10/);
  const { header, key, recoveryKey } = await L.create('correct horse 42');
  assert.match(recoveryKey, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  assert.ok(L.recoveryLooksRight(recoveryKey.toLowerCase().replace(/-/g, ' ')));
  // Nothing readable in the header.
  const h = JSON.stringify(header);
  assert.ok(!h.includes('correct horse') && !h.includes(L.cleanRecovery(recoveryKey)));
  assert.strictEqual(header.pw.iter, 600000);
  // Data written with the key reads back with a key from the password and from the recovery key.
  const blob = await L.encryptJSON(key, { passwords: [{ site: 'Example Portal', password: 'Synthetic-Pass-1' }] }, 'data.bin');
  assert.ok(!Buffer.from(blob).toString('latin1').includes('Synthetic-Pass-1'), 'encrypted on disk');
  const k2 = await L.open(header, 'correct horse 42');
  assert.strictEqual((await L.decryptJSON(k2, blob, 'data.bin')).passwords[0].site, 'Example Portal');
  const k3 = await L.open(header, recoveryKey.toLowerCase(), 'rk');
  assert.strictEqual((await L.decryptJSON(k3, blob, 'data.bin')).passwords[0].password, 'Synthetic-Pass-1');
  await assert.rejects(L.open(header, 'wrong password!!'), { name: 'WrongSecretError' });
  await assert.rejects(L.open(header, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', 'rk'), { name: 'WrongSecretError' });
  // A file renamed (swapped) does not open.
  await assert.rejects(L.decrypt(k2, blob, 'other.bin'), { name: 'CorruptFileError' });
  // Forgot the password: the recovery key sets a new one; the old one stops working.
  const h2 = await L.changePassword(header, recoveryKey, 'rk', 'new password 2026');
  await assert.rejects(L.open(h2, 'correct horse 42'), { name: 'WrongSecretError' });
  const k4 = await L.open(h2, 'new password 2026');
  assert.strictEqual((await L.decryptJSON(k4, blob, 'data.bin')).passwords[0].site, 'Example Portal');
  // A new recovery key replaces the old one.
  const { header: h3, recoveryKey: rk2 } = await L.newRecovery(h2, 'new password 2026');
  await assert.rejects(L.open(h3, recoveryKey, 'rk'), { name: 'WrongSecretError' });
  await L.open(h3, rk2, 'rk');
});

test('v1.111: locker tables, search and password generator', () => {
  const d = L.normalizeData({ passwords: [{ id: 'a', site: 'Example Portal', username: 'jdoe', password: 'Zq9secret' }, null], files: [{ id: 'bad!' }, { id: 'abcdefgh12', name: 'CI-1 contract.pdf', size: 10 }] });
  assert.strictEqual(d.passwords.length, 1);
  assert.deepStrictEqual(Object.keys(d.passwords[0]), ['id', 'site', 'username', 'password', 'url', 'notes']);
  assert.strictEqual(d.files.length, 1);
  assert.strictEqual(L.filterRows('passwords', d.passwords, 'portal jdoe').length, 1);
  assert.strictEqual(L.filterRows('passwords', d.passwords, 'zq9').length, 0, 'passwords are not searched');
  const g = L.generatePassword();
  assert.strictEqual(g.length, 20);
  assert.notStrictEqual(g, L.generatePassword());
  assert.deepStrictEqual(Object.keys(L.TABLES), ['passwords', 'aliases', 'accounts']);
});

test('v1.111: other open cases on the same suspect', () => {
  assert.strictEqual(K.personKey('DOE, John'), K.personKey('john doe'));
  assert.strictEqual(K.personKey('Unknown'), '');
  assert.strictEqual(K.personKey('Doe'), '', 'one word is not enough to match');
  const c = { id: 'a', subject: 'John Doe', suspects: [{ name: 'Rick Poe' }, { name: 'Not Identified', notIdentified: true }] };
  const others = [
    { id: 'b', number: 'EX-2', subject: 'DOE, JOHN', status: 'Open' },
    { id: 'c', number: 'EX-1', subject: 'Jane Roe', suspects: [{ name: 'POE, Rick' }], status: 'Open' },
    { id: 'd', number: 'EX-3', subject: 'John Doe', status: 'Closed' },
    { id: 'e', number: 'EX-4', subject: 'Mary Doe', status: 'Open' },
  ];
  const r = K.sameSuspectCases(c, others);
  assert.deepStrictEqual(r.map((x) => [x.c.id, x.names]), [['c', ['Rick Poe']], ['b', ['John Doe']]]);
});

test('v1.111: a subject name in Last, First and Middle', () => {
  assert.deepStrictEqual(O.nameParts('John Michael Doe'), { last: 'DOE', first: 'John', middle: 'Michael', whole: false });
  assert.deepStrictEqual(O.nameParts('DOE, Jane'), { last: 'DOE', first: 'Jane', middle: '', whole: false });
  assert.strictEqual(O.nameParts('John Doe Jr').last, 'DOE JR');
  assert.ok(O.nameParts('State v. Doe').whole);
});
