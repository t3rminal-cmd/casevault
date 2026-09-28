/* CaseVault — user interface.
 * Plain DOM code, no framework. Data flows: UI -> Vault (vault.js) -> SSD (fs.js).
 */
'use strict';

(() => {
  /* =====================================================================
   * Small helpers
   * ===================================================================== */

  const $ = (sel, el = document) => el.querySelector(sel);

  // h('div', {class: 'x', onclick: fn}, 'text', childNode, [more])
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else if (k === 'html') el.innerHTML = v; // only ever used with Markdown.render output (escaped)
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const today = () => Vault.localDay();

  function fmtDate(s) {
    if (!s) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(ms) {
    const d = new Date(ms);
    return `${fmtDate(Vault.localDay(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtSize(n) {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let u = -1;
    do { n /= 1024; u++; } while (n >= 1024 && u < units.length - 1);
    return `${n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`;
  }

  function daysUntil(dateStr) {
    const a = new Date(today() + 'T00:00:00');
    const b = new Date(dateStr + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  function dueLabel(dateStr) {
    const n = daysUntil(dateStr);
    if (n < 0) return { text: `${-n} day${n === -1 ? '' : 's'} overdue`, cls: 'overdue' };
    if (n === 0) return { text: 'due today', cls: 'soon' };
    if (n === 1) return { text: 'due tomorrow', cls: 'soon' };
    return { text: `in ${n} days`, cls: n <= 7 ? 'soon' : '' };
  }

  const parseTags = (s) => [...new Set(String(s).split(',').map((t) => t.trim()).filter(Boolean))];
  const statusPill = (status) => h('span', { class: `pill status-${String(status).toLowerCase()}` }, status);

  function toast(message, kind = 'info', ms = 4000) {
    const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
    $('#toasts').append(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* =====================================================================
   * Dialogs
   * ===================================================================== */

  const dialogEl = $('#dialog');

  function openDialog(build) {
    return new Promise((resolve) => {
      dialogEl.replaceChildren();
      let done = false;
      const close = (value) => {
        if (done) return;
        done = true;
        dialogEl.close();
        resolve(value);
      };
      dialogEl.onclose = () => { if (!done) { done = true; resolve(undefined); } };
      dialogEl.append(build(close));
      dialogEl.showModal();
      const focus = dialogEl.querySelector('[autofocus]') || dialogEl.querySelector('input, textarea, select, button');
      if (focus) focus.focus();
    });
  }

  function confirmDialog({ title, message, confirmText = 'OK', danger = false, requireText = '' }) {
    return openDialog((close) => {
      const typed = requireText ? h('input', { type: 'text', autocomplete: 'off', 'aria-label': `Type ${requireText} to confirm` }) : null;
      const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'submit', disabled: !!requireText }, confirmText);
      if (typed) typed.addEventListener('input', () => { ok.disabled = typed.value.trim() !== requireText; });
      return h('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); if (!ok.disabled) close(true); } },
        h('h2', {}, title),
        typeof message === 'string' ? h('p', {}, message) : message,
        typed && h('label', { class: 'field' }, h('span', {}, `Type ${requireText} to confirm`), typed),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
          ok));
    });
  }

  /* =====================================================================
   * Autosave + "Saved to SSD" indicator
   * ===================================================================== */

  const Save = {
    timers: new Map(),  // key -> { timer, fn }
    failed: new Map(),  // key -> fn  (retried after reconnect)
    running: 0,
    lastSaved: null,

    // Queue a save. Repeated calls with the same key within `delay` collapse into one write.
    schedule(key, fn, delay = 500) {
      const prev = this.timers.get(key);
      if (prev) clearTimeout(prev.timer);
      this.failed.delete(key);
      const timer = setTimeout(() => this.run(key, fn).catch(() => {}), delay); // errors surface via the indicator
      this.timers.set(key, { timer, fn });
      this.render();
    },

    // Run a save now and report the result through the indicator.
    async run(key, fn) {
      const pending = this.timers.get(key);
      if (pending) clearTimeout(pending.timer);
      this.timers.delete(key);
      this.running++;
      this.render();
      try {
        const result = await fn();
        this.failed.delete(key);
        this.lastSaved = new Date();
        afterSave();
        return result;
      } catch (err) {
        if (FS.isDisconnectError(err)) {
          this.failed.set(key, fn);
          onDriveLost();
        } else {
          console.error(err);
          toast(`Could not save: ${err.message}`, 'error', 8000);
        }
        throw err;
      } finally {
        this.running--;
        this.render();
      }
    },

    // For one-off actions (add file, delete event) that should show in the indicator.
    track(key, fn) {
      return this.run(key, fn);
    },

    flushAll() {
      return Promise.allSettled([...this.timers.entries()].map(([key, { fn }]) => this.run(key, fn)));
    },

    async retryFailed() {
      const jobs = [...this.failed.entries()];
      this.failed.clear();
      await Promise.allSettled(jobs.map(([key, fn]) => this.run(key, fn)));
    },

    discardAll() {
      for (const { timer } of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
      this.failed.clear();
      this.render();
    },

    busy() {
      return this.running > 0 || this.timers.size > 0 || this.failed.size > 0;
    },

    render() {
      const el = $('#save-status');
      if (!state.connected && !this.failed.size) { el.className = 'save-status'; el.textContent = ''; return; }
      if (this.failed.size) {
        el.className = 'save-status error';
        el.textContent = `Not saved — reconnect SSD (${this.failed.size})`;
      } else if (this.running || this.timers.size) {
        el.className = 'save-status saving';
        el.textContent = 'Saving…';
      } else if (this.lastSaved) {
        el.className = 'save-status saved';
        el.textContent = `Saved to SSD ${pad(this.lastSaved.getHours())}:${pad(this.lastSaved.getMinutes())}:${pad(this.lastSaved.getSeconds())}`;
      } else {
        el.className = 'save-status saved';
        el.textContent = 'Connected to SSD';
      }
    },
  };

  const afterSave = debounce(() => renderCaseList(), 150);

  /* =====================================================================
   * App state
   * ===================================================================== */

  const state = {
    connected: false,
    vaultId: null,
    caseId: null,
    tab: 'details',
    caseObj: null,
    renderToken: 0,
    drive: '',
  };

  /* =====================================================================
   * Connecting to the SSD
   * ===================================================================== */

  const gate = $('#gate');

  function showGate(message, detail = '', actions = []) {
    $('#gate-message').textContent = message;
    $('#gate-detail').textContent = detail;
    $('#gate-actions').replaceChildren(...actions.map((a) =>
      h('button', { class: `btn ${a.primary ? 'primary' : ''}`, type: 'button', onclick: a.onClick }, a.label)));
    gate.hidden = false;
    document.body.classList.add('gated');
    const first = $('#gate-actions button');
    if (first) first.focus();
  }

  function hideGate() {
    gate.hidden = true;
    document.body.classList.remove('gated');
  }

  const unsavedNote = () => Save.failed.size
    ? `${Save.failed.size} unsaved change${Save.failed.size === 1 ? ' is' : 's are'} waiting in this window and will be saved when you reconnect. Don't close this tab.`
    : '';

  // Direct mode: Chrome/Edge open the SSD folder themselves (File System Access API).
  // Helper mode: other browsers (Firefox) go through the CaseVault helper on 127.0.0.1.
  const MODE = ('showDirectoryPicker' in window && window.isSecureContext) ? 'direct' : 'helper';
  document.body.dataset.mode = MODE;

  const actPick = MODE === 'direct' ? { label: 'Choose folder…', onClick: () => pickFolder() } : null;
  const actReconnect = { label: 'Reconnect', primary: true, onClick: () => reconnect() };
  const acts = (...list) => list.filter(Boolean);

  function gateWelcome() {
    showGate(
      'Choose your CaseVault folder on the SSD.',
      'Pick the CaseVault partition (for example V:\\) or its CaseVault-Data folder. If there is no vault yet, CaseVault will offer to create one.',
      [{ label: 'Choose folder…', primary: true, onClick: () => pickFolder() }]);
  }

  function gateReconnect(name) {
    showGate(
      `Welcome back. Click Reconnect to open "${name}" on your SSD.`,
      'Your browser asks for permission once per session. This keeps other websites from ever reading your drive.',
      acts(actReconnect, actPick));
  }

  function gateMissing(extra = '') {
    const hint = MODE === 'direct'
      ? 'If Windows gave the drive a different letter, click "Choose folder…" and pick the CaseVault-Data folder again.'
      : 'Unlock the CASEVAULT drive with your BitLocker password if Windows asks. The helper finds it on any drive letter.';
    showGate(
      'Drive not connected. Plug in your SSD and click Reconnect.',
      [extra, unsavedNote(), hint].filter(Boolean).join(' '),
      acts(actReconnect, actPick));
  }

  function gateHelperDown() {
    showGate(
      'The CaseVault helper is not running.',
      [unsavedNote(), 'Double-click Start-CaseVault.bat on the CV-AI drive (for example W:\\), keep its window open, then click Reconnect.'].filter(Boolean).join(' '),
      [actReconnect]);
  }

  function gateUnsupported() {
    if (MODE === 'helper') {
      return showGate(
        'In this browser, CaseVault runs through the CaseVault helper.',
        'Plug in and unlock the SSD, then double-click Start-CaseVault.bat on the CV-AI drive (for example W:\\). It opens CaseVault at http://127.0.0.1:8517/. Or use Chrome or Edge, which can open the SSD directly.',
        [{ label: 'Open http://127.0.0.1:8517/', primary: true, onClick: () => { location.href = HelperFS.DEFAULT_URL; } }]);
    }
    showGate('This browser can\'t open folders on your SSD.', 'Use Chrome, Edge, or Firefox on a desktop computer.', []);
  }

  function gateError(err) {
    showGate('Could not open the vault.', err.message || String(err), acts(
      { label: 'Try again', primary: true, onClick: () => reconnect() }, actPick));
  }

  function gateCreate(parent) {
    const where = parent.name === Vault.DATA_DIR ? `"${parent.name}"` : `"${parent.name}\\${Vault.DATA_DIR}"`;
    showGate(
      `No vault found in "${parent.name}".`,
      `Create a new, empty vault at ${where}? Nothing else in that folder is touched.`,
      acts({
        label: 'Create vault here', primary: true, onClick: async () => {
          try { await openVault(await Vault.create(parent)); } catch (err) { handleOpenError(err); }
        },
      }, actPick && { label: 'Choose a different folder…', onClick: () => pickFolder() }));
  }

  async function pickFolder() {
    let picked;
    try {
      picked = await window.showDirectoryPicker({ id: 'casevault', mode: 'readwrite' });
    } catch (err) {
      if (err.name === 'AbortError') return;
      return gateError(err);
    }
    try {
      const r = await Vault.resolve(picked);
      if (r.found) return openVault(r.dir);
      gateCreate(r.parent);
    } catch (err) {
      handleOpenError(err);
    }
  }

  async function connectHelper() {
    let info;
    try { info = await HelperFS.info(); } catch { return gateHelperDown(); }
    if (!info.ready) return gateMissing();
    state.drive = info.drive || '';
    try {
      const r = await Vault.resolve(HelperFS.root(info.root));
      if (r.found) return openVault(r.dir);
      gateCreate(r.parent);
    } catch (err) {
      handleOpenError(err);
    }
  }

  async function reconnect() {
    if (MODE === 'helper') return connectHelper();
    const handle = await HandleStore.load();
    if (!handle) return gateWelcome();
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        return showGate('CaseVault needs permission to read and write the vault folder.',
          'Click Reconnect and choose "Allow" (or "Allow on every visit") when the browser asks.',
          acts(actReconnect, actPick));
      }
      const r = await Vault.resolve(handle);
      if (!r.found) return gateMissing('The saved folder is there, but it has no vault.json.');
      await openVault(r.dir);
    } catch (err) {
      handleOpenError(err);
    }
  }

  // Work out whether the drive or (in helper mode) the helper went away, and show the right screen.
  async function gateLost() {
    if (MODE === 'helper') {
      try {
        const info = await HelperFS.info();
        if (info.ready && state.connected) return;
      } catch { return gateHelperDown(); }
    }
    gateMissing();
  }

  function handleOpenError(err) {
    if (err && (err.name === 'NotFoundError' || err.name === 'NotReadableError' || err.name === 'InvalidStateError')) return gateLost();
    console.error(err);
    gateError(err);
  }

  async function openVault(dir) {
    const previousId = state.vaultId;
    const data = await Vault.load(dir);
    if (previousId && data.vaultId !== previousId && (Save.failed.size || Save.timers.size)) {
      const drop = await confirmDialog({
        title: 'This is a different vault',
        message: `You have ${Save.failed.size + Save.timers.size} unsaved change(s) from the previous vault. They cannot be saved into a different vault. Reconnect the original SSD to keep them, or continue and discard them.`,
        confirmText: 'Discard and continue',
        danger: true,
      });
      if (!drop) { Vault.close(); return gateMissing(); }
      Save.discardAll();
    }
    if (MODE === 'direct') await HandleStore.save(dir);
    const sameVault = previousId === data.vaultId;
    state.connected = true;
    state.vaultId = data.vaultId;
    $('#vault-name').textContent = MODE === 'helper' ? `${state.drive.replace(/[\\/]+$/, '')} ${dir.name}`.trim() : dir.name;
    hideGate();
    Save.render();
    if (sameVault) await Save.retryFailed();
    else { state.caseId = null; state.caseObj = null; }
    renderCaseList();
    route();
    CVChecks.onVaultOpen();
  }

  function onDriveLost() {
    if (!state.connected) return;
    state.connected = false;
    Save.render();
    gateLost();
  }

  // Heartbeat: notice an unplugged drive (or a stopped helper) within a few seconds.
  setInterval(async () => {
    if (!state.connected || document.hidden) return;
    try { await Vault.ping(); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); }
  }, 4000);

  async function launch() {
    if (MODE === 'helper') return HelperFS.servedByHelper ? connectHelper() : gateUnsupported();
    const handle = await HandleStore.load();
    if (!handle) return gateWelcome();
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'readwrite' }); } catch { /* treat as prompt */ }
    if (perm !== 'granted') return gateReconnect(handle.name);
    try {
      const r = await Vault.resolve(handle);
      if (!r.found) return gateMissing('The saved folder has no vault.json.');
      await openVault(r.dir);
    } catch (err) {
      handleOpenError(err);
    }
  }


  /* =====================================================================
   * Sidebar: case list
   * ===================================================================== */

  function filteredCases() {
    const q = $('#case-search').value.trim().toLowerCase();
    const f = $('#case-filter').value;
    return (Vault.data?.cases || [])
      .filter((c) => f === 'all' || (f === 'active' ? c.status === 'Open' || c.status === 'Pending' : c.status === f))
      .filter((c) => !q || [c.title, c.number, c.client, ...(c.tags || [])].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }

  function renderCaseList() {
    const list = $('#case-list');
    if (!Vault.data) { list.replaceChildren(); return; }
    const cases = filteredCases();
    if (!cases.length) {
      list.replaceChildren(h('li', { class: 'empty muted' },
        Vault.data.cases.length ? 'No cases match.' : 'No cases yet. Click "+ New case".'));
      return;
    }
    list.replaceChildren(...cases.map((c) => {
      const due = c.nextDeadline ? dueLabel(c.nextDeadline.date) : null;
      return h('li', {},
        h('a', {
          href: `#/case/${encodeURIComponent(c.id)}`,
          class: `case-item ${c.id === state.caseId ? 'active' : ''}`,
          'aria-current': c.id === state.caseId ? 'page' : null,
        },
        h('div', { class: 'case-item-top' }, h('span', { class: 'case-item-title' }, c.title || 'Untitled case'), statusPill(c.status)),
        h('div', { class: 'case-item-meta muted' }, [c.number, c.client].filter(Boolean).join(' · ') || '\u00a0'),
        due && h('div', { class: `case-item-due ${due.cls}` }, `⏰ ${c.nextDeadline.title || 'Deadline'}: ${due.text}`)));
    }));
  }

  $('#case-search').addEventListener('input', debounce(renderCaseList, 120));
  $('#case-filter').addEventListener('change', renderCaseList);

  /* =====================================================================
   * Routing: #/  or  #/case/<id>/<tab>
   * ===================================================================== */

  function go(caseId, tab, sub) {
    location.hash = caseId ? `#/case/${encodeURIComponent(caseId)}/${tab || 'details'}${sub ? `/${encodeURIComponent(sub)}` : ''}` : '#/';
  }

  function route() {
    if (!state.connected) return;
    const m = location.hash.match(/^#\/case\/([^/]+)(?:\/(\w+))?(?:\/([^/]+))?/);
    if (m) showCase(decodeURIComponent(m[1]), m[2] || 'details', m[3] || null);
    else showDashboard();
  }

  window.addEventListener('hashchange', () => { Save.flushAll(); route(); });

  /* =====================================================================
   * Dashboard
   * ===================================================================== */

  function showDashboard() {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
    const cases = Vault.data.cases;
    const count = (s) => cases.filter((c) => c.status === s).length;
    const deadlines = cases.filter((c) => c.nextDeadline && c.status !== 'Closed' && c.status !== 'Archived')
      .sort((a, b) => (a.nextDeadline.date + a.nextDeadline.time).localeCompare(b.nextDeadline.date + b.nextDeadline.time));
    const recent = [...cases].sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 8);

    $('#main').replaceChildren(h('section', { class: 'dashboard' },
      h('h1', {}, 'Overview'),
      h('div', { class: 'stats' },
        ...Vault.STATUSES.map((s) => h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, count(s)), h('div', { class: 'stat-label' }, s)))),
      h('h2', {}, 'Upcoming deadlines'),
      deadlines.length
        ? h('ul', { class: 'plain-list' }, deadlines.map((c) => {
          const due = dueLabel(c.nextDeadline.date);
          return h('li', {}, h('a', { href: `#/case/${encodeURIComponent(c.id)}/timeline`, class: 'row-link' },
            h('span', { class: `due ${due.cls}` }, `${fmtDate(c.nextDeadline.date)}${c.nextDeadline.time ? ' ' + c.nextDeadline.time : ''}`),
            h('span', {}, h('strong', {}, c.nextDeadline.title || 'Deadline'), ' — ', c.title),
            h('span', { class: `due ${due.cls}` }, due.text)));
        }))
        : h('p', { class: 'muted' }, 'No open deadlines. Add them from a case\'s Timeline tab.'),
      h('h2', {}, 'Recently updated'),
      recent.length
        ? h('ul', { class: 'plain-list' }, recent.map((c) => h('li', {}, h('a', { href: `#/case/${encodeURIComponent(c.id)}`, class: 'row-link' },
          h('span', {}, h('strong', {}, c.title || 'Untitled case'), c.number ? ` · ${c.number}` : ''),
          statusPill(c.status),
          h('span', { class: 'muted' }, c.updated ? fmtDateTime(Date.parse(c.updated)) : '')))))
        : h('p', { class: 'muted' }, 'Create your first case with "+ New case".')));
  }

  /* =====================================================================
   * New case
   * ===================================================================== */

  async function newCase() {
    if (!state.connected) return;
    const result = await openDialog((close) => {
      const form = h('form', { class: 'form-grid', onsubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        close({
          title: fd.get('title').trim(), number: fd.get('number').trim(), client: fd.get('client').trim(),
          status: fd.get('status'), opened: fd.get('opened'), tags: parseTags(fd.get('tags')),
        });
      } },
      h('h2', { class: 'span-2' }, 'New case'),
      field('Title', h('input', { name: 'title', required: true, autofocus: true, maxlength: 200 }), 'span-2'),
      field('Case / file number', h('input', { name: 'number', maxlength: 100 })),
      field('Client', h('input', { name: 'client', maxlength: 200 })),
      field('Status', h('select', { name: 'status' }, Vault.STATUSES.map((s) => h('option', {}, s)))),
      field('Opened', h('input', { name: 'opened', type: 'date', value: today() })),
      field('Tags (comma separated)', h('input', { name: 'tags', maxlength: 300 }), 'span-2'),
      h('div', { class: 'dialog-actions span-2' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Create case')));
      return form;
    });
    if (!result) return;
    try {
      const c = await Save.track('new-case', () => Vault.createCase(result));
      renderCaseList();
      go(c.id, 'details');
    } catch { /* reported by Save */ }
  }

  function field(label, input, cls = '') {
    return h('label', { class: `field ${cls}` }, h('span', {}, label), input);
  }

  $('#btn-new-case').addEventListener('click', newCase);

  /* =====================================================================
   * Case view
   * ===================================================================== */

  const TABS = [['details', 'Details'], ['notes', 'Notes'], ['timeline', 'Timeline'], ['files', 'Files'], ['checks', 'Checks']];

  async function showCase(id, tab, sub = null) {
    const token = ++state.renderToken;
    if (!TABS.some(([t]) => t === tab)) tab = 'details';
    try {
      if (state.caseId !== id || !state.caseObj) {
        state.caseObj = await Vault.getCase(id);
      }
    } catch (err) {
      if (token !== state.renderToken) return;
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return onDriveLost();
      toast(err.name === 'CaseMissingError' || err.name === 'NotFoundError'
        ? 'That case folder is no longer on the SSD. The case list has been refreshed.'
        : `Could not open case: ${err.message}`, 'error', 7000);
      await Vault.rebuildIndex().catch(() => {});
      return go(null);
    }
    if (token !== state.renderToken) return;
    state.caseId = id;
    state.tab = tab;
    renderCaseList();

    const c = state.caseObj;
    const panel = h('div', { class: 'tab-panel', role: 'tabpanel' });
    $('#main').replaceChildren(h('section', { class: 'case' },
      h('div', { class: 'case-head' },
        h('h1', { id: 'case-title' }, c.title || 'Untitled case'),
        h('div', { class: 'case-sub muted', id: 'case-sub' }, caseSubtitle(c))),
      h('nav', { class: 'tabs', role: 'tablist' }, TABS.map(([t, label]) =>
        h('a', { href: `#/case/${encodeURIComponent(id)}/${t}`, role: 'tab', class: `tab ${t === tab ? 'active' : ''}`, 'aria-selected': String(t === tab) }, label))),
      panel));

    const renderers = { details: renderDetails, notes: renderNotes, timeline: renderTimeline, files: renderFiles, checks: (...a) => CVChecks.render(...a) };
    try {
      await renderers[tab](panel, c, token, sub);
    } catch (err) {
      if (FS.isDisconnectError(err)) return onDriveLost();
      console.error(err);
      panel.replaceChildren(h('p', { class: 'error-text' }, `Could not load this tab: ${err.message}`));
    }
  }

  function caseSubtitle(c) {
    return [c.number && `No. ${c.number}`, c.client, statusPill(c.status), c.dates.opened && `Opened ${fmtDate(c.dates.opened)}`]
      .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
  }

  function refreshCaseHeader(c) {
    const title = $('#case-title');
    if (title) title.textContent = c.title || 'Untitled case';
    const sub = $('#case-sub');
    if (sub) sub.replaceChildren(...caseSubtitle(c));
  }

  /* ---------- Details ---------- */

  function renderDetails(panel, c) {
    const save = () => {
      refreshCaseHeader(c);
      const snapshot = structuredClone(c);
      Save.schedule(`case:${c.id}`, () => Vault.saveCase(snapshot), 600);
    };
    const bind = (input, apply) => { input.addEventListener('input', () => { apply(input.value); save(); }); return input; };

    const closedInput = h('input', { type: 'date', value: c.dates.closed || '' });
    const statusSelect = h('select', {}, Vault.STATUSES.map((s) => h('option', { selected: s === c.status }, s)));
    statusSelect.addEventListener('change', () => {
      c.status = statusSelect.value;
      if ((c.status === 'Closed' || c.status === 'Archived') && !c.dates.closed) {
        c.dates.closed = today();
        closedInput.value = c.dates.closed;
      }
      save();
    });

    panel.replaceChildren(
      h('form', { class: 'form-grid', onsubmit: (e) => e.preventDefault() },
        field('Title', bind(h('input', { value: c.title, maxlength: 200 }), (v) => { c.title = v; }), 'span-2'),
        field('Case / file number', bind(h('input', { value: c.number, maxlength: 100 }), (v) => { c.number = v; })),
        field('Client', bind(h('input', { value: c.client, maxlength: 200 }), (v) => { c.client = v; })),
        field('Status', statusSelect),
        field('Tags (comma separated)', bind(h('input', { value: c.tags.join(', '), maxlength: 300 }), (v) => { c.tags = parseTags(v); })),
        field('Opened', bind(h('input', { type: 'date', value: c.dates.opened || '' }), (v) => { c.dates.opened = v; })),
        field('Closed', bind(closedInput, (v) => { c.dates.closed = v; })),
        h('p', { class: 'muted span-2 small' },
          `Created ${c.dates.created ? fmtDateTime(Date.parse(c.dates.created)) : '—'} · Folder: cases\\${c.id}`)),
      h('div', { class: 'danger-zone' },
        h('h3', {}, 'Delete case'),
        h('p', { class: 'muted' }, 'Permanently removes this case folder from the SSD, including notes, timeline, and every attached file. To keep it, set the status to Archived instead.'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => deleteCase(c) }, 'Delete case…')));
  }

  async function deleteCase(c) {
    const ok = await confirmDialog({
      title: `Delete "${c.title}"?`,
      message: 'This permanently deletes the case folder and all its files from the SSD. It cannot be undone.',
      confirmText: 'Delete permanently',
      danger: true,
      requireText: 'DELETE',
    });
    if (!ok) return;
    const t = Save.timers.get(`case:${c.id}`);
    if (t) { clearTimeout(t.timer); Save.timers.delete(`case:${c.id}`); }
    try {
      await Save.track(`delete:${c.id}`, () => Vault.deleteCase(c.id));
      state.caseObj = null;
      toast('Case deleted.');
      go(null);
    } catch { /* reported by Save */ }
  }

  /* ---------- Notes ---------- */

  async function renderNotes(panel, c, token) {
    const text = await Vault.getNotes(c.id);
    if (token !== state.renderToken) return;
    const ta = h('textarea', { class: 'notes-editor', spellcheck: 'true', 'aria-label': 'Case notes', placeholder: 'Write notes here. Markdown works: # Heading, **bold**, - list items.' });
    ta.value = text;
    const preview = h('div', { class: 'notes-preview', hidden: true });
    const counter = h('span', { class: 'muted small' });
    const updateCount = () => {
      const words = (ta.value.match(/\S+/g) || []).length;
      counter.textContent = `${words} word${words === 1 ? '' : 's'} · notes.md`;
    };
    updateCount();

    ta.addEventListener('input', () => {
      updateCount();
      const value = ta.value;
      Save.schedule(`notes:${c.id}`, () => Vault.saveNotes(c.id, value), 700);
    });

    const btnEdit = h('button', { class: 'btn small active', type: 'button' }, 'Edit');
    const btnPreview = h('button', { class: 'btn small', type: 'button' }, 'Preview');
    btnEdit.addEventListener('click', () => {
      preview.hidden = true; ta.hidden = false; ta.focus();
      btnEdit.classList.add('active'); btnPreview.classList.remove('active');
    });
    btnPreview.addEventListener('click', () => {
      preview.innerHTML = Markdown.render(ta.value) || '<p class="muted">Nothing written yet.</p>';
      preview.hidden = false; ta.hidden = true;
      btnPreview.classList.add('active'); btnEdit.classList.remove('active');
    });

    panel.replaceChildren(
      h('div', { class: 'toolbar' }, h('div', { class: 'segmented' }, btnEdit, btnPreview), h('div', { class: 'spacer' }), counter),
      ta, preview);
  }

  /* ---------- Timeline ---------- */

  async function renderTimeline(panel, c, token) {
    const tl = await Vault.getTimeline(c.id);
    if (token !== state.renderToken) return;
    let editingId = null;

    const f = {
      date: h('input', { type: 'date', required: true, value: today() }),
      time: h('input', { type: 'time' }),
      kind: h('select', {}, h('option', { value: 'event' }, 'Event'), h('option', { value: 'deadline' }, 'Deadline')),
      title: h('input', { required: true, maxlength: 200, placeholder: 'What happened / what is due' }),
      note: h('textarea', { rows: 2, maxlength: 4000, placeholder: 'Details (optional)' }),
    };
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Add to timeline');
    const cancel = h('button', { class: 'btn', type: 'button', hidden: true }, 'Cancel');
    const list = h('ol', { class: 'timeline' });

    const persist = () => {
      const snapshot = structuredClone(tl);
      return Save.track(`timeline:${c.id}`, () => Vault.saveTimeline(c.id, snapshot)).catch(() => {});
    };

    const resetForm = () => {
      editingId = null;
      f.title.value = ''; f.note.value = ''; f.time.value = '';
      submit.textContent = 'Add to timeline';
      cancel.hidden = true;
    };
    cancel.addEventListener('click', resetForm);

    const form = h('form', { class: 'timeline-form', onsubmit: async (e) => {
      e.preventDefault();
      const data = { date: f.date.value, time: f.time.value, kind: f.kind.value, title: f.title.value.trim(), note: f.note.value.trim() };
      if (!data.date || !data.title) return;
      if (editingId) {
        const ev = tl.events.find((x) => x.id === editingId);
        if (ev) Object.assign(ev, data, { updated: new Date().toISOString() });
      } else {
        tl.events.push({ id: Vault.newId('e'), ...data, done: false, created: new Date().toISOString() });
      }
      Vault.sortEvents(tl.events);
      resetForm();
      draw();
      await persist();
      f.title.focus();
    } },
    field('Date', f.date), field('Time', f.time), field('Type', f.kind),
    field('Title', f.title, 'grow'),
    field('Note', f.note, 'full'),
    h('div', { class: 'full form-actions' }, cancel, submit));

    function draw() {
      if (!tl.events.length) {
        list.replaceChildren(h('li', { class: 'muted empty' }, 'No events yet. Add dates, hearings, filings, and deadlines above.'));
        return;
      }
      list.replaceChildren(...tl.events.map((ev) => {
        const isDeadline = ev.kind === 'deadline';
        const due = isDeadline && !ev.done ? dueLabel(ev.date) : null;
        const done = isDeadline ? h('input', { type: 'checkbox', checked: !!ev.done, 'aria-label': 'Done', title: 'Mark done' }) : null;
        if (done) done.addEventListener('change', () => { ev.done = done.checked; draw(); persist(); });
        return h('li', { class: `tl-item ${ev.kind} ${ev.done ? 'done' : ''} ${due ? due.cls : ''}` },
          h('div', { class: 'tl-when' }, h('div', {}, fmtDate(ev.date)), ev.time && h('div', { class: 'muted small' }, ev.time)),
          h('div', { class: 'tl-body' },
            h('div', { class: 'tl-title' },
              done,
              h('span', { class: `badge ${ev.kind}` }, isDeadline ? 'Deadline' : 'Event'),
              h('strong', {}, ev.title),
              due && h('span', { class: `due ${due.cls}` }, due.text)),
            ev.note && h('div', { class: 'tl-note' }, ev.note)),
          h('div', { class: 'tl-actions' },
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
              editingId = ev.id;
              f.date.value = ev.date; f.time.value = ev.time || ''; f.kind.value = ev.kind;
              f.title.value = ev.title; f.note.value = ev.note || '';
              submit.textContent = 'Save changes'; cancel.hidden = false;
              f.title.focus();
            } }, 'Edit'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              if (!(await confirmDialog({ title: 'Delete this entry?', message: `"${ev.title}" on ${fmtDate(ev.date)}`, confirmText: 'Delete', danger: true }))) return;
              tl.events = tl.events.filter((x) => x.id !== ev.id);
              if (editingId === ev.id) resetForm();
              draw();
              persist();
            } }, 'Delete')));
      }));
    }

    draw();
    panel.replaceChildren(form, list);
  }

  /* ---------- Files ---------- */

  const PREVIEWABLE = {
    pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image-svg',
    txt: 'text', md: 'text', csv: 'text', json: 'text', log: 'text', xml: 'text',
    mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', mp4: 'video', webm: 'video', mov: 'video',
  };
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

  async function renderFiles(panel, c, token) {
    const files = await Vault.listFiles(c.id);
    if (token !== state.renderToken) return;

    const input = h('input', { type: 'file', multiple: true, hidden: true });
    input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
    const drop = h('div', { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Add files' },
      h('strong', {}, 'Drop files here'), ' or ', h('span', { class: 'link' }, 'choose files'),
      h('div', { class: 'muted small' }, 'Files are copied into this case\'s files folder on the SSD. The originals are not changed.'));
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      addFiles([...e.dataTransfer.files]);
    });

    async function addFiles(list) {
      if (!list.length) return;
      const note = toast(`Copying ${list.length} file${list.length === 1 ? '' : 's'} to SSD…`, 'info', 600000);
      let copied = 0;
      for (const file of list) {
        try {
          await Save.track(`file:${c.id}:${file.name}`, () => Vault.addFile(c.id, file));
          copied++;
        } catch { break; }
      }
      note.remove();
      if (copied) toast(`Copied ${copied} file${copied === 1 ? '' : 's'} to the SSD.`, 'success');
      if (state.caseId === c.id && state.tab === 'files') showCase(c.id, 'files');
    }

    const table = files.length
      ? h('table', { class: 'files' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', { class: 'num' }, 'Size'), h('th', {}, 'Added'), h('th', {}, ''))),
        h('tbody', {}, files.map((f) => h('tr', {},
          h('td', {}, h('button', { class: 'linkish', type: 'button', onclick: () => previewFile(c, f.name) }, f.name)),
          h('td', { class: 'num muted' }, fmtSize(f.size)),
          h('td', { class: 'muted' }, fmtDateTime(f.modified)),
          h('td', { class: 'actions' },
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => previewFile(c, f.name) }, 'Open'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              if (!(await confirmDialog({ title: 'Delete this file?', message: `"${f.name}" will be permanently deleted from the SSD.`, confirmText: 'Delete', danger: true }))) return;
              try {
                await Save.track(`file-del:${c.id}:${f.name}`, () => Vault.deleteFile(c.id, f.name));
                showCase(c.id, 'files');
              } catch { /* reported by Save */ }
            } }, 'Delete'))))))
      : h('p', { class: 'muted' }, 'No files attached yet.');

    panel.replaceChildren(drop, input,
      h('p', { class: 'muted small' }, `${files.length} file${files.length === 1 ? '' : 's'} · cases\\${c.id}\\files`),
      table);
  }

  async function previewFile(c, name, page = null) {
    let file;
    try {
      file = await Vault.readFile(c.id, name);
      if (!file) throw Object.assign(new Error('File not found'), { name: 'NotFoundError' });
    } catch (err) {
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return onDriveLost();
      return toast(`Could not open ${name}: ${err.message}`, 'error');
    }
    const ext = extOf(name);
    const kind = PREVIEWABLE[ext];
    const urls = [];
    const blobUrl = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
    const typed = MIME[ext] ? new Blob([file], { type: MIME[ext] }) : file;

    await openDialog((close) => {
      let body;
      if (kind === 'pdf') body = h('iframe', { class: 'preview-frame', src: blobUrl(typed) + (page ? `#page=${page}` : ''), title: name });
      else if (kind === 'image') body = h('img', { class: 'preview-img', src: blobUrl(typed), alt: name });
      else if (kind === 'image-svg') body = h('img', { class: 'preview-img', src: blobUrl(new Blob([file], { type: 'image/svg+xml' })), alt: name });
      else if (kind === 'audio') body = h('audio', { controls: true, src: blobUrl(typed) });
      else if (kind === 'video') body = h('video', { class: 'preview-img', controls: true, src: blobUrl(typed) });
      else if (kind === 'text') {
        body = h('pre', { class: 'preview-text' }, 'Loading…');
        file.slice(0, 2_000_000).text().then((t) => { body.textContent = t; });
      } else {
        body = h('div', { class: 'preview-none' },
          h('p', {}, 'This file type can\'t be shown inside CaseVault.'),
          h('p', {}, 'Open it straight from the SSD in its normal program:'),
          h('code', { class: 'path' }, `${Vault.root.name}\\cases\\${c.id}\\files\\${name}`),
          h('p', { class: 'muted small' }, 'Tip: in File Explorer, paste the folder part of that path after your CaseVault drive letter.'));
      }
      return h('div', { class: 'preview' },
        h('div', { class: 'preview-head' },
          h('h2', {}, name),
          h('span', { class: 'muted small' }, fmtSize(file.size)),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
        body);
    });
    urls.forEach((u) => URL.revokeObjectURL(u));
  }

  /* =====================================================================
   * Vault panel
   * ===================================================================== */

  async function showVaultPanel() {
    if (!state.connected) return;
    let backups = [];
    try { backups = await Vault.listBackups(); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
    const v = Vault.data;
    await openDialog((close) => {
      const keep = h('input', { type: 'number', min: 1, max: 365, value: v.settings.backupsToKeep, class: 'narrow' });
      keep.addEventListener('change', () => {
        const n = Math.max(1, Math.min(365, parseInt(keep.value, 10) || 30));
        keep.value = n;
        Save.track('settings', () => Vault.updateSettings({ backupsToKeep: n })).catch(() => {});
      });
      return h('div', { class: 'vault-panel' },
        h('h2', {}, 'Vault'),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Folder'), h('dd', {}, Vault.root.name),
          h('dt', {}, 'Cases'), h('dd', {}, String(v.cases.length)),
          h('dt', {}, 'Created'), h('dd', {}, v.created ? fmtDateTime(Date.parse(v.created)) : '—'),
          h('dt', {}, 'Vault ID'), h('dd', { class: 'mono small' }, v.vaultId || '—'),
          h('dt', {}, 'App version'), h('dd', {}, Vault.APP_VERSION),
          h('dt', {}, 'Mode'), h('dd', {}, MODE === 'direct' ? 'Direct (browser opens the SSD)' : 'Helper (CaseVault helper on 127.0.0.1)')),
        h('h3', {}, 'Backups'),
        h('p', { class: 'muted' }, `A copy of vault.json is saved to the backups folder once a day. ${backups.length} backup${backups.length === 1 ? '' : 's'} on the SSD${backups[0] ? `, newest: ${backups[0]}` : ''}.`),
        h('p', { class: 'muted small' }, 'This covers the case index and settings. To back up whole cases (notes, timelines, files), copy the entire CaseVault-Data folder to a second encrypted drive.'),
        h('div', { class: 'row' },
          h('label', { class: 'inline' }, 'Keep the newest ', keep, ' backups'),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            try { const name = await Save.track('backup', () => Vault.backupNow()); toast(`Backup saved: ${name}`, 'success'); close(); } catch { /* reported */ }
          } }, 'Back up now')),
        h('h3', {}, 'Maintenance'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            try { await Save.track('reindex', () => Vault.rebuildIndex()); renderCaseList(); toast('Case index rebuilt from the case folders.', 'success'); } catch { /* reported */ }
          } }, 'Rebuild case index'),
          MODE === 'direct' && h('button', { class: 'btn', type: 'button', onclick: async () => { close(); await Save.flushAll(); pickFolder(); } }, 'Open a different vault…'),
          MODE === 'direct' && h('button', { class: 'btn', type: 'button', onclick: async () => {
            close();
            await Save.flushAll();
            if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD first.', 'error');
            await HandleStore.clear();
            Vault.close();
            Object.assign(state, { connected: false, vaultId: null, caseId: null, caseObj: null });
            $('#vault-name').textContent = '';
            $('#main').replaceChildren();
            renderCaseList();
            Save.render();
            gateWelcome();
          } }, 'Disconnect')),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done')));
    });
  }

  $('#btn-vault').addEventListener('click', showVaultPanel);

  /* =====================================================================
   * Global behaviour
   * ===================================================================== */

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      Save.flushAll();
    }
  });

  // Write any pending edits the moment the window is hidden or closed.
  document.addEventListener('visibilitychange', () => { if (document.hidden) Save.flushAll(); });
  window.addEventListener('beforeunload', (e) => {
    if (Save.busy()) {
      Save.flushAll();
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Service worker: caches the app files (never case data) so the app opens offline.
  // Only on https / localhost; the file:// copy on the SSD doesn't need it.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered', err));
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('A CaseVault update was installed. Reload the page when convenient to use it.', 'info', 15000);
      hadController = true;
    });
  }

  // Small toolkit shared with the consistency checker screen (js/checker/checks-ui.js).
  window.CaseVaultUI = { h, $, toast, openDialog, confirmDialog, field, fmtDate, fmtDateTime, fmtSize, Save, state, go, previewFile, onDriveLost };
  CVChecks.init(window.CaseVaultUI);

  Save.render();
  launch();
})();
