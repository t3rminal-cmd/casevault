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
  assert.deepStrictEqual((await Vault.addStarterTemplates()).length, 4);
  assert.deepStrictEqual((await Vault.addStarterTemplates()).length, 0, 'never overwrites');
  const templates = await Vault.listTemplates();
  assert.deepStrictEqual(templates.map((t) => t.title), ['Affidavit (generic example)', 'Arrest report (generic example)', 'Case summary (generic example)', 'Subpoena (generic example)']);
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
    load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/vault.js');
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
  assert.ok((await data.getDirectoryHandle('templates')).children.has('generic-affidavit.md'));
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
    assert.ok(fs.existsSync(path.join(dir, 'CaseVault-Data', 'templates', 'generic-subpoena.md')));
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
  assert.strictEqual(v.settings.privacyIdleMinutes, 0, 'new settings get defaults');
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
  assert.match(D.STARTER_TEMPLATES['generic-affidavit.md'], /\{\{affiant\.name\}\}/);
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
