// Tests for the privacy screen: PIN hashing and the lock/unlock controller.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/privacy.js');

test('PIN validation: 4 to 6 digits only', () => {
  for (const ok of ['1234', '00000', '987654']) assert.ok(P.isValidPin(ok), ok);
  for (const bad of ['123', '1234567', '12a4', '', null, ' 1234']) assert.ok(!P.isValidPin(bad), String(bad));
});

test('PIN hashing: salted SHA-256, never stores the PIN', async () => {
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const h1 = await P.hashPin('2468', salt);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.strictEqual(h1, await P.hashPin('2468', salt), 'deterministic for the same salt');
  // Known value: sha256(salt bytes + "2468")
  const expected = require('node:crypto').createHash('sha256').update(Buffer.concat([Buffer.from('0123456789abcdef'), Buffer.from('2468')])).digest('hex');
  assert.strictEqual(h1, expected);

  const a = await P.makePinRecord('2468');
  const b = await P.makePinRecord('2468');
  assert.notStrictEqual(a.salt, b.salt, 'a fresh random salt each time');
  assert.notStrictEqual(a.hash, b.hash);
  assert.ok(!JSON.stringify(a).includes('2468'), 'the record never contains the PIN');
  assert.strictEqual(a.algo, 'SHA-256');
  assert.ok(await P.verifyPin('2468', a));
  assert.ok(!(await P.verifyPin('2469', a)));
  assert.ok(!(await P.verifyPin('2468', null)));
  await assert.rejects(P.makePinRecord('12'), /4 to 6 digits/);
});

test('Esc twice within 500 ms triggers; slower presses do not', () => {
  let t = 0;
  const esc = P.createEscDetector(500, () => t);
  assert.strictEqual(esc(), false);
  t = 400; assert.strictEqual(esc(), true);
  t = 1000; assert.strictEqual(esc(), false, 'a third press starts over');
  t = 1600; assert.strictEqual(esc(), false, '600 ms later is too slow');
  t = 1700; assert.strictEqual(esc(), true);
});

function fakePage(record = null) {
  const page = { title: 'Smith v. Jones · CaseVault', icon: 'icons/icon.svg', shown: null, flushed: 0, paused: 0, previewsClosed: 0, record, t: 0 };
  page.env = {
    show: (needsPin) => { page.shown = needsPin ? 'pin' : 'click'; },
    hide: () => { page.shown = null; },
    getTitle: () => page.title, setTitle: (x) => { page.title = x; },
    getIcon: () => page.icon, setIcon: (x) => { page.icon = x; },
    flush: () => { page.flushed++; return Promise.resolve(); },
    pauseMedia: () => { page.paused++; },
    closePreviews: () => { page.previewsClosed++; },
    getPinRecord: () => page.record,
    now: () => page.t,
  };
  return page;
}

test('lock covers the page: title, icon, media, previews, autosave flush', () => {
  const page = fakePage();
  const c = P.createController(page.env);
  assert.ok(c.lock());
  assert.ok(c.locked);
  assert.strictEqual(page.title, 'New Tab');
  assert.strictEqual(page.icon, P.BLANK_ICON);
  assert.deepStrictEqual([page.shown, page.flushed, page.paused, page.previewsClosed], ['click', 1, 1, 1]);
  assert.strictEqual(c.lock(), false, 'locking twice does nothing');
  assert.strictEqual(page.flushed, 1);
});

test('without a PIN one click returns and restores title and icon', async () => {
  const page = fakePage();
  const c = P.createController(page.env);
  c.lock();
  assert.deepStrictEqual(await c.unlock(), { ok: true });
  assert.ok(!c.locked);
  assert.deepStrictEqual([page.title, page.icon, page.shown], ['Smith v. Jones · CaseVault', 'icons/icon.svg', null]);
});

test('with a PIN: wrong PINs rejected, cooldown after 5 tries, right PIN unlocks', async () => {
  const page = fakePage(await P.makePinRecord('4321'));
  const c = P.createController(page.env);
  c.lock();
  assert.strictEqual(page.shown, 'pin');
  assert.deepStrictEqual(await c.unlock(), { ok: false, reason: 'wrong', left: 4 });
  for (let i = 0; i < 3; i++) await c.unlock('0000');
  const blocked = await c.unlock('0000');
  assert.deepStrictEqual([blocked.ok, blocked.reason, blocked.waitMs], [false, 'wait', P.COOLDOWN_MS]);
  page.t = 10000;
  assert.strictEqual((await c.unlock('4321')).reason, 'wait', 'even the right PIN waits out the cooldown');
  assert.ok(c.locked);
  page.t = P.COOLDOWN_MS + 1;
  assert.deepStrictEqual(await c.unlock('4321'), { ok: true });
  assert.ok(!c.locked);
  assert.strictEqual(page.title, 'Smith v. Jones · CaseVault');
});

test('idle timer: off by default, fires once after N minutes, activity resets it', () => {
  let t = 0; let fired = 0; let minutes = 0;
  const idle = P.createIdleTimer({ minutes: () => minutes, onIdle: () => fired++, now: () => t });
  t = 60 * 60000; idle.tick();
  assert.strictEqual(fired, 0, 'off (0 minutes) never fires');
  minutes = 5; idle.poke();
  t += 4 * 60000; idle.tick(); assert.strictEqual(fired, 0);
  t += 60000; idle.tick(); assert.strictEqual(fired, 1);
  t += 60000; idle.tick(); assert.strictEqual(fired, 1, 'fires only once until there is activity');
  idle.poke(); t += 5 * 60000; idle.tick(); assert.strictEqual(fired, 2);
});
