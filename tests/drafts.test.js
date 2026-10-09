// Tests for Drafts: storage round-trip in both storage modes, templates, placeholders, .docx export.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');
const mockHelper = require('./helpers/mock-helper.js');

const D = require('../js/drafts/draft-core.js');
const X = require('../js/drafts/docx.js');

/* ---------------- storage round-trip ---------------- */

async function roundTrip(Vault, rootHandle) {
  await Vault.load(await Vault.create(rootHandle));
  const c = await Vault.createCase({ title: 'State v. Lee', number: 'CR-2026-0142', client: 'County DA' });
  assert.deepStrictEqual(await Vault.listDrafts(c.id), [], 'no drafts yet');

  const slug = await Vault.newDraftSlug(c.id, 'Affidavit — search warrant');
  assert.strictEqual(slug, 'affidavit-search-warrant');
  const body = '# AFFIDAVIT\n\nI, [CONFIRM: affiant name], state:\n\n1. On March 14, 2026 at 21:40 Officer Díaz responded -- see report.\n';
  const meta = await Vault.saveDraft(c.id, slug, { title: 'Affidavit -- search warrant', type: 'affidavit', ai: true }, body);
  assert.ok(meta.created && meta.updated);

  const back = await Vault.readDraft(c.id, slug);
  assert.strictEqual(back.body, body, 'body survives exactly (unicode, "--", markdown)');
  assert.deepStrictEqual([back.meta.title, back.meta.type, back.meta.ai], ['Affidavit -- search warrant', 'affidavit', true]);

  assert.strictEqual(await Vault.newDraftSlug(c.id, 'Affidavit - Search warrant'), 'affidavit-search-warrant-2', 'slugs never collide');
  const list = await Vault.listDrafts(c.id);
  assert.deepStrictEqual(list.map((d) => [d.slug, d.title, d.ai]), [[slug, 'Affidavit -- search warrant', true]]);

  // Templates
  // v1.28: the retired generic templates go from the SSD unless they were changed.
  await Vault.saveTemplate('generic-affidavit.md', '# Affidavit\n\n> **Generic example, not a legal form.** x\n');
  await Vault.saveTemplate('generic-subpoena.md', '# Subpoena\n\nMy own wording, kept.\n');
  assert.deepStrictEqual((await Vault.addStarterTemplates()).length, 0, 'v1.48: no built-in templates');
  const templates = await Vault.listTemplates();
  assert.deepStrictEqual(templates.map((t) => t.title), ['Subpoena']);
  await Vault.saveTemplate('agency-affidavit.md', '# Agency affidavit\n\nCase {{case.number}}');
  assert.strictEqual(await Vault.readTemplate('agency-affidavit.md'), '# Agency affidavit\n\nCase {{case.number}}');

  await Vault.deleteDraft(c.id, slug);
  assert.deepStrictEqual(await Vault.listDrafts(c.id), []);
  return c;
}

let AppVault;
function app() {
  if (!AppVault) {
    globalThis.location = new URL('http://127.0.0.1:8517/'); // helper-fs.js reads this at load time
    load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/operation.js', 'js/vault.js');
    AppVault = { Vault: get('Vault'), HelperFS: get('HelperFS') };
  }
  return AppVault;
}

test('drafts round-trip: direct mode (Chrome/Edge File System Access handles)', async () => {
  const { Vault } = app();
  const ssd = new MemDirectoryHandle('V');
  const c = await roundTrip(Vault, ssd);
  // On "disk": a plain Markdown file whose first line holds the details.
  const data = await ssd.getDirectoryHandle('CaseVault-Data');
  const draftsDir = await (await (await data.getDirectoryHandle('cases')).getDirectoryHandle(c.id)).getDirectoryHandle('drafts');
  assert.deepStrictEqual([...draftsDir.children.keys()], []);
  assert.ok(!(await data.getDirectoryHandle('templates')).children.has('generic-supplemental-report.md'), 'v1.48: no built-in template');
  Vault.close();
});

test('drafts round-trip: helper mode (Firefox, through the helper HTTP API)', async (t) => {
  const { Vault, HelperFS } = app();
  let server = null;
  let base = process.env.CASEVAULT_HELPER_URL; // set this to test against the real PowerShell helper
  let dir = null;
  if (!base) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-helper-'));
    fs.mkdirSync(path.join(dir, 'CaseVault-Data'));
    server = await mockHelper.start(path.join(dir, 'CaseVault-Data'));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  t.after(() => { if (server) server.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
  globalThis.location = new URL(base);
  const info = await HelperFS.info();
  assert.ok(info.ready);
  const c = await roundTrip(Vault, HelperFS.root(info.root));
  if (dir) {
    // Same files and format as direct mode.
    const draftsDir = path.join(dir, 'CaseVault-Data', 'cases', c.id, 'drafts');
    assert.deepStrictEqual(fs.readdirSync(draftsDir), []);
    assert.ok(!fs.existsSync(path.join(dir, 'CaseVault-Data', 'templates', 'generic-supplemental-report.md')));
  }
  Vault.close();
});

test('old vaults (before drafts) still open and gain drafts only on first use', async () => {
  const { Vault } = app();
  const ssd = new MemDirectoryHandle('V');
  const data = await ssd.getDirectoryHandle('CaseVault-Data', { create: true });
  await data.getDirectoryHandle('cases', { create: true });
  const w = await (await data.getFileHandle('vault.json', { create: true })).createWritable();
  await w.write(JSON.stringify({ app: 'CaseVault', appVersion: '1.0.0', schema: 1, vaultId: 'old', settings: { backupsToKeep: 30, aiProfile: 'rules-only' }, cases: [] }));
  await w.close();
  const v = await Vault.load(data);
  assert.strictEqual(v.settings.privacyIdleMinutes, 15, 'new settings get defaults');
  assert.strictEqual(v.settings.privacyPin, null);
  assert.ok(!data.children.has('templates'), 'nothing is added until used');
  Vault.close();
});

/* ---------------- format, placeholders, templates ---------------- */

test('draft file format: details in a first-line comment, body untouched', () => {
  const text = D.serializeDraft({ title: 'A --> tricky title', type: 'memo', ai: false }, '# Memo\n\nBody');
  assert.ok(text.startsWith('<!-- casevault-draft {'));
  assert.ok(!text.split('\n')[0].slice(4, -3).includes('--'), 'no "--" inside the comment');
  const back = D.parseDraft(text);
  assert.deepStrictEqual(back.meta, { title: 'A --> tricky title', type: 'memo', ai: false });
  assert.strictEqual(back.body, '# Memo\n\nBody');
  assert.deepStrictEqual(D.parseDraft('# Just markdown'), { meta: {}, body: '# Just markdown' }, 'plain .md files work too');
  assert.strictEqual(D.slugify('Résumé: Lee / Díaz #2'), 'resume-lee-diaz-2');
  assert.strictEqual(D.slugify('***'), 'draft');
});

test('placeholder extraction lists every [CONFIRM: ...] with its line', () => {
  const ph = D.extractPlaceholders('I, [CONFIRM: affiant name], badge [CONFIRM:badge number],\nof [CONFIRM: agency].\n[CONFIRM: ]\n[CONFIRM without colon]');
  assert.deepStrictEqual(ph.map((p) => [p.label, p.line]), [['affiant name', 1], ['badge number', 1], ['agency', 2], ['(unspecified)', 3]]);
  assert.strictEqual(ph[0].text, '[CONFIRM: affiant name]');
});

test('templates: {{placeholders}} filled from the case; missing ones become [CONFIRM: ...]', () => {
  const ctx = D.templateContext({ title: 'State v. Lee', number: 'CR-2026-0142', client: '', tags: ['burglary'], dates: { opened: '2026-03-15' } }, new Date(2026, 8, 28));
  const out = D.fillTemplate('Case {{case.number}} ({{ case.title }}), client {{case.client}}, tags {{case.tags}}, opened {{case.opened}}, on {{today}} / {{today.iso}}. Badge {{confirm: badge number}}. {{unknown.thing}}', ctx);
  assert.strictEqual(out, 'Case CR-2026-0142 (State v. Lee), client [CONFIRM: case.client], tags burglary, opened 2026-03-15, on September 28, 2026 / 2026-09-28. Badge [CONFIRM: badge number]. [CONFIRM: unknown.thing]');
  for (const [file, tpl] of Object.entries(D.STARTER_TEMPLATES)) {
    assert.match(tpl, /Generic example, not a legal form/, `${file} is marked as a generic example`);
    assert.ok(D.extractPlaceholders(D.fillTemplate(tpl, ctx)).length > 0);
  }
});

test('templates: {{affiant.*}} comes from "My details"; empty values become [CONFIRM: ...]', () => {
  const affiant = { name: 'Officer Alex Sample', title: 'Detective', agency: 'Example County Test Unit', address: '100 Example Street\r\nSuite 0\n', phone: '', email: 'alex.sample@example.invalid' };
  const ctx = D.templateContext({ number: 'TEST-0001' }, new Date(2026, 8, 28), affiant);
  const out = D.fillTemplate('{{affiant.name}}, {{affiant.title}} of {{affiant.agency}}\n{{affiant.address}}\nTel {{affiant.phone}} · {{affiant.email}}', ctx);
  assert.strictEqual(out, 'Officer Alex Sample, Detective of Example County Test Unit\n100 Example Street\nSuite 0\nTel [CONFIRM: affiant.phone] · alex.sample@example.invalid');
  // No profile at all: every field asks to be confirmed.
  const none = D.fillTemplate('{{affiant.name}} {{affiant.email}}', D.templateContext({}, new Date()));
  assert.strictEqual(none, '[CONFIRM: affiant.name] [CONFIRM: affiant.email]');
  assert.deepStrictEqual(D.AFFIANT_FIELDS, ['name', 'title', 'agency', 'address', 'phone', 'email']);
  assert.deepStrictEqual(Object.keys(D.STARTER_TEMPLATES), [], 'v1.48: no built-in templates');
  assert.ok(D.RETIRED_TEMPLATES.includes('generic-supplemental-report.md'));
});

test('stripMarkdown gives clean plain text', () => {
  const md = D.serializeDraft({ title: 'x' }, '# Title\n\nSome **bold** and *italic* and `code`.\n\n- item one\n1. first\n> quote');
  assert.strictEqual(D.stripMarkdown(md), 'Title\n\nSome bold and italic and code.\n\n• item one\n1. first\nquote');
});

/* ---------------- .docx export ---------------- */

function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.byteLength - 22;
  assert.strictEqual(dv.getUint32(eocd, true), 0x06054b50, 'end-of-central-directory record');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.strictEqual(dv.getUint32(p, true), 0x02014b50);
    const size = dv.getUint32(p + 20, true);
    const crc = dv.getUint32(p + 16, true);
    const nameLen = dv.getUint16(p + 28, true);
    const off = dv.getUint32(p + 42, true);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nameLen)).toString('utf8');
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const data = buf.subarray(start, start + size);
    assert.strictEqual(X.crc32(data), crc, `CRC of ${name}`);
    files[name] = Buffer.from(data).toString('utf8');
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return files;
}

test('.docx export: a valid zip with word/document.xml, headings, runs and lists', () => {
  const md = '# Affidavit\n\nI, [CONFIRM: affiant name], **state** that *on* March 14 <at> "night" & more.\nSecond line.\n\n- first bullet\n- second\n\n1. one\n2. two\n\n1. restart\n';
  const bytes = X.buildDocx(md, { title: 'Affidavit & draft', date: new Date(2026, 8, 28, 10, 0, 0) });
  assert.ok(bytes instanceof Uint8Array);
  const files = readZip(bytes);
  assert.deepStrictEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/numbering.xml', 'word/styles.xml']);
  const doc = files['word/document.xml'];
  assert.match(doc, /<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Affidavit<\/w:t>/);
  assert.match(doc, /<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">state<\/w:t>/);
  assert.match(doc, /<w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">on<\/w:t>/);
  assert.match(doc, /<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">\[CONFIRM: affiant name\]/);
  assert.match(doc, /March 14 &lt;at&gt; &quot;night&quot; &amp; more\./, 'text is XML-escaped');
  assert.match(doc, /<w:br\/>/, 'single line breaks are kept');
  assert.strictEqual((doc.match(/<w:numId w:val="1"\/>/g) || []).length, 2, 'bullet list');
  assert.strictEqual((doc.match(/<w:numId w:val="2"\/>/g) || []).length, 2, 'first numbered list');
  assert.strictEqual((doc.match(/<w:numId w:val="3"\/>/g) || []).length, 1, 'a new numbered list restarts at 1');
  assert.match(files['docProps/core.xml'], /<dc:title>Affidavit &amp; draft<\/dc:title>/);

  // Cross-check with an independent zip + XML reader when Python is available (it is on CI runners).
  let python = null;
  for (const cmd of ['python3', 'python']) { try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); python = cmd; break; } catch { /* next */ } }
  if (python) {
    const tmp = path.join(os.tmpdir(), `cv-${process.pid}.docx`);
    fs.writeFileSync(tmp, bytes);
    try {
      const out = execFileSync(python, ['-c', [
        'import sys, zipfile, xml.dom.minidom',
        'z = zipfile.ZipFile(sys.argv[1])',
        'assert z.testzip() is None',
        '[xml.dom.minidom.parseString(z.read(n)) for n in z.namelist()]',
        'print("ok", len(z.namelist()))',
      ].join('\n'), tmp]).toString().trim();
      assert.strictEqual(out, 'ok 7');
    } finally { fs.rmSync(tmp, { force: true }); }
  }
});

test('every listed placeholder has a value source', () => {
  const C = require('../js/closing.js');
  const keys = [...C.ARRESTEE_FIELDS, ...C.ARREST_FIELDS].map((f) => f.key);
  const groups = D.placeholderGroups(keys);
  const ctx = D.templateContext({}, new Date(2026, 8, 29), null, { ...C.arrestContext(C.emptyArrest()), ...C.closureContext(null) });
  for (const k of groups.flatMap((g) => g.keys)) {
    if (k.startsWith('confirm:')) continue;
    assert.ok(Object.prototype.hasOwnProperty.call(ctx, k), k);
  }
  assert.strictEqual(new Set(groups.flatMap((g) => g.keys)).size, groups.flatMap((g) => g.keys).length);
});

test('contacts on the Details tab fill {{case.officer.*}} and {{case.prosecutor.*}}', () => {
  const c = { number: 'TEST-0002', contacts: { officer: { name: 'Det. Alex Sample', email: 'alex.sample@agency.example', phone: '555-0100' }, prosecutor: { title: 'AUSA', name: 'Jordan Example', email: 'jordan@usao.example', phone: '555-0199' }, others: [{ role: 'Finance', name: 'Pat Placeholder' }] } };
  const out = D.fillTemplate('{{case.officer.name}} {{case.officer.phone}} / {{case.prosecutor.title}} {{case.prosecutor.name}} {{case.prosecutor.email}}', D.templateContext(c, new Date(2026, 8, 29)));
  assert.strictEqual(out, 'Det. Alex Sample 555-0100 / AUSA Jordan Example jordan@usao.example');
  assert.ok(D.placeholderGroups().some((g) => g.title === 'Contacts' && g.keys.includes('case.prosecutor.email')));
  assert.match(D.fillTemplate('{{case.officer.email}}', D.templateContext({}, new Date())), /CONFIRM/, 'empty contact asks you to confirm');
});

test('suspects fill {{suspect.*}} with the main suspect, {{suspects}} lists them; age from DOB', () => {
  const now = new Date(2026, 8, 29);
  assert.strictEqual(D.ageOn('1990-09-30', now), 35);
  assert.strictEqual(D.ageOn('1990-09-29', now), 36);
  assert.strictEqual(D.ageOn('', now), null);
  const c = { agencyNumber: 'AG-26-0077', suspects: [{ name: 'Sam Example', dob: '1995-01-15', residence: '100 Test Lane, Anytown', role: 'Secondary' }, { name: 'Pat Placeholder', dob: '1988-12-01', residence: '', role: 'Main' }, { name: '', role: 'Other' }] };
  const ctx = D.templateContext(c, now);
  assert.strictEqual(D.fillTemplate('{{suspect.name}} ({{suspect.role}}), DOB {{suspect.dob}}, age {{suspect.age}}. Agency no. {{case.agencyNumber}}', ctx), 'Pat Placeholder (Primary), DOB December 1, 1988, age 37. Agency no. AG-26-0077');
  assert.strictEqual(ctx.suspects, 'Sam Example, DOB January 15, 1995, age 31, 100 Test Lane, Anytown (Secondary)\nPat Placeholder, DOB December 1, 1988, age 37 (Primary)');
  assert.ok(D.placeholderGroups().some((g) => g.title === 'Suspects'));
});

test('template titles drop the old "(generic example)" suffix', () => {
  assert.strictEqual(D.templateTitle('# Affidavit (generic example)\n\ntext', 'generic-affidavit.md'), 'Affidavit');
  assert.strictEqual(D.templateTitle('# My warrant\n', 'x.md'), 'My warrant');
  assert.strictEqual(D.DOC_TYPES.dea202.label, 'DEA 202');
});

test('v1.28: deleting a case tidies its backups and chats; Emergency Purge empties CaseVault-Data', async () => {
  const { Vault } = app();
  const ssd = new MemDirectoryHandle('V');
  await Vault.load(await Vault.create(ssd));
  const a = await Vault.createCase({ title: 'Operation Example', number: 'TEST-0001' });
  const b = await Vault.createCase({ title: 'Other Example', number: 'TEST-0002' });
  await Vault.backupNow();
  await Vault.saveChat({ id: 'chat-0001', title: 'About A', caseId: a.id, turns: [] });
  await Vault.saveChat({ id: 'chat-0002', title: 'About B', caseId: b.id, turns: [] });
  await Vault.deleteCase(a.id);
  await Vault.purgeDeleted(a.id); // v1.106: Delete Now (or 30 days later) is when the traces go
  const data = await ssd.getDirectoryHandle('CaseVault-Data');
  const backups = await data.getDirectoryHandle('backups');
  for (const [name] of backups.children) {
    const v = JSON.parse(await (await (await backups.getFileHandle(name)).getFile()).text());
    assert.ok(!v.cases.some((c) => c.id === a.id), `${name} no longer lists the deleted case`);
    if (/-\d{6}\.json$/.test(name)) assert.ok(v.cases.some((c) => c.id === b.id), `${name} keeps the other case`);
  }
  assert.deepStrictEqual((await Vault.listChats()).map((c) => c.title), ['About B'], 'chats about the deleted case go too');
  const r = await Vault.purgeAll();
  assert.deepStrictEqual(r.failed, []);
  assert.deepStrictEqual([...data.children.keys()], [], 'CaseVault-Data is empty');
  assert.strictEqual(Vault.data, null);
});

test('orderReports: arranged order kept, new reports first (v1.40)', () => {
  const list = [{ slug: 'new' }, { slug: 'b' }, { slug: 'a' }, { slug: 'c' }];
  assert.deepStrictEqual(D.orderReports(list, ['a', 'gone', 'c', 'b']).map((d) => d.slug), ['new', 'a', 'c', 'b']);
  assert.deepStrictEqual(D.orderReports(list, null).map((d) => d.slug), ['new', 'b', 'a', 'c']);
});

test('v1.48: once, every template but the DEA 6 sample moves to templates/removed-v1.48 (nothing deleted)', async () => {
  const { Vault, FS } = { ...app(), FS: get('FS') };
  const { MemDirectoryHandle } = require('./helpers/mem-fs.js');
  const dir = await Vault.create(new MemDirectoryHandle('T'));
  await Vault.load(dir);
  Vault.data.settings.templatesTrimmed = false; // as a vault from before v1.48
  await Vault.saveTemplate('dea6-sample.md', '# DEA 6 Sample\n\nSynthetic text.');
  await Vault.saveTemplate('my-affidavit.md', '# My Affidavit\n\nSynthetic text.');
  await Vault.saveTemplate('memo.md', '# Memo\n\nSynthetic text.');
  assert.deepStrictEqual((await Vault.listTemplates()).map((t) => t.title), ['DEA 6 Sample']);
  const kept = await FS.getDir(await FS.getDir(dir, 'templates'), 'removed-v1.48');
  assert.deepStrictEqual((await FS.list(kept)).map((e) => e.name).sort(), ['memo.md', 'my-affidavit.md']);
  // Only once: a template added later stays.
  await Vault.saveTemplate('later.md', '# Later\n\nSynthetic text.');
  assert.deepStrictEqual((await Vault.listTemplates()).map((t) => t.title), ['DEA 6 Sample', 'Later']);
  assert.strictEqual(D.DOC_TYPES.dea6.label, 'DEA Style');
  assert.strictEqual(D.docTypeOf('dea6-sample.md DEA 6 Sample'), 'dea6');
});
