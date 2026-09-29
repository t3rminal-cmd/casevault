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

  // Short date for tables: "28 Sep 22:48" this year, "28 Sep 2025" before.
  function fmtShortDateTime(ms) {
    const d = new Date(ms);
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return d.getFullYear() === new Date().getFullYear() ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : `${day} ${d.getFullYear()}`;
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
        dialogEl.onclose = null; // this dialog's "close" event arrives later; it isn't for the next one
        dialogEl.close();
        resolve(value);
      };
      // Esc or the browser closing it. A late "close" event from the previous dialog (one dialog
      // replaced by the next, e.g. Vault → Run self-test) finds the dialog open again: ignore it.
      dialogEl.onclose = () => { if (dialogEl.open) return; if (!done) { done = true; resolve(undefined); } };
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
    setSidebar(!!(Vault.data.settings && Vault.data.settings.sidebarCollapsed), { save: false });
    Save.render();
    if (sameVault) await Save.retryFailed();
    else { state.caseId = null; state.caseObj = null; CVOutbound.goOffline('vault changed'); CVOnlineUI.reset(); CVApiKey.forget(); }
    renderNetStatus();
    renderCaseList();
    route();
    CVChecks.onVaultOpen();
  }

  function onDriveLost() {
    if (!state.connected) return;
    state.connected = false;
    CVOutbound.goOffline('drive disconnected');
    CVApiKey.forget();
    renderNetStatus();
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

  const isArchivedEntry = (c) => c.location === 'archive';
  const matchesSearch = (c, q) => !q || [c.title, c.number, c.client, ...(c.tags || [])].join(' ').toLowerCase().includes(q);

  // Cases in cases/ (the archive has its own section below the list).
  function filteredCases() {
    const q = $('#case-search').value.trim().toLowerCase();
    const f = $('#case-filter').value;
    return (Vault.data?.cases || [])
      .filter((c) => !isArchivedEntry(c))
      .filter((c) => f === 'all' || (f === 'active' ? c.status === 'Open' || c.status === 'Pending' : c.status === f))
      .filter((c) => matchesSearch(c, q))
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }

  function caseItem(c) {
    const due = c.nextDeadline && !isArchivedEntry(c) ? dueLabel(c.nextDeadline.date) : null;
    return h('li', {},
      h('a', {
        href: `#/case/${encodeURIComponent(c.id)}`,
        class: `case-item ${c.id === state.caseId ? 'active' : ''}`,
        'aria-current': c.id === state.caseId ? 'page' : null,
      },
      h('div', { class: 'case-item-top' }, h('span', { class: 'case-item-title' }, c.title || 'Untitled case'), statusPill(c.status)),
      h('div', { class: 'case-item-meta muted' }, [c.number, c.client].filter(Boolean).join(' · ') || '\u00a0'),
      due && h('div', { class: `case-item-due ${due.cls}` }, `⏰ ${c.nextDeadline.title || 'Deadline'}: ${due.text}`)));
  }

  function renderCaseList() {
    const list = $('#case-list');
    const section = $('#archived-cases');
    if (!Vault.data) { list.replaceChildren(); section.hidden = true; return; }
    const cases = filteredCases();
    const activeCount = Vault.data.cases.filter((c) => !isArchivedEntry(c)).length;
    list.replaceChildren(...(cases.length ? cases.map(caseItem) : [h('li', { class: 'empty muted' },
      activeCount ? 'No cases match.' : Vault.data.cases.length ? 'No active cases.' : 'No cases yet. Click "+ New case".')]));

    // Archived cases: a collapsible section, searched with the same box.
    const q = $('#case-search').value.trim().toLowerCase();
    const archived = Vault.data.cases.filter(isArchivedEntry).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    const shown = archived.filter((c) => matchesSearch(c, q));
    section.hidden = !archived.length;
    $('#archived-count').textContent = q ? `${shown.length} of ${archived.length}` : String(archived.length);
    $('#archived-list').replaceChildren(...(shown.length ? shown.map(caseItem) : [h('li', { class: 'empty muted' }, 'No archived cases match.')]));
    // Open the section when the case on screen is archived, or a search finds archived cases.
    if ((state.caseId && archived.some((c) => c.id === state.caseId)) || (q && shown.length)) section.open = true;
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
    if (/^#\/online\b/.test(location.hash)) return showOnline();
    const m = location.hash.match(/^#\/case\/([^/]+)(?:\/(\w+))?(?:\/([^/]+))?/);
    if (m) showCase(decodeURIComponent(m[1]), m[2] || 'details', m[3] || null);
    else showDashboard();
  }

  window.addEventListener('hashchange', () => { Save.flushAll(); route(); });

  /* =====================================================================
   * Online research & drafting (#/online), and the header's Online/Offline button
   * ===================================================================== */

  function showOnline() {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
    CVOnlineUI.render($('#main')).catch((err) => {
      if (FS.isDisconnectError(err)) return onDriveLost();
      console.error(err);
      toast(`Could not open online AI: ${err.message}`, 'error');
    });
  }

  function renderNetStatus() {
    const el = $('#net-status');
    if (!state.connected) { el.hidden = true; return; }
    const on = CVOutbound.isOnline();
    el.hidden = false;
    el.className = `net-status ${on ? 'on' : 'off'}`;
    el.textContent = on ? `Online · ${CVOutbound.minutesLeft()} min` : 'Offline';
    el.title = on
      ? `Online AI is on: CaseVault may reach ${CVOutbound.ALLOWED_HOSTS.join(', ')} with text you review. Click to manage or go offline.`
      : 'CaseVault is offline: nothing leaves this computer. Click for online research & drafting.';
  }
  $('#net-status').addEventListener('click', () => { location.hash = '#/online'; });

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
      const numberIn = h('input', { name: 'number', maxlength: 100 });
      const openedIn = h('input', { name: 'opened', type: 'date', value: today() });
      const folderNote = h('span', {});
      const showFolder = () => {
        const name = CVCaseFiles.caseFolderName({ number: numberIn.value, dates: { opened: openedIn.value } });
        folderNote.replaceChildren(...(name
          ? ['Case folder ', h('code', {}, `cases\\${name}`), ' · files named ', h('code', {}, `${name} Arrest Report.pdf`), ' and so on']
          : ['Add the case number to name the folder and files ', h('code', {}, '<year>-<case no.>'), '.']));
      };
      numberIn.addEventListener('input', showFolder);
      openedIn.addEventListener('input', showFolder);
      showFolder();
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
      field('Case / file number', numberIn),
      field('Client', h('input', { name: 'client', maxlength: 200 })),
      field('Status', h('select', { name: 'status' }, Vault.STATUSES.map((s) => h('option', {}, s)))),
      field('Opened', openedIn),
      h('p', { class: 'muted small span-2' }, folderNote),
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

  const TABS = [['details', 'Details'], ['notes', 'Notes'], ['timeline', 'Timeline'], ['files', 'Files'], ['mail', 'Mail'], ['drafts', 'Drafts'], ['checks', 'Checks']];

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
    const archived = Vault.isArchived(id);
    const panel = h('div', { class: 'tab-panel', role: 'tabpanel' });
    $('#main').replaceChildren(h('section', { class: `case ${archived ? 'archived' : ''}` },
      archived ? h('div', { class: 'archived-banner', role: 'note' },
        h('div', {}, h('strong', {}, 'Archived case'),
          h('span', { class: 'small block' }, 'Read-only. Notes, files, drafts and checks can be opened and searched, but not changed.')),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onclick: () => restoreCase(c) }, 'Restore to active cases')) : null,
      h('div', { class: 'case-head' },
        h('h1', { id: 'case-title' }, c.title || 'Untitled case'),
        h('div', { class: 'case-sub muted', id: 'case-sub' }, caseSubtitle(c))),
      h('nav', { class: 'tabs', role: 'tablist' }, TABS.map(([t, label]) =>
        h('a', { href: `#/case/${encodeURIComponent(id)}/${t}`, role: 'tab', class: `tab ${t === tab ? 'active' : ''}`, 'aria-selected': String(t === tab) }, label))),
      panel));
    // Read-only: everything in the tab that could change the case is switched off, now and as
    // the tab redraws. (vault.js refuses the writes too.)
    if (archived) new MutationObserver(() => applyReadOnly(panel)).observe(panel, { childList: true, subtree: true });

    const renderers = { details: renderDetails, notes: renderNotes, timeline: renderTimeline, files: renderFiles, mail: (...a) => CVMailUI.render(...a), drafts: (...a) => CVDraftsUI.render(...a), checks: (...a) => CVChecks.render(...a) };
    try {
      await renderers[tab](panel, c, token, sub);
    } catch (err) {
      if (FS.isDisconnectError(err)) return onDriveLost();
      console.error(err);
      panel.replaceChildren(h('p', { class: 'error-text' }, `Could not load this tab: ${err.message}`));
    }
    if (archived) applyReadOnly(panel);
  }

  // Text boxes become read-only (still scrollable and selectable); other controls are disabled,
  // except those marked data-ro-ok (open, preview, export a copy, filters) and the case actions.
  function applyReadOnly(root) {
    for (const el of root.querySelectorAll('input, select, textarea, button')) {
      if (el.closest('[data-ro-ok]')) continue;
      const textual = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|date|time|number|email|tel|url)$/.test(el.type));
      if (textual) { if (!el.readOnly) el.readOnly = true; } else if (!el.disabled) el.disabled = true;
    }
    for (const el of root.querySelectorAll('.dropzone:not([aria-disabled])')) { el.setAttribute('aria-disabled', 'true'); el.hidden = true; }
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
      // "Archived" means moving the case to the archive: ask first.
      if (statusSelect.value === 'Archived' && !Vault.isArchived(c.id)) {
        statusSelect.value = c.status;
        archiveCase(c);
        return;
      }
      c.status = statusSelect.value;
      if (c.status === 'Closed' && !c.dates.closed) {
        c.dates.closed = today();
        closedInput.value = c.dates.closed;
      }
      save();
    });
    const archived = Vault.isArchived(c.id);

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
          `Created ${c.dates.created ? fmtDateTime(Date.parse(c.dates.created)) : '—'} · Folder: ${archived ? 'archive' : 'cases'}\\${c.id}`
          + `${archived && c.dates.archived ? ` · Archived ${fmtDate(c.dates.archived)}` : ''}`)),
      // Archive and delete side by side, so the gentler choice is always in view.
      h('section', { class: 'case-actions', 'data-ro-ok': 'true', 'aria-labelledby': 'case-actions-title' },
        h('h3', { id: 'case-actions-title' }, 'Case actions'),
        h('div', { class: 'case-actions-grid' },
          archived
            ? h('div', { class: 'case-action' },
              h('button', { class: 'btn', type: 'button', onclick: () => restoreCase(c) }, 'Restore to active cases'),
              h('p', { class: 'muted small' }, 'Moves the case back to the active list, with the status it had before, so it can be changed again.'))
            : h('div', { class: 'case-action' },
              h('button', { class: 'btn', type: 'button', onclick: () => archiveCase(c) }, 'Archive case…'),
              h('p', { class: 'muted small' }, 'Keeps everything, read-only, in CaseVault-Data\\archive. It leaves the case list but can still be opened, searched and restored.')),
          !archived && Vault.conventionalId(c) ? h('div', { class: 'case-action' },
            h('button', { class: 'btn', type: 'button', onclick: () => renameCaseFolder(c) }, `Rename folder to ${Vault.conventionalId(c)}`),
            h('p', { class: 'muted small' }, 'Renames this case\'s folder on the SSD to the <year>-<case no.> convention. Every file is copied and checked first.')) : null,
          h('div', { class: 'case-action' },
            h('button', { class: 'btn danger', type: 'button', onclick: () => deleteCase(c) }, 'Delete case…'),
            h('p', { class: 'muted small' }, 'Permanently deletes the case from the SSD. There is no trash to get it back from.')))));
  }

  // Pending edits to a case that is being deleted are dropped rather than written.
  function dropPendingSaves(id) {
    for (const key of [...Save.timers.keys()]) {
      if (key === `case:${id}` || key.startsWith(`notes:${id}`) || key.startsWith(`timeline:${id}`) || key.startsWith(`draft:${id}:`)) {
        clearTimeout(Save.timers.get(key).timer);
        Save.timers.delete(key);
      }
    }
    Save.render();
  }

  async function archiveCase(c) {
    const ok = await confirmDialog({
      title: 'Move this case to the archive?',
      message: h('div', {},
        h('p', {}, `"${c.title || 'Untitled case'}" moves to CaseVault-Data\\archive on the SSD, with its notes, timeline, files, drafts and checks. Every file is copied and checked before the original is removed.`),
        h('p', { class: 'muted small' }, 'It leaves the case list and opens read-only from "Archived" at the bottom of the list. You can restore it at any time.')),
      confirmText: 'Archive case',
    });
    if (!ok) return;
    await Save.flushAll();
    if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD, then archive.', 'error', 8000);
    const progress = toast('Archiving: copying and checking files…', 'info', 600000);
    try {
      await Save.track(`archive:${c.id}`, () => Vault.archiveCase(c.id, (n, name) => { progress.textContent = `Archiving: ${n} file${n === 1 ? '' : 's'} copied and checked (${name})…`; }));
      progress.remove();
      state.caseObj = null;
      toast('Case archived. It opens read-only from "Archived" in the case list.', 'success', 7000);
      renderCaseList();
      route();
    } catch (err) {
      progress.remove();
      if (FS.isDisconnectError(err)) return onDriveLost();
      toast(`The case was not archived: ${err.message} It is still in the active list, unchanged.`, 'error', 12000);
      state.caseObj = null;
      route();
    }
  }

  async function renameCaseFolder(c) {
    await Save.flushAll();
    if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD first.', 'error', 8000);
    const progress = toast('Renaming: copying and checking files…', 'info', 600000);
    try {
      const updated = await Save.track(`rename:${c.id}`, () => Vault.renameCaseFolder(c.id, (n) => { progress.textContent = `Renaming: ${n} file${n === 1 ? '' : 's'} copied and checked…`; }));
      progress.remove();
      state.caseObj = null;
      toast(`Case folder renamed to ${updated.id}.`, 'success', 7000);
      renderCaseList();
      go(updated.id, 'details');
    } catch (err) {
      progress.remove();
      if (FS.isDisconnectError(err)) return onDriveLost();
      toast(`The folder was not renamed: ${err.message} The case is unchanged.`, 'error', 12000);
    }
  }

  async function restoreCase(c) {
    const progress = toast('Restoring: copying and checking files…', 'info', 600000);
    try {
      await Save.track(`restore:${c.id}`, () => Vault.restoreCase(c.id, (n) => { progress.textContent = `Restoring: ${n} file${n === 1 ? '' : 's'} copied and checked…`; }));
      progress.remove();
      state.caseObj = null;
      toast('Case restored to the active list.', 'success');
      renderCaseList();
      route();
    } catch (err) {
      progress.remove();
      if (FS.isDisconnectError(err)) return onDriveLost();
      toast(`The case was not restored: ${err.message} It is still in the archive, unchanged.`, 'error', 12000);
    }
  }

  // Delete needs the case number typed (the title when there's no number), and offers the archive instead.
  async function deleteCase(c) {
    const want = Vault.deleteConfirmText(c);
    const archived = Vault.isArchived(c.id);
    const choice = await openDialog((close) => {
      const typed = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'delete-help' });
      const del = h('button', { class: 'btn danger', type: 'submit', disabled: true }, 'Delete permanently');
      typed.addEventListener('input', () => { del.disabled = !Vault.deleteConfirmMatches(c, typed.value); });
      return h('form', { class: 'delete-form', onsubmit: (e) => { e.preventDefault(); if (Vault.deleteConfirmMatches(c, typed.value)) close('delete'); } },
        h('h2', {}, `Delete "${c.title || 'Untitled case'}"?`),
        h('p', { class: 'error-text' }, 'Permanently deletes this case from the SSD: notes, timeline, files, drafts and checks. This can\'t be undone.'),
        archived ? null : h('p', { class: 'muted small' }, 'To keep it out of the way but safe, archive it instead.'),
        h('label', { class: 'field' },
          h('span', { id: 'delete-help' }, c.number ? 'Type the case number to confirm: ' : 'Type the case title to confirm: ', h('code', {}, want)),
          typed),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          archived ? null : h('button', { class: 'btn', type: 'button', onclick: () => close('archive') }, 'Archive instead'),
          del));
    });
    if (choice === 'archive') return archiveCase(c);
    if (choice !== 'delete') return;
    dropPendingSaves(c.id);
    try {
      await Save.track(`delete:${c.id}`, () => Vault.deleteCase(c.id));
      state.caseObj = null;
      toast('Case deleted.');
      renderCaseList();
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

    const btnEdit = h('button', { 'data-ro-ok': 'true', class: 'btn small active', type: 'button' }, 'Edit');
    const btnPreview = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button' }, 'Preview');
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
    txt: 'text', md: 'text', json: 'text', log: 'text', xml: 'text', docx: 'docx', docm: 'docx',
    csv: 'sheet', tsv: 'sheet', xlsx: 'sheet', xlsm: 'sheet', xls: 'sheet', ods: 'sheet',
    mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', mp4: 'video', webm: 'video', mov: 'video',
  };
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

  // Files tab: the case's document folders on the left, the chosen folder's files on the right.
  // sub (from the address) is the folder being shown; '' = all folders.
  async function renderFiles(panel, c, token, sub) {
    const archived = Vault.isArchived(c.id);
    if (!archived) await Vault.ensureFolders(c.id).catch((err) => { if (FS.isDisconnectError(err)) throw err; });
    const files = await Vault.listFiles(c.id);
    if (token !== state.renderToken) return;
    const CF = CVCaseFiles;
    try { sub = sub ? decodeURIComponent(sub) : sub; } catch { /* keep as is */ }
    const current = CF.isCategory(sub) ? sub : (sub === 'unsorted' ? 'unsorted' : '');
    const inFolder = (f) => (current === 'unsorted' ? !f.folder : !current || f.folder === current);
    const shown = files.filter(inFolder);
    const count = (folder) => files.filter((f) => f.folder === folder).length;
    const unsorted = files.filter((f) => !f.folder);
    const prefix = CF.casePrefix(c);

    const input = h('input', { type: 'file', multiple: true, hidden: true });
    input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
    const target = current && current !== 'unsorted' ? current : '';
    const drop = h('div', { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Add files' },
      h('strong', {}, target ? `Drop files into ${target}` : 'Drop files here'), ' or ', h('span', { class: 'link' }, 'choose files'),
      h('div', { class: 'muted small' }, target
        ? `Saved as "${CF.fileName(c, target, 'x.pdf').replace(/\.pdf$/, '')}…" in files\\${target}. The originals are not changed.`
        : 'You pick the document type for each file next. They are copied to the SSD and named by the case number; the originals are not changed.'));
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
      const plan = await chooseTypes(c, list, target);
      if (!plan) return;
      const note = toast(`Copying ${list.length} file${list.length === 1 ? '' : 's'} to SSD…`, 'info', 600000);
      const saved = [];
      for (const { file, folder, description } of plan) {
        try {
          saved.push(await Save.track(`file:${c.id}:${file.name}`, () => Vault.addFile(c.id, file, { folder, description })));
        } catch { break; }
      }
      note.remove();
      if (saved.length) toast(saved.length === 1 ? `Saved as ${CF.splitPath(saved[0]).base}` : `Saved ${saved.length} files to the SSD.`, 'success', 6000);
      if (state.caseId === c.id && state.tab === 'files') showCase(c.id, 'files', current || null);
    }

    const folderBtn = (key, label, n) => h('a', {
      href: `#/case/${encodeURIComponent(c.id)}/files${key ? `/${encodeURIComponent(key)}` : ''}`,
      class: `folder-item ${current === key ? 'active' : ''}`, 'data-ro-ok': 'true', 'aria-current': current === key ? 'page' : null,
    }, h('span', { class: 'folder-icon', 'aria-hidden': 'true' }, '📁'), h('span', { class: 'folder-name' }, label), h('span', { class: 'folder-count muted' }, n ? String(n) : ''));

    const nav = h('nav', { class: 'folder-nav', 'aria-label': 'Document folders' },
      folderBtn('', 'All documents', files.length),
      CF.FOLDERS.map((f) => folderBtn(f, f, count(f))),
      unsorted.length ? folderBtn('unsorted', 'Unsorted (older files)', unsorted.length) : null);

    const table = shown.length
      ? h('table', { class: 'files' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), current ? null : h('th', {}, 'Folder'), h('th', { class: 'num' }, 'Size'), h('th', {}, 'Added'), h('th', {}, ''))),
        h('tbody', {}, shown.map((f) => h('tr', {},
          h('td', { class: 'fname' }, h('button', { 'data-ro-ok': 'true', class: 'linkish', type: 'button', onclick: () => previewFile(c, f.name) }, f.base),
            f.folder && prefix && !CF.followsConvention(c, f.folder, f.base) ? h('span', { class: 'pill warn-pill', title: `Not named ${prefix} ${CF.byFolder(f.folder).label}` }, 'name') : null),
          current ? null : h('td', { class: 'muted small' }, f.folder || 'Unsorted'),
          h('td', { class: 'num muted' }, fmtSize(f.size)),
          h('td', { class: 'muted nowrap', title: fmtDateTime(f.modified) }, fmtShortDateTime(f.modified)),
          h('td', { class: 'actions' },
            h('button', { 'data-ro-ok': 'true', class: 'btn small ghost', type: 'button', onclick: () => previewFile(c, f.name) }, 'Open'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => moveFileDialog(c, f, current) }, f.folder ? 'Move / rename' : 'File it…'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              if (!(await confirmDialog({ title: 'Delete this file?', message: `"${f.base}" will be permanently deleted from the SSD.`, confirmText: 'Delete', danger: true }))) return;
              try {
                await Save.track(`file-del:${c.id}:${f.name}`, () => Vault.deleteFile(c.id, f.name));
                showCase(c.id, 'files', current || null);
              } catch { /* reported by Save */ }
            } }, 'Delete'))))))
      : h('p', { class: 'muted' }, current ? `No documents in ${current === 'unsorted' ? 'Unsorted' : current} yet.` : 'No files attached yet.');

    const where = `${archived ? 'archive' : 'cases'}\\${c.id}\\files${current && current !== 'unsorted' ? `\\${current}` : ''}`;
    panel.replaceChildren(...[
      prefix ? null : h('p', { class: 'hint' }, 'This case has no case number yet, so files are named ', h('code', {}, `${new Date().getFullYear()}-NOCASENO …`), '. Add the number on the Details tab first to have them named ', h('code', {}, '2026-<CaseNo> <Type>'), '.'),
      unsorted.length && !archived ? h('p', { class: 'hint' }, `${unsorted.length} file${unsorted.length === 1 ? ' was' : 's were'} added before document folders existed. Open "Unsorted" and use "File it…" to move each into its folder with a conventional name.`) : null,
      h('div', { class: 'files-layout' }, nav,
        h('div', { class: 'files-main' }, drop, input,
          h('p', { class: 'muted small' }, `${shown.length} file${shown.length === 1 ? '' : 's'} · ${where}`),
          table))].filter(Boolean));
  }

  // Asks the document type (and an optional description) for each file being added.
  // Returns [{ file, folder, description }] or null when cancelled.
  function chooseTypes(c, list, preset) {
    const CF = CVCaseFiles;
    return openDialog((close) => {
      const rows = list.map((file) => {
        const folder = h('select', { 'aria-label': `Document type for ${file.name}` },
          CF.FOLDERS.map((f) => h('option', { value: f, selected: f === (preset || CF.guessFolder(file.name)) }, f)));
        const desc = h('input', { type: 'text', maxlength: 80, placeholder: 'optional, e.g. Det. Smith', 'aria-label': `Description for ${file.name}` });
        const result = h('code', { class: 'small' });
        const show = () => { result.textContent = CF.fileName(c, folder.value, file.name, desc.value); };
        folder.addEventListener('change', show);
        desc.addEventListener('input', show);
        show();
        return { file, folder, desc, el: h('tr', {}, h('td', { class: 'small' }, file.name), h('td', {}, folder), h('td', {}, desc), h('td', {}, result)) };
      });
      return h('form', { class: 'type-form', onsubmit: (e) => {
        e.preventDefault();
        close(rows.map((r) => ({ file: r.file, folder: r.folder.value, description: r.desc.value.trim() })));
      } },
      h('h2', {}, `Add ${list.length} file${list.length === 1 ? '' : 's'} to the case`),
      h('p', { class: 'muted small' }, 'Each file goes into its document folder and is named ', h('code', {}, '<year>-<case no.> <document type>'), '. A number like (2) is added when the name is taken.'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'files' },
        h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Document type'), h('th', {}, 'Description'), h('th', {}, 'Saved as'))),
        h('tbody', {}, rows.map((r) => r.el)))),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit', autofocus: true }, 'Save to SSD')));
    });
  }

  async function moveFileDialog(c, f, current) {
    const CF = CVCaseFiles;
    const plan = await openDialog((close) => {
      const folder = h('select', {}, CF.FOLDERS.map((x) => h('option', { value: x, selected: x === (f.folder || CF.guessFolder(f.base)) }, x)));
      const desc = h('input', { type: 'text', maxlength: 80, placeholder: 'optional' });
      const keep = h('input', { type: 'checkbox' });
      const result = h('code', {});
      const show = () => { result.textContent = keep.checked ? f.base : CF.fileName(c, folder.value, f.base, desc.value); desc.disabled = keep.checked; };
      for (const el of [folder, desc, keep]) el.addEventListener('input', show);
      keep.addEventListener('change', show);
      show();
      return h('form', { onsubmit: (e) => { e.preventDefault(); close({ folder: folder.value, description: desc.value.trim(), keepName: keep.checked }); } },
        h('h2', {}, f.folder ? 'Move or rename' : 'File this document'),
        h('p', { class: 'muted small' }, f.base),
        field('Document folder', folder),
        field('Description (optional)', desc),
        h('label', { class: 'check-row' }, keep, h('span', {}, 'Keep the current file name')),
        h('p', {}, 'New name: ', result),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Move')));
    });
    if (!plan) return;
    try {
      const to = await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, plan.folder, plan));
      toast(`Saved as ${to.replace('/', '\\')}`, 'success', 6000);
      showCase(c.id, 'files', current || null);
    } catch (err) { if (!FS.isDisconnectError(err)) { /* reported by Save */ } }
  }

  // Spreadsheet preview: one scrollable table per sheet, with sheet tabs. Cell text is only ever
  // set with textContent (via h()), never as HTML. `at` = { sheet, row } highlights a row.
  const PREVIEW_ROWS = 2000;

  function sheetTable(sheet, targetRow) {
    if (!sheet.rows.length) return h('p', { class: 'muted' }, 'This sheet is empty.');
    const shown = sheet.rows.slice(0, PREVIEW_ROWS);
    const cols = Array.from({ length: sheet.columns }, (_, i) => CVSheets.columnLetter((sheet.startCol || 0) + i));
    const table = h('table', { class: 'sheet-table' },
      h('thead', {}, h('tr', {}, h('th', { class: 'rownum' }, ''), cols.map((l) => h('th', {}, l)))),
      h('tbody', {}, shown.map((r) => h('tr', { class: r.row === targetRow ? 'target' : null, 'data-row': r.row },
        h('th', { class: 'rownum' }, String(r.row)),
        cols.map((_, i) => h('td', {}, r.cells[i] || ''))))));
    const more = sheet.rows.length > PREVIEW_ROWS || sheet.truncated;
    return h('div', {}, table, more ? h('p', { class: 'muted small' }, `Showing the first ${shown.length} rows. Open the file in Excel to see everything.`) : null);
  }

  function sheetPreview(sheets, at) {
    const view = h('div', { class: 'sheet-view' });
    const tabs = h('div', { class: 'sheet-tabs', role: 'tablist' });
    const show = (i) => {
      [...tabs.children].forEach((b, k) => { b.classList.toggle('active', k === i); b.setAttribute('aria-selected', String(k === i)); });
      const sheet = sheets[i];
      view.replaceChildren(sheetTable(sheet, at && at.sheet === sheet.name ? at.row : null));
      const target = view.querySelector('tr.target');
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
    };
    sheets.forEach((sheet, i) => tabs.append(h('button', { type: 'button', role: 'tab', class: 'sheet-tab', onclick: () => show(i) }, sheet.name)));
    const start = Math.max(0, at ? sheets.findIndex((s) => s.name === at.sheet) : 0);
    if (sheets.length) show(start);
    else view.append(h('p', { class: 'muted' }, 'This spreadsheet has no sheets.'));
    return [sheets.length > 1 ? tabs : null, view];
  }

  async function previewFile(c, name, page = null, at = null) {
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
      if (kind === 'pdf') {
        // XFA forms (Adobe LiveCycle) only say "Please wait..." in the browser's PDF viewer, so
        // CaseVault draws them itself; ordinary PDFs use the browser's viewer.
        body = h('div', { class: 'xfa-preview' }, h('p', { class: 'muted' }, 'Opening…'));
        const pdfFrame = () => h('iframe', { class: 'preview-frame', src: blobUrl(typed) + (page ? `#page=${page}` : ''), title: name });
        file.arrayBuffer().then(async (buf) => {
          const data = new Uint8Array(buf);
          const fields = await CVExtract.readXfaFields(data);
          if (!fields.xfa) return body.replaceWith(pdfFrame());
          const view = h('div', { class: 'xfa-view' });
          const note = h('p', { class: 'muted small' }, 'XFA form (Adobe LiveCycle), shown read-only.');
          const showFields = () => CVExtract.renderXfa(view, data, fields, at && at.field, { fieldsOnly: true });
          const showForm = () => CVExtract.renderXfa(view, data, fields, at && at.field);
          const toggle = h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
            const toFields = toggle.dataset.mode !== 'fields';
            toggle.dataset.mode = toFields ? 'fields' : 'form';
            toggle.textContent = toFields ? 'Show the form' : 'Show filled-in fields';
            view.replaceChildren(h('p', { class: 'muted' }, 'Opening…'));
            (toFields ? showFields : showForm)();
          } });
          // Coming from a check result: start on the fields list with that field highlighted.
          const startFields = !!(at && at.field);
          toggle.dataset.mode = startFields ? 'fields' : 'form';
          toggle.textContent = startFields ? 'Show the form' : 'Show filled-in fields';
          body.replaceChildren(h('div', { class: 'xfa-bar' }, note, fields.paragraphs.length ? toggle : null), view);
          const mode = await (startFields ? showFields() : showForm());
          if (mode === 'fields' && !startFields) toggle.remove();
        }).catch((err) => body.replaceChildren(h('p', { class: 'error-text' }, `Could not open this PDF: ${err.message}`)));
      } else if (kind === 'image') body = h('img', { class: 'preview-img', src: blobUrl(typed), alt: name });
      else if (kind === 'image-svg') body = h('img', { class: 'preview-img', src: blobUrl(new Blob([file], { type: 'image/svg+xml' })), alt: name });
      else if (kind === 'audio') body = h('audio', { controls: true, src: blobUrl(typed) });
      else if (kind === 'video') body = h('video', { class: 'preview-img', controls: true, src: blobUrl(typed) });
      else if (kind === 'sheet') {
        body = h('div', { class: 'sheet-preview' }, h('p', { class: 'muted' }, 'Reading the spreadsheet…'));
        CVSheets.read(file, name)
          .then((sheets) => body.replaceChildren(...sheetPreview(sheets, at).filter(Boolean)))
          .catch((err) => body.replaceChildren(h('p', { class: 'error-text' }, `Could not read this spreadsheet: ${err.message}`)));
      } else if (kind === 'docx') {
        // Word: drawn by CaseVault from the file's text and structure (no Word needed). The layout is
        // simplified; the file itself is unchanged and opens in Word as usual.
        body = h('div', { class: 'docx-preview' }, h('p', { class: 'muted' }, 'Reading the Word document…'));
        file.arrayBuffer().then(async (buf) => {
          const xml = await CVExtract.unzipEntry(buf, 'word/document.xml');
          if (!xml) throw new Error('it has no document body');
          const numbering = await CVExtract.unzipEntry(buf, 'word/numbering.xml').catch(() => null);
          const blocks = CVDocxView.parse(xml, numbering || '');
          body.replaceChildren(
            h('p', { class: 'muted small docx-note' }, 'Word document, shown read-only. Headings, bold/italic, lists and tables are kept; fonts, spacing and images are not. The file itself is unchanged: open it in Word for the exact layout.'),
            h('div', { class: 'docx-page' }, blocks.length ? CVDocxView.render(blocks) : h('p', { class: 'muted' }, 'This document has no text.')));
        }).catch((err) => body.replaceChildren(h('p', { class: 'error-text' }, `Could not read this Word file: ${err.message}. Open it in Word from the SSD.`)));
      } else if (kind === 'text') {
        body = h('pre', { class: 'preview-text' }, 'Loading…');
        file.slice(0, 2_000_000).text().then((t) => { body.textContent = t; });
      } else {
        body = h('div', { class: 'preview-none' },
          h('p', {}, 'This file type can\'t be shown inside CaseVault.'),
          ext === 'doc' ? h('p', { class: 'small' }, 'This is an old-style Word file (.doc). Open it in Word and use File → Save As → Word Document (.docx): CaseVault can show and check .docx files.') : null,
          h('p', {}, 'Open it straight from the SSD in its normal program:'),
          h('code', { class: 'path' }, `${Vault.root.name}\\${Vault.isArchived(c.id) ? 'archive' : 'cases'}\\${c.id}\\files\\${name.replace(/\//g, '\\')}`),
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

  async function showVaultPanel(section = null) {
    if (section) setTimeout(() => { const el = dialogEl.querySelector(`[data-section="${section}"]`); if (el) el.scrollIntoView({ block: 'start' }); }, 50);
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
        privacySettings(v),
        affiantSettings(v),
        CVSecureSettings.onlineSection(),
        CVSecureSettings.watchSection(),
        CVSecureSettings.mailSection(),
        CVSecureSettings.logSection(),
        CVDraftsUI.templateSettings(),
        h('h3', {}, 'Maintenance'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            try { await Save.track('reindex', () => Vault.rebuildIndex()); renderCaseList(); toast('Case index rebuilt from the case folders.', 'success'); } catch { /* reported */ }
          } }, 'Rebuild case index'),
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); showSelfTest(); } }, 'Run self-test…'),
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

  // Self-test: made-up documents through every reader, the checker, privacy and the AI engine.
  async function showSelfTest() {
    if (!state.connected) return;
    const env = { Vault, FS, Engine: CVChecks.Engine, mode: MODE };
    const icons = { waiting: '·', running: '…', pass: '✓', warn: '!', fail: '✗' };
    let results = [];
    const list = h('ol', { class: 'selftest-list' });
    const summary = h('p', { class: 'muted' }, 'Running. This takes up to a minute; the AI test can take longer the first time.');
    const copy = h('button', { class: 'btn', type: 'button', disabled: true, onclick: async () => {
      try { await navigator.clipboard.writeText(CVSelfTest.report(results, env)); toast('Report copied (no case data in it).', 'success'); } catch { toast('Could not copy.', 'error'); }
    } }, 'Copy report');
    const draw = (r) => {
      results = r;
      list.replaceChildren(...r.map((x) => h('li', { class: `selftest-item ${x.status}` },
        h('span', { class: 'selftest-icon', 'aria-hidden': 'true' }, icons[x.status] || '·'),
        h('div', {}, h('strong', {}, x.name), h('span', { class: 'sr-only' }, ` ${x.status}`), x.detail ? h('span', { class: 'small block muted' }, x.detail) : null))));
    };
    const dialog = openDialog((close) => h('div', { class: 'selftest' },
      h('h2', {}, 'Self-test'),
      h('p', { class: 'muted small' }, 'Uses its own made-up documents, never your cases. Writes one small test file to the SSD and deletes it.'),
      list, summary,
      h('div', { class: 'dialog-actions' }, copy, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Close'))));
    const final = await CVSelfTest.run(env, draw);
    const n = (st) => final.filter((x) => x.status === st).length;
    summary.className = n('fail') ? 'error-text' : n('warn') ? 'warn-text' : 'ok-text';
    summary.textContent = n('fail') ? `${n('fail')} check${n('fail') === 1 ? '' : 's'} failed. Copy the report and keep it for support.`
      : `All ${final.length - n('warn')} checks passed${n('warn') ? `; ${n('warn')} to look at` : ''}.`;
    copy.disabled = false;
    await dialog;
  }

  // "My details": the affiant profile that fills {{affiant.*}} in templates. Saved in vault.json.
  function affiantSettings(v) {
    const a = v.settings.affiant || {};
    const LABELS = { name: 'Name', title: 'Title or rank', agency: 'Agency', address: 'Address', phone: 'Phone', email: 'Email' };
    const TYPES = { phone: 'tel', email: 'email' };
    const inputs = {};
    const save = () => {
      const next = {};
      for (const k of CVDraft.AFFIANT_FIELDS) next[k] = inputs[k].value.trim();
      Save.track('settings', () => Vault.updateSettings({ affiant: next })).catch(() => {});
    };
    const rows = CVDraft.AFFIANT_FIELDS.map((k) => {
      const id = `affiant-${k}`;
      inputs[k] = k === 'address'
        ? h('textarea', { id, rows: 3, autocomplete: 'off' })
        : h('input', { id, type: TYPES[k] || 'text', autocomplete: 'off' });
      inputs[k].value = a[k] || '';
      inputs[k].addEventListener('change', save);
      return h('div', { class: 'field' }, h('label', { for: id }, LABELS[k], ' ', h('code', { class: 'small muted' }, `{{affiant.${k}}}`)), inputs[k]);
    });
    return h('section', {},
      h('h3', {}, 'My details (for templates)'),
      h('p', { class: 'muted small' }, 'Filled into templates wherever they say ', h('code', {}, '{{affiant.name}}'), ' and so on. Anything left empty becomes a [CONFIRM: ...] placeholder. Stored in vault.json on the SSD.'),
      h('div', { class: 'affiant-grid' }, rows));
  }

  // Privacy screen settings, shown inside the Vault panel. The PIN form is inline because the app
  // has a single dialog element.
  function privacySettings(v) {
    const status = h('span', {});
    const form = h('div', { class: 'row', hidden: true });
    const pin1 = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, class: 'narrow pin', placeholder: 'PIN', 'aria-label': 'New PIN (4 to 6 digits)', autocomplete: 'off' });
    const pin2 = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, class: 'narrow pin', placeholder: 'Repeat', 'aria-label': 'Repeat the PIN', autocomplete: 'off' });
    const setBtn = h('button', { class: 'btn', type: 'button' });
    const removeBtn = h('button', { class: 'btn', type: 'button' }, 'Remove PIN');
    const draw = () => {
      const has = !!v.settings.privacyPin;
      status.textContent = has ? 'A PIN is set. It is needed to leave the privacy screen.' : 'No PIN: one click leaves the privacy screen.';
      setBtn.textContent = has ? 'Change PIN…' : 'Set PIN…';
      removeBtn.hidden = !has;
    };
    const savePin = async () => {
      if (!CVPrivacy.isValidPin(pin1.value)) return toast('The PIN must be 4 to 6 digits.', 'error');
      if (pin1.value !== pin2.value) return toast('The two PINs are different.', 'error');
      const record = await CVPrivacy.makePinRecord(pin1.value);
      pin1.value = pin2.value = '';
      try {
        await Save.track('settings', () => Vault.updateSettings({ privacyPin: record }));
        form.hidden = true;
        draw();
        toast('Privacy screen PIN saved (only a salted hash is stored).', 'success');
      } catch { /* reported by Save */ }
    };
    setBtn.addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) pin1.focus(); });
    removeBtn.addEventListener('click', async () => {
      try { await Save.track('settings', () => Vault.updateSettings({ privacyPin: null })); draw(); toast('PIN removed.'); } catch { /* reported */ }
    });
    for (const i of [pin1, pin2]) i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); });
    pin2.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); savePin(); } });
    form.append(pin1, pin2, h('button', { class: 'btn primary', type: 'button', onclick: savePin }, 'Save PIN'),
      h('button', { class: 'btn', type: 'button', onclick: () => { form.hidden = true; pin1.value = pin2.value = ''; } }, 'Cancel'));

    const idle = h('select', { 'aria-label': 'Hide automatically after' },
      [[0, 'Off'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes']]
        .map(([m, label]) => h('option', { value: m, selected: Number(v.settings.privacyIdleMinutes || 0) === m }, label)));
    idle.addEventListener('change', () => {
      Save.track('settings', () => Vault.updateSettings({ privacyIdleMinutes: Number(idle.value) })).catch(() => {});
    });
    draw();
    return h('section', {},
      h('h3', {}, 'Privacy screen'),
      h('p', { class: 'muted small' }, 'Press ', h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'H'), ', press ', h('kbd', {}, 'Esc'), ' twice quickly, or click ', h('strong', {}, 'Hide'),
        ' to cover CaseVault with a blank screen. The tab title changes to "New Tab", media pauses and pending edits are saved.'),
      h('div', { class: 'row' }, status, h('div', { class: 'spacer' }), setBtn, removeBtn),
      form,
      h('div', { class: 'row' }, h('label', { class: 'inline' }, 'Hide automatically after ', idle, ' without activity')),
      h('p', { class: 'hint' }, 'For real security when you leave, press ', h('kbd', {}, 'Windows key'), ' + ', h('kbd', {}, 'L'), ' to lock the PC. The privacy screen only hides what is on screen.'));
  }

  $('#btn-vault').addEventListener('click', () => showVaultPanel());

  /* =====================================================================
   * Global behaviour
   * ===================================================================== */

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      Save.flushAll();
    }
    // Ctrl+\ shows or hides the case list (Ctrl+B is left to the browser and text fields).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
      if (!state.connected || document.querySelector('#dialog[open]')) return;
      e.preventDefault();
      setSidebar(!document.body.classList.contains('sidebar-collapsed'), { focus: true });
    }
  });

  /* ---------- collapsible sidebar ---------- */

  // collapsed: true hides the case list to a thin rail (or entirely at phone width).
  // Remembered in vault.json so it follows the SSD. focus moves to the other toggle, which is
  // where keyboard users expect to be after the one they pressed disappears.
  function setSidebar(collapsed, { save = true, focus = false } = {}) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const expandBtn = $('#btn-sidebar-expand');
    const collapseBtn = $('#btn-sidebar-collapse');
    expandBtn.hidden = !collapsed;
    expandBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Show the case list' : 'Hide the case list';
    collapseBtn.title = `${label} (Ctrl+\\)`;
    collapseBtn.querySelector('.sr-only').textContent = label;
    if (focus) (collapsed ? expandBtn : collapseBtn).focus();
    if (save && state.connected && !!Vault.data.settings.sidebarCollapsed !== collapsed) {
      Save.track('settings', () => Vault.updateSettings({ sidebarCollapsed: collapsed })).catch(() => {});
    }
  }
  $('#btn-sidebar-collapse').addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-collapsed'), { focus: true }));
  $('#btn-sidebar-expand').addEventListener('click', () => setSidebar(false, { focus: true }));
  $('#btn-rail-new').addEventListener('click', () => $('#btn-new-case').click());

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
  window.CaseVaultUI = { h, $, toast, openDialog, confirmDialog, field, fmtDate, fmtDateTime, fmtSize, Save, state, go, refresh: () => route(), previewFile, onDriveLost, showVaultPanel };
  CVChecks.init(window.CaseVaultUI);
  CVOutbound.init(window.CaseVaultUI);
  CVOutbound.onChange(renderNetStatus);
  CVApiKey.init(window.CaseVaultUI);
  CVOnlineUI.init(window.CaseVaultUI);
  CVMailUI.init(window.CaseVaultUI);
  CVSecureSettings.init(window.CaseVaultUI);
  CVMemory.mount($('#mem-status'), {
    isHelper: () => MODE === 'helper',
    engineConnected: () => CVChecks.Engine.status() === 'connected' && !CVChecks.Engine.inBrowser(),
  });
  CVActivityLib.mount(CVActivity, $('#ai-activity'));
  CVDraftsUI.init(window.CaseVaultUI);

  // Privacy screen: Ctrl+Shift+H, Esc twice, or the "Hide" button. See js/privacy.js.
  CVPrivacy.init({
    flush: () => Save.flushAll(),
    getPinRecord: () => (Vault.data && Vault.data.settings.privacyPin) || null,
    getIdleMinutes: () => (Vault.data && Vault.data.settings.privacyIdleMinutes) || 0,
    button: $('#btn-privacy'),
  });

  Save.render();
  launch();
})();
