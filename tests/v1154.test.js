// v1.154: Export Encrypted saves on the SSD (CaseVault-Data/exports/<folder>), never on the PC.
// All data is synthetic (Doe / Roe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('exports on the SSD: saved in the folder picked, checked, listed and read back', async () => {
  globalThis.location = new URL('http://127.0.0.1:8517/');
  load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/operation.js', 'js/vault.js');
  const Vault = get('Vault');
  const ssd = new MemDirectoryHandle('V');
  await Vault.load(await Vault.create(ssd));
  assert.deepStrictEqual(await Vault.listExportFolders(), [], 'none yet');
  const blob = new Blob([new Uint8Array(3000).map((_, i) => i % 251)]);
  const a = await Vault.saveExport('EX-100', 'EX-100 Case Export.cvcase', blob);
  assert.deepStrictEqual([a.folder, a.name], ['EX-100', 'EX-100 Case Export.cvcase']);
  assert.match(a.path, /^CaseVault-Data\\exports\\EX-100\\EX-100 Case Export\.cvcase$/);
  const b = await Vault.saveExport('EX-100', 'EX-100 Case Export.cvcase', blob);
  assert.notStrictEqual(b.name, a.name, 'a second export never overwrites the first');
  await Vault.saveExport('To ASA Roe', 'EX-200 Case Export.cvcase', new Blob(['x']));
  const list = await Vault.listExportFolders();
  assert.deepStrictEqual(list.map((f) => [f.name, f.files.length]), [['EX-100', 2], ['To ASA Roe', 1]]);
  const back = await Vault.readExport('EX-100', a.name);
  assert.ok(Buffer.from(await back.arrayBuffer()).equals(Buffer.from(await blob.arrayBuffer())));
  await assert.rejects(Vault.saveExport('  ', 'x.cvcase', blob), /Pick a folder/);
  await assert.rejects(Vault.readExport('EX-100', 'missing.cvcase'), { name: 'NotFoundError' });
  // On "disk": inside CaseVault-Data, in exports/<folder>.
  const data = await ssd.getDirectoryHandle('CaseVault-Data');
  assert.ok((await (await data.getDirectoryHandle('exports')).getDirectoryHandle('EX-100')).children.has(a.name));
});

test('the export no longer goes to the PC\'s Downloads folder', () => {
  const ui = read('js/case-export-ui.js');
  assert.ok(!/download|createObjectURL/i.test(ui.replace(/\/\*[\s\S]*?\*\//g, '')), 'no browser download');
  assert.match(ui, /Vault\.saveExport\(/);
  assert.match(ui, /Vault\.listExportFolders\(/);
  assert.match(ui, /Vault\.readExport\(/);
});
