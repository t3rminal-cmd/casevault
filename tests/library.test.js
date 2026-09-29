// The Library the AI learns from and the writing behaviors (js/library.js), and the Library on
// the SSD (js/vault.js). Made-up content only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/library.js');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');

test('document type is guessed from a sample file name', () => {
  const cases = { 'DEA-6 surveillance 2019.pdf': 'dea6', 'dea6_buy.docx': 'dea6', 'Report of Investigation.pdf': 'dea6', 'DEA 7 exhibit 3.pdf': 'dea7',
    'DEA-202 subject.pdf': 'dea202', 'PC affidavit sample.docx': 'affidavit', 'search warrant.pdf': 'warrant', 'Directive 12.pdf': 'any', 'memo to GS.docx': 'memo' };
  for (const [name, want] of Object.entries(cases)) assert.strictEqual(L.guessDocType(name), want, name);
});

test('Draft with AI picks examples of the document type and the "always" directives', () => {
  const items = [
    { path: 'Report examples/a.pdf', category: 'examples', docType: 'dea6' },
    { path: 'Report examples/b.pdf', category: 'examples', docType: 'dea7' },
    { path: 'Report examples/c.pdf', category: 'examples', docType: 'any' },
    { path: 'Warrant examples/w.pdf', category: 'warrants', docType: 'warrant' },
    { path: 'Directives/d1.pdf', category: 'directives', always: true },
    { path: 'Directives/d2.pdf', category: 'directives', always: false },
  ];
  assert.deepStrictEqual(L.pickForDraft(items, 'dea6'), { examples: ['Report examples/a.pdf'], directives: ['Directives/d1.pdf'] });
  assert.deepStrictEqual(L.pickForDraft(items, 'memo').examples, ['Report examples/c.pdf'], 'no exact match: the any-type examples');
  assert.deepStrictEqual(L.pickForDraft(items, 'affidavit').examples, ['Report examples/w.pdf'.replace('Report examples', 'Warrant examples')], 'warrants help affidavits');
});

test('writing behaviors: DEA-6 by default, built-ins can be edited, custom ones added', () => {
  const b = L.behaviorsOf({});
  assert.deepStrictEqual(b.map((x) => x.id), ['dea6', 'narrative', 'legal', 'brief']);
  assert.strictEqual(L.defaultBehaviorId({}), 'dea6');
  assert.match(L.behaviorById({}, 'dea6').prompt, /DETAILS: numbered paragraphs in time order/);
  assert.match(L.behaviorById({}, 'dea6').prompt, /INDEXING/);
  const s = { aiBehaviors: [{ id: 'dea6', name: 'DEA-6 (ours)', prompt: 'Our way.' }, { id: 'custom-1', name: 'Mine', prompt: 'My way.' }], aiBehaviorDefault: 'custom-1' };
  const list = L.behaviorsOf(s);
  assert.deepStrictEqual(list.map((x) => [x.id, x.name, x.builtin]), [['dea6', 'DEA-6 (ours)', true], ['narrative', 'Plain narrative police report', true], ['legal', 'Affidavit / formal legal', true], ['brief', 'Brief summary', true], ['custom-1', 'Mine', false]]);
  assert.strictEqual(L.behaviorById(s, L.defaultBehaviorId(s)).prompt, 'My way.');
  assert.strictEqual(L.behaviorById(s, 'gone').id, 'dea6', 'an unknown id falls back');
});

test('the Library on the SSD: add, settings, text cache, move, delete', async () => {
  globalThis.location = new URL('http://127.0.0.1:8517/');
  load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/vault.js');
  const Vault = get('Vault');
  await Vault.load(await Vault.create(new MemDirectoryHandle('V')));
  assert.deepStrictEqual(await Vault.listLibrary(), []);
  const p = await Vault.saveLibraryFile('Report examples', 'DEA-6 sample.txt', new File(['DETAILS\n1. Made-up.'], 'DEA-6 sample.txt'));
  assert.strictEqual(p, 'Report examples/DEA-6 sample.txt');
  const p2 = await Vault.saveLibraryFile('Report examples', 'DEA-6 sample.txt', new File(['two'], 'x.txt'));
  assert.strictEqual(p2, 'Report examples/DEA-6 sample (2).txt', 'a taken name gets (2)');
  await Vault.writeLibraryMeta({ schema: 1, items: { [p]: { docType: 'dea6' } } });
  assert.deepStrictEqual((await Vault.readLibraryMeta()).items[p], { docType: 'dea6' });
  await Vault.writeLibraryText(p, 20, 1, 'cached text');
  assert.strictEqual(await Vault.readLibraryText(p, 20, 1), 'cached text');
  assert.strictEqual(await Vault.readLibraryText(p, 21, 1), null, 'a changed file is read again');
  const moved = await Vault.moveLibraryFile(p2, 'Directives');
  assert.strictEqual(moved, 'Directives/DEA-6 sample (2).txt');
  assert.deepStrictEqual((await Vault.listLibrary()).map((f) => f.path), ['Directives/DEA-6 sample (2).txt', 'Report examples/DEA-6 sample.txt'], '.cache is not listed');
  await Vault.deleteLibraryFile(moved);
  assert.strictEqual((await Vault.listLibrary()).length, 1);
  assert.strictEqual(await (await Vault.readLibraryFile(p)).text(), 'DETAILS\n1. Made-up.');
  await assert.rejects(() => Vault.readLibraryFile('../vault.json'), /Not a library path/);
});
