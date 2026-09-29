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

    // The profile is remembered per PC (js/ai/hardware.js), because the SSD moves between a PC
    // with a graphics card and one without. vault.json's old setting only still counts for
    // "Rules-only", which is a choice about the case work rather than the PC.
    setting() {
      const pc = typeof CVHardware !== 'undefined' ? CVHardware.profile() : null;
      if (pc) return pc;
      const s = Vault.data && Vault.data.settings;
      return s && s.aiProfileChosen && s.aiProfile === 'rules-only' ? 'rules-only' : 'auto';
    },

    autoOrder() {
      return typeof CVHardware !== 'undefined' ? CVHardware.autoOrder(CVHardware.state) : undefined;
    },

    choice() {
      return CVAI.choose(this.detected, this.setting(), this.autoOrder());
    },

    // 'connected' | 'offline' | 'rules-only' | 'checking'
    status() {
      if (this.setting() === 'rules-only') return 'rules-only';
      if (!this.detected) return 'checking';
      if (this.detected.status !== 'connected') return 'offline';
      return this.choice() ? 'connected' : 'offline';
    },

    // Ollama first; if it isn't running, the in-browser engine (WebLLM) when it's switched on and
    // a model is on the SSD. this.detected.fetchImpl routes AI calls to whichever engine was found.
    refresh() {
      if (!this.busy) {
        this.busy = (async () => {
          let d = await CVAI.detect().catch(() => null);
          if ((!d || d.status !== 'connected') && this.webllmAllowed() && typeof CVWebLLM !== 'undefined') {
            const w = await CVWebLLM.detect(Vault.data && Vault.data.settings.webllmModel).catch(() => null);
            if (w && w.status === 'connected') d = w;
          }
          this.detected = d || { status: 'offline', models: [], chat: [], profiles: {} };
        })().finally(() => { this.busy = null; renderPill(); });
      }
      return this.busy;
    },

    webllmAllowed() {
      return !(Vault.data && Vault.data.settings.webllm === false);
    },

    /**
     * fetch for AI calls: Ollama over HTTP, or the in-browser engine (no network). Wrapped so the
     * header's activity indicator sees every request.
     */
    fetchImpl() {
      const raw = (this.detected && this.detected.fetchImpl) || null;
      if (!this.wrapped || this.wrapped.raw !== raw) this.wrapped = { raw, fetch: CVActivity.wrap(raw || undefined) };
      return this.wrapped.fetch;
    },

    inBrowser() {
      return !!(this.detected && this.detected.engine === 'webllm');
    },
  };

  // First use of the in-browser model loads it from the SSD: show progress, since it takes a while.
  let loadToast = null;
  function showLoadProgress(p) {
    if (!ui) return;
    if (p.done) { if (loadToast) { loadToast.remove(); loadToast = null; } renderPill(); return; }
    const pct = Math.round((p.progress || 0) * 100);
    const text = `Loading the in-browser AI model (${p.id}) from the SSD… ${pct}%`;
    if (!loadToast || !loadToast.isConnected) loadToast = ui.toast(text, 'info', 3600000);
    else loadToast.textContent = text;
  }

  function profileLabel(choice) {
    if (!choice) return '';
    if (Engine.inBrowser()) return `In-browser · ${choice.model.replace(/-q4f16_1-MLC$|-MLC$/, '')}`;
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
      connected: `AI: ${profileLabel(Engine.choice())}`,
      offline: 'AI: Offline',
      'rules-only': 'AI: Rules-only',
      checking: 'AI: checking…',
    }[st];
    el.replaceChildren(CVIcons.icon(st === 'connected' ? 'cpu' : st === 'checking' ? 'arrow-repeat' : 'exclamation-circle'), text);
    el.title = {
      connected: Engine.inBrowser()
        ? 'Ollama is not running, so CaseVault uses the in-browser AI model on this PC\'s graphics chip. Click for AI settings.'
        : 'The local AI engine is running. Click for AI settings.',
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
      const firstAuto = (CVAI.PROFILES[(Engine.autoOrder() || [])[0]] || CVAI.PROFILES.quick).label;
      const options = [['auto', 'Auto', `Picks for this PC: ${firstAuto} first here. ${CVHardware.explain(CVHardware.state)}`]];
      // Quick/Thorough/Light describe Ollama models; the in-browser engine has just its one model.
      if (d.engine !== 'webllm') {
        for (const [key, p] of Object.entries(CVAI.PROFILES)) {
          if (d.profiles[key]) options.push([key, p.label, `${p.hint}. Uses ${d.profiles[key]}.`]);
        }
      }
      options.push(['rules-only', 'Rules-only', 'No AI. Only the rule-based checks run. Always available.']);
      const radios = options.map(([value, label, hint]) => {
        const input = h('input', { type: 'radio', name: 'ai-profile', value, checked: value === current });
        input.addEventListener('change', async () => {
          CVHardware.setProfile(value);
          renderPill();
          toast(`AI profile on this PC: ${label}`, 'success');
        });
        return h('label', { class: 'radio-row' }, input, h('span', {}, h('strong', {}, label), h('span', { class: 'muted small block' }, hint)));
      });
      const choice = Engine.choice();
      return h('div', { class: 'engine-panel' },
        h('h2', {}, 'AI engine'),
        d.status === 'connected' && d.engine === 'webllm'
          ? h('p', {}, h('span', { class: 'pill status-closed' }, 'Connected'), ' Ollama is not running, so CaseVault uses the ', h('strong', {}, 'in-browser engine'),
            ` with ${d.webllm.model}. It runs on this PC's graphics chip; the first use loads it from the SSD, which can take a minute.`)
          : d.status === 'connected'
          ? h('p', {}, h('span', { class: 'pill status-closed' }, 'Connected'), ' Ollama is running on this computer',
            choice ? ['. Checks will use ', h('strong', {}, profileLabel(choice)), choice.fallback ? ' (the chosen profile has no model installed)' : '', '.'] : ', but no chat model is installed.')
          : h('div', {},
            h('p', {}, h('span', { class: 'pill status-pending' }, 'Offline'), ' The local AI engine is not running, so checks use the rule-based layer only.'),
            h('p', { class: 'muted small explain' }, 'To use AI review, double-click Start-CaseVault.bat on the CV-AI drive (for example W:\\) and click "Check again". See docs/AI-SETUP.md.')),
        d.status === 'connected' && d.engine !== 'webllm' && h('p', { class: 'muted small' },
          `Installed models: ${d.models.map((m) => m.name).join(', ') || 'none'}.`),
        d.status === 'connected' && d.engine !== 'webllm' && embedStatus(d),
        h('h3', {}, 'Profile on this PC'),
        h('p', { class: 'muted small explain' }, 'Remembered by this PC\'s browser, not on the SSD, so the Beelink and the L14 can each use the model that suits them.'),
        h('div', { class: 'radio-list' }, radios),
        webllmSection(),
        h('p', { class: 'muted small explain' }, 'Privacy: CaseVault only talks to the AI engine on this computer (127.0.0.1:11434), or runs the in-browser model inside this tab. Nothing is sent anywhere else.'),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: async () => { close(); await Engine.refresh(); showEngineDialog(); } }, 'Check again'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done')));
    });
  }

  // Passage search (embedding model): which report passages the AI reads for each statement.
  function embedStatus(d) {
    const { h, toast } = ui;
    if (d.embed) return h('p', { class: 'small ok-text' }, `✓ Passage search: ${d.embed}. The AI review and Draft with AI find the relevant report passages by meaning, not only by keywords.`);
    const cmd = 'W:\\ollama\\ollama.exe pull nomic-embed-text';
    return h('div', { class: 'card warn-card' },
      h('strong', {}, 'Passage search model not installed'),
      h('p', { class: 'small' }, 'Without it the AI reads the passages found by keywords only, and can miss one written in other words. Install nomic-embed-text (about 0.3 GB) once:'),
      h('ol', { class: 'small' },
        h('li', {}, 'Leave the Start-CaseVault.bat window open (the AI engine must be running).'),
        h('li', {}, 'Press Windows key + R, type cmd and press Enter.'),
        h('li', {}, 'Paste this and press Enter (use your drive letter if it isn\'t W:), then wait for "success":'),
        h('li', { class: 'list-none' }, h('code', {}, cmd), ' ',
          h('button', { class: 'btn small', type: 'button', onclick: async () => {
            try { await navigator.clipboard.writeText(cmd); toast('Command copied.', 'success'); } catch { toast('Select the command and press Ctrl+C.', 'error'); }
          } }, 'Copy')),
        h('li', {}, 'Come back here and click "Check again".')));
  }

  // In-browser engine settings, inside the AI engine dialog.
  function webllmSection() {
    const { h, Save, toast } = ui;
    const box = h('div', {}, h('p', { class: 'muted small' }, 'Looking for in-browser models…'));
    const allowed = h('input', { type: 'checkbox', checked: Engine.webllmAllowed() });
    allowed.addEventListener('change', async () => {
      try {
        await Save.track('settings', () => Vault.updateSettings({ webllm: allowed.checked }));
        if (!allowed.checked) await CVWebLLM.unload();
        await Engine.refresh();
      } catch { /* reported by Save */ }
    });
    CVWebLLM.available().then((a) => {
      if (!a.ok) { box.replaceChildren(h('p', { class: 'muted small' }, a.reason)); return; }
      const current = (Vault.data.settings.webllmModel) || (Engine.detected && Engine.detected.webllm && Engine.detected.webllm.model) || '';
      const select = h('select', { 'aria-label': 'In-browser model' }, a.models.map((m) => h('option', { value: m.id, selected: m.id === current }, `${m.id} · ${(m.bytes / 1e9).toFixed(1)} GB`)));
      select.addEventListener('change', async () => {
        try {
          await Save.track('settings', () => Vault.updateSettings({ webllmModel: select.value }));
          await CVWebLLM.unload();
          await Engine.refresh();
          toast(`In-browser model: ${select.value}`, 'success');
        } catch { /* reported */ }
      });
      box.replaceChildren(...[
        h('label', { class: 'inline' }, 'Model: ', select),
        CVWebLLM.loadedId ? h('button', { class: 'btn small', type: 'button', onclick: async () => { await CVWebLLM.unload(); toast('In-browser model unloaded from the graphics chip.'); } }, 'Unload') : null,
        CVWebLLM.lastError ? h('p', { class: 'error-text small' }, CVWebLLM.lastError.message) : null].filter(Boolean));
    });
    return h('section', {},
      h('h3', { title: 'Used when Ollama is not running.' }, 'In-browser AI'),
      h('label', { class: 'check-row' }, allowed, h('span', {}, 'Use the in-browser AI when Ollama isn\'t running')),
      h('p', { class: 'muted small explain' }, 'Runs a small model (models in W:\\webllm) on this PC\'s graphics chip with WebGPU. Slower and less capable than Ollama, but needs nothing installed. Only available when CaseVault is opened through Start-CaseVault.bat.'),
      box);
  }

  /* =====================================================================
   * Helpers
   * ===================================================================== */

  function banner() {
    return ui.h('div', { class: 'ai-banner', role: 'note' }, ui.icon('exclamation-triangle-fill'), ' ', BANNER);
  }

  function markText(text, highlight) {
    const { h } = ui;
    if (!highlight) return [text];
    const [a, b] = highlight;
    if (!(a >= 0 && b > a && b <= text.length)) return [text];
    return [text.slice(0, a), h('mark', {}, text.slice(a, b)), text.slice(b)];
  }

  // "Report.pdf · page 3", "Log.xlsx · Sheet1 row 12", "Form.pdf · page 1 · Timeline row 2" (XFA field)
  function at(loc) {
    if (loc.sheet != null) return `${loc.sheet} row ${loc.row}`;
    return [loc.page ? `page ${loc.page}` : null, loc.field || null].filter(Boolean).join(' · ') || null;
  }

  function where(loc) {
    return [loc.doc, at(loc)].filter(Boolean).join(' · ');
  }

  async function checkableFiles(c) {
    return (await Vault.listFiles(c.id)).filter((f) => CVExtract.kindOf(f.name));
  }

  // Text of a document: from the SSD cache when the file hasn't changed, otherwise read it again.
  // A draft (info.kind === 'draft') is read from cases/<id>/drafts/ instead of the attached files.
  async function documentText(c, name, onProgress, info = null) {
    if (info && info.kind === 'draft') {
      const draft = await Vault.readDraft(c.id, info.draft);
      if (!draft) {
        const err = new Error(`The draft "${name}" no longer exists.`);
        err.name = 'FileGoneError';
        throw err;
      }
      const paragraphs = CVExtract.paragraphsFromText(CVDraft.stripMarkdown(draft.body), null);
      return { name, kind: 'draft', pageCount: 1, paragraphs, ocrPages: [], warnings: [], size: draft.body.length, modified: draft.meta.updated || null };
    }
    const file = await Vault.readFile(c.id, name);
    if (!file) {
      const err = new Error(`"${name}" is no longer attached to this case.`);
      err.name = 'FileGoneError';
      throw err;
    }
    const cached = await Vault.readTextCache(c.id, name, file.size, file.lastModified);
    // Text read by an older version of the reader is read again (e.g. XFA forms before v1.8).
    if (cached && cached.paragraphs && (cached.extractor || 1) >= CVExtract.VERSION) return { ...cached, size: file.size, modified: file.lastModified };
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
      h('option', { value: '' }, 'None: compare the reports with each other'),
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
        h('label', { class: 'field', title: 'An affidavit or a draft.' }, h('span', {}, 'Document to check'), affSelect),
        h('div', { class: 'field' }, h('span', {}, 'Compare against'), reportList),
        h('label', { class: 'check-row' }, aiToggle, h('span', {}, 'Include AI review', aiLine)),
        h('p', { class: 'muted small explain' }, 'The rule-based checks (dates, times, names, numbers, addresses, plates, phone numbers, amounts, counts) always run. Reports are also cross-checked against each other.'),
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

    // An archived case is read-only: its past checks can be opened, but no new ones run.
    const archived = Vault.isArchived(c.id);
    panel.replaceChildren(banner(), archived ? h('p', { class: 'muted' }, 'This case is archived. Past checks can be opened and read; restore the case to run a new one.') : form,
      h('h2', { class: 'section-title' }, 'Past checks'), past);
  }

  /* =====================================================================
   * Running a check
   * ===================================================================== */

  // Facts a template writes into every draft that no report will mention: the author's own details
  // (signature block) and today's date ("Prepared …"). They never count as "not found".
  function ownDetails() {
    const a = (Vault.data && Vault.data.settings.affiant) || {};
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return [
      ...['name', 'title', 'agency', 'address', 'phone', 'email'].map((k) => a[k]).filter(Boolean),
      `Prepared ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
      `Dated ${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()} and ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.`,
    ];
  }

  // draft: { slug, title } to check a draft (from the Drafts tab) instead of an attached file.
  async function runCheck(c, affidavit, reports, useAI, draft = null) {
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
          const src = draft && role === 'affidavit' ? { kind: 'draft', draft: draft.slug } : null;
          const d = await documentText(c, name, (msg) => { activity.textContent = `${name}: ${msg}`; }, src);
          docs.push({ name, role, kind: d.kind, paragraphs: d.paragraphs, docIndex: docs.length });
          docInfo.push({ name, role, kind: d.kind, ...(src ? { draft: src.draft } : {}), pageCount: d.pageCount, paragraphCount: d.paragraphs.length, ...(d.xfa ? { xfa: true } : {}), ocrPages: d.ocrPages || [], warnings: d.warnings || [], size: d.size, modified: d.modified });
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
      const ruleFlags = CVRules.compare(docs.map((d) => ({ id: d.docIndex, name: d.name, role: d.role, paragraphs: d.paragraphs })), { ignore: ownDetails() });
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
          const numCtx = CVAI.numCtxFor(choice.profile);
          engineInfo = { mode: 'ai', profile: choice.profile, model: choice.model, embed: det.embed || null, numCtx };
          // Time per statement, for "this one 0:07 · about 1:10 left".
          const timing = { index: -1, startedAt: 0, firstAt: 0, total: 0, phase: '' };
          const drawTiming = () => {
            if (timing.phase !== 'review' || timing.index < 0) return;
            const t = Date.now();
            const shown = Math.min(timing.index + 1, timing.total);
            const doneCount = timing.index;
            const perItem = doneCount > 0 ? (timing.startedAt - timing.firstAt) / doneCount : 0;
            const left = perItem ? Math.max(0, perItem * (timing.total - doneCount) - (t - timing.startedAt)) : 0;
            activity.replaceChildren(
              `Reviewing statement ${shown} of ${timing.total} with ${choice.model}…`,
              h('span', { class: 'block timing' }, `This statement: ${CVActivityLib.fmtElapsed(t - timing.startedAt)}`,
                perItem ? ` · about ${CVActivityLib.fmtElapsed(left)} left` : ' · estimating the time left…'));
          };
          const tick = setInterval(drawTiming, 1000);
          if (CVActivity.heavyBusy()) activity.textContent = 'Waiting for "Draft with AI" to finish…';
          try {
            ai = await CVActivity.exclusive('check', async (task) => {
              if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); // cancelled while waiting
              return CVAI.review({
                fetchImpl: Engine.fetchImpl(),
                docs,
                engine: { base: det.base, model: choice.model, embed: det.embed, numCtx },
                signal: ctrl.signal,
                onProgress: (p) => {
                  timing.phase = p.phase;
                  if (p.phase === 'embed') {
                    activity.textContent = 'Indexing report passages…';
                    task.set('Indexing…');
                  } else {
                    if (p.done !== timing.index) {
                      const t = Date.now();
                      if (timing.index < 0) timing.firstAt = t;
                      timing.index = p.done;
                      timing.startedAt = t;
                      timing.total = p.total;
                    }
                    task.set(`Checking ${Math.min(p.done + 1, p.total)} of ${p.total}`);
                    drawTiming();
                  }
                  if (p.total) bar.value = 35 + Math.round((p.done / p.total) * 60);
                },
              });
            }, { label: 'Checking…', model: choice.model });
            done(aiStep, ai.complete ? 'done' : 'done warn');
          } catch (err) {
            done(aiStep, 'failed');
            if (err.name === 'AbortError' && ctrl.signal.aborted) {
              ai = null; // cancelled before the review started: nothing to keep
            } else {
              aiStep.append(h('span', { class: 'small block' }, `AI review stopped: ${err.message}`));
              ai = { flags: [], stats: null, complete: false, error: err.message };
            }
          } finally {
            clearInterval(tick);
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
      const b = h('button', { 'data-ro-ok': 'true', type: 'button', class: `chip sev-${s.toLowerCase()} ${view.severity.has(s) ? 'on' : ''}`, title: SEVERITY_HELP[s], 'aria-pressed': String(view.severity.has(s)) }, `${s} ${counts[s]}`);
      b.addEventListener('click', () => {
        if (view.severity.has(s)) view.severity.delete(s); else view.severity.add(s);
        b.classList.toggle('on'); b.setAttribute('aria-pressed', String(view.severity.has(s)));
        draw();
      });
      return b;
    });
    const statusSel = h('select', { 'data-ro-ok': 'true', 'aria-label': 'Show' }, [['all', 'All flags'], ['open', 'Open only'], ['done', 'Resolved only']].map(([v, l]) => h('option', { value: v, selected: view.status === v }, l)));
    statusSel.addEventListener('change', () => { view.status = statusSel.value; draw(); });
    const layerSel = h('select', { 'data-ro-ok': 'true', 'aria-label': 'Layer' }, [['all', 'Rules + AI'], ['rules', 'Rules only'], ['ai', 'AI only']].map(([v, l]) => h('option', { value: v, selected: view.layer === v }, l)));
    layerSel.addEventListener('change', () => { view.layer = layerSel.value; draw(); });

    const st = data.ai && data.ai.stats;
    const docsLine = (data.documents || []).map((d) => h('li', {},
      h('strong', {}, d.name), ` (${d.role === 'affidavit' ? 'checked' : 'report'}${d.xfa ? ', XFA form' : ''}${d.pageCount ? `, ${d.pageCount} page${d.pageCount === 1 ? '' : 's'}` : ''})`,
      d.skipped ? h('span', { class: 'error-text' }, ` Skipped: ${d.error}`) : null,
      ...(d.warnings || []).map((w) => h('span', { class: 'warn-text block small' }, w))));

    // Documents that gave no usable text weren't really compared: say so above the results.
    const empty = (data.documents || []).filter((d) => !d.skipped && d.paragraphCount === 0);
    const emptyCard = empty.length ? h('div', { class: 'card warn-card', role: 'note' },
      h('strong', {}, `No usable text in ${empty.map((d) => d.name).join(', ')}.`),
      h('p', { class: 'small' }, `${empty.length === 1 ? 'This document was' : 'These documents were'} not compared, so a clean result doesn't mean ${empty.length === 1 ? 'it agrees' : 'they agree'}. See the notes under Documents below.`)) : null;

    panel.replaceChildren(
      back,
      banner(),
      ...(emptyCard ? [emptyCard] : []), // replaceChildren would print "null"
      h('div', { class: 'card result-head' },
        h('h2', {}, data.affidavit ? `Check of ${data.affidavit}` : 'Reports cross-check'),
        h('p', { class: 'muted' }, `${data.created ? fmtDateTime(Date.parse(data.created)) : ''} · `,
          data.engine && data.engine.mode === 'ai' ? `Rules + AI (${data.engine.model})` : 'Rules only', ' · ', summaryOpen),
        h('ul', { class: 'doc-list' }, docsLine),
        st ? h('p', { class: 'small' },
          `AI reviewed ${st.reviewed} of ${st.statements} statements: ${st.supported} supported, ${st.contradicted} contradicted, ${st.notFound} not found.`,
          st.discarded ? h('strong', {}, ` ${st.discarded} AI answer${st.discarded === 1 ? ' was' : 's were'} discarded because the quoted text was not found in the reports.`) : '') : null,
        data.ai && !data.ai.complete ? h('p', { class: 'warn-text small' }, `The AI review did not finish${data.ai.error ? ` (${data.ai.error})` : ''}. Statements after that point were not reviewed by AI.`) : null,
        h('div', { class: 'row result-foot' },
          h('p', { class: 'muted small explain' }, `Saved on the SSD: ${Vault.isArchived(c.id) ? 'archive' : 'cases'}\\${c.id}\\checks\\${name}`),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: () => deleteCheck(c, name, data) }, 'Delete this check'))),
      h('div', { class: 'filters' }, sevChips, h('div', { class: 'spacer' }), layerSel, statusSel),
      list);
    draw();
  }

  async function deleteCheck(c, name, data) {
    const { confirmDialog, Save, toast, go } = ui;
    const when = data.created ? ui.fmtDateTime(Date.parse(data.created)) : name;
    const ok = await confirmDialog({
      title: 'Delete this check?',
      message: `The check of ${data.affidavit || 'the reports'} from ${when} is deleted from the SSD, with its flags and notes. The documents themselves are not touched.`,
      confirmText: 'Delete check',
      danger: true,
    });
    if (!ok) return;
    const key = `check:${c.id}:${name}`;
    const pending = Save.timers.get(key);
    if (pending) { clearTimeout(pending.timer); Save.timers.delete(key); }
    try {
      await Save.track(`delete-check:${c.id}:${name}`, () => Vault.deleteCheck(c.id, name));
      toast('Check deleted.');
      go(c.id, 'checks');
    } catch { /* reported by Save */ }
  }

  function flagCard(c, data, f, save, onChange) {
    const { h } = ui;
    const note = h('textarea', { rows: 2, class: 'flag-note', placeholder: 'Explain how this was resolved. It is saved with the check.', 'aria-label': 'Note' });
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

    const quote = (loc, label) => h('button', { 'data-ro-ok': 'true', type: 'button', class: 'quote', title: 'Show this in the document', onclick: () => openLocation(c, data, loc) },
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
    const info = (data.documents || []).find((d) => d.name === loc.doc);
    let doc;
    try {
      doc = await documentText(c, loc.doc, () => {}, info);
    } catch (err) {
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return ui.onDriveLost();
      return toast(err.message, 'error');
    }
    const changed = info && info.size != null && (info.size !== doc.size || info.modified !== doc.modified);
    await openDialog((close) => {
      let lastPage = null;
      const body = h('div', { class: 'doc-view' });
      for (const p of doc.paragraphs) {
        const section = p.sheet != null ? `Sheet: ${p.sheet}` : p.field != null ? 'Form fields' : p.page ? `Page ${p.page}` : null;
        if (section && section !== lastPage) { body.append(h('div', { class: 'doc-page' }, section)); lastPage = section; }
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
          h('span', { class: 'muted small' }, at(loc) || ''),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => {
            close();
            if (info && info.kind === 'draft') ui.go(c.id, 'drafts', info.draft);
            else ui.previewFile(c, loc.doc, loc.page, loc.sheet != null ? { sheet: loc.sheet, row: loc.row } : loc.field != null ? { field: loc.field } : null);
          } }, info && info.kind === 'draft' ? 'Open draft' : 'Open original'),
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
    if (typeof CVWebLLM !== 'undefined') CVWebLLM.onProgress(showLoadProgress);
    const pill = document.getElementById('engine-status');
    if (pill) pill.addEventListener('click', () => { if (Vault.data) showEngineDialog(); });
    setInterval(() => { if (!document.hidden && Vault.data) Engine.refresh(); }, 60000);
    if (typeof CVHardware !== 'undefined') {
      CVHardware.onChange(() => { if (Vault.data) renderPill(); });
      CVHardware.probeGpu();
    }
  }

  function onVaultOpen() {
    renderPill();
    Engine.refresh();
  }

  /** Run a consistency check on a draft against every checkable attached document,
   *  except the draft's own exported copies (draft.exclude). */
  async function checkDraft(c, draft) {
    const skip = new Set(draft.exclude || []);
    const reports = (await checkableFiles(c)).map((f) => f.name).filter((n) => !skip.has(n));
    if (!reports.length) {
      ui.toast('Attach the reports on the Files tab first, then run the check again.', 'error', 8000);
      return;
    }
    await Engine.refresh();
    const useAI = Engine.status() === 'connected' && !!Engine.choice();
    return runCheck(c, `Draft: ${draft.title}`, reports, useAI, draft);
  }

  root.CVChecks = { init, render, onVaultOpen, renderPill, Engine, documentText, checkDraft, profileLabel };
})(this);
