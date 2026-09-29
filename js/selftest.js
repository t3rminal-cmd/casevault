/* CaseVault — self-test (Vault → Maintenance → Run self-test).
 *
 * Checks, in about a minute, that CaseVault works on this PC: the SSD can be written, every
 * document reader works, the checker and the privacy protection behave as they should, and the AI
 * engine answers. It uses its own tiny made-up documents, built in memory, never your cases, and
 * writes nothing to the SSD except one small test file that it deletes again.
 *
 * The documents and the expected results (buildPdf, MINI_CASE, EXPECT) are plain data and code, so
 * the unit tests check them under Node as well.
 */
'use strict';

(function (root) {
  /* ---------------- tiny made-up documents ---------------- */

  // The same planted errors as the test kit: time, plate, count, amount and a swapped-letter name.
  const MINI_CASE = {
    affidavit: 'On 03/14/2026 at approximately 21:45 hours, Officer Alex Sampel responded to 1420 Example Ave. Officer Sample saw license plate TST-1248. The witness heard three shots. Officers recovered $2,450 in US currency.',
    report: 'On 03/14/2026 at 2140 hours, Officer Alex Sample responded to 1420 Example Avenue. Officer Sample saw license plate TST-1284. The witness heard two shots. Officers recovered $2,540 in US currency.',
  };
  const EXPECT = ['time', 'plate', 'count', 'money', 'name'];
  const PII_TEXT = 'Please run Jordan Placeholder, DOB 04/02/1990, SSN 123-45-6789. Vehicle TST-1284 at 1420 Example Avenue. Call 555-0142 or casey.example@agency.example.';
  const PII_SECRETS = ['04/02/1990', '123-45-6789', 'TST-1284', '1420 Example', '555-0142', 'casey.example@'];

  /**
   * A minimal valid PDF, uncompressed. text: one line on the page. xfa: { template, datasets } adds
   * an XFA form (AcroForm /XFA), as LiveCycle forms have.
   */
  function buildPdf({ text = '', xfa = null } = {}) {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const stream = (data) => `<< /Length ${data.length} >>\nstream\n${data}\nendstream`;
    const esc = (s) => s.replace(/[\\()]/g, '\\$&');
    add(null); // catalog, below
    add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
    add(stream(`BT /F1 12 Tf 72 720 Td (${esc(text)}) Tj ET`));
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    let acro = '';
    if (xfa) {
      const t = add(stream(xfa.template));
      const d = add(stream(xfa.datasets));
      const a = add(`<< /Fields [] /DR << /Font << /Helv 5 0 R >> >> /XFA [(template) ${t} 0 R (datasets) ${d} 0 R] >>`);
      acro = ` /AcroForm ${a} 0 R /NeedsRendering true`;
    }
    objs[0] = `<< /Type /Catalog /Pages 2 0 R${acro} >>`;
    let out = '%PDF-1.7\n';
    const offsets = [];
    objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(out); // ASCII only, so string offsets are byte offsets
  }

  const XFA = {
    template: '<template><subform name="form1"><field name="CaseNo"><caption><value><text>Case number</text></value></caption></field><field name="Officer"><caption><value><text>Reporting officer</text></value></caption></field></subform></template>',
    datasets: '<xfa:datasets><xfa:data><form1><CaseNo>2026-00123</CaseNo><Officer>Officer Alex Sample</Officer></form1></xfa:data></xfa:datasets>',
  };

  /* ---------------- the checks ---------------- */

  const ok = (detail) => ({ status: 'pass', detail });
  const warn = (detail) => ({ status: 'warn', detail });
  const fail = (detail) => ({ status: 'fail', detail });
  const textOf = (doc) => doc.paragraphs.map((p) => p.text).join(' ');

  function checks(env) {
    const { Vault, FS, Engine } = env;
    return [
      ['CaseVault version and mode', async () => {
        const sw = root.navigator && root.navigator.serviceWorker && root.navigator.serviceWorker.controller;
        return ok(`CaseVault ${Vault.APP_VERSION}, ${env.mode === 'direct' ? 'direct mode (the browser opens the SSD)' : 'helper mode (Start-CaseVault.bat)'}${sw ? ', installed for offline use' : ''}.`);
      }],
      ['SSD: write, read back, delete', async () => {
        const name = `.selftest-${Date.now()}.txt`;
        const payload = `CaseVault self-test ${new Date().toISOString()} ✓`;
        await FS.writeText(Vault.root, name, payload);
        const back = await FS.readText(Vault.root, name);
        await FS.remove(Vault.root, name);
        if (back !== payload) return fail('The test file read back differently. The drive may be failing.');
        return ok(`A test file was written to ${Vault.root.name}, read back identically, and deleted.`);
      }],
      ['Word .docx reader', async () => {
        const bytes = root.CVDocx.buildDocx(`# Test\n\n${MINI_CASE.report}`, { title: 'Self-test' });
        const d = await root.CVExtract.extract(new File([bytes], 'selftest.docx'), 'selftest.docx');
        return /2140 hours/.test(textOf(d)) ? ok('A Word file made in memory was read correctly.') : fail('The Word text did not come back.');
      }],
      ['PDF reader', async () => {
        const d = await root.CVExtract.extract(new File([buildPdf({ text: 'Officer Alex Sample responded at 2140 hours.' })], 'selftest.pdf'), 'selftest.pdf');
        return /2140 hours/.test(textOf(d)) ? ok('A text PDF was read.') : fail(`No text came back${d.warnings && d.warnings.length ? `: ${d.warnings[0]}` : '.'}`);
      }],
      ['XFA form reader', async () => {
        const f = await root.CVExtract.readXfaFields(buildPdf({ text: 'Please wait...', xfa: XFA }));
        const t = f.paragraphs.map((p) => p.text).join(' | ');
        return f.xfa && /Case number: 2026-00123/.test(t) && /Reporting officer: Officer Alex Sample/.test(t) ? ok(`Form fields read: ${t}`) : fail(`Form fields not read (${t || 'none'}).`);
      }],
      ['Spreadsheet reader', async () => {
        const d = await root.CVExtract.extract(new File(['Item,Value\n2,"$2,540"\n'], 'selftest.csv'), 'selftest.csv');
        return /2,540/.test(textOf(d)) ? ok(`Rows read: ${textOf(d)}`) : fail('The CSV rows did not come back.');
      }],
      ['OCR for scanned pages and photos', async (progress) => {
        const canvas = root.document.createElement('canvas');
        canvas.width = 900; canvas.height = 160;
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = '#000'; g.font = 'bold 56px Arial'; g.fillText('PLATE TST 1284', 40, 100);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const d = await root.CVExtract.extract(new File([blob], 'selftest.png'), 'selftest.png', (m) => progress(`OCR ${m}`));
        const t = textOf(d).toUpperCase();
        return /TST/.test(t) && /1284/.test(t) ? ok(`OCR read: "${textOf(d).trim()}"`) : warn(`OCR ran but read "${textOf(d).trim() || 'nothing'}". Scanned pages may be read poorly.`);
      }],
      ['Consistency rules on a mini case', async () => {
        const flags = root.CVRules.compare([
          { name: 'Affidavit', role: 'affidavit', paragraphs: [{ index: 0, page: 1, text: MINI_CASE.affidavit }] },
          { name: 'Report', role: 'report', paragraphs: [{ index: 0, page: 1, text: MINI_CASE.report }] },
        ]);
        const found = EXPECT.filter((t) => flags.some((f) => f.type === t && f.severity === 'High'));
        const missed = EXPECT.filter((t) => !found.includes(t));
        const extra = flags.filter((f) => f.type === 'address');
        if (missed.length) return fail(`Planted errors missed: ${missed.join(', ')}.`);
        if (extra.length) return fail('A matching address (Ave. / Avenue) was wrongly flagged.');
        return ok(`All ${EXPECT.length} planted errors flagged (time, plate, count, amount, name spelling); the matching address was not.`);
      }],
      ['Privacy: personal details hidden before going online', async () => {
        const known = root.CVPii.knownTerms({ affiant: { name: 'Detective Casey Example', email: 'casey.example@agency.example' } });
        const r = root.CVPii.redact(PII_TEXT, root.CVPii.scan(PII_TEXT, { known }));
        const leaked = PII_SECRETS.filter((s) => r.text.includes(s));
        return leaked.length ? fail(`Would have been sent: ${leaked.join(', ')}`) : ok(`All ${PII_SECRETS.length} kinds of detail replaced: ${r.text}`);
      }],
      ['Online state', async () => {
        const on = root.CVOutbound && root.CVOutbound.isOnline();
        return on ? warn('CaseVault is online right now. It goes offline by itself after the idle time.') : ok('Offline: nothing can leave this computer.');
      }],
      ['AI engine and model for this PC', async () => {
        await Engine.refresh();
        const d = Engine.detected || {};
        if (d.status !== 'connected') return warn('The AI engine is not running (start Start-CaseVault.bat). Checks still work with rules only.');
        const choice = Engine.choice();
        if (!choice) return warn(`Engine running, but no chat model is installed (${(d.models || []).map((m) => m.name).join(', ') || 'none'}).`);
        const hw = root.CVHardware ? ` ${root.CVHardware.explain(root.CVHardware.state)}` : '';
        return ok(`Checks here use ${choice.model} (${Engine.setting() === 'auto' ? 'Auto' : 'chosen on this PC'}).${hw}`);
      }],
      ['Passage search model', async () => {
        const d = Engine.detected || {};
        if (d.status !== 'connected' || d.engine === 'webllm') return warn('Only checked when Ollama is running.');
        return d.embed ? ok(`${d.embed} is installed.`) : warn('Not installed. Click "AI:" in the header for the one-line install.');
      }],
      ['AI answers, short live test', async (progress) => {
        const d = Engine.detected || {};
        const choice = Engine.choice();
        if (d.status !== 'connected' || !choice) return warn('Skipped: no AI engine.');
        progress(`asking ${choice.model} (the first answer can take 10–30 s while the model loads)…`);
        const t0 = Date.now();
        const res = await Engine.fetchImpl()(`${d.base}/api/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: choice.model, prompt: 'Reply with the single word OK.', stream: false, keep_alive: root.CVAI.KEEP_ALIVE, options: { num_predict: 8, temperature: 0, num_ctx: root.CVAI.numCtxFor(choice.profile) } }),
        });
        if (!res.ok) return fail(`The engine answered ${res.status}.`);
        const j = await res.json();
        const secs = (Date.now() - t0) / 1000;
        const tps = j.eval_count && j.eval_duration ? ` · ${(j.eval_count / (j.eval_duration / 1e9)).toFixed(1)} tokens/s` : '';
        const load = j.load_duration > 2e9 ? ` (of which ${(j.load_duration / 1e9).toFixed(0)} s loading the model)` : '';
        return ok(`${choice.model} answered "${String(j.response || '').trim().slice(0, 20)}" in ${secs.toFixed(1)} s${load}${tps}.`);
      }],
    ];
  }

  /** Run every check; onUpdate(results) after each step. Returns the results. */
  async function run(env, onUpdate = () => {}) {
    const list = checks(env);
    const results = list.map(([name]) => ({ name, status: 'waiting', detail: '' }));
    for (let i = 0; i < list.length; i++) {
      results[i].status = 'running';
      onUpdate(results);
      try {
        Object.assign(results[i], await list[i][1]((msg) => { results[i].detail = msg; onUpdate(results); }));
      } catch (err) {
        Object.assign(results[i], fail(err && err.message ? err.message : String(err)));
      }
      onUpdate(results);
    }
    return results;
  }

  /** A plain-text report (no case data) for copying. */
  function report(results, env) {
    const mark = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
    return [`CaseVault self-test · ${new Date().toLocaleString()} · ${env && env.Vault ? env.Vault.APP_VERSION : ''}`,
      ...results.map((r) => `${mark[r.status] || r.status.toUpperCase()}  ${r.name}: ${r.detail}`)].join('\n');
  }

  const api = { buildPdf, run, report, checks, MINI_CASE, EXPECT, PII_TEXT, PII_SECRETS, XFA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVSelfTest = api;
})(this);
