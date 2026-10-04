// v1.46 Operations and General Files: records in vault.json, cases linked by operationId, the
// one-time migration from shared Titles, duplicate checks. All data is made up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');
const Op = require('../js/operation.js');

/* ---------- plain logic ---------- */

test('Operation label, number and name checks', () => {
  assert.strictEqual(Op.opLabel({ number: 'OP-001', name: 'Example Sweep' }), 'OP-001 - Example Sweep');
  assert.strictEqual(Op.opLabel({ number: '', name: 'Example Sweep' }), 'Example Sweep');
  const ops = [{ id: 'a', number: 'op-001', name: 'One' }];
  assert.deepStrictEqual(Op.validateOperation({ number: '', name: '' }, ops), ['Mission Number is required.', 'Mission Name is required.']);
  assert.match(Op.validateOperation({ number: ' OP-001 ', name: 'Two' }, ops)[0], /already used/);
  assert.deepStrictEqual(Op.validateOperation({ number: 'OP-001', name: 'One renamed' }, ops, 'a'), [], 'its own number is fine');
  assert.match(Op.validateOperation({ number: 'OP-2', name: 'X', start: '2026-05-01', end: '2026-04-01' }, ops)[0], /End Date/);
  assert.strictEqual(Op.nextOpNumber([{ number: 'OP-001' }, { number: 'OP-003' }]), 'OP-002');
});

test('Case Number is unique (archived ones count); Subject Name is required', () => {
  const cases = [{ id: 'c1', number: 'JA-100', location: 'active' }, { id: 'c2', number: 'JA 200', location: 'archive' }];
  assert.deepStrictEqual(Op.validateCase({ number: 'JA-300', subject: 'John Doe' }, cases), []);
  assert.match(Op.validateCase({ number: 'ja-100', subject: 'John Doe' }, cases)[0], /already exists/);
  assert.match(Op.validateCase({ number: 'JA  200', subject: 'John Doe' }, cases)[0], /archived/);
  assert.deepStrictEqual(Op.validateCase({ number: 'JA-100', subject: 'x' }, cases, 'c1'), [], 'editing the case itself');
  assert.deepStrictEqual(Op.validateCase({ number: '', subject: '' }, cases), ['Case Number is required.', 'Subject Name is required.']);
  const dups = Op.duplicateNumbers([...cases, { id: 'c3', number: 'JA-100' }]);
  assert.deepStrictEqual([...dups.keys()], ['JA-100']);
});

test('same and similar subject names are found, never merged', () => {
  const cases = [{ id: 'a', subject: 'John Doe' }, { id: 'b', subject: 'Doe, John' }, { id: 'c', subject: 'Jon Doe' }, { id: 'd', subject: 'John A. Doe' }, { id: 'e', subject: 'Mary Roe' }, { id: 'f', subject: '' }];
  const m = Op.subjectMatches(cases, 'john doe', 'a');
  assert.deepStrictEqual(m.same.map((x) => x.id), ['b']);
  assert.deepStrictEqual(m.similar.map((x) => x.id), ['c', 'd']);
  assert.deepStrictEqual(Op.subjectMatches(cases, 'Pat Poe'), { same: [], similar: [] });
  assert.strictEqual(Op.nameMatch('Al', 'Al'), 'same');
  assert.strictEqual(Op.nameMatch('Al Roe', 'Ed Roe'), '', 'short names are not "similar" by one letter');
});

test('migration plan: a Title shared by 2+ cases becomes an Operation; others stay independent', () => {
  const cases = [
    { id: 'a', title: 'Example Sweep', number: '2', fileNumber: '500', status: 'Closed', dates: { opened: '2026-02-01', closed: '2026-03-01' }, suspects: [{ name: 'Jane Roe', role: 'Secondary' }, { name: 'John Doe', role: 'Primary' }] },
    { id: 'b', title: ' Example  Sweep ', number: '1', fileNumber: '', status: 'Open', dates: { opened: '2026-01-15' } },
    { id: 'c', title: 'Single Matter', number: '3', fileNumber: '900', status: 'Open', dates: { opened: '2026-01-01' } },
    { id: 'd', title: 'Other Group', number: '4', status: 'Closed', dates: { opened: '2026-04-01', closed: '2026-04-09' } },
    { id: 'e', title: 'Other Group', number: '5', status: 'Archived', dates: { opened: '2026-04-02', closed: '2026-04-20' } },
    { id: 'f', title: 'Done Already', number: '6', operationId: 'op-x' },
  ];
  const plan = Op.planMigration(cases, [{ number: 'OP-001' }]);
  assert.strictEqual(plan.operations.length, 2);
  const [sweep, other] = plan.operations;
  assert.deepStrictEqual({ ...sweep, caseIds: sweep.caseIds.sort() }, { key: 'example sweep', number: '500', name: 'Example Sweep', status: 'Open', start: '2026-01-15', end: '', caseIds: ['a', 'b'] });
  assert.strictEqual(other.number, 'OP-002', 'no file number: the next free OP number');
  assert.strictEqual(other.status, 'Closed');
  assert.strictEqual(other.end, '2026-04-20');
  assert.strictEqual(plan.subjects.a, 'John Doe', 'the Primary suspect first');
  assert.strictEqual(plan.subjects.b, '', 'no suspect: blank');
});

/* ---------- with the vault ---------- */

let App;
function app() {
  if (!App) {
    globalThis.location = new URL('http://127.0.0.1:8517/');
    load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/operation.js', 'js/vault.js');
    App = { Vault: get('Vault'), FS: get('FS') };
  }
  return App;
}
async function freshVault() {
  const { Vault } = app();
  const dir = await Vault.create(new MemDirectoryHandle('V'));
  await Vault.load(dir);
  return { Vault, dir };
}
const readCase = async (FS, dir, id, folder = 'cases') => FS.readJSON(await FS.getDir(await FS.getDir(dir, folder), id), 'case.json');

test('a new vault has no Operations; cases are made in General Files or inside one', async () => {
  const { Vault } = await freshVault();
  assert.deepStrictEqual(Vault.listOperations(), []);
  assert.strictEqual(Vault.data.operationsVersion, 1);
  const op = await Vault.createOperation({ number: 'OP-100', name: 'Example Sweep', status: 'Open', start: '2026-01-02' });
  await assert.rejects(Vault.createOperation({ number: 'op-100', name: 'Again' }), { name: 'ValidationError' });
  await assert.rejects(Vault.createOperation({ number: '', name: 'No number' }), /Mission Number is required/);
  const a = await Vault.createCase({ number: 'EX-1', subject: 'John Doe', operationId: op.id, opened: '2026-01-02' });
  const b = await Vault.createCase({ number: 'EX-2', subject: 'Mary Roe' });
  assert.strictEqual(a.title, 'Example Sweep', 'the title is the Operation name');
  assert.deepStrictEqual(a.operation, { number: 'OP-100', name: 'Example Sweep' });
  assert.strictEqual(b.title, 'Mary Roe', 'an independent case is titled by its subject');
  assert.strictEqual(b.operationId, '');
  await assert.rejects(Vault.createCase({ number: 'ex-1', subject: 'Someone' }), /already exists/);
  assert.deepStrictEqual(Vault.operationMembers(op.id).map((c) => c.id), [a.id]);
  assert.strictEqual(Vault.operationOf(a.id).id, op.id);
  assert.strictEqual(Vault.operationOf(b.id), null);
  assert.ok(Vault.caseNumberTaken('EX-2'));
  assert.ok(!Vault.caseNumberTaken('EX-2', b.id));
});

test('assign, block a second Operation, unlink keeps the case and its files, rename once', async () => {
  const { Vault, dir } = await (async () => { const v = await freshVault(); return v; })();
  const { FS } = app();
  const one = await Vault.createOperation({ number: 'OP-1', name: 'First' });
  const two = await Vault.createOperation({ number: 'OP-2', name: 'Second' });
  const c = await Vault.createCase({ number: 'EX-10', subject: 'Pat Poe' });
  await Vault.addFile(c.id, new File(['synthetic'], 'note.txt'));
  await Vault.assignCase(c.id, one.id);
  await assert.rejects(Vault.assignCase(c.id, one.id), /already in this Mission/);
  await assert.rejects(Vault.assignCase(c.id, two.id), /already assigned to OP-1 - First/);
  assert.strictEqual((await readCase(FS, dir, c.id)).operationId, one.id);

  await Vault.updateOperation(one.id, { name: 'First Renamed', number: 'OP-1A' });
  const renamed = await readCase(FS, dir, c.id);
  assert.strictEqual(renamed.title, 'First Renamed');
  assert.deepStrictEqual(renamed.operation, { number: 'OP-1A', name: 'First Renamed' });
  await assert.rejects(Vault.updateOperation(two.id, { number: 'op-1a' }), /already used/);

  await Vault.unlinkCase(c.id);
  const after = await readCase(FS, dir, c.id);
  assert.strictEqual(after.operationId, '');
  assert.strictEqual(after.title, 'Pat Poe');
  assert.strictEqual((await Vault.listFiles(c.id)).length, 1, 'the files stay');
  await Vault.assignCase(c.id, two.id);
  assert.strictEqual(Vault.operationOf(c.id).id, two.id);
});

test('deleting an Operation keeps every case (archived too) as an independent case', async () => {
  const { Vault, dir } = await freshVault();
  const { FS } = app();
  const op = await Vault.createOperation({ number: 'OP-9', name: 'To Delete' });
  const a = await Vault.createCase({ number: 'EX-21', subject: 'John Doe', operationId: op.id });
  const b = await Vault.createCase({ number: 'EX-22', subject: '', operationId: op.id });
  await Vault.saveNotes(a.id, 'Synthetic note.');
  await Vault.archiveCase(b.id);
  await Vault.updateSettings({ foldedOps: [op.id] });
  assert.strictEqual(await Vault.deleteOperation(op.id), 2);
  assert.deepStrictEqual(Vault.listOperations(), []);
  assert.deepStrictEqual(Vault.data.settings.foldedOps, []);
  assert.strictEqual(Vault.data.cases.length, 2, 'no case removed');
  const ca = await readCase(FS, dir, a.id);
  const cb = await readCase(FS, dir, b.id, 'archive');
  assert.strictEqual(ca.operationId, '');
  assert.strictEqual(ca.title, 'John Doe');
  assert.strictEqual(cb.operationId, '');
  assert.strictEqual(cb.title, 'To Delete', 'no subject: it keeps the title it had');
  assert.strictEqual(await Vault.getNotes(a.id), 'Synthetic note.');
  const restored = await Vault.restoreCase(b.id);
  assert.strictEqual(restored.operationId, '');
});

test('a case restored after its Operation was deleted (link left behind) comes back independent', async () => {
  const { Vault } = await freshVault();
  const op = await Vault.createOperation({ number: 'OP-5', name: 'Gone' });
  const c = await Vault.createCase({ number: 'EX-31', subject: 'Jane Roe', operationId: op.id });
  await Vault.archiveCase(c.id);
  Vault.data.operations = []; // as if deleted by an older copy of the app
  const r = await Vault.restoreCase(c.id);
  assert.strictEqual(r.operationId, '');
  assert.strictEqual(r.title, 'Jane Roe');
});

test('one-time migration: vault.json is backed up, shared Titles become Operations, subjects filled', async () => {
  const { Vault, dir } = await freshVault();
  const { FS } = app();
  // Cases as v1.45 made them: no subject, no operationId; two share a Title. The Operation is
  // named as the first-opened case spells it.
  const a = await Vault.createCase({ title: 'x', number: 'EX-41', opened: '2026-02-01' });
  const b = await Vault.createCase({ title: 'x', number: 'EX-42', opened: '2026-01-01' });
  const c = await Vault.createCase({ title: 'x', number: 'EX-43' });
  const d = await Vault.createCase({ title: 'x', number: 'EX-41B' });
  const old = async (id, patch, folder = 'cases') => {
    const h = await FS.getDir(await FS.getDir(dir, folder), id);
    const j = await FS.readJSON(h, 'case.json');
    delete j.subject; delete j.operationId; delete j.operation;
    await FS.writeJSON(h, 'case.json', { ...j, ...patch });
  };
  await old(a.id, { title: 'Example Sweep', fileNumber: 'F-77', suspects: [{ name: 'John Doe', role: 'Primary' }] });
  await old(b.id, { title: 'example sweep ', status: 'Pending' });
  await old(a.id, { title: 'Example Sweep', fileNumber: 'F-77', status: 'Closed', suspects: [{ name: 'John Doe', role: 'Primary' }] });
  await old(c.id, { title: 'Lone Case' });
  await Vault.archiveCase(d.id);
  await old(d.id, { title: 'Lone Case', status: 'Archived' }, 'archive');
  const v = await FS.readJSON(dir, 'vault.json');
  delete v.operations; delete v.operationsVersion;
  v.settings.foldedOps = ['example sweep'];
  await FS.writeJSON(dir, 'vault.json', v);
  const backupsBefore = (await Vault.listBackups()).length;

  await Vault.load(dir);
  assert.ok((await Vault.listBackups()).length > backupsBefore, 'vault.json backed up first');
  assert.strictEqual(Vault.data.operationsVersion, 1);
  const ops = Vault.listOperations().sort((x, y) => x.name.localeCompare(y.name));
  assert.deepStrictEqual(ops.map((o) => [o.number, o.name, o.status]), [['F-77', 'example sweep', 'Pending'], ['OP-001', 'Lone Case', 'Open']]);
  const sweep = ops[0];
  assert.deepStrictEqual(Vault.data.settings.foldedOps, [sweep.id]);
  const ca = await readCase(FS, dir, a.id);
  assert.strictEqual(ca.operationId, sweep.id);
  assert.strictEqual(ca.subject, 'John Doe');
  assert.strictEqual((await readCase(FS, dir, b.id)).subject, '');
  assert.strictEqual((await readCase(FS, dir, d.id, 'archive')).operationId, ops[1].id, 'archived cases join too');
  assert.strictEqual(Vault.data.cases.find((x) => x.id === a.id).operationId, sweep.id, 'the index knows');

  // Opening again changes nothing.
  const snapshot = JSON.stringify(Vault.listOperations());
  await Vault.load(dir);
  assert.strictEqual(JSON.stringify(Vault.listOperations()), snapshot);
});

test('an older vault.json without the Operation: it is rebuilt from what the cases keep', async () => {
  const { Vault, dir } = await freshVault();
  const { FS } = app();
  const op = await Vault.createOperation({ number: 'OP-77', name: 'Kept In Cases' });
  const c = await Vault.createCase({ number: 'EX-51', subject: 'Pat Poe', operationId: op.id, opened: '2026-03-03' });
  const v = await FS.readJSON(dir, 'vault.json');
  v.operations = [];
  await FS.writeJSON(dir, 'vault.json', v);
  await Vault.load(dir);
  const back = Vault.getOperation(op.id);
  assert.ok(back, 'same id');
  assert.strictEqual(back.number, 'OP-77');
  assert.strictEqual(back.name, 'Kept In Cases');
  assert.strictEqual(Vault.operationOf(c.id).id, op.id);
});

test('a large Operation: 150 cases link, rename and unlink on delete', async () => {
  const { Vault } = await freshVault();
  const op = await Vault.createOperation({ number: 'OP-BIG', name: 'Big' });
  for (let i = 1; i <= 150; i++) await Vault.createCase({ number: `BIG-${i}`, subject: `Subject ${i}`, operationId: op.id });
  assert.strictEqual(Vault.operationMembers(op.id).length, 150);
  await Vault.updateOperation(op.id, { name: 'Bigger' });
  assert.ok(Vault.data.cases.every((c) => c.title === 'Bigger'));
  assert.strictEqual(await Vault.deleteOperation(op.id), 150);
  assert.ok(Vault.data.cases.every((c) => !c.operationId && c.title.startsWith('Subject ')));
});

test('templates: {{case.subject}}, {{operation.number}}, {{operation.name}}', () => {
  const D = require('../js/drafts/draft-core.js');
  const linked = D.templateContext({ title: 'Example Sweep', number: 'EX-1', subject: 'John Doe', operation: { number: 'OP-001', name: 'Example Sweep' } });
  assert.deepStrictEqual([linked['case.title'], linked['case.subject'], linked['operation.number'], linked['operation.name']], ['Example Sweep', 'John Doe', 'OP-001', 'Example Sweep']);
  const loose = D.templateContext({ title: 'Mary Roe', number: 'EX-2', subject: 'Mary Roe', operation: null });
  assert.deepStrictEqual([loose['operation.number'], loose['operation.name']], ['', '']);
  assert.ok(D.placeholderGroups().some((g) => g.title === 'Mission' && g.keys.includes('operation.name')));
});
