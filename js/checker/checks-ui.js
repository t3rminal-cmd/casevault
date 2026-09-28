/* CaseVault — Offline Consistency Checker: the "Checks" tab, the AI engine status, and its settings.
 * Uses the small UI kit app.js exposes as window.CaseVaultUI.
 */
'use strict';

(function (root) {
  let ui = null; // set by init()

  const BANNER = 'AI-assisted review. Verify every flag against the source.';
  const SEVERITY_HELP = {
    High: 'Hard fact mismatch',
    Medium: 'Contradiction',
    Low: 'Not supported by the reports',
  };
  const STATUS_LABEL = { open: 'Open', fix: 'Fix', 'not-issue': 'Not an issue', explained: 'Explained' };

  /* =====================================================================
   * AI engine: detection, header status, settings
   * ===================================================================== */

  const Engine = {
    detected: null,
    busy: null,

    setting() {
      return (Vault.data && Vault.data.settings.aiProfile) || 'auto';
    },

    choice() {
      return CVAI.choose(this.detected, this.setting());
    },

    // 'connected' | 'offline' | 'rules-only' | 'checking'
    status() {
      if (this.setting() === 'rules-only') return 'rules-only';
      if (!this.detected) return 'checking';
      if (this.detected.status !== 'connected') return 'offline';
      return this.choice() ? 'connected' : 'offline';
    },

    refresh() {
      if (!this.busy) {
        this.busy = CVAI.detect().then((d) => { this.detected = d; }).catch(() => {
          this.detected = { status: 'offline', models: [], chat: [], profiles: {} };
        }).finally(() => { this.busy = null; renderPill(); });
      }
      return this.busy;
    },
  };

  function profileLabel(choice) {
    if (!choice) return '';
    const p = CVAI.PROFILES[choice.profile];
    return `${p ? p.label : 'Custom'} · ${choice.model}`;
  }

  function renderPill() {
    const el = document.getElementById('engine-status');
    if (!el || !Vault.data) { if (el) el.hidden = true; return; }
    const st = Engine.status();
    el.hidden = false;
    el.className = `engine-status ${st}`;
    const text = {
      connected: `AI: Connected (${profileLabel(Engine.choice())})`,
      offline: 'AI: Offline',
      'rules-only': 'AI: Rules-only',
      checking: 'AI: checking…',
    }[st];
    el.textContent = text;
    el.title = {
      connected: 'The local AI engine is running. Click for AI settings.',
      offline: 'The local AI engine (Ollama) is not running. Checks will use rules only. Click for help.',
      'rules-only': 'AI review is switched off. Checks use rules only. Click to change.',
      checking: 'Looking for the local AI engine…',
    }[st];
  }

  async function showEngineDialog() {
    const { h, openDialog, Save, toast } = ui;
    await Engine.refresh();
    await openDialog((close) => {
      const d = Engine.detected || { status: 'offline', profiles: {}, chat: [] };
      const current = Engine.setting();
      const options = [['auto', 'Auto', 'Use the best installed model (Quick, then Light, then Thorough).']];
      for (const [key, p] of Object.entries(CVAI.PROFILES)) {
        if (d.profiles[key]) options.push([key, p.label, `${p.hint}. Uses ${d.profiles[key]}.`]);
      }
      options.push(['rules-only', 'Rules-only', 'No AI. Only the rule-based checks run. Always available.']);
      const radios = options.map(([value, label, hint]) => {
        const input = h('input', { type: 'radio', name: 'ai-profile', value, checked: value === current });
        input.addEventListener('change', async () => {
          try {
            await Save.track('settings', () => Vault.updateSettings({ aiProfile: value, aiProfileChosen: true }));
            renderPill();
            toast(`AI profile: ${label}`, 'success');
          } catch { /* reported by Save */ }
        });
        return h('label', { class: 'radio-row' }, input, h('span', {}, h('strong', {}, label), h('span', { class: 'muted small block' }, hint)));
      });
      const choice = Engine.choice();
      return h('div', { class: 'engine-panel' },
        h('h2', {}, 'AI engine'),
        d.status === 'connected'
          ? h('p', {}, h('span', { class: 'pill status-closed' }, 'Connected'), ' Ollama is running on this computer',
            choice ? ['. Checks will use ', h('strong', {}, profileLabel(choice)), choice.fallback ? ' (the chosen profile has no model installed)' : '', '.'] : ', but no chat model is installed.')
          : h('div', {},
            h('p', {}, h('span', { class: 'pill status-pending' }, 'Offline'), ' The local AI engine is not running, so checks use the rule-based layer only.'),
            h('p', { class: 'muted small' }, 'To use AI review, double-click Start-CaseVault.bat on the CV-AI drive (for example W:\\) and click "Check again". See docs/AI-SETUP.md.')),
        d.status === 'connected' && h('p', { class: 'muted small' },
          `Installed models: ${d.models.map((m) => m.name).join(', ') || 'none'}.`,
          d.embed ? ` Passage search uses ${d.embed}.` : ' Tip: install nomic-embed-text for better passage search.'),
        h('h3', {}, 'Profile'),
        h('div', { class: 'radio-list' }, radios),
        h('p', { class: 'muted small' }, 'Privacy: CaseVault only talks to the AI engine on this computer (127.0.0.1:11434). Nothing is sent anywhere else.'),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: async () => { close(); await Engine.refresh(); showEngineDialog(); } }, 'Check again'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done')));
    });
  }

  /* =====================================================================
   * Helpers
   * ===================================================================== */

  function banner() {
    return ui.h('div', { class: 'ai-banner', role: 'note' }, '⚠ ', BANNER);
  }

  function markText(text, highlight) {
    const { h } = ui;
    if (!highlight) return [text];
    const [a, b] = highlight;
    if (!(a >= 0 && b > a && b <= text.length)) return [text];
    return [text.slice(0, a), h('mark', {}, text.slice(a, b)), text.slice(b)];
  }

  function where(loc) {
    return [loc.doc, loc.page ? `page ${loc.page}` : null].filter(Boolean).join(' · ');
  }

  async function checkableFiles(c) {
    return (await Vault.listFiles(c.id)).filter((f) => CVExtract.kindOf(f.name));
  }

  // Text of a document: from the SSD cache when the file hasn't changed, otherwise read it again.
  async function documentText(c, name, onProgress) {
    const file = await Vault.readFile(c.id, name);
    if (!file) {
      const err = new Error(`"${name}" is no longer attached to this case.`);
      err.name = 'FileGoneError';
      throw err;
    }
    const cached = await Vault.readTextCache(c.id, name, file.size, file.lastModified);
    if (cached && cached.paragraphs) return { ...cached, size: file.size, modified: file.lastModified };
    const out = await CVExtract.extract(file, name, onProgress);
    await Vault.writeTextCache(c.id, name, file.size, file.lastModified, out);
    return { ...out, size: file.size, modified: file.lastModified };
  }

  /* =====================================================================
   * Checks tab: new check + past checks
   * ===================================================================== */

  async function render(panel, c, token, sub) {
    if (sub) return renderResult(panel, c, token, decodeURIComponent(sub));
    const { h, state, fmtDateTime } = ui;
    const [files, checks] = await Promise.all([checkableFiles(c), Vault.listChecks(c.id)]);
    if (token !== state.renderToken) return;
    Engine.refresh().then(() => { if (token === state.renderToken) updateAiLine(); });

    // ---- new check form
    const guess = files.find((f) => /affidavit|affid|declaration|probable cause/i.test(f.name)) || null;
    const affSelect = h('select', { 'aria-label': 'Document to check' },
      h('option', { value: '' }, '(none: only compare the reports with each other)'),
      files.map((f) => h('option', { value: f.name, selected: guess && f.name === guess.name }, f.name)));
    const reportList = h('div', { class: 'check-reports' });
    const aiToggle = h('input', { type: 'checkbox' });
    const aiLine = h('span', { class: 'muted small' });
    const runBtn = h('button', { class: 'btn primary', type: 'button' }, 'Run check');

    function drawReports() {
      const aff = affSelect.value;
      const prev = new Map([...reportList.querySelectorAll('input')].map((i) => [i.value, i.checked]));
      reportList.replaceChildren(...files.filter((f) => f.name !== aff).map((f) =>
        h('label', { class: 'check-row' },
          h('input', { type: 'checkbox', value: f.name, checked: prev.has(f.name) ? prev.get(f.name) : true }),
          h('span', {}, f.name))));
      if (!reportList.children.length) reportList.append(h('p', { class: 'muted small' }, 'No other documents are attached.'));
      updateAiLine();
    }

    function updateAiLine() {
      const st = Engine.status();
      const choice = Engine.choice();
      const hasAff = !!affSelect.value;
      aiToggle.disabled = !(st === 'connected' && choice && hasAff);
      if (aiToggle.disabled) aiToggle.checked = false;
      else if (!aiToggle.dataset.touched) aiToggle.checked = true;
      aiLine.textContent = st === 'connected' && choice
        ? (hasAff ? ` using ${profileLabel(choice)}` : ' (needs a document to check)')
        : st === 'rules-only' ? ' (switched off: AI profile is Rules-only)'
          : st === 'checking' ? ' (looking for the AI engine…)'
            : ' (AI engine offline: start Start-CaseVault.bat on the CV-AI drive)';
    }
    aiToggle.addEventListener('change', () => { aiToggle.dataset.touched = '1'; });
    affSelect.addEventListener('change', drawReports);
    drawReports();

    runBtn.addEventListener('click', () => {
      const reports = [...reportList.querySelectorAll('input:checked')].map((i) => i.value);
      const affidavit = affSelect.value || null;
      if (!reports.length || (!affidavit && reports.length < 2)) {
        ui.toast(affidavit ? 'Choose at least one report to compare against.' : 'Choose at least two reports to compare with each other.', 'error');
        return;
      }
      runCheck(c, affidavit, reports, aiToggle.checked);
    });

    const form = files.length
      ? h('div', { class: 'card' },
        h('h2', {}, 'New check'),
        h('label', { class: 'field' }, h('span', {}, 'Document to check (affidavit or draft)'), affSelect),
        h('div', { class: 'field' }, h('span', {}, 'Compare against'), reportList),
        h('label', { class: 'check-row' }, aiToggle, h('span', {}, 'Include AI review', aiLine)),
        h('p', { class: 'muted small' }, 'The rule-based checks (dates, times, names, numbers, addresses, plates, phone numbers, amounts, counts) always run. Reports are also cross-checked against each other.'),
        h('div', { class: 'form-actions' }, runBtn))
      : h('div', { class: 'card' }, h('h2', {}, 'New check'),
        h('p', { class: 'muted' }, 'Attach the affidavit and the reports on the Files tab first. PDF, DOCX, TXT and photos (PNG/JPG) can be checked.'));

    // ---- past checks
    const past = checks.length
      ? h('table', { class: 'files checks-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Run'), h('th', {}, 'Checked'), h('th', {}, 'Flags'), h('th', {}, 'Open'), h('th', {}, 'Engine'))),
        h('tbody', {}, checks.map((k) => h('tr', { class: 'clickable', onclick: () => ui.go(c.id, 'checks', k.name) },
          h('td', {}, h('a', { href: `#/case/${encodeURIComponent(c.id)}/checks/${encodeURIComponent(k.name)}` }, k.created ? fmtDateTime(Date.parse(k.created)) : k.name)),
          h('td', {}, k.damaged ? h('span', { class: 'error-text' }, 'Damaged file') : [k.affidavit || 'Reports only', h('span', { class: 'muted small block' }, `against ${k.reports.length} document${k.reports.length === 1 ? '' : 's'}`)]),
          h('td', {}, k.counts ? ['High', 'Medium', 'Low'].map((s) => h('span', { class: `sev-count sev-${s.toLowerCase()}`, title: s }, `${k.counts[s] || 0}`)) : ''),
          h('td', {}, k.open != null ? String(k.open) : ''),
          h('td', { class: 'muted small' }, k.engine ? (k.engine.model || 'Rules only') : '', k.complete === false ? ' (stopped early)' : '')))))
      : h('p', { class: 'muted' }, 'No checks yet.');

    panel.replaceChildren(banner(), form, h('h2', { class: 'section-title' }, 'Past checks'), past);
  }

  /* =====================================================================
   * Running a check
   * ===================================================================== */

  async function runCheck(c, affidavit, reports, useAI) {
    const { h, openDialog, Save, toast, go } = ui;
    const ctrl = new AbortController();
    const steps = h('ol', { class: 'progress-steps' });
    const activity = h('p', { class: 'muted small' }, 'Starting…');
    const bar = h('progress', { max: 100, value: 0 });
    let stopBtn;
    let closeDialog;
    const addStep = (text) => { const li = h('li', { class: 'running' }, text); steps.append(li); return li; };
    const done = (li, cls = 'done') => { li.className = cls; };

    openDialog((close) => {
      closeDialog = close;
      stopBtn = h('button', { class: 'btn', type: 'button', onclick: () => { ctrl.abort(); stopBtn.disabled = true; activity.textContent = 'Stopping…'; } }, 'Cancel');
      return h('div', { class: 'progress-panel' }, h('h2', {}, 'Checking documents'), steps, bar, activity, h('div', { class: 'dialog-actions' }, stopBtn));
    });
    dialogBlockEscape(true);

    const finish = () => { dialogBlockEscape(false); if (closeDialog) closeDialog(); };
    try {
      // 1. Read every document.
      const names = [affidavit, ...reports].filter(Boolean);
      const docs = [];
      const docInfo = [];
      for (let i = 0; i < names.length; i++) {
        if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const name = names[i];
        const role = name === affidavit ? 'affidavit' : 'report';
        const li = addStep(`Reading ${name}`);
        try {
          const d = await documentText(c, name, (msg) => { activity.textContent = `${name}: ${msg}`; });
          docs.push({ name, role, kind: d.kind, paragraphs: d.paragraphs, docIndex: docs.length });
          docInfo.push({ name, role, kind: d.kind, pageCount: d.pageCount, ocrPages: d.ocrPages || [], warnings: d.warnings || [], size: d.size, modified: d.modified });
          done(li, d.ocrPages && d.ocrPages.length ? 'done warn' : 'done');
        } catch (err) {
          if (FS.isDisconnectError(err)) throw err;
          done(li, 'failed');
          li.append(h('span', { class: 'small block' }, err.message));
          if (role === 'affidavit') throw new Error(`Could not read ${name}: ${err.message}`);
          docInfo.push({ name, role, error: err.message, skipped: true });
        }
        bar.value = Math.round(((i + 1) / names.length) * (useAI ? 30 : 80));
      }
      const usable = docs.filter((d) => d.role === 'report').length;
      if (!usable || (!affidavit && usable < 2)) throw new Error('Not enough readable documents to compare.');

      // 2. Rule-based checks.
      const rulesStep = addStep('Rule-based checks');
      activity.textContent = 'Comparing dates, times, names and numbers…';
      await new Promise((r) => setTimeout(r, 20));
      const ruleFlags = CVRules.compare(docs.map((d) => ({ id: d.docIndex, name: d.name, role: d.role, paragraphs: d.paragraphs })));
      done(rulesStep);
      bar.value = useAI ? 35 : 90;

      // 3. AI review.
      let ai = null;
      let engineInfo = { mode: 'rules-only' };
      if (useAI && affidavit) {
        const aiStep = addStep('AI review');
        const choice = Engine.choice();
        const det = Engine.detected;
        if (!choice) {
          done(aiStep, 'failed');
          aiStep.append(h('span', { class: 'small block' }, 'AI engine not available. Rules only.'));
        } else {
          engineInfo = { mode: 'ai', profile: choice.profile, model: choice.model, embed: det.embed || null };
          try {
            ai = await CVAI.review({
              docs,
              engine: { base: det.base, model: choice.model, embed: det.embed },
              signal: ctrl.signal,
              onProgress: (p) => {
                if (p.phase === 'embed') activity.textContent = 'Indexing report passages…';
                else activity.textContent = `Reviewing statement ${Math.min(p.done + 1, p.total)} of ${p.total} with ${choice.model}…`;
                if (p.total) bar.value = 35 + Math.round((p.done / p.total) * 60);
              },
            });
            done(aiStep, ai.complete ? 'done' : 'done warn');
          } catch (err) {
            done(aiStep, 'failed');
            aiStep.append(h('span', { class: 'small block' }, `AI review stopped: ${err.message}`));
            ai = { flags: [], stats: null, complete: false, error: err.message };
          }
        }
      }
      if (ctrl.signal.aborted && !ai) throw new DOMException('Cancelled', 'AbortError');

      // 4. Save to the SSD.
      const saveStep = addStep('Saving to SSD');
      const rank = { High: 0, Medium: 1, Low: 2 };
      const flags = [...ruleFlags, ...(ai ? ai.flags : [])].sort((a, b) => rank[a.severity] - rank[b.severity]
        || a.statement.docIndex - b.statement.docIndex || a.statement.paragraph - b.statement.paragraph || a.statement.start - b.statement.start);
      const name = await Vault.newCheckName(c.id);
      const data = {
        schema: 1,
        app: 'CaseVault',
        appVersion: Vault.APP_VERSION,
        created: new Date().toISOString(),
        affidavit: affidavit || null,
        reports: docInfo.filter((d) => d.role === 'report').map((d) => d.name),
        documents: docInfo,
        docOrder: docs.map((d) => d.name),
        engine: engineInfo,
        ai: ai ? { stats: ai.stats, complete: ai.complete, error: ai.error || null } : null,
        complete: !ai || ai.complete,
        flags,
      };
      await Save.track(`check-new:${c.id}`, () => Vault.saveCheck(c.id, name, data));
      done(saveStep);
      bar.value = 100;
      finish();
      if (!data.complete) toast('The AI review was stopped early. The results so far were saved.', 'info', 8000);
      go(c.id, 'checks', name);
    } catch (err) {
      finish();
      if (err.name === 'AbortError') return toast('Check cancelled. Nothing was saved.');
      if (FS.isDisconnectError(err)) return ui.onDriveLost();
      console.error(err);
      toast(`Check failed: ${err.message}`, 'error', 10000);
    }
  }

  // While a check runs, Esc must not close the progress window.
  function onCancel(e) { e.preventDefault(); }
  function dialogBlockEscape(on) {
    const d = document.getElementById('dialog');
    if (on) d.addEventListener('cancel', onCancel); else d.removeEventListener('cancel', onCancel);
  }

  /* =====================================================================
   * Results
   * ===================================================================== */

  const view = { severity: new Set(['High', 'Medium', 'Low']), status: 'all', layer: 'all' };

  async function renderResult(panel, c, token, name) {
    const { h, state, Save, fmtDateTime } = ui;
    let data;
    try {
      data = await Vault.readCheck(c.id, name);
    } catch (err) {
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') throw err;
      data = null;
    }
    if (token !== state.renderToken) return;
    const back = h('a', { href: `#/case/${encodeURIComponent(c.id)}/checks`, class: 'back-link' }, '← All checks');
    if (!data) { panel.replaceChildren(back, h('p', { class: 'error-text' }, 'This check could not be read.')); return; }

    const save = () => {
      const snapshot = structuredClone(data);
      Save.schedule(`check:${c.id}:${name}`, () => Vault.saveCheck(c.id, name, snapshot), 500);
    };

    const counts = { High: 0, Medium: 0, Low: 0 };
    for (const f of data.flags) counts[f.severity]++;
    const openCount = () => data.flags.filter((f) => f.status === 'open').length;

    const list = h('div', { class: 'flag-list' });
    const summaryOpen = h('span', {});
    const drawSummary = () => { summaryOpen.textContent = `${openCount()} of ${data.flags.length} still open`; };

    function draw() {
      const shown = data.flags.filter((f) => view.severity.has(f.severity)
        && (view.layer === 'all' || f.layer === view.layer)
        && (view.status === 'all' || (view.status === 'open' ? f.status === 'open' : f.status !== 'open')));
      list.replaceChildren(...(shown.length ? shown.map((f) => flagCard(c, data, f, save, () => { drawSummary(); })) : [h('p', { class: 'muted' }, data.flags.length ? 'No flags match these filters.' : 'No inconsistencies were found. Still read the documents yourself: no flags is not proof of accuracy.')]));
      drawSummary();
    }

    const sevChips = ['High', 'Medium', 'Low'].map((s) => {
      const b = h('button', { type: 'button', class: `chip sev-${s.toLowerCase()} ${view.severity.has(s) ? 'on' : ''}`, title: SEVERITY_HELP[s], 'aria-pressed': String(view.severity.has(s)) }, `${s} ${counts[s]}`);
      b.addEventListener('click', () => {
        if (view.severity.has(s)) view.severity.delete(s); else view.severity.add(s);
        b.classList.toggle('on'); b.setAttribute('aria-pressed', String(view.severity.has(s)));
        draw();
      });
      return b;
    });
    const statusSel = h('select', { 'aria-label': 'Show' }, [['all', 'All flags'], ['open', 'Open only'], ['done', 'Resolved only']].map(([v, l]) => h('option', { value: v, selected: view.status === v }, l)));
    statusSel.addEventListener('change', () => { view.status = statusSel.value; draw(); });
    const layerSel = h('select', { 'aria-label': 'Layer' }, [['all', 'Rules + AI'], ['rules', 'Rules only'], ['ai', 'AI only']].map(([v, l]) => h('option', { value: v, selected: view.layer === v }, l)));
    layerSel.addEventListener('change', () => { view.layer = layerSel.value; draw(); });

    const st = data.ai && data.ai.stats;
    const docsLine = (data.documents || []).map((d) => h('li', {},
      h('strong', {}, d.name), ` (${d.role === 'affidavit' ? 'checked' : 'report'}${d.pageCount ? `, ${d.pageCount} page${d.pageCount === 1 ? '' : 's'}` : ''})`,
      d.skipped ? h('span', { class: 'error-text' }, ` Skipped: ${d.error}`) : null,
      ...(d.warnings || []).map((w) => h('span', { class: 'warn-text block small' }, w))));

    panel.replaceChildren(
      back,
      banner(),
      h('div', { class: 'card result-head' },
        h('h2', {}, data.affidavit ? `Check of ${data.affidavit}` : 'Reports cross-check'),
        h('p', { class: 'muted' }, `${data.created ? fmtDateTime(Date.parse(data.created)) : ''} · `,
          data.engine && data.engine.mode === 'ai' ? `Rules + AI (${data.engine.model})` : 'Rules only', ' · ', summaryOpen),
        h('ul', { class: 'doc-list' }, docsLine),
        st ? h('p', { class: 'small' },
          `AI reviewed ${st.reviewed} of ${st.statements} statements: ${st.supported} supported, ${st.contradicted} contradicted, ${st.notFound} not found.`,
          st.discarded ? h('strong', {}, ` ${st.discarded} AI answer${st.discarded === 1 ? ' was' : 's were'} discarded because the quoted text was not found in the reports.`) : '') : null,
        data.ai && !data.ai.complete ? h('p', { class: 'warn-text small' }, `The AI review did not finish${data.ai.error ? ` (${data.ai.error})` : ''}. Statements after that point were not reviewed by AI.`) : null,
        h('p', { class: 'muted small' }, `Saved on the SSD: cases\\${c.id}\\checks\\${name}`)),
      h('div', { class: 'filters' }, sevChips, h('div', { class: 'spacer' }), layerSel, statusSel),
      list);
    draw();
  }

  function flagCard(c, data, f, save, onChange) {
    const { h } = ui;
    const note = h('textarea', { rows: 2, class: 'flag-note', placeholder: 'Explain how this was resolved (saved with the check)', 'aria-label': 'Note' });
    note.value = f.note || '';
    note.hidden = f.status !== 'explained' && !f.note;
    note.addEventListener('input', () => { f.note = note.value; save(); });

    const card = h('article', { class: `flag sev-${f.severity.toLowerCase()} status-${f.status}` });
    const buttons = ['fix', 'not-issue', 'explained'].map((s) => {
      const b = h('button', { type: 'button', class: `btn small ${f.status === s ? 'active' : ''}`, 'aria-pressed': String(f.status === s) }, STATUS_LABEL[s]);
      b.addEventListener('click', () => {
        f.status = f.status === s ? 'open' : s;
        f.reviewed = f.status === 'open' ? null : new Date().toISOString();
        buttons.forEach((x, i) => {
          const on = ['fix', 'not-issue', 'explained'][i] === f.status;
          x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on));
        });
        card.className = `flag sev-${f.severity.toLowerCase()} status-${f.status}`;
        if (f.status === 'explained') { note.hidden = false; note.focus(); }
        save();
        onChange();
      });
      return b;
    });

    const quote = (loc, label) => h('button', { type: 'button', class: 'quote', title: 'Show this in the document', onclick: () => openLocation(c, data, loc) },
      h('span', { class: 'quote-where' }, label, ': ', where(loc)),
      h('span', { class: 'quote-text' }, '“', markText(loc.text, loc.highlight), '”'));

    card.append(
      h('header', { class: 'flag-head' },
        h('span', { class: `pill sev sev-${f.severity.toLowerCase()}`, title: SEVERITY_HELP[f.severity] }, f.severity),
        h('span', { class: 'layer-badge' }, f.layer === 'ai' ? 'AI' : 'Rules'),
        h('strong', { class: 'flag-title' }, f.title)),
      h('div', { class: 'flag-sides' },
        quote(f.statement, data.affidavit && f.statement.doc === data.affidavit ? 'Statement' : 'Says'),
        f.source ? quote(f.source, 'Source') : h('div', { class: 'quote none' }, h('span', { class: 'quote-where' }, 'Source'), h('span', { class: 'muted' }, 'Not found in the reports'))),
      f.detail ? h('p', { class: 'flag-detail muted small' }, f.detail) : null,
      h('div', { class: 'flag-actions' }, h('span', { class: 'muted small' }, 'Mark as:'), ...buttons),
      note);
    return card;
  }

  /* =====================================================================
   * Jump to location
   * ===================================================================== */

  async function openLocation(c, data, loc) {
    const { h, openDialog, toast } = ui;
    let doc;
    try {
      doc = await documentText(c, loc.doc, () => {});
    } catch (err) {
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return ui.onDriveLost();
      return toast(err.message, 'error');
    }
    const info = (data.documents || []).find((d) => d.name === loc.doc);
    const changed = info && info.size != null && (info.size !== doc.size || info.modified !== doc.modified);
    await openDialog((close) => {
      let lastPage = null;
      const body = h('div', { class: 'doc-view' });
      for (const p of doc.paragraphs) {
        if (p.page && p.page !== lastPage) { body.append(h('div', { class: 'doc-page' }, `Page ${p.page}`)); lastPage = p.page; }
        const isTarget = p.index === loc.paragraph;
        let content = [p.text];
        if (isTarget && loc.end > loc.start && p.text.slice(loc.start, loc.end) === loc.text) {
          const inner = markText(loc.text, loc.highlight);
          content = [p.text.slice(0, loc.start), h('mark', { class: 'sentence' }, inner), p.text.slice(loc.end)];
        }
        body.append(h('p', { class: isTarget ? 'target' : '' }, content));
      }
      return h('div', { class: 'preview' },
        h('div', { class: 'preview-head' },
          h('h2', {}, loc.doc),
          h('span', { class: 'muted small' }, loc.page ? `page ${loc.page}` : ''),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); ui.previewFile(c, loc.doc, loc.page); } }, 'Open original'),
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
        changed ? h('p', { class: 'warn-text small' }, 'This file has changed since the check was run. The highlighted text may have moved.') : null,
        body);
    });
  }

  // Scroll the highlighted paragraph into view whenever the document viewer opens.
  new MutationObserver(() => {
    const t = document.querySelector('#dialog[open] .doc-view .target');
    if (t && !t.dataset.scrolled) { t.dataset.scrolled = '1'; t.scrollIntoView({ block: 'center' }); }
  }).observe(document.documentElement, { subtree: true, childList: true });

  /* =====================================================================
   * Public
   * ===================================================================== */

  function init(kit) {
    ui = kit;
    const pill = document.getElementById('engine-status');
    if (pill) pill.addEventListener('click', () => { if (Vault.data) showEngineDialog(); });
    setInterval(() => { if (!document.hidden && Vault.data) Engine.refresh(); }, 60000);
  }

  function onVaultOpen() {
    renderPill();
    Engine.refresh();
  }

  root.CVChecks = { init, render, onVaultOpen, renderPill, Engine };
})(this);
