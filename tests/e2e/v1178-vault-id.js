// v1.178: a vault made before vaultId existed gets one when CaseVault opens it, so the helper (1.17)
// can recognise this vault and never open another drive's vault in its place. Made-up data only.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1200, 800);
  const r = await p.evaluate(async () => {
    const had = Vault.data.vaultId;
    delete Vault.data.vaultId;            // as in a vault.json written before vaultId existed
    await Vault.updateSettings({});       // saved without it
    const before = (await FS.readJSON(Vault.root, 'vault.json')).vaultId || '';
    await Vault.load(Vault.root);
    const after = (await FS.readJSON(Vault.root, 'vault.json')).vaultId || '';
    const again = (await Vault.load(Vault.root)).vaultId;
    return { had: !!had, before, after, again, uuid: /^[0-9a-f-]{36}$/.test(after) };
  });
  ok(r.had, 'a new vault has a vaultId');
  ok(!r.before && r.uuid, `an old vault without one gets one on opening, saved in vault.json: ${r.after}`);
  ok(r.again === r.after, 'and keeps it the next time');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
