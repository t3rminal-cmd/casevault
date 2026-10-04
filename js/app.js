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
    // Every date box in CaseVault is typed as MM.DD.YYYY (js/formats.js), with a calendar button.
    if (tag === 'input' && attrs && attrs.type === 'date' && window.CVFormat) {
      const { class: cls, ...rest } = attrs;
      const box = CVFormat.dateField(rest);
      if (cls) box.classList.add(...String(cls).split(/\s+/).filter(Boolean));
      for (const [k, v] of Object.entries(rest)) if (k.startsWith('on') && typeof v === 'function') box.addEventListener(k.slice(2), v);
      return box;
    }
    const el = document.createElement(tag);
    // Headings in Title Case (v1.20): "Upcoming deadlines" shows as "Upcoming Deadlines".
    // Buttons too (v1.21): "Show/hide" -> "Show/Hide", "Edit links" -> "Edit Links".
    const cls = String((attrs && attrs.class) || '');
    const labelled = /^h[2-4]$/.test(tag) || (tag === 'button' && /\b(btn|menu-item|tab)\b/.test(cls) && !/\blinkish\b/.test(cls));
    if (labelled && !(attrs && attrs['data-keep-case'])) kids = kids.map((k) => (typeof k === 'string' ? CVFormat.titleCase(k) : k));
    let iconName = null;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'icon') iconName = v;
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else if (k === 'html') el.innerHTML = v; // only ever used with Markdown.render output (escaped)
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    // Icons go on the right of the words (v1.21).
    if (iconName) { if (el.childNodes.length) el.append(' '); el.append(CVIcons.icon(iconName)); }
    return el;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const today = () => Vault.localDay();

  function fmtDate(s) {
    if (!s) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
    if (isNaN(d)) return s;
    // The long date everywhere in CaseVault (v1.32): "September 30, 2026".
    return CVFormat.dateText(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  function fmtDateTime(ms) {
    const d = new Date(ms);
    return `${fmtDate(Vault.localDay(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // v1.76: the time alone, as in fmtDateTime (Files tab: the time under the date updated).
  function fmtTime(ms) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Short date for tables: "09.28 22:48" this year, "09.28.2025" before.
  function fmtShortDateTime(ms) {
    const d = new Date(ms);
    const day = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    return d.getFullYear() === new Date().getFullYear() ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : `${day}.${d.getFullYear()}`;
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

  // v1.67: the statute of limitations of a case in the index: 'warn' (5 days or less), 'expired' or ''.
  const solState = (c) => (c && c.sol && !isArchivedEntry(c) && c.status !== 'Closed' && globalThis.CVLimits ? CVLimits.state(c.sol, today()) : '');
  // v1.62: a heading inside a popup form (a thin line with its name) and a hint box.
  const formSect = (label, icon) => h('div', { class: 'form-sect span-2' }, icon ? I(icon) : null, h('span', {}, label));
  const formHint = (...kids) => h('p', { class: 'form-hint span-2' }, I('info-circle'), h('span', {}, ...kids));
  // v1.76: DNA (does not apply) offered on number boxes such as the Federal Jacket Number.
  const dnaCombo = (el) => (window.CVCombo ? CVCombo.attach(el, { items: () => [{ value: 'DNA', label: 'DNA', hint: 'Does Not Apply' }] }) : el);
  const STATUS_ICONS = { Open: 'folder2-open', Pending: 'hourglass-split', Closed: 'lock-fill', Archived: 'archive' };
  const statusPill = (status) => h('span', { class: `pill status-${String(status).toLowerCase()}`, icon: STATUS_ICONS[status] }, status);
  const I = (name, opts) => CVIcons.icon(name, opts);

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

  const DIALOG_SIZES = [
    ['panel', '.vault-panel'],
    ['form', '.op-form, .new-case-form'],
    ['full', '.preview, .doc-view, .lib-preview, .pdf-view, .word-view, .disc'],
    ['wide', '.type-form, .review-form, .key-form, .gen-form, .close-form, .selftest, .engine-panel, .options-form, .contact-form, .rephrase-form, .review-report, .chat-history-form'],
  ];

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
      // Every box has an X at the top right that closes it without doing anything, like Esc.
      // A box with its own header row (the Vault, Options, a file) gets the X in that row, after
      // Done, as a button of the same size (v1.20); any other box has it in the corner.
      // v1.57: no X when the box already has a button that closes it (Done, Close, Cancel, OK…).
      const closer = [...dialogEl.querySelectorAll('button')].some((b) => /^(done|close|cancel|ok|back|not now|save and close|save & close)$/i.test(b.textContent.trim()));
      if (!closer) {
        const xBtn = h('button', { class: 'icon-btn dialog-x', type: 'button', title: 'Close', 'aria-label': 'Close (Esc)', onclick: () => close(undefined) }, I('x-lg'));
        const head = dialogEl.querySelector('.vault-panel-head, .opt-head, .preview-head');
        if (head) { xBtn.classList.add('in-head'); head.append(xBtn); } else dialogEl.append(xBtn);
      }
      // The dialog's size comes from what it shows (set here, not with CSS :has(), which older
      // Firefox versions don't know and would leave file previews 620px wide and clipped).
      const kind = DIALOG_SIZES.find(([, sel]) => dialogEl.querySelector(sel));
      dialogEl.className = `dialog${kind ? ` dialog-${kind[0]}` : ''}`;
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
        } else if (err && err.name === 'ValidationError') {
          // v1.46: a refused Operation or Case Number change; the caller says why.
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
      // The header shows just the icon; the words are in its hover box.
      el.title = `${el.textContent}${el.classList.contains('error') ? '' : ` · ${$('#vault-name').textContent || 'SSD'}`}`;
      el.setAttribute('aria-label', el.textContent);
      el.tabIndex = 0;
      el.prepend(I({ error: 'exclamation-triangle-fill', saving: 'arrow-repeat', saved: 'hdd-fill' }[el.className.split(' ')[1]] || 'hdd'));
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
    archOpen: new Set(), // v1.67: open Archived sub-folders
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
    // Where the data is saved, e.g. W:\CaseVault-Data (helper mode knows the drive letter).
    $('#vault-name').textContent = MODE === 'helper' && state.drive ? CVFormat.pathText(`${state.drive.replace(/[\\/]+$/, '')}\\${dir.name}`) : dir.name;
    hideGate();
    setSidebar(!!(Vault.data.settings && Vault.data.settings.sidebarCollapsed), { save: false });
    if (Vault.data.settings && Vault.data.settings.sidebarWidth) setSidebarWidth(Vault.data.settings.sidebarWidth, { save: false });
    setSidebarLock(!!(Vault.data.settings && Vault.data.settings.sidebarLocked), { save: false });
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
    quickFooter(false);
    CVOutbound.goOffline('drive disconnected');
    CVApiKey.forget();
    CVChatUI.reset();
    CVNotesFloat.reset();
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
  // v1.46: the subject and the Operation's number and name are searched too.
  const matchesSearch = (c, q) => !q || [c.title, c.subject, c.fileNumber, c.number, c.agencyNumber, c.client, c.status, CVOperation.opLabel(Vault.operationOf(c)), ...(c.tags || [])].join(' ').toLowerCase().includes(q);

  // Cases in cases/ (the archive has its own section below the list): open and pending first,
  // then closed, each most recently changed first. Typing a status in the search box finds those.
  function filteredCases() {
    const q = $('#case-search').value.trim().toLowerCase();
    const rank = (c) => (c.status === 'Closed' ? 1 : 0);
    return (Vault.data?.cases || [])
      .filter((c) => !isArchivedEntry(c))
      .filter((c) => matchesSearch(c, q))
      .sort((a, b) => rank(a) - rank(b) || (b.updated || '').localeCompare(a.updated || ''));
  }

  // A case in the left list: [Open] Title [bell], then file | case | client. A red bell means a
  // deadline is overdue or due within a week; the details are in the hover box.
  function caseItem(c, inGroup = false) {
    const sol = solState(c);
    const due = sol ? { cls: 'overdue', text: sol === 'expired' ? 'statute of limitations expired' : 'statute of limitations expiring' }
      : c.nextDeadline && !isArchivedEntry(c) ? dueLabel(c.nextDeadline.date) : null;
    // Any open deadline on the case's Timeline rings the red bell (right of the title).
    // v1.28: the bell sits right after the title; a case number inside an operation leaves it to
    // the operation's name.
    const alarm = !!due && !inGroup;
    const tip = [
      `${c.number || 'No case number'}${c.subject ? `, ${c.subject}` : ''} · ${c.status}`,
      c.status === 'Pending' && c.pending ? `Waiting on ${c.pending.reason}${c.pending.followUp ? `, follow up ${fmtDate(c.pending.followUp)}` : ''}` : null,
      sol ? `Statute of limitations ${sol === 'expired' ? 'expired' : 'expires'} ${fmtDate(c.sol.expires)}` : null,
      due && !sol ? `${due.cls === 'overdue' || due.cls === 'soon' ? 'Alarm: ' : 'Next deadline: '}${c.nextDeadline.title || 'Deadline'}, ${fmtDate(c.nextDeadline.date)}${c.nextDeadline.time ? ` ${c.nextDeadline.time}` : ''} (${due.text})` : null,
    ].filter(Boolean).join('\n');
    return h('li', {},
      h('a', {
        href: `#/case/${encodeURIComponent(c.id)}`,
        // v1.60: a case with a reminder (a deadline overdue or within a week) has a thin red border.
        class: `case-item ${c.id === state.caseId ? 'active' : ''}${due ? ` has-reminder reminder-${due.cls}` : ''}`,
        'aria-current': c.id === state.caseId ? 'page' : null,
        title: tip,
      },
      // Title on the left; the status and the red bell together on the right (v1.20).
      h('div', { class: 'case-item-top' },
        // v1.46: the Case Number, with the Subject Name under it.
        h('span', { class: 'case-item-title is-number' }, c.number || 'No case number yet'),
        alarm ? h('span', { class: `case-bell ${due.cls}`, 'aria-label': `Deadline ${due.text}` }, I('bell-fill')) : null,
        h('span', { class: 'case-item-flags' },
          h('span', { class: `case-status status-${String(c.status).toLowerCase()}` }, c.status))),
      // Just the numbers: file number | case number | client, e.g. "100 | JH123456 | State".
      // (No empty line when there are no numbers to show, v1.29. Inside an operation only the case
      // number shows, v1.32: the file number, original case and client are on the operation.)
      h('div', { class: `case-item-meta muted${c.subject ? '' : ' no-subject'}` }, [c.subject || 'No subject yet', inGroup ? '' : CVOperation.opLabel(Vault.operationOf(c))].filter(Boolean).join(' | '))));
  }

  /* Operations (v1.46): an Operation is a record (number, name, status, dates, notes) in vault.json;
   * a case belongs to none or one of them (case.operationId). Every case lives in General Files; an
   * Operation's Files are its linked cases. In the case list each Operation is a folder, and General
   * Files holds the cases that aren't in one. */
  const GENERAL = 'general';
  const opOf = (c) => (c ? Vault.operationOf(c) : null);
  const opLabel = (op) => CVOperation.opLabel(op);
  /** Active cases of c's Operation (c included), most recently changed first; [] when c has none.
   * c: a case, an index entry or an Operation id. */
  function operationCases(c) {
    const id = typeof c === 'string' ? c : c && c.operationId;
    return id ? (Vault.data?.cases || []).filter((x) => !isArchivedEntry(x) && x.operationId === id).sort((a, b) => (b.updated || '').localeCompare(a.updated || '')) : [];
  }
  // v1.50: the folders start folded. The one holding what's on screen (the case, the Operation, or
  // General Files) is open; one opened or folded with its arrow stays that way until you go to
  // another page. (v1.28 to v1.49 kept which were folded in vault.json.)
  try { localStorage.removeItem('casevault-op-closed'); } catch { /* nothing kept */ }
  const sideFold = new Map(); // folder key -> true (opened) / false (folded), until the next page
  let sideFoldHash = '';
  function folderOpen(group) {
    if (location.hash !== sideFoldHash) { sideFold.clear(); sideFoldHash = location.hash; }
    if (sideFold.has(group.key)) return sideFold.get(group.key);
    if ($('#case-search').value.trim()) return true;
    if (state.caseId && group.cases.some((c) => c.id === state.caseId)) return true;
    const opm = location.hash.match(/^#\/operation\/([^/]+)/);
    if (opm && group.op && !group.partial && group.op.id === decodeURIComponent(opm[1])) return true;
    return group.key === GENERAL && /^#\/general\b/.test(location.hash);
  }
  const byNumber = (a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true });
  /** A folder in the case list: { key, op (null for General Files), cases }. */
  function operationGroup(group) {
    const { key, op, cases } = group;
    const opFiles = !!group.opFiles;
    const label = opFiles ? 'Mission Files' : op ? opLabel(op) : 'General Files';
    const open = folderOpen(group);
    const bell = cases.some((c) => c.nextDeadline && dueLabel(c.nextDeadline.date));
    const meta = opFiles ? `${cases.length} closed case${cases.length === 1 ? '' : 's'} of ongoing Missions`
      : op ? [op.status, `${group.total} case${group.total === 1 ? '' : 's'}`].join(' · ') : `${group.total} independent case${group.total === 1 ? '' : 's'}`;
    const det = h('details', { class: `op-group${op || opFiles ? '' : ' general-group'}${opFiles ? ' opfiles-group' : ''}${bell ? ' has-reminder' : ''}`, open },
      h('summary', { class: 'op-head', title: opFiles ? 'Closed cases whose Mission is still going on. Each is still in its Mission\'s folder above.' : op ? `${label}: open the Mission` : 'General Files: every case; these are the ones not in a Mission' },
        h('span', { class: `op-folder${op || opFiles ? '' : ' gf-icon'}` }, I(op || opFiles ? 'op-folder' : 'folder-fill')),
        h('span', { class: 'op-text' },
          // v1.60: an Operation's number on top, its name under it.
          h('span', { class: 'op-name-row' }, h('span', { class: 'op-name' }, ...(op && !opFiles
            ? [h('span', { class: 'op-num' }, op.number || 'No number'), op.name ? h('span', { class: 'op-title' }, op.name) : null].filter(Boolean)
            : [opFiles ? 'MISSION FILES' : 'GENERAL FILES'])), // v1.77: the folder names in capitals
            bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null),
          h('span', { class: 'op-meta muted' }, meta)),
        cases.length > 1 ? h('span', { class: 'op-count' }, String(cases.length)) : null,
        h('span', { class: 'op-chev', title: 'Fold or unfold' }, I('chevron-down'))),
      h('ul', { class: 'op-cases' }, cases.length ? cases.map((c) => caseItem(c, true)) : [h('li', { class: 'empty muted small' }, op ? 'No cases in this Mission yet.' : 'No independent cases.')]));
    // A click on the folder's name opens the Operation (or General Files); the arrow folds it.
    det.querySelector('summary').addEventListener('click', (e) => {
      if (e.target.closest('.op-chev')) return;
      if (opFiles) return; // just folds
      e.preventDefault();
      location.hash = op ? `#/operation/${encodeURIComponent(op.id)}` : '#/general';
    });
    det.addEventListener('toggle', () => {
      // A <details> drawn open fires "toggle" too: keep only a real change (v1.29).
      if (det.open === folderOpen(group)) return;
      sideFold.set(key, det.open);
    });
    return h('li', { class: 'op-item' }, det);
  }
  const fileKey = (f) => String(f || '').trim();
  const byFileNumber = (a, b) => {
    const x = fileKey(a); const y = fileKey(b);
    if (!x !== !y) return x ? -1 : 1; // no file number last
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
  };
  /** The folders for these cases: each Operation (in Operation Number order) with its cases, then
   * General Files with the independent ones. Empty Operations show too, unless a search is on. */
  function opGroups(cases, { searching = false, all = (Vault.data?.cases || []).filter((c) => !isArchivedEntry(c)) } = {}) {
    const q = $('#case-search') ? $('#case-search').value.trim().toLowerCase() : '';
    const groups = [];
    const opFilesClosed = [];
    for (const op of [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name))) {
      const total = all.filter((c) => c.operationId === op.id);
      // The Operation's own number or name matching the search shows all its cases.
      const hit = q && opLabel(op).toLowerCase().includes(q);
      const mine = (hit ? total : cases.filter((c) => c.operationId === op.id)).sort(byNumber);
      if (searching && q && !hit && !mine.length) continue;
      const closed = op.status === 'Closed' || (total.length > 0 && total.every((c) => c.status === 'Closed'));
      groups.push({ key: op.id, op, cases: mine, total: total.length, closed });
      // v1.50: a closed case of an Operation that is still open stays in its folder, and shows under
      // Closed too; v1.55: in one "Operation Files" folder, by case number, without the Operation's name.
      if (!closed) opFilesClosed.push(...mine.filter((c) => c.status === 'Closed'));
    }
    if (opFilesClosed.length) groups.push({ key: 'opfiles:closed', op: null, opFiles: true, cases: opFilesClosed.sort(byNumber), total: opFilesClosed.length, closed: true, partial: true });
    const loose = cases.filter((c) => !c.operationId || !Vault.getOperation(c.operationId)).sort(byNumber);
    const looseAll = all.filter((c) => !c.operationId || !Vault.getOperation(c.operationId));
    if (loose.length || !searching || !q) {
      const open = loose.filter((c) => c.status !== 'Closed');
      const shut = loose.filter((c) => c.status === 'Closed');
      if (open.length || !shut.length) groups.push({ key: GENERAL, op: null, cases: open, total: looseAll.length, closed: false });
      if (shut.length) groups.push({ key: `${GENERAL}:closed`, op: null, cases: shut, total: looseAll.length, closed: true });
    }
    return groups;
  }
  const isClosedGroup = (g) => g.closed;

  // v1.78: MISSION FILES in the case list: every open Mission folder inside it, a + for a new one.
  function missionFolder(groups) {
    const key = 'missions';
    const searching = !!$('#case-search').value.trim();
    const open = sideFold.has(key) && location.hash === sideFoldHash ? sideFold.get(key) : true;
    const n = groups.filter((g) => g.op).length;
    const bell = groups.some((g) => g.cases.some((c) => c.nextDeadline && dueLabel(c.nextDeadline.date)));
    const add = h('button', { class: 'icon-btn mission-add', type: 'button', title: 'New Mission', onclick: async (e) => {
      e.preventDefault(); e.stopPropagation();
      const op = await operationDialog();
      if (op) { renderCaseList(); location.hash = `#/operation/${encodeURIComponent(op.id)}`; }
    } }, I('plus-lg'), h('span', { class: 'sr-only' }, 'New Mission'));
    const det = h('details', { class: `op-group mission-group${bell ? ' has-reminder' : ''}`, open: open || searching },
      h('summary', { class: 'op-head', title: 'MISSION FILES: every Mission. Click to see them all; the arrow folds the folder.' },
        h('span', { class: 'op-folder mission-icon' }, I('folder-mission')),
        h('span', { class: 'op-text' },
          h('span', { class: 'op-name-row' }, h('span', { class: 'op-name' }, 'MISSION FILES'), bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null),
          h('span', { class: 'op-meta muted' }, `${n} mission${n === 1 ? '' : 's'}`)),
        add,
        h('span', { class: 'op-chev', title: 'Fold or unfold' }, I('chevron-down'))),
      h('ul', { class: 'mission-children' }, groups.length ? groups.map((g) => operationGroup(g)) : [h('li', { class: 'empty muted small' }, 'No Missions yet. Click + to make one.')]));
    det.querySelector('summary').addEventListener('click', (e) => {
      if (e.target.closest('.op-chev')) { e.preventDefault(); sideFoldHash = location.hash; sideFold.set(key, !det.open); det.open = !det.open; return; }
      if (e.target.closest('.mission-add')) return;
      e.preventDefault();
      location.hash = '#/operations';
    });
    return h('li', { class: 'op-item mission-item' }, det);
  }

  function renderCaseList() {
    const list = $('#case-list');
    const section = $('#archived-cases');
    if (!Vault.data) { list.replaceChildren(); section.hidden = true; return; }
    const cases = filteredCases();
    const activeCount = Vault.data.cases.filter((c) => !isArchivedEntry(c)).length;
    const searching = !!$('#case-search').value.trim();
    const groups = opGroups(cases, { searching });
    // An empty General Files folder shows only when there is nothing else to show.
    const openGroups = groups.filter((g) => !isClosedGroup(g) && !(g.key === GENERAL && !g.cases.length && groups.some((x) => x !== g && !isClosedGroup(x))));
    const closedGroups = groups.filter(isClosedGroup);
    // v1.78: the Missions sit inside one MISSION FILES folder, like GENERAL FILES, with New Mission.
    const missionGroups = openGroups.filter((g) => g.op || g.opFiles);
    const otherGroups = openGroups.filter((g) => !(g.op || g.opFiles));
    list.replaceChildren(missionFolder(missionGroups), ...(otherGroups.length ? otherGroups.map((g) => operationGroup(g)) : missionGroups.length ? [] : [h('li', { class: 'empty muted' },
      closedGroups.length ? 'Every Mission is closed.' : activeCount ? 'No cases match.' : Vault.data.cases.length ? 'No active cases.' : 'No cases yet. Click "New case".')]));
    // Closed Operations (and closed independent cases): above Archived, at the bottom (v1.42).
    const closedSec = $('#closed-cases');
    const allClosed = opGroups(Vault.data.cases.filter((c) => !isArchivedEntry(c))).filter(isClosedGroup);
    closedSec.hidden = !allClosed.length;
    $('#closed-count').textContent = String(closedGroups.length);
    $('#closed-list').replaceChildren(...(closedGroups.length ? closedGroups.map((g) => operationGroup(g)) : [h('li', { class: 'empty muted' }, 'No closed missions match.')]));
    if ((state.caseId && closedGroups.some((g) => g.cases.some((c) => c.id === state.caseId))) || ($('#case-search').value.trim() && closedGroups.length)) closedSec.open = true;

    // Archived cases: a collapsible section, searched with the same box.
    const q = $('#case-search').value.trim().toLowerCase();
    const archived = Vault.data.cases.filter(isArchivedEntry).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    const shown = archived.filter((c) => matchesSearch(c, q));
    section.hidden = !archived.length;
    $('#archived-count').textContent = q ? `${shown.length} of ${archived.length}` : String(archived.length);
    // v1.67: EXPIRED, NOLLE PROSEQUI and PROSECUTION sub-folders; cases without one below them.
    const subs = Vault.ARCHIVE_FOLDERS.map(([k, label]) => {
      const inIt = shown.filter((c) => c.archiveFolder === k);
      if (!inIt.length) return null;
      const open = state.archOpen.has(k) || !!q || inIt.some((c) => c.id === state.caseId);
      const list = h('ul', { class: 'case-list arch-sub-list', hidden: !open }, inIt.map(caseItem));
      const head = h('button', { type: 'button', class: 'arch-sub-head', 'aria-expanded': String(open), onclick: () => {
        if (state.archOpen.has(k)) state.archOpen.delete(k); else state.archOpen.add(k);
        renderCaseList();
      } }, h('span', { class: 'sec-folder' }, I('folder-archived')), h('span', { class: 'arch-sub-name' }, label), h('span', { class: 'count' }, String(inIt.length)), I(open ? 'chevron-down' : 'chevron-right'));
      return h('li', { class: `arch-sub arch-${k}` }, head, list);
    }).filter(Boolean);
    const loose = shown.filter((c) => !Vault.ARCHIVE_FOLDERS.some(([k]) => k === c.archiveFolder));
    $('#archived-list').replaceChildren(...(shown.length ? [...subs, ...loose.map(caseItem)] : [h('li', { class: 'empty muted' }, 'No archived cases match.')]));
    // Open the section when the case on screen is archived, or a search finds archived cases.
    if ((state.caseId && archived.some((c) => c.id === state.caseId)) || (q && shown.length)) section.open = true;
  }

  $('#case-search').addEventListener('input', debounce(renderCaseList, 120));
  // v1.50: Closed and Archived at the bottom: a grey folder, the word in capitals, a drop-down arrow.
  for (const sec of ['#closed-cases', '#archived-cases']) {
    const sum = $(`${sec} > summary`);
    sum.prepend(h('span', { class: 'sec-folder' }, I(sec === '#closed-cases' ? 'folder-closed' : 'folder-archived')));
    sum.append(h('span', { class: 'sec-chev' }, I('chevron-down')));
  }

  /* =====================================================================
   * Routing: #/  or  #/case/<id>/<tab>
   * ===================================================================== */

  function go(caseId, tab, sub) {
    location.hash = caseId ? `#/case/${encodeURIComponent(caseId)}/${tab || 'details'}${sub ? `/${encodeURIComponent(sub)}` : ''}` : '#/';
  }

  function route() {
    if (!state.connected) return;
    // v1.69: the Quick Links footer stays on every page, like the case list.
    if (!$('#ql-footer').childElementCount) quickFooter(true);
    if (/^#\/online\b/.test(location.hash)) return showOnline();
    // Old #/chat links open the floating Ask AI box over the overview.
    if (/^#\/chat\b/.test(location.hash)) { history.replaceState(null, '', '#/'); CVChatUI.toggle(true); }
    const ref = location.hash.match(/^#\/reference(?:\/([\w-]+))?/);
    if (ref) return showReference(ref[1] || null);
    // v1.46: Operations and General Files.
    if (/^#\/operations\b/.test(location.hash)) return showOperations();
    const opm = location.hash.match(/^#\/operation\/([^/]+)/);
    if (opm) return showOperation(decodeURIComponent(opm[1]));
    if (/^#\/general\b/.test(location.hash)) return showGeneralFiles();
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

  function showReference(section) {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
    CVReferenceUI.render($('#main'), section).catch((err) => {
      if (FS.isDisconnectError(err)) return onDriveLost();
      console.error(err);
      toast(`Could not open the reference: ${err.message}`, 'error');
    });
  }

  function renderNetStatus() {
    const el = $('#net-status');
    if (!state.connected) { el.hidden = true; return; }
    const on = CVOutbound.isOnline();
    el.hidden = false;
    el.className = `net-status ${on ? 'on' : 'off'}`;
    el.replaceChildren(I(on ? 'globe2' : 'shield-lock-fill'), on ? `Online · ${CVOutbound.minutesLeft()} min` : 'Offline');
    el.title = on
      ? `Online (${CVOutbound.minutesLeft()} min left). Online AI is on: CaseVault may reach ${CVOutbound.ALLOWED_HOSTS.join(', ')} with text you review. Click to manage or go offline.`
      : 'Offline: nothing leaves this computer. Click for online research & drafting.';
  }
  $('#net-status').addEventListener('click', () => { location.hash = '#/online'; });

  /* =====================================================================
   * Dashboard
   * ===================================================================== */

  /* v1.68: a folder not tied to a case number: OTHER FILES (key 'other') or an Operation's own
   * folder (key 'op-<id>', with Subpoenas, Affidavits, Operation Plans, Maps, Subject Data and
   * Vehicle List). Files are kept as they are named, in CaseVault-Data\\shared. */
  const sharedOpen = {};
  // v1.78: Missions (they were Operations): the folder on the SSD keeps its name, it shows as Mission Plans.
  const opFolderLabel = (n) => (n === 'Operation Plans' ? 'Mission Plans' : n);
  const OP_FOLDER_DESC = { Subpoenas: 'Served and returned', Affidavits: 'Search warrant affidavits', 'Operation Plans': 'Ops plans and briefings', Maps: 'Maps and aerials', 'Subject Data': 'Demographics and photo per subject', 'Vehicle List': 'Vehicles, owners and photos', Other: 'Anything else for the Mission' };
  const SHARED_ICONS = { 'USPIS Files': 'badge-uspis', 'DEA Files': 'badge-dea', 'INET Files': 'globe2', Training: 'book', Other: 'folder-other', Subpoenas: 'file-earmark-ruled', Affidavits: 'pencil-square', 'Operation Plans': 'card-checklist', Maps: 'map', 'Subject Data': 'person-vcard', 'Vehicle List': 'car-front' };
  // v1.71: folders are names, or { name, label, desc, custom }; getFolders() reads them each time
  // (Other Files: the built-in folders and the ones you make; New Folder adds one).
  /** v1.73: an Operation's Vehicle List: one card per vehicle with the Draft's vehicle fields
   * (Registered Owner and Address too) and, on the right, a photo of the vehicle. Kept in the
   * folder (.vehicles.json); photos are files in the same folder. */
  function opVehiclesPanel(opId) {
    return opCardsPanel(opId, { folder: 'Vehicle List', noun: 'Vehicle', icon: 'car-front', fields: CVReportFields.LISTS.vehicles.fields,
      summary: (v) => [v.year, v.make, v.model, v.color].filter(Boolean).join(' '), photoAlt: (v) => `Photo of vehicle ${v.plate || ''}`.trim(),
      read: () => Vault.readOpVehicles(opId), write: (snap) => Vault.saveOpVehicles(opId, snap) });
  }
  // v1.80: Subject Data: a demographics sheet per subject, with a photo on the right; as many
  // subjects as the Mission has.
  const SUBJECT_FIELDS = (() => {
    const P = Object.fromEntries((CVReportFields.SUSPECT_INFO || []).map((f) => [f[0], f]));
    const pick = (k, fb) => P[k] || fb;
    return [['name', 'Name', 'text'], ['alias', 'Alias / Moniker', 'text'], ['dob', 'Date of Birth', 'date'],
      ...['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran'].map((k) => pick(k, [k, k, 'text'])),
      ['phone', 'Phone Number', 'text'], ...['irNumber', 'fbiNumber', 'idocNumber'].map((k) => pick(k, [k, k, 'text'])),
      ['address', 'Address', 'wide'], ['marks', 'Tattoos / Scars', 'wide'], ['notes', 'Notes', 'wide']];
  })();
  // v1.81: the people already written up in the Mission's cases: Details suspects and Draft
  // offenders, one per name (an offender's details fill what the suspect lacks).
  async function missionPeople(opId) {
    const keyOf = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const out = new Map();
    const put = (p, where) => {
      const k = keyOf(p.name);
      if (!k || k === 'unknown offender') return;
      const cur = out.get(k) || { name: String(p.name).trim(), from: [] };
      for (const [f, v] of Object.entries(p)) if (f !== 'from' && String(v || '').trim() && !String(cur[f] || '').trim()) cur[f] = String(v).trim();
      if (!cur.from.includes(where)) cur.from.push(where);
      out.set(k, cur);
    };
    for (const e of (Vault.data.cases || []).filter((x) => x.operationId === opId)) {
      try {
        const c = await Vault.getCase(e.id);
        for (const s of (c && c.suspects) || []) {
          if (s.notIdentified) continue;
          const i = s.info || {};
          put({ name: s.name, dob: s.dob, alias: i.moniker, phone: i.phone, ...Object.fromEntries(['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran', 'irNumber', 'fbiNumber', 'idocNumber', 'marks'].map((k) => [k, i[k]])) }, `Suspect, ${e.number || 'case'}`);
        }
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      try {
        const d = await Vault.readCaseJSON(e.id, 'report-fields.json');
        for (const o of (d && Array.isArray(d.offendersList) ? d.offendersList : [])) {
          if (o.unknown) continue;
          const socials = Array.isArray(o.socials) ? o.socials.map((x) => x && x.name).filter(Boolean).join(', ') : '';
          const phones = Array.isArray(o.phones) ? o.phones.filter(Boolean).join(', ') : '';
          put({ name: o.name, dob: o.dob, alias: socials, phone: phones, address: o.address, ...Object.fromEntries(['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran', 'irNumber', 'fbiNumber', 'idocNumber', 'marks'].map((k) => [k, o[k]])) }, `Offender, ${e.number || 'case'}`);
        }
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    }
    return [...out.values()];
  }
  function opSubjectsPanel(opId) {
    return opCardsPanel(opId, { folder: 'Subject Data', noun: 'Subject', icon: 'person-plus', fields: SUBJECT_FIELDS, suggest: () => missionPeople(opId),
      summary: (v) => [v.name, v.dob ? `DOB ${fmtDate(v.dob)}` : ''].filter(Boolean).join(' · '), photoAlt: (v) => `Photo of ${v.name || 'the subject'}`,
      read: () => Vault.readOpList(opId, 'Subject Data', '.subjects.json'), write: (snap) => Vault.saveOpList(opId, 'Subject Data', '.subjects.json', snap) });
  }
  /** v1.73 (v1.80: shared by Vehicle List and Subject Data): one card per entry with its fields on
   * the left and a photo on the right. Kept in the folder as a hidden .json; photos are files there. */
  function opCardsPanel(opId, { folder, noun, icon, fields, summary, photoAlt, read, write, suggest = null }) {
    const key = `op-${opId}`;
    const box = h('div', { class: `op-vehicles op-cards-${noun.toLowerCase()}` });
    let list = [];
    const save = debounce(() => { const snap = structuredClone(list); Save.track(`op-${noun.toLowerCase()}s:${opId}`, () => write(snap)).catch(() => {}); }, 500);
    const photoBox = (v) => {
      const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
      const wrap = h('div', { class: 'op-veh-photo' });
      const show = async () => {
        if (!v.photo) { wrap.replaceChildren(h('button', { type: 'button', class: 'op-veh-photo-add', title: `Add a photo of this ${noun.toLowerCase()}`, onclick: () => pick.click() }, I('camera-fill'), h('span', {}, 'Add Photo')), pick); return; }
        const img = h('img', { alt: photoAlt(v) });
        try { const f = await Vault.readShared(key, folder, v.photo); if (f) { img.src = URL.createObjectURL(f); img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true }); } } catch { img.alt = 'Photo not found'; }
        wrap.replaceChildren(h('button', { type: 'button', class: 'op-veh-photo-img', title: 'View', onclick: () => previewFile({ readFile: () => Vault.readShared(key, folder, v.photo), where: `${key}\\${folder}` }, v.photo) }, img),
          h('div', { class: 'op-veh-photo-acts' }, h('button', { type: 'button', class: 'btn small ghost', onclick: () => pick.click() }, 'Replace'), h('button', { type: 'button', class: 'btn small ghost', onclick: () => { v.photo = ''; save(); show(); } }, 'Remove')), pick);
      };
      pick.addEventListener('change', async () => {
        const f = pick.files[0]; pick.value = '';
        if (!f) return;
        try { v.photo = await Save.track(`shared:${key}`, () => Vault.addShared(key, folder, f)); save(); show(); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); }
      });
      show();
      return wrap;
    };
    const draw = () => {
      box.replaceChildren(
        ...(list.length ? list.map((v, i) => {
          const inputs = fields.map(([k, label, kind, opts]) => {
            let el;
            if (kind === 'select') el = h('select', { 'aria-label': `${noun} ${i + 1} ${label}` }, opts.map((o) => h('option', { value: o, selected: o === (v[k] || '') }, o || '—')));
            else el = h('input', { type: kind === 'date' ? 'date' : 'text', value: v[k] || '', autocomplete: 'off', 'aria-label': `${noun} ${i + 1} ${label}`, placeholder: kind === 'height' ? '5 ft 10 in' : kind === 'weight' ? '160 Pounds' : null });
            el.addEventListener(kind === 'select' ? 'change' : 'input', () => { v[k] = el.value; save(); });
            // v1.81: a subject's name suggests the suspects and offenders already in the Mission's
            // reports; picking one fills the boxes that are still empty.
            if (suggest && k === 'name' && window.CVCombo) {
              const box2 = CVCombo.attach(el, { items: () => people.map((p) => ({ value: p.name, label: p.name, hint: p.from.join('; ') })), onPick: (it) => {
                const p = people.find((x) => x.name === it.value);
                if (p) { for (const [f] of fields) if (p[f] && !String(v[f] || '').trim()) v[f] = p[f]; save(); draw(); }
              } });
              return field(label, box2, '');
            }
            return field(label, el, kind === 'wide' ? 'op-veh-wide' : '');
          });
          return h('div', { class: 'op-veh-card' },
            h('div', { class: 'op-veh-head' }, h('strong', {}, `${noun} ${i + 1}`), h('span', { class: 'muted small' }, summary(v) || ''), h('div', { class: 'spacer' }),
              h('button', { type: 'button', class: 'icon-btn danger-icon', title: `Remove this ${noun.toLowerCase()}`, onclick: async () => {
                if (!(await confirmDialog({ title: `Remove ${noun} ${i + 1}?`, message: `Its details are removed from ${folder}. A photo stays in the folder.`, confirmText: 'Remove', danger: true }))) return;
                list.splice(i, 1); save(); draw();
              } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove ${noun.toLowerCase()}`))),
            h('div', { class: 'op-veh-body' }, h('div', { class: 'op-veh-fields' }, ...inputs), photoBox(v)));
        }) : [h('p', { class: 'muted small' }, `No ${noun.toLowerCase()}s yet.`)]),
        h('div', { class: 'op-veh-foot' }, h('button', { type: 'button', class: 'btn small', icon, onclick: () => { list.push({ id: Vault.newId(noun[0].toLowerCase()) }); save(); draw(); const last = box.querySelectorAll('.op-veh-card'); if (last.length) last[last.length - 1].querySelector('input').focus(); } }, `Add ${noun}`),
          // v1.81: every suspect and offender of the Mission's reports not on the sheet yet, filled in.
          suggest ? h('button', { type: 'button', class: 'btn small', icon: 'people', title: 'Add every suspect (Details) and offender (Draft) of this Mission\'s cases that is not on this sheet yet', onclick: async () => {
            people = await suggest().catch(() => people);
            const have = new Set(list.map((x) => String(x.name || '').trim().toLowerCase()));
            const add = people.filter((p) => !have.has(p.name.toLowerCase()));
            if (!add.length) { toast('Everyone in the reports is already on this sheet.', 'info'); return; }
            for (const p of add) list.push({ id: Vault.newId('s'), ...Object.fromEntries(fields.map(([f]) => [f, p[f] || '']).filter(([, x]) => x)) });
            save(); draw(); toast(`${add.length} added from the reports.`, 'success');
          } }, 'Add From Reports') : ''));
    };
    let people = [];
    if (suggest) suggest().then((p) => { people = p; }).catch(() => {});
    read().then((v) => { list = v; draw(); }).catch((err) => { if (FS.isDisconnectError(err)) onDriveLost(); });
    return box;
  }

  // v1.72: tiles: the folders as folder icons, like Operations and General Files; a click opens
  // one (its files show under the icons), another click closes it.
  function sharedFilesBox(key, { folders: fixed = [], getFolders = null, allowNew = false, newTile = true, tiles = false, tileIcon = 'folder2-open', empty = 'No files yet.' } = {}) {
    const box = h('div', { class: `shared-files${tiles ? ' shared-tiles' : ''}`, 'data-key': key });
    const norm = (f) => (typeof f === 'string' ? { name: f, label: f } : { ...f, label: f.label || f.name });
    let folders = fixed.map(norm);
    let vehEl = null;
    let folder = sharedOpen[key] != null ? sharedOpen[key] : (tiles ? null : folders.length ? folders[0].name : (getFolders ? null : ''));
    const newFolder = async () => {
      const inp = h('input', { maxlength: 60, autocomplete: 'off', 'aria-label': 'Folder name', placeholder: 'ATF Files' });
      setTimeout(() => inp.focus(), 60);
      const name = await openDialog((close) => h('form', { class: 'dialog-form', onsubmit: (e) => { e.preventDefault(); close(inp.value.trim()); } },
        h('h2', { icon: 'folder-plus' }, 'New Folder in Other Files'),
        field('Folder Name', inp),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Create Folder'))));
      if (!name) return;
      try { folder = await Vault.addOtherFolder(name); sharedOpen[key] = folder; toast(`Folder ${folder} made.`, 'success'); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(err.message, 'error'); }
      draw();
    };
    const removeFolder = async (f) => {
      if (!(await confirmDialog({ title: `Remove the folder ${f.label}?`, message: 'Only an empty folder can be removed.', confirmText: 'Remove Folder', danger: true }))) return;
      try { await Vault.removeOtherFolder(f.name); folder = tiles ? null : folders[0].name; sharedOpen[key] = folder; } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(err.message, 'error'); }
      draw();
    };
    const pick = h('input', { type: 'file', multiple: true, hidden: true });
    const add = async (files) => {
      if (!files || !files.length || folder == null) return;
      try {
        for (const f of files) await Save.track(`shared:${key}`, () => Vault.addShared(key, folder, f));
        toast(`${files.length} file${files.length === 1 ? '' : 's'} added${folder ? ` to ${folder}` : ''}.`, 'success');
      } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(`Not added: ${err.message}`, 'error'); }
      draw();
    };
    pick.addEventListener('change', () => { add([...pick.files]); pick.value = ''; });
    const draw = async () => {
      let list = [];
      let counts = {};
      try {
        if (getFolders) folders = (await getFolders()).map(norm);
        if (folders.length && folder != null && !folders.some((f) => f.name === folder)) folder = tiles ? null : folders[0].name;
        list = folder == null ? [] : await Vault.listShared(key, folder);
        if (folders.length) for (const f of folders) counts[f.name] = f.name === folder ? list.length : (await Vault.listShared(key, f.name)).length;
      } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
      const cur = folders.find((f) => f.name === folder);
      const folderLabel = cur ? cur.label : '';
      // v1.69: the folders are tabs, like a case's Details / Timeline / Draft tabs.
      const tileRow = tiles ? h('div', { class: 'op-folders shared-folder-tiles', role: 'list' }, ...folders.map((f) => h('button', {
        type: 'button', role: 'listitem', class: `op-folder-tile shared-tile ${f.name === folder ? 'open' : ''}`, 'aria-expanded': String(f.name === folder),
        title: `${f.label}${f.desc ? `: ${f.desc}` : ''} (${counts[f.name] || 0} file${counts[f.name] === 1 ? '' : 's'})`,
        onclick: () => { folder = f.name === folder ? null : f.name; sharedOpen[key] = folder; draw(); },
      }, h('span', { class: 'op-folder-art' }, I(tileIcon), counts[f.name] ? h('span', { class: 'op-folder-count' }, String(counts[f.name])) : null),
      h('span', { class: 'op-folder-name op-two-line' }, h('span', { class: 'op-num' }, f.label), (f.desc || f.custom) ? h('span', { class: 'op-title' }, f.desc || 'Your own folder') : ''))),
      allowNew && newTile ? h('button', { type: 'button', role: 'listitem', class: 'op-folder-tile shared-tile shared-tile-new', title: 'Make a new folder in Other Files', onclick: newFolder },
        h('span', { class: 'op-folder-art' }, I('folder-plus')), h('span', { class: 'op-folder-name op-two-line' }, h('span', { class: 'op-num' }, 'New Folder'), h('span', { class: 'op-title' }, 'Make your own'))) : '') : null;
      if (tiles && folder == null) { box.replaceChildren(tileRow); return; }
      const chips = tiles ? tileRow : folders.length ? h('nav', { class: `tabs shared-tabs${folders.some((f) => f.desc) ? ' has-desc' : ''}`, role: 'tablist' }, ...folders.map((f) => h('button', {
        type: 'button', role: 'tab', class: `tab${f.name === folder ? ' active' : ''}`, 'aria-selected': String(f.name === folder), title: f.desc || null,
        onclick: () => { folder = f.name; sharedOpen[key] = f.name; draw(); },
      }, h('span', { class: 'tab-main' }, I(SHARED_ICONS[f.label] || (f.custom ? 'folder' : 'folder2-open')), h('span', { class: 'tab-name' }, f.label), h('span', { class: 'tab-count' }, String(counts[f.name] || 0))),
      f.desc ? h('span', { class: 'tab-desc' }, f.desc) : '')),
      allowNew ? h('button', { type: 'button', class: 'tab tab-new', title: 'Make a new folder in Other Files', onclick: newFolder }, h('span', { class: 'tab-main' }, I('folder-plus'), h('span', { class: 'tab-name' }, 'New Folder')), folders.some((f) => f.desc) ? h('span', { class: 'tab-desc' }, 'Your own folder') : '') : '') : null;
      const reader = { readFile: (name) => Vault.readShared(key, folder, name.split('/').pop()), where: `${key}${folder ? `\\${folder}` : ''}` };
      const rows = list.length ? h('table', { class: 'files shared-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', { class: 'num' }, 'Size'), h('th', { class: 'date-cell' }, 'Updated'), h('th', { class: 'col-actions' }, ''))),
        h('tbody', {}, list.map((f) => h('tr', {},
          h('td', {}, h('button', { type: 'button', class: 'linklike', title: 'Open', onclick: () => previewFile(reader, f.base) }, I(FILE_ICONS[fileKind(f.base)]), ' ', f.base)),
          h('td', { class: 'num muted' }, fmtSize(f.size)),
          h('td', { class: 'muted date-cell', title: `Last updated ${fmtDateTime(f.modified)}` }, f.modified ? fmtDate(Vault.localDay(new Date(f.modified))) : '—'),
          h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'icon-btn danger-icon', title: 'Delete this file', onclick: async () => {
            if (!(await confirmDialog({ title: `Delete ${f.base}?`, message: 'The file is deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
            try { await Vault.deleteShared(key, folder, f.base); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(`Not deleted: ${err.message}`, 'error'); }
            draw();
          } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${f.base}`))))))) : h('p', { class: 'muted small shared-empty' }, folderLabel ? `No files in ${folderLabel} yet.` : empty);
      // The vehicle cards are made once, so typing isn't lost when the file list redraws.
      // v1.80: Subject Data opens its demographics sheet the same way.
      const panelFor = { 'Vehicle List': opVehiclesPanel, 'Subject Data': opSubjectsPanel }[folder];
      if (key.startsWith('op-') && panelFor) vehEl = (vehEl && vehEl.dataset.folder === folder) ? vehEl : panelFor(key.slice(3));
      else vehEl = null;
      if (vehEl) vehEl.dataset.folder = folder;
      const vehicles = vehEl || '';
      box.replaceChildren(...[chips, tiles ? h('div', { class: 'op-open-head shared-open-head' }, h('strong', {}, folderLabel), h('span', { class: 'muted small' }, (cur && cur.desc) || ''), h('div', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn small ghost', title: 'Close this folder', onclick: () => { folder = null; sharedOpen[key] = null; draw(); } }, 'Close')) : '', vehicles, h('div', { class: 'shared-drop', title: 'Drop files here, or click Add Files' }, rows,
        h('div', { class: 'shared-foot' }, h('button', { type: 'button', class: 'btn small', icon: 'plus-lg', onclick: () => pick.click() }, folderLabel ? `Add Files to ${folderLabel}` : 'Add Files'), h('span', { class: 'muted small' }, 'or drop files here'),
          cur && cur.custom ? h('span', { class: 'spacer' }) : '', cur && cur.custom ? h('button', { type: 'button', class: 'btn small ghost danger', icon: 'trash3', title: 'Remove this folder (only when it is empty)', onclick: () => removeFolder(cur) }, 'Remove Folder') : ''), pick)].filter(Boolean));
    };
    box.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); box.classList.add('drop-on'); } });
    box.addEventListener('dragleave', () => box.classList.remove('drop-on'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drop-on'); add([...e.dataTransfer.files]); });
    box.newFolder = newFolder; // v1.74: New Folder sits in the section's header
    draw();
    return box;
  }

  function showDashboard() {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
    const cases = Vault.data.cases;
    const count = (s) => cases.filter((c) => c.status === s).length;
    const deadlines = cases.filter((c) => c.nextDeadline && c.status !== 'Closed' && c.status !== 'Archived')
      .sort((a, b) => (a.nextDeadline.date + a.nextDeadline.time).localeCompare(b.nextDeadline.date + b.nextDeadline.time));
    // Recently Updated can be cleared (v1.32): only cases changed after that show again.
    const clearedAt = (Vault.data.settings && Vault.data.settings.recentClearedAt) || '';
    const recent = [...cases].filter((c) => (c.updated || '') > clearedAt).sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 8);
    const tlBox = h('div', { class: 'dash-section op-timeline-section', hidden: true });
    const opBox = h('div', { class: 'dash-section op-open-section', hidden: true });

    $('#main').replaceChildren(h('section', { class: 'dashboard' },
      // v1.61: a smaller banner with the status counts in it, then quick actions and what needs you.
      welcomeHero(cases, deadlines, count),
      quickActions(),
      needsAttention(deadlines, cases),
      operationFolders(cases, tlBox, opBox),
      tlBox,
      // v1.42: no Upcoming Deadlines (the banner shows what's due); the open operation's case
      // numbers, each with its tabs, sit here instead, so the folders above never move.
      opBox,
      generalYearFolders(cases),
      // v1.68: OTHER FILES: anything not tied to a case number or an Operation.
      otherFilesSection(),
      // v1.71: Recently Updated as even columns, in the Quick Links' size, not bold.
      h('div', { class: 'dash-section ov-panel recent-section' }, panelHead('Recently Updated', 'The cases changed most recently. Clear empties the list.',
        recent.length ? h('button', { class: 'btn small', type: 'button', icon: 'x-circle', title: 'Empties this list. Cases you change after this show here again.', onclick: async () => {
          try { await Save.track('settings', () => Vault.updateSettings({ recentClearedAt: new Date().toISOString() })); showDashboard(); } catch { /* reported */ }
        } }, 'Clear') : ''),
      recent.length
        ? h('div', { class: 'recent-grid', role: 'table' },
          h('div', { class: 'recent-row recent-headrow', role: 'row' }, ...['Subject', 'Case Number', 'File Number', 'Status', 'Updated'].map((t) => h('span', { role: 'columnheader' }, t))),
          ...recent.map((c) => h('a', { href: `#/case/${encodeURIComponent(c.id)}`, class: 'recent-row', role: 'row' },
            h('span', { class: 'recent-cell' }, c.title || c.subject || 'Untitled case'),
            h('span', { class: 'recent-cell' }, c.number || '—'),
            h('span', { class: 'recent-cell' }, c.fileNumber || '—'),
            h('span', { class: 'recent-cell' }, statusPill(c.status)),
            h('span', { class: 'recent-cell muted' }, c.updated ? fmtDate(Vault.localDay(new Date(c.updated))) : '—'))))
        : h('p', { class: 'muted' }, cases.length ? 'Nothing changed since you cleared this list.' : 'Create your first case with "New case".')),
    ));
    // v1.63: Quick Links in the footer bar under the page, from the case list to the right edge.
  }

  /** v1.63: the Quick Links footer: shown on the Overview, empty and hidden everywhere else.
   * The round Ask AI / Notes buttons sit just above it (--ql-dock-h). */
  let footerRO = null;
  document.addEventListener('cv-links-changed', () => { if (state.connected && $('#ql-footer').childElementCount) quickFooter(true); });
  function quickFooter(on) {
    const foot = $('#ql-footer');
    if (!foot) return;
    if (footerRO) { footerRO.disconnect(); footerRO = null; }
    if (!on) { foot.hidden = true; foot.replaceChildren(); document.body.style.removeProperty('--ql-dock-h'); return; }
    foot.replaceChildren(h('span', { class: 'ql-foot-title' }, I('link-45deg'), h('span', {}, 'Quick Links')), CVReferenceUI.quickLinks({ footer: true }));
    foot.hidden = false;
    const setH = () => document.body.style.setProperty('--ql-dock-h', foot.hidden ? '0px' : `${Math.ceil(foot.getBoundingClientRect().height)}px`);
    if (typeof ResizeObserver === 'function') { footerRO = new ResizeObserver(setH); footerRO.observe(foot); }
    setH();
  }


  /* =====================================================================
   * Operations (#/operations, #/operation/<id>) and General Files (#/general), v1.46
   * ===================================================================== */

  function pageStart(title) {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
  }
  const caseLink = (c, tab = 'details') => `#/case/${encodeURIComponent(c.id)}/${tab}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /** New or edit Operation. Resolves to the saved Operation, or null. */
  async function operationDialog(op = null) {
    const saved = await openDialog((close) => {
      const v = op || { status: 'Open', start: today() };
      const numberIn = h('input', { name: 'number', required: true, maxlength: 100, autocomplete: 'off', autofocus: true, value: v.number || (op ? '' : CVOperation.nextOpNumber(Vault.listOperations())) });
      const nameIn = h('input', { name: 'name', required: true, maxlength: 200, autocomplete: 'off', value: v.name || '' });
      const statusIn = h('select', { name: 'status' }, CVOperation.OP_STATUSES.map((x) => h('option', { selected: x === v.status }, x)));
      const startIn = h('input', { name: 'start', type: 'date', value: v.start || '' });
      const endIn = h('input', { name: 'end', type: 'date', value: v.end || '' });
      const notesIn = h('textarea', { name: 'notes', rows: 4, maxlength: 20000, 'aria-label': 'Notes' }, v.notes || '');
      const err = h('p', { class: 'error-text small span-2', role: 'alert', hidden: true });
      const form = h('form', { class: 'form-grid op-form', onsubmit: async (e) => {
        e.preventDefault();
        const fields = { number: numberIn.value, name: nameIn.value, status: statusIn.value, start: startIn.value, end: endIn.value, notes: notesIn.value };
        const errs = CVOperation.validateOperation(fields, Vault.listOperations(), op ? op.id : '');
        err.hidden = !errs.length;
        err.textContent = errs.join(' ');
        if (errs.length) return;
        try {
          close(await Save.track(op ? `op:${op.id}` : 'new-op', () => (op ? Vault.updateOperation(op.id, fields) : Vault.createOperation(fields))));
        } catch (ex) { err.hidden = false; err.textContent = ex.message; }
      } },
      h('h2', { class: 'span-2', icon: 'op-folder' }, op ? 'Edit Mission' : 'New Mission'),
      formSect('Mission', 'op-folder'),
      field('Mission Number', numberIn, '', 'Unique: no two Missions share a number.'),
      field('Mission Name', nameIn),
      formSect('Status and Dates', 'calendar-event'),
      h('div', { class: 'span-2 form-row3' }, field('Status', statusIn), field('Start Date', startIn), field('End Date', endIn)),
      formSect('Notes', 'journal-text'),
      h('div', { class: 'span-2 field' }, notesIn),
      err,
      h('div', { class: 'dialog-actions span-2' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, op ? 'Save changes' : 'Create Mission')));
      return form;
    });
    if (saved) renderCaseList();
    return saved;
  }

  /** The Operations page: every Operation with its status, dates and number of cases. */
  function showOperations() {
    pageStart('Missions');
    const ops = [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name));
    const count = (op) => (Vault.data.cases || []).filter((c) => c.operationId === op.id).length;
    $('#main').replaceChildren(h('section', { class: 'ops-page' },
      h('div', { class: 'page-head' }, h('h1', {}, 'Missions'), h('div', { class: 'spacer' }),
        h('a', { class: 'btn', href: '#/general', icon: 'folder-fill' }, 'General Files'),
        h('button', { class: 'btn primary', type: 'button', icon: 'plus-lg', onclick: async () => { const op = await operationDialog(); if (op) location.hash = `#/operation/${encodeURIComponent(op.id)}`; } }, 'New Mission')),
      h('p', { class: 'muted small' }, 'A Mission links cases together. The cases themselves stay in General Files; deleting a Mission never deletes a case or a file.'),
      ops.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table ops-table' },
        h('thead', {}, h('tr', {}, ['Mission', 'Status', 'Start Date', 'End Date', 'Cases'].map((x) => h('th', { class: /Date$/.test(x) ? 'date-cell' : '' }, x)))),
        h('tbody', {}, ops.map((op) => h('tr', {},
          h('td', {}, h('a', { href: `#/operation/${encodeURIComponent(op.id)}`, class: 'op-row-link' }, I('op-folder'), opLabel(op))),
          h('td', {}, statusPill(op.status)),
          h('td', { class: 'nowrap date-cell' }, op.start ? fmtDate(op.start) : '—'),
          h('td', { class: 'nowrap date-cell' }, op.end ? fmtDate(op.end) : '—'),
          h('td', { class: 'num' }, String(count(op))))))))
        : h('div', { class: 'empty-state' }, h('p', {}, 'No Missions yet.'), h('p', { class: 'muted small' }, 'New Mission makes one. Then create cases inside it, or link cases from General Files.'))));
  }

  /** Pick cases from General Files to link to an Operation. Cases already in another Operation
   * are shown but can't be picked: unlink them there first. */
  async function addExistingDialog(op) {
    const ids = await openDialog((close) => {
      const q = h('input', { type: 'search', placeholder: 'Search by case number or subject', 'aria-label': 'Search cases', autofocus: true });
      const rows = h('div', { class: 'pick-list', role: 'list' });
      const picked = new Set();
      const ok = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Link cases');
      const draw = () => {
        const t = q.value.trim().toLowerCase();
        const list = (Vault.data.cases || []).filter((c) => !isArchivedEntry(c) && c.operationId !== op.id)
          .filter((c) => !t || [c.number, c.subject, c.title].join(' ').toLowerCase().includes(t)).sort(byNumber);
        rows.replaceChildren(...(list.length ? list.slice(0, 300).map((c) => {
          const other = opOf(c);
          const box = h('input', { type: 'checkbox', disabled: !!other, checked: picked.has(c.id) });
          box.addEventListener('change', () => { if (box.checked) picked.add(c.id); else picked.delete(c.id); ok.disabled = !picked.size; ok.textContent = picked.size > 1 ? `Link ${picked.size} cases` : 'Link case'; });
          return h('label', { class: `pick-row${other ? ' disabled' : ''}`, role: 'listitem', title: other ? `Already in ${opLabel(other)}. Unlink it there first.` : '' }, box,
            h('span', { class: 'pick-num' }, c.number || 'No case number'), h('span', { class: 'pick-subject' }, c.subject || 'No subject yet'),
            h('span', { class: 'pick-op muted small' }, other ? `In ${opLabel(other)}` : 'Independent'));
        }) : [h('p', { class: 'muted' }, t ? 'No cases match.' : 'No other cases in General Files.')]));
      };
      q.addEventListener('input', draw);
      draw();
      return h('form', { class: 'add-existing', onsubmit: (e) => { e.preventDefault(); close([...picked]); } },
        h('h2', { 'data-keep-case': 'true' }, `Add existing case to ${opLabel(op)}`), q, rows,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), ok));
    });
    if (!ids || !ids.length) return 0;
    let n = 0;
    for (const id of ids) if (await linkCase(id, op.id)) n += 1;
    return n;
  }

  /** One Operation: its fields (edit), its Files (the linked cases) and Delete. */
  function showOperation(id) {
    const op = Vault.getOperation(id);
    pageStart(op ? opLabel(op) : 'Mission');
    if (!op) {
      $('#main').replaceChildren(h('section', { class: 'ops-page' }, h('h1', {}, 'Mission not found'),
        h('p', {}, 'This Mission was deleted. Its cases are in General Files.'), h('p', {}, h('a', { href: '#/operations' }, 'All Missions'), ' · ', h('a', { href: '#/general' }, 'General Files'))));
      return;
    }
    const members = (Vault.data.cases || []).filter((c) => c.operationId === op.id).sort(byNumber);
    const redraw = () => { renderCaseList(); showOperation(id); };
    const tlCase = members.find((c) => !isArchivedEntry(c));
    const tlPanel = h('div', { class: 'op-timeline' }, tlCase ? h('p', { class: 'muted small' }, 'Loading the timeline…') : h('p', { class: 'muted' }, 'Add a case number to this Mission to keep its timeline here.'));
    if (tlCase) {
      const tk = state.renderToken;
      setTimeout(() => renderTimeline(tlPanel, tlCase, tk).catch((err) => { if (FS.isDisconnectError(err)) onDriveLost(); else tlPanel.replaceChildren(h('p', { class: 'muted' }, `Could not read the timeline: ${err.message}`)); }), 0);
    }
    const info = (label, value) => h('div', { class: 'op-info-item' }, h('span', { class: 'op-info-label' }, label), h('span', { class: 'op-info-value' }, value || '—'));
    $('#main').replaceChildren(h('section', { class: 'ops-page op-page' },
      h('a', { href: '#/operations', class: 'back-link' }, '← All Missions'),
      h('div', { class: 'page-head' },
        h('span', { class: 'page-icon' }, I('op-folder')),
        h('div', { class: 'page-title' }, h('h1', {}, opLabel(op)), h('div', { class: 'muted small' }, plural(members.length, 'case'), ' · ', statusPill(op.status))),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', icon: 'pencil', onclick: async () => { if (await operationDialog(op)) redraw(); } }, 'Edit Mission')),
      h('div', { class: 'op-info' },
        info('Mission Number', op.number), info('Mission Name', op.name), info('Status', op.status), info('Start Date', op.start ? fmtDate(op.start) : ''), info('End Date', op.end ? fmtDate(op.end) : '')),
      op.notes ? h('div', { class: 'op-notes' }, h('span', { class: 'op-info-label' }, 'Notes'), h('p', {}, op.notes)) : null,
      // v1.74: plain headers; the explanations sit under each section, small.
      h('div', { class: 'section-head op-files-head' }, h('h2', { class: 'section-title caps' }, 'Files'), h('div', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', icon: 'link-45deg', onclick: async () => { if (await addExistingDialog(op)) redraw(); } }, 'Add Existing Case'),
        h('button', { class: 'btn primary', type: 'button', icon: 'plus-lg', onclick: () => newCase({ operationId: op.id }) }, 'New Case in this Mission')),
      members.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table op-cases-table' },
        h('thead', {}, h('tr', {}, ['Case Number', 'Subject Name', 'Status', 'Opened', 'Open', ''].map((x) => h('th', { class: x === 'Opened' ? 'date-cell' : '' }, x)))),
        h('tbody', {}, members.map((c) => h('tr', { class: isArchivedEntry(c) ? 'archived-row' : '' },
          h('td', {}, h('a', { href: caseLink(c), class: 'case-num-link' }, c.number || 'No case number')),
          h('td', { class: c.subject ? '' : 'muted' }, c.subject || 'No subject yet'),
          h('td', {}, statusPill(isArchivedEntry(c) ? 'Archived' : c.status)),
          h('td', { class: 'nowrap date-cell' }, c.opened ? fmtDate(c.opened) : '—'),
          h('td', { class: 'nowrap' }, h('div', { class: 'op-case-links' }, OP_TABS.map(([tab, label]) => h('a', { class: 'op-tab-link', href: caseLink(c, tab) }, label)))),
          h('td', { class: 'nowrap' }, isArchivedEntry(c)
            ? h('span', { class: 'muted small', title: 'Archived cases are read-only. Restore it to unlink it.' }, 'Archived')
            : h('button', { class: 'btn small', type: 'button', icon: 'folder-symlink', title: 'Move this case to General Files or another Mission', onclick: async () => { if (await moveCaseDialog(c)) redraw(); } }, 'Move File')))))))
        : h('div', { class: 'empty-state' }, h('p', {}, 'No cases in this Mission yet.'), h('p', { class: 'muted small' }, 'New Case in this Mission creates one; Add Existing Case links one from General Files.')),
      h('p', { class: 'muted small op-section-note' }, 'The cases linked to this Mission. They live in General Files; nothing is copied.'),
      // v1.78: the Mission's timeline (all its case numbers) on its main page.
      h('div', { class: 'section-head op-tl-head', id: 'op-timeline' }, h('h2', { class: 'section-title caps' }, 'Timeline')),
      tlPanel,
      // v1.68: the Operation's own folder, not tied to a case number.
      h('div', { class: 'section-head op-folder-head', id: 'op-folder' }, h('h2', { class: 'section-title caps' }, 'Mission Folder')),
      sharedFilesBox(`op-${op.id}`, { tiles: true, tileIcon: 'folder-mission', folders: Vault.OP_FOLDERS.map((n) => ({ name: n, label: opFolderLabel(n), desc: OP_FOLDER_DESC[n] || '' })) }),
      h('p', { class: 'muted small op-section-note' }, 'For the whole Mission, not one case number. Kept on the SSD in CaseVault-Data\\shared.'),
      h('section', { class: 'case-actions op-danger', 'aria-labelledby': 'op-actions-title' },
        h('h3', { id: 'op-actions-title', icon: 'sliders' }, 'Mission actions'),
        h('div', { class: 'case-actions-grid' },
          h('button', { class: 'btn danger action-btn', type: 'button', icon: 'trash3', title: 'Removes the Mission only. Its cases and files stay in General Files.', onclick: async () => {
            const ok = await confirmDialog({ title: 'Delete Mission', danger: true, confirmText: 'Delete Mission',
              message: 'Are you sure you want to delete this Mission? The Mission and its Files folder will be removed. All associated cases and files will be preserved and will remain available in General Files as independent cases.' });
            if (!ok) return;
            try {
              await Save.flushAll();
              const n = await Save.track(`op:${op.id}`, () => Vault.deleteOperation(op.id));
              toast(`Mission deleted. ${plural(n, 'case')} kept in General Files.`, 'success', 5000);
              renderCaseList();
              location.hash = '#/general';
            } catch { /* reported by Save */ }
          } }, 'Delete Mission')))));
  }

  /** General Files: every case (archived ones too), whether or not it's in an Operation. */
  function showGeneralFiles() {
    pageStart('General Files');
    const dups = CVOperation.duplicateNumbers(Vault.data.cases);
    const q = h('input', { type: 'search', placeholder: 'Search by case number, subject or Mission', 'aria-label': 'Search General Files', value: state.generalQuery || '' });
    const show = h('select', { 'aria-label': 'Show' }, [['all', 'All cases'], ['loose', 'Independent cases'], ['linked', 'In a Mission'], ['archived', 'Archived']].map(([v, l]) => h('option', { value: v, selected: v === (state.generalShow || 'all') }, l)));
    const body = h('tbody', {});
    const countEl = h('span', { class: 'muted small' });
    const redraw = () => { renderCaseList(); showGeneralFiles(); };
    const draw = () => {
      state.generalQuery = q.value;
      state.generalShow = show.value;
      const t = q.value.trim().toLowerCase();
      const list = (Vault.data.cases || []).filter((c) => {
        const op = opOf(c);
        if (show.value === 'loose' && (op || isArchivedEntry(c))) return false;
        if (show.value === 'linked' && !op) return false;
        if (show.value === 'archived' && !isArchivedEntry(c)) return false;
        return !t || [c.number, c.subject, c.title, c.fileNumber, c.status, op ? opLabel(op) : 'general files'].join(' ').toLowerCase().includes(t);
      }).sort(byNumber);
      countEl.textContent = `${plural(list.length, 'case')}${list.length !== Vault.data.cases.length ? ` of ${Vault.data.cases.length}` : ''}`;
      body.replaceChildren(...(list.length ? list.map((c) => {
        const op = opOf(c);
        const dup = dups.has(CVOperation.normNumber(c.number));
        const arch = isArchivedEntry(c);
        // v1.50: one Move File button (it was Unlink, or an "Assign to…" list).
        const action = arch ? null : h('button', { class: 'btn small', type: 'button', icon: 'folder-symlink', title: 'Move this case into a Mission, to another one, or back to General Files', onclick: async () => { if (await moveCaseDialog(c)) redraw(); } }, 'Move File');
        return h('tr', { class: arch ? 'archived-row' : '' },
          h('td', {}, h('a', { href: caseLink(c), class: 'case-num-link' }, c.number || 'No case number'),
            dup ? h('span', { class: 'dup-flag', title: 'Another case has the same Case Number (made before numbers had to be unique). Nothing was changed.' }, I('exclamation-triangle-fill'), 'Duplicate') : null),
          h('td', { class: c.subject ? '' : 'muted' }, c.subject || 'No subject yet'),
          h('td', {}, op ? h('a', { href: `#/operation/${encodeURIComponent(op.id)}` }, opLabel(op)) : h('span', { class: 'muted' }, '—')),
          h('td', {}, statusPill(arch ? 'Archived' : c.status)),
          h('td', { class: 'nowrap date-cell' }, c.opened ? fmtDate(c.opened) : '—'),
          h('td', { class: 'nowrap' }, action));
      }) : [h('tr', {}, h('td', { colspan: 6, class: 'muted empty-cell' }, Vault.data.cases.length ? 'No cases match.' : 'No cases yet. New Case makes one.'))]));
    };
    q.addEventListener('input', debounce(draw, 120));
    show.addEventListener('change', draw);
    draw();
    $('#main').replaceChildren(h('section', { class: 'ops-page general-page' },
      h('div', { class: 'page-head' },
        h('span', { class: 'page-icon gf-icon' }, I('folder-fill')),
        h('div', { class: 'page-title' }, h('h1', {}, 'General Files'), h('div', { class: 'muted small' }, 'Every case, in a Mission or not. A Mission only links cases; they are always kept here.')),
        h('div', { class: 'spacer' }),
        h('a', { class: 'btn', href: '#/operations', icon: 'op-folder' }, 'Missions'),
        h('button', { class: 'btn primary', type: 'button', icon: 'plus-lg', onclick: () => newCase() }, 'New Case')),
      dups.size ? h('p', { class: 'warn-note small', role: 'note' }, I('exclamation-triangle-fill'), ` ${plural(dups.size, 'Case Number')} ${dups.size === 1 ? 'is' : 'are'} used by more than one case (made before numbers had to be unique). They are flagged below; nothing was changed.`) : null,
      h('div', { class: 'general-tools' }, q, show, countEl),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table general-table' },
        h('thead', {}, h('tr', {}, ['Case Number', 'Subject Name', 'Mission', 'Status', 'Opened', ''].map((x) => h('th', { class: x === 'Opened' ? 'date-cell' : '' }, x)))),
        body))));
  }

  /* Operations on the Overview (v1.28): a blue folder for each operation (Title or Operation Name),
   * its name under it. Click one to open it: its case numbers, each with its Reports, Field Notes,
   * Files (photos, documents) and Timeline. Which one is open is remembered for this visit. */
  const opFolderState = { open: '', close: null };
  // v1.44: just Details, Reports and Files, as words.
  const OP_TABS = [['details', 'Details'], ['reports', 'Reports'], ['files', 'Files']];
  // Empty space: anything that isn't a control, a link, a folder, the open folder's cases or the
  // timeline, and nothing inside a dialog or the sidebar.
  // v1.47: the General Files year folders close the same way.
  const yearFolderState = { open: '', close: null };
  document.addEventListener('click', (e) => {
    if (!(opFolderState.open && opFolderState.close) && !(yearFolderState.open && yearFolderState.close)) return;
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('#main')) return;
    if (t.closest('a, button, input, select, textarea, label, summary, details, [role="button"], [contenteditable], .op-folder-tile, .op-open, .op-open-section, .op-timeline-section, .htl-wrap, .dialog')) return;
    if (window.getSelection && String(window.getSelection())) return; // selecting text isn't a click away
    if (opFolderState.open && opFolderState.close) opFolderState.close();
    if (yearFolderState.open && yearFolderState.close) yearFolderState.close();
  });
  /** A case as a card on the Overview: its number, subject (and Operation), status and tabs. */
  function overviewCard(c, withOp = false) {
    const to = (tab, sub) => `#/case/${encodeURIComponent(c.id)}/${tab}${sub ? `/${sub}` : ''}`;
    const op = withOp ? opOf(c) : null;
    return h('div', { class: 'op-case-card' },
      h('a', { class: 'op-case-top', href: to('details') }, h('span', { class: 'op-case-id' }, h('span', { class: 'op-case-num' }, c.number || 'No case number yet'),
        h('span', { class: 'op-case-subject muted' }, [c.subject || 'No subject yet', op ? opLabel(op) : ''].filter(Boolean).join(' · '))), statusPill(c.status)),
      h('nav', { class: 'op-case-links', 'aria-label': `${c.number || 'Case'} tabs` },
        ...OP_TABS.map(([tab, label]) => h('a', { class: 'op-tab-link', href: to(tab) }, label))));
  }
  /* General Files on the Overview (v1.47): the cases that aren't in an Operation, a folder for each
   * year they were opened (newest first), between Operations and Recently Updated. Click a year to
   * see its cases under the folders. */
  /** v1.71: the Overview's section header, the same for every section: the title in capitals with
   * a one-line description under it, and its button on the right. */
  function panelHead(title, desc, action = '') {
    return h('div', { class: 'section-head ov-head' },
      h('div', { class: 'ov-head-text' }, h('h2', { class: `section-title caps${/ Files$/i.test(title) ? ' ov-files-title' : ''}` }, h('span', { class: /^Other Files$/i.test(title) ? 'ov-title-wide' : '' }, title)), h('span', { class: 'ov-desc muted small' }, desc)),
      h('div', { class: 'spacer' }), action || h('span', { class: 'ov-action-space' }));
  }
  /** v1.74: OTHER FILES with New Folder in its header, like All Cases and All Operations. */
  function otherFilesSection() {
    const files = sharedFilesBox('other', { allowNew: true, newTile: false, tiles: true, tileIcon: 'folder-other', empty: 'No files yet. Add forms, training or reference sheets here.',
      getFolders: async () => [...Vault.OTHER_FOLDERS, ...(await Vault.otherCustomFolders()).map((n) => ({ name: n, custom: true }))] });
    return h('div', { class: 'dash-section ov-panel other-files-section' },
      panelHead('Other Files', 'Not tied to a case number or a Mission. Kept on the SSD in CaseVault-Data\\shared\\other.',
        h('button', { type: 'button', class: 'btn small ov-btn-other', icon: 'folder-other', title: 'Make a new folder in Other Files', onclick: () => files.newFolder() }, 'New Folder')),
      files);
  }
  function generalYearFolders(cases) {
    const loose = cases.filter((c) => !isArchivedEntry(c) && (!c.operationId || !Vault.getOperation(c.operationId)));
    const yearOf = (c) => (/^\d{4}/.exec(String(c.opened || '')) || [''])[0];
    const years = [...new Set(loose.map(yearOf))].sort((a, b) => (!a) - (!b) || b.localeCompare(a));
    const list = years.map((y) => ({ k: y || 'none', name: y || 'No Date', group: loose.filter((c) => yearOf(c) === y).sort(byNumber) }));
    const box = h('div', { class: 'dash-section ov-panel op-folders-section general-years-section' });
    const draw = () => {
      const open = list.find((o) => o.k === yearFolderState.open);
      const tiles = h('div', { class: 'op-folders', role: 'list' }, list.map((o) => {
        const bell = o.group.some((c) => c.nextDeadline && dueLabel(c.nextDeadline.date) && c.status !== 'Closed');
        return h('button', { type: 'button', role: 'listitem', class: `op-folder-tile year-tile ${open === o ? 'open' : ''}`, 'aria-expanded': String(open === o),
          title: `${o.name}: ${o.group.length} case${o.group.length === 1 ? '' : 's'} not in a Mission`,
          onclick: () => { yearFolderState.open = open === o ? '' : o.k; draw(); } },
        h('span', { class: 'op-folder-art' }, I('folder-general'), o.group.length > 1 ? h('span', { class: 'op-folder-count' }, String(o.group.length)) : null),
        h('span', { class: 'op-folder-name' }, o.name, bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null));
      }));
      const inside = open ? h('div', { class: 'op-open' },
        h('div', { class: 'op-open-head' }, h('strong', {}, `General Files ${open.name}`), h('span', { class: 'muted small' }, `${open.group.length} case${open.group.length === 1 ? '' : 's'}`),
          h('div', { class: 'spacer' }), h('button', { type: 'button', class: 'btn small', onclick: () => newCase() }, 'New Case')),
        h('div', { class: 'op-open-cases' }, open.op ? h('a', { class: 'op-folder-card', href: `#/operation/${encodeURIComponent(open.op.id)}`, title: 'Subpoenas, Affidavits, Mission Plans, Maps, Subject Data and the Vehicle List, for the whole Mission' },
          I('op-folder'), h('span', { class: 'op-folder-card-text' }, h('strong', {}, 'Mission Folder'), h('span', { class: 'muted small' }, Vault.OP_FOLDERS.map(opFolderLabel).join(' · ')))) : null,
        ...open.group.map((c) => overviewCard(c)))) : null;
      box.replaceChildren(...[panelHead('General Files', 'Cases not in a Mission, by the year they were opened.', h('a', { class: 'btn small ov-btn-general', href: '#/general', icon: 'folder-general' }, 'All Cases')),
        list.length ? tiles : h('p', { class: 'muted' }, 'Every case is in a Mission. Cases that aren\'t show here by the year they were opened.'), inside].filter(Boolean));
    };
    yearFolderState.close = () => { if (yearFolderState.open && box.isConnected) { yearFolderState.open = ''; draw(); } };
    draw();
    return box;
  }
  function operationFolders(cases, tlBox = null, opBox = null) {
    const active = cases.filter((c) => !isArchivedEntry(c));
    // v1.46: a folder for each Operation (Operation Number order, as in the case list), then
    // General Files with the cases that aren't in one.
    const list = Vault.listOperations().map((op) => ({ k: op.id, op, name: opLabel(op), group: active.filter((c) => c.operationId === op.id).sort(byNumber) }))
      .sort((a, b) => byFileNumber(a.op.number, b.op.number) || a.op.name.localeCompare(b.op.name));
    // v1.47: General Files has its own section below, by year.
    const box = h('div', { class: 'dash-section ov-panel op-folders-section' });
    const draw = () => {
      const open = list.find((o) => o.k === opFolderState.open);
      const tiles = h('div', { class: 'op-folders', role: 'list' }, list.map((o) => {
        const bell = o.group.some((c) => c.nextDeadline && dueLabel(c.nextDeadline.date) && c.status !== 'Closed');
        return h('button', { type: 'button', role: 'listitem', class: `op-folder-tile ${open === o ? 'open' : ''}`, 'aria-expanded': String(open === o),
          title: `${o.name}: ${o.group.length} case number${o.group.length === 1 ? '' : 's'}`,
          onclick: () => { opFolderState.open = open === o ? '' : o.k; draw(); } },
        h('span', { class: 'op-folder-art' }, I('folder-mission'), o.group.length > 1 ? h('span', { class: 'op-folder-count' }, String(o.group.length)) : null),
        // v1.60: Operation Number on top, name below (as in the sidebar).
        h('span', { class: 'op-folder-name op-two-line' }, ...[h('span', { class: 'op-num' }, o.op.number || 'No number', bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null),
          o.op.name ? h('span', { class: 'op-title' }, o.op.name) : null].filter(Boolean)));
      }));
      const inside = open ? h('div', { class: 'op-open' },
        h('div', { class: 'op-open-head' }, h('a', { href: open.op ? `#/operation/${encodeURIComponent(open.op.id)}` : '#/general', class: 'op-open-name' }, h('strong', {}, open.name)), h('span', { class: 'muted small' }, `${open.group.length} case number${open.group.length === 1 ? '' : 's'}`),
          h('div', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn small', onclick: () => newCase(open.op ? { operationId: open.op.id } : {}) }, open.op ? 'Add Case Number' : 'New Case')),
        h('div', { class: 'op-open-cases' }, open.group.length ? open.group.map((c) => overviewCard(c)) : [h('p', { class: 'muted' }, open.op ? 'No cases in this Mission yet. Add Case Number creates one here.' : 'No independent cases.')])) : null;
      box.replaceChildren(...[panelHead('Mission Files', 'Case numbers worked together as a Mission. Click a folder to open it.', h('div', { class: 'ov-head-actions' },
          // v1.78: New Mission right here, beside All Missions.
          h('button', { class: 'btn small ov-btn-mission', type: 'button', icon: 'plus-lg', onclick: async () => { const op = await operationDialog(); if (op) { renderCaseList(); location.hash = `#/operation/${encodeURIComponent(op.id)}`; } } }, 'New Mission'),
          h('a', { class: 'btn small ov-btn-mission', href: '#/operations', icon: 'folder-mission' }, 'All Missions'))),
        list.length ? tiles : h('p', { class: 'muted' }, 'No Missions yet. All Missions → New Mission makes one.'), opBox ? null : inside].filter(Boolean));
      if (opBox) { opBox.hidden = !inside; opBox.replaceChildren(...(inside ? [inside] : [])); }
      if (tlBox) drawTimeline(open);
    };
    // The open operation's Timeline (v1.32): every case number's events, in its own section above
    // Upcoming Deadlines.
    let tlToken = 0;
    async function drawTimeline(open) {
      const my = ++tlToken;
      if (!open) { tlBox.hidden = true; tlBox.replaceChildren(); return; }
      const tls = [];
      for (const c of open.group) { try { tls.push({ caseId: c.id, number: c.number || '', events: ((await Vault.getTimeline(c.id)) || {}).events || [] }); } catch { /* moved */ } }
      if (my !== tlToken) return;
      const rows = CVOperation.mergeEvents(tls);
      tlBox.hidden = false;
      // v1.33: a timeline you can click, left to right in date order; each event opens it on the
      // Timeline tab. Deadlines are diamonds (red when overdue), done ones are faded, today is marked.
      const todayIso = today();
      const track = h('ol', { class: 'htl', 'aria-label': `Timeline of ${open.name}` });
      let todayShown = false;
      for (const { caseId, number, ev } of rows) {
        if (!todayShown && (ev.date || '') > todayIso) { track.append(h('li', { class: 'htl-today', 'aria-label': 'Today' }, h('span', {}, 'Today'))); todayShown = true; }
        const due = ev.kind === 'deadline' && !ev.done ? dueLabel(ev.date) : null;
        track.append(h('li', { class: `htl-item ${ev.kind === 'deadline' ? 'deadline' : 'event'}${ev.done ? ' done' : ''}${due ? ` ${due.cls}` : ''}` },
          h('a', { class: 'htl-link', href: `#/case/${encodeURIComponent(caseId)}/timeline`, title: [ev.title, ev.note].filter(Boolean).join('\n') },
            h('span', { class: 'htl-date' }, fmtDate(ev.date), ev.time ? h('span', { class: 'htl-time' }, ev.time) : null),
            h('span', { class: 'htl-dot', 'aria-hidden': 'true' }),
            h('span', { class: 'htl-card' },
              h('span', { class: 'htl-title' }, ev.title || (ev.kind === 'deadline' ? 'Deadline' : 'Event')),
              h('span', { class: 'htl-meta' }, [ev.kind === 'deadline' ? (ev.done ? 'Done' : due ? due.text : 'Deadline') : '', number && open.group.length > 1 ? number : ''].filter(Boolean).join(' · '))))));
      }
      if (!todayShown && rows.length) track.append(h('li', { class: 'htl-today', 'aria-label': 'Today' }, h('span', {}, 'Today')));
      tlBox.replaceChildren(
        h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, `Timeline: ${open.name}`)),
        rows.length ? h('div', { class: 'htl-wrap' }, track) : h('p', { class: 'muted' }, 'No events yet. Add them on a case\'s Timeline tab.'));
      // Start at today's place.
      const mark = track.querySelector('.htl-today');
      if (mark) requestAnimationFrame(() => { const w = track.parentElement; w.scrollLeft = Math.max(0, mark.offsetLeft - w.clientWidth / 2); });
    }
    // v1.38: a click on empty space on the Overview closes the open folder.
    opFolderState.close = () => { if (opFolderState.open && box.isConnected) { opFolderState.open = ''; draw(); } };
    draw();
    return box;
  }

  /* The landing page's welcome banner (v1.21): a greeting, the date and time, what needs you
   * today, and one-click actions. */
  function welcomeHero(cases, deadlines, count) {
    const who = ((Vault.data.settings.affiant || {}).name || '').trim();
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Working Late' : hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    const clock = h('div', { class: 'hero-clock', 'aria-hidden': 'true' });
    const dateLine = h('span', { class: 'hero-date' });
    const tick = () => {
      if (!clock.isConnected && clock.dataset.started) return false;
      const d = new Date();
      clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dateLine.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' });
      return true;
    };
    tick();
    clock.dataset.started = '1';
    const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 15000);
    // v1.61: the status counts sit in the banner (no separate row of boxes).
    const counts = h('div', { class: 'hero-counts' }, Vault.STATUSES.map((st) => h('span', { class: `hero-count hc-${st.toLowerCase()}`, title: `${count(st)} ${st} case${count(st) === 1 ? '' : 's'}` },
      I(STATUS_ICONS[st]), h('strong', {}, String(count(st))), h('span', {}, st))));
    return h('div', { class: 'hero hero-compact' },
      h('div', { class: 'hero-art', 'aria-hidden': 'true' }, h('span', { class: 'hero-ring r1' }), h('span', { class: 'hero-ring r2' }), h('span', { class: 'hero-ring r3' }), I('shield-lock-fill')),
      h('div', { class: 'hero-text' },
        h('div', { class: 'hero-line' }, h('h1', { class: 'hero-title' }, `${greet}${who ? `, ${who.split(/\s+/)[0]}` : ''}`), dateLine),
        counts),
      clock);
  }

  /* v1.61: one row of same-size actions under the banner. Draft, Discovery and Link Chart ask
   * which case first. */
  function quickActions() {
    const tile = (label, icon, onclick, tip) => h('button', { type: 'button', class: 'qa-tile', title: tip, onclick }, h('span', { class: 'qa-icon' }, I(icon)), h('span', { class: 'qa-label' }, label));
    const toTab = (tab) => async () => { const c = await pickCase(tab === 'draft' ? 'Draft: Which Case?' : 'Link Chart: Which Case?', tab === 'draft' ? 'pencil-square' : 'diagram-3-fill'); if (c) location.hash = caseLink(c, tab); };
    const discovery = async () => {
      const c = await pickCase('Discovery: Which Case?', 'shield-lock-fill');
      if (!c) return;
      location.hash = caseLink(c, 'files');
      try { await CVDiscoveryUI.open(await Vault.getCase(c.id)); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); else toast(`Could not open Discovery: ${err.message}`, 'error'); }
    };
    return h('div', { class: 'quick-actions', role: 'toolbar', 'aria-label': 'Quick actions' },
      tile('New Case', 'plus-lg', () => newCase(), 'Make a new case'),
      tile('Draft', 'pencil-square', toTab('draft'), 'Open the Draft tab of a case'),
      tile('Discovery', 'shield-lock-fill', discovery, 'Make a discovery package for a case'),
      tile('Link Chart', 'diagram-3-fill', toTab('linkchart'), 'Open the Link Chart of a case'),
      tile('Ask AI', 'chat-dots-fill', () => { const b = document.getElementById('btn-chat'); if (b) b.click(); }, 'Open the Ask AI window'),
      tile('Reference', 'book', () => { location.hash = '#/reference'; }, 'Charts, codes and calculators'),
      tile('Library', 'bookshelf', () => showVaultPanel('library'), 'Examples and directives for the AI'),
      tile('Vault', 'safe2', () => showVaultPanel(), 'Vault settings, profile and logs'));
  }

  /** v1.61: pick a case (newest change first; type to filter). Resolves to an index entry or null. */
  function pickCase(title, icon = 'search') {
    const list = Vault.data.cases.filter((c) => !isArchivedEntry(c)).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    if (!list.length) { toast('Make a case first with New Case.', 'info'); return Promise.resolve(null); }
    return openDialog((close) => {
      const q = h('input', { type: 'search', placeholder: 'Case number, subject or Mission', 'aria-label': 'Find a case', autofocus: true, autocomplete: 'off' });
      const box = h('div', { class: 'pick-case-list', role: 'list' });
      const draw = () => {
        const t = q.value.trim().toLowerCase();
        const hits = list.filter((c) => !t || [c.number, c.subject, c.title, opOf(c) ? opLabel(opOf(c)) : 'General Files'].join(' ').toLowerCase().includes(t)).slice(0, 60);
        box.replaceChildren(...(hits.length ? hits.map((c) => h('button', { type: 'button', role: 'listitem', class: 'pick-case-row', onclick: () => close(c) },
          h('strong', {}, c.number || 'No case number'), h('span', { class: 'pick-case-sub' }, c.subject || c.title || ''),
          h('span', { class: 'muted small pick-case-op' }, opOf(c) ? (opOf(c).number || opOf(c).name) : 'General Files'), statusPill(c.status)))
          : [h('p', { class: 'muted' }, 'No case matches.')]));
      };
      q.addEventListener('input', draw);
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = box.querySelector('button'); if (b) b.click(); } });
      draw();
      return h('div', { class: 'pick-case' }, h('h2', { icon }, title), q, box,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel')));
    });
  }

  /** v1.61: Needs Attention: deadlines overdue or due within a week, soonest first. */
  function needsAttention(deadlines, cases = []) {
    const due = deadlines.filter((c) => daysUntil(c.nextDeadline.date) <= 7);
    // v1.67: narcotic charges: 3 years from the Date of Occurrence; a warning 5 days before.
    const sols = cases.filter((c) => solState(c)).sort((a, b) => a.sol.expires.localeCompare(b.sol.expires));
    const solRows = sols.map((c) => {
      // The 3 years run to the end of the expiry day.
      const end = new Date(new Date(`${c.sol.expires}T00:00:00`).getTime() + 86400000);
      const left = h('span', { class: 'att-due att-count' });
      const tick = () => { if (!left.isConnected && left.dataset.on) return false; left.dataset.on = '1'; left.textContent = CVLimits.countdown(end - Date.now()); return true; };
      tick();
      const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 1000);
      const expired = end - Date.now() <= 0;
      return h('a', { role: 'listitem', class: 'attention-row att-overdue att-sol', href: caseLink(c, 'draft'), title: `Narcotic charges must be brought within 3 years of the Date of Occurrence (${fmtDate(c.sol.occurred)}).` },
        h('span', { class: 'att-case' }, h('strong', {}, c.number || 'No case number'), h('span', { class: 'muted small' }, c.subject || '')),
        h('span', { class: 'att-what' }, I('exclamation-triangle-fill'), expired ? ' Statute of Limitations Expired' : ' Warning: Statute of Limitations Expiring'),
        h('span', { class: 'att-when' }, `${expired ? 'Expired' : 'Expires'} ${fmtDate(c.sol.expires)}`),
        left);
    });
    if (sols.length && !state.solToastShown) {
      state.solToastShown = true;
      toast(`Statute of limitations: ${sols.map((c) => c.number || 'No case number').join(', ')}. See Needs Attention.`, 'error', 9000);
    }
    // v1.66: no count beside the heading; the list says it all.
    // v1.74: Needs Attention folds into one slim bar (with a short summary); remembered.
    const overdueN = solRows.length + due.filter((c) => daysUntil(c.nextDeadline.date) < 0).length;
    const total = solRows.length + due.length;
    const summary = h('span', { class: `att-summary${overdueN ? ' has-overdue' : ''}` }, total ? `${total} item${total === 1 ? '' : 's'}${overdueN ? ` · ${overdueN} overdue` : ''}` : 'Nothing due in the next 7 days');
    let folded = false;
    try { folded = localStorage.getItem('cv-att-folded') === '1'; } catch { /* private window */ }
    const foldBtn = h('button', { type: 'button', class: 'icon-btn att-fold', 'aria-expanded': String(!folded), title: folded ? 'Show Needs Attention' : 'Fold Needs Attention into a bar' }, I('chevron-down'), h('span', { class: 'sr-only' }, 'Fold or show'));
    const head = h('div', { class: 'section-head att-head' }, h('h2', { class: 'section-title' }, I('bell-fill'), ' Needs Attention'), summary, h('div', { class: 'spacer' }), foldBtn);
    const wrap = (...kids) => {
      const sec = h('div', { class: `dash-section attention-section${folded ? ' att-folded' : ''}` }, head, ...kids);
      const set = (f) => { folded = f; sec.classList.toggle('att-folded', f); foldBtn.setAttribute('aria-expanded', String(!f)); foldBtn.title = f ? 'Show Needs Attention' : 'Fold Needs Attention into a bar'; try { localStorage.setItem('cv-att-folded', f ? '1' : '0'); } catch { /* ignore */ } };
      foldBtn.addEventListener('click', () => set(!folded));
      head.addEventListener('click', (e) => { if (folded && !e.target.closest('button')) set(false); });
      return sec;
    };
    if (!due.length && !solRows.length) return wrap(h('p', { class: 'muted attention-none' }, 'Nothing due in the next 7 days.'));
    return wrap(
      h('div', { class: 'attention-list', role: 'list' }, ...solRows, ...due.slice(0, 8).map((c) => {
        const d = c.nextDeadline;
        const n = daysUntil(d.date);
        const lab = dueLabel(d.date);
        return h('a', { role: 'listitem', class: `attention-row ${n < 0 ? 'att-overdue' : n <= 1 ? 'att-now' : 'att-soon'}`, href: caseLink(c, 'timeline'), title: 'Open the Timeline of this case' },
          h('span', { class: 'att-case' }, h('strong', {}, c.number || 'No case number'), h('span', { class: 'muted small' }, c.subject || '')),
          h('span', { class: 'att-what' }, d.title || 'Deadline'),
          h('span', { class: 'att-when' }, fmtDate(d.date), d.time ? ` ${d.time}` : ''),
          h('span', { class: 'att-due' }, lab.text.replace(/\b\w/g, (ch) => ch.toUpperCase())));
      })),
      due.length > 8 ? h('p', { class: 'muted small' }, `And ${due.length - 8} more. Each case shows a red border in the case list.`) : null);
  }

  /* =====================================================================
   * New case
   * ===================================================================== */

  /** An Operation picker: — General Files (no Operation) —, then every Operation. */
  function operationSelect(value = '', attrs = {}) {
    const ops = [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name));
    return h('select', attrs, h('option', { value: '' }, 'None (General Files)'), ops.map((o) => h('option', { value: o.id, selected: o.id === value }, opLabel(o))));
  }

  /** v1.46: before a new case is made: the same subject on another case asks first; a similar one
   * is pointed out (never merged). Returns true to go ahead. */
  async function subjectCheck(subject, exceptId = '') {
    const m = CVOperation.subjectMatches(Vault.data.cases, subject, exceptId);
    const list = (cases) => h('ul', { class: 'match-list' }, cases.slice(0, 8).map((x) => h('li', {}, h('strong', {}, x.number || 'No case number'), ` · ${x.subject}`, opOf(x) ? ` · ${opLabel(opOf(x))}` : ' · General Files', isArchivedEntry(x) ? ' · Archived' : '')));
    const ask = (title, message, cases) => openDialog((close) => h('div', { class: 'confirm subject-warn' },
      h('h2', {}, title), h('p', {}, message), list(cases),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', autofocus: true, 'data-keep-case': 'true', onclick: () => close(true) }, 'Continue and create new case'))));
    if (m.same.length && !(await ask('Same subject', 'This subject already has another case. Is this a new case number for the same subject?', m.same))) return false;
    if (m.similar.length && !(await ask('Possible match', 'A subject with a similar name already has a case. Check it is not the same person. Nothing is merged.', m.similar))) return false;
    return true;
  }

  // v1.46: Case Number and Subject Name are required; the case is made in General Files and,
  // when an Operation is picked, linked to it. prefill: { operationId, subject, number }.
  async function newCase(prefill = {}) {
    if (!state.connected) return;
    if (prefill instanceof Event) prefill = {};
    const result = await openDialog((close) => {
      const numberIn = h('input', { name: 'number', required: true, maxlength: 100, autocomplete: 'off', autofocus: true, value: prefill.number || '' });
      const subjectIn = h('input', { name: 'subject', required: true, maxlength: 200, autocomplete: 'off', value: prefill.subject || '' });
      const opIn = operationSelect(prefill.operationId || '', { name: 'operationId' });
      // One file number can hold several cases: offer the file numbers already in use.
      const fileNumbers = [...new Set((Vault.data.cases || []).map((x) => x.fileNumber).filter(Boolean))].sort();
      // Each with the Operations it's used in, shown on the right of the list (v1.38).
      const opOfFile = (n) => [...new Set((Vault.data.cases || []).filter((x) => x.fileNumber === n).map((x) => opLabel(opOf(x))).filter(Boolean))].join(', ');
      const fileList = h('datalist', { id: 'file-numbers' }, fileNumbers.map((n) => h('option', { value: n, label: opOfFile(n) || n })));
      const openedIn = h('input', { name: 'opened', type: 'date', value: today() });
      const folderNote = h('span', {});
      const numberErr = h('p', { class: 'error-text small span-2', role: 'alert', hidden: true });
      const showFolder = () => {
        const name = CVCaseFiles.caseFolderName({ number: numberIn.value, dates: { opened: openedIn.value } });
        folderNote.replaceChildren(...(name
          ? ['Case folder ', h('code', {}, CVFormat.pathText(`cases\\${name}`)), ' · files named ', h('code', {}, `${name} Arrest Report.pdf`), ' and so on']
          : ['The case number names the folder and files ', h('code', {}, '<year>-<case no.>'), '.']));
      };
      const checkNumber = () => {
        const dup = CVOperation.caseWithNumber(Vault.data.cases, numberIn.value);
        numberErr.hidden = !dup;
        numberErr.textContent = dup ? `Case Number ${numberIn.value.trim()} already exists${isArchivedEntry(dup) ? ' (archived)' : ''}${dup.subject ? `, subject ${dup.subject}` : ''}. Case Numbers must be unique.` : '';
        numberIn.setCustomValidity(dup ? 'This Case Number already exists.' : '');
        return !dup;
      };
      numberIn.addEventListener('input', () => { showFolder(); checkNumber(); });
      openedIn.addEventListener('input', showFolder);
      showFolder();
      const fileIn = h('input', { name: 'fileNumber', maxlength: 100, list: 'file-numbers', title: 'The investigation file. Several cases can share one file number.' });
      const agencyIn = h('input', { name: 'agencyNumber', maxlength: 100, title: 'The federal jacket number for this case.' });
      const clientIn = clientSelect('', { name: 'client' });
      const opNote = h('p', { class: 'form-hint span-2 op-note' });
      // Picking an Operation fills the file number, jacket number and client from its cases.
      const fillFrom = () => {
        const op = Vault.getOperation(opIn.value);
        const sibs = op ? operationCases(op.id) : [];
        opNote.textContent = op ? `Adds a case to ${opLabel(op)} (${sibs.length} so far${sibs.length ? `: ${sibs.map((x) => x.number).filter(Boolean).join(', ')}` : ''}).` : 'The case goes in General Files, not in a Mission. It can be linked to one later.';
        const sib = sibs[0];
        if (!sib) return;
        if (!fileIn.value) fileIn.value = sib.fileNumber || '';
        if (!agencyIn.value) agencyIn.value = sib.agencyNumber || '';
        if (!clientIn.value && sib.client) { if (![...clientIn.options].some((o) => o.value === sib.client)) clientIn.append(h('option', { value: sib.client }, sib.client)); clientIn.value = sib.client; }
      };
      opIn.addEventListener('change', fillFrom);
      fillFrom();
      const form = h('form', { class: 'form-grid new-case-form', onsubmit: (e) => {
        e.preventDefault();
        if (!checkNumber()) { numberIn.focus(); return; }
        const fd = new FormData(form);
        close({
          number: fd.get('number').trim(), subject: fd.get('subject').trim(), operationId: fd.get('operationId') || '',
          fileNumber: fd.get('fileNumber').trim(), agencyNumber: fd.get('agencyNumber').trim(), client: fd.get('client'),
          status: fd.get('status'), opened: fd.get('opened'), tags: [],
        });
      } },
      h('h2', { class: 'span-2', icon: 'folder-plus' }, 'New case'),
      formSect('Case', 'person-vcard'),
      field('Case Number', numberIn, '', 'Unique: no two cases, archived ones included, can share a Case Number.'),
      field('Subject Name', subjectIn, '', 'The person the case is about. Several cases can have the same subject.'),
      numberErr,
      field('Mission', opIn, 'span-2', 'Optional. The case is always kept in General Files; a Mission only links it.'),
      opNote,
      formSect('File Details', 'folder2-open'),
      field('File Number', fileIn),
      field('Federal Jacket Number', dnaCombo(agencyIn)),
      fileList,
      h('div', { class: 'span-2 form-row3' }, field('Client', clientIn),
        field('Status', h('select', { name: 'status' }, Vault.STATUSES.filter((x) => x !== 'Archived').map((x) => h('option', {}, x)))),
        field('Opened', openedIn)),
      formHint(folderNote),
      h('div', { class: 'dialog-actions span-2' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Create case')));
      return form;
    });
    if (!result) return;
    if (!(await subjectCheck(result.subject))) return;
    try {
      const c = await Save.track('new-case', () => Vault.createCase(result));
      // Inside an Operation: it shares the Operation's Case Overview from the start.
      if (c.operationId) await mergeIntoOperation(c.id).catch(() => {});
      renderCaseList();
      go(c.id, 'details');
    } catch (err) { if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000); /* else reported by Save */ }
  }

  /** v1.46: after a case joins an Operation, its Case Overview (suspects, contacts, deconfliction)
   * and the Operation's are joined, and every case of the Operation gets the result. */
  async function mergeIntoOperation(caseId) {
    const c = await Vault.getCase(caseId);
    const others = [];
    for (const o of operationCases(c.operationId).filter((x) => x.id !== caseId)) { try { others.push(await Vault.getCase(o.id)); } catch { /* moved */ } }
    if (!others.length) return;
    const merged = CVOperation.mergeOverview([...others, c]);
    for (const x of [c, ...others]) {
      if (CVOperation.sameOverview(x, { ...x, ...merged })) continue;
      Object.assign(x, structuredClone(merged));
      await Save.track(`case:${x.id}`, () => Vault.saveCase(x));
    }
  }

  /** Link a case to an Operation (from General Files, the Operation page or the case's Details). */
  async function linkCase(caseId, opId) {
    try {
      await Save.track(`link:${caseId}`, () => Vault.assignCase(caseId, opId));
      await mergeIntoOperation(caseId).catch(() => {});
      if (state.caseObj && state.caseObj.id === caseId) state.caseObj = null; // re-read on the next draw
      toast(`Linked to ${opLabel(Vault.getOperation(opId))}.`, 'success', 3000);
      return true;
    } catch (err) {
      if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000);
      return false;
    }
  }

  /* Move File (v1.50): one box to move a case between General Files and the Operations: out of
   * an Operation into General Files (independent), from General Files into an Operation, or from
   * one Operation to another. The case and its files never move on the SSD; only the link changes.
   * -> true when it moved. */
  async function moveCaseDialog(entry) {
    await Save.flushAll();
    const cur = opOf(entry);
    const ops = [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name));
    const choices = [['', 'General Files (independent case)', 'folder-fill'], ...ops.map((op) => [op.id, opLabel(op), 'op-folder'])].filter(([id]) => id !== (cur ? cur.id : ''));
    if (!choices.length) { toast('There is nowhere else to move it yet. Make a Mission first.', 'info', 5000); return false; }
    const want = await openDialog((close) => {
      let pick = choices[0][0];
      const rows = choices.map(([id, label, icon], i) => {
        const radio = h('input', { type: 'radio', name: 'move-dest', value: id, checked: i === 0 });
        radio.addEventListener('change', () => { pick = id; });
        return h('label', { class: `move-dest${id ? '' : ' gf-link'}` }, radio, I(icon), h('span', {}, label));
      });
      return h('form', { class: 'move-file', onsubmit: (e) => { e.preventDefault(); close(pick); } },
        h('h2', {}, 'Move File'),
        h('p', { class: 'muted small' }, `Case ${entry.number || entry.title || ''} is in ${cur ? opLabel(cur) : 'General Files'}. Where should it go? Its files stay where they are on the SSD; only where it's listed changes.`),
        h('div', { class: 'move-dests', role: 'radiogroup', 'aria-label': 'Move to' }, rows),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(undefined) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit', icon: 'folder-symlink' }, 'Move')));
    });
    if (want === undefined) return false;
    try {
      if (cur) await Save.track(`link:${entry.id}`, () => Vault.unlinkCase(entry.id));
      if (state.caseObj && state.caseObj.id === entry.id) state.caseObj = null;
      if (want) return await linkCase(entry.id, want);
      toast(`Case ${entry.number || ''} moved to General Files.`, 'success', 3000);
      return true;
    } catch (err) {
      if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000);
      return false;
    }
  }

  /* v1.54: fold a section away with the button in its heading (▾ / ▸). Which ones are folded is a
   * screen preference of this PC (localStorage), never case data. */
  const FOLD_STORE = 'casevault-folded-sections';
  const foldedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD_STORE) || '[]')); } catch { return new Set(); } };
  function makeFoldable(section, key, { open: startOpen = false } = {}) { // v1.59: every form starts folded
    const head = section.querySelector(':scope > h3');
    if (!head || section.querySelector(':scope > .fold-body')) return section;
    const body = h('div', { class: 'fold-body' });
    for (const n of [...section.childNodes]) if (n !== head) body.append(n);
    const btn = h('button', { class: 'icon-btn fold-btn', type: 'button' });
    const row = h('div', { class: 'fold-head' });
    head.replaceWith(row);
    row.append(head, h('div', { class: 'spacer' }), btn);
    section.append(body);
    section.classList.add('foldable');
    const set = foldedSet();
    let folded = set.has(key) || (!startOpen && !set.has(`open:${key}`));
    const show = () => {
      body.hidden = folded;
      section.classList.toggle('folded', folded);
      const label = `${folded ? 'Show' : 'Hide'} ${head.textContent.trim()}`;
      btn.title = label; btn.setAttribute('aria-expanded', String(!folded));
      btn.replaceChildren(I(folded ? 'chevron-right' : 'chevron-down'), h('span', { class: 'sr-only' }, label));
    };
    // Open it from outside (the Vault's list on the left).
    section.cvUnfold = () => { if (folded) btn.click(); };
    btn.addEventListener('click', () => {
      folded = !folded;
      const st = foldedSet();
      st.delete(key); st.delete(`open:${key}`);
      if (folded && startOpen) st.add(key);
      if (!folded && !startOpen) st.add(`open:${key}`);
      try { localStorage.setItem(FOLD_STORE, JSON.stringify([...st])); } catch { /* this visit only */ }
      show();
    });
    show();
    return section;
  }

  /** A labelled box. tip: the explanation, shown in the hover box (no brackets in labels). */
  function field(label, input, cls = '', tip = '') {
    return h('label', { class: `field ${cls}`, title: tip || null }, h('span', {}, label), input);
  }

  $('#btn-new-case').addEventListener('click', newCase);

  /* =====================================================================
   * Case view
   * ===================================================================== */

  // Reports (v1.17) holds the case notes and every draft in one list.
  // v1.52: Link Chart, after Files.
  // v1.64: each case tab has an icon, like the Options tabs.
  const TAB_ICONS = { details: 'person-vcard', arrest: 'shield-exclamation', timeline: 'calendar-event', draft: 'pencil-square', reports: 'journal-bookmark', files: 'folder2-open', linkchart: 'diagram-3-fill', mail: 'envelope', checks: 'list-check' };
  const TABS = [['details', 'Details'], ['timeline', 'Timeline'], ['draft', 'Draft'], ['reports', 'Reports'], ['files', 'Files'], ['linkchart', 'Link Chart'], ['mail', 'Mail'], ['checks', 'Checks']];
  // The Arrest details tab appears once a case has arrest details, or is closed "by arrest".
  const FOLDER_ICONS = {
    '': 'collection', unsorted: 'folder', photos: 'image', 'Case Overview': 'journal-richtext', 'Case Initiation': 'flag', 'Affidavit Drafts': 'pencil-square', 'Affidavit Final': 'file-earmark-ruled', Affidavits: 'file-earmark-ruled',
    'Warrant Drafts': 'pencil-fill', 'Warrant Final': 'file-earmark-text', 'Warrants Signed': 'shield-fill-check', 'Arrest Report': 'person-badge', 'Supplementary Report': 'file-earmark-text',
    'Case Report': 'journal-bookmark', 'Link Charts': 'diagram-3-fill', Deconfliction: 'signpost-split', 'Drug Exhibits': 'capsule-pill', 'Other Exhibits': 'box-seam', Email: 'envelope',
    'Ops Plan': 'map', 'Subpoena Drafts': 'pencil-square', 'Subpoena Sent': 'send', 'Subpoena Response': 'inbox', 'Subject Information': 'person-vcard',
    Recordings: 'mic', 'Recordings/Video': 'camera-video', 'Recordings/Audio': 'mic', 'Vehicle Information': 'car-front', Maps: 'geo-alt', 'Case Closing': 'check-circle-fill', Other: 'folder',
  };
  const FILE_ICONS = { pdf: 'file-earmark-pdf-fill', word: 'file-earmark-word-fill', sheet: 'file-earmark-spreadsheet', image: 'file-earmark-image', audio: 'file-earmark-music', video: 'file-earmark-play', text: 'file-earmark-text', mail: 'envelope-paper', zip: 'file-earmark-zip', other: 'file-earmark' };
  function fileKind(name) {
    const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (/^(docx?|docm|rtf|odt)$/.test(ext)) return 'word';
    if (/^(xlsx?|xlsm|ods|csv)$/.test(ext)) return 'sheet';
    if (/^(png|jpe?g|gif|webp|bmp|tiff?|heic)$/.test(ext)) return 'image';
    if (/^(mp3|wav|m4a|aac|ogg|wma|flac)$/.test(ext)) return 'audio';
    if (/^(mp4|mov|avi|mkv|webm|wmv)$/.test(ext)) return 'video';
    if (/^(txt|md|log|json|xml)$/.test(ext)) return 'text';
    if (/^(eml|msg)$/.test(ext)) return 'mail';
    if (/^(zip|7z|rar)$/.test(ext)) return 'zip';
    return 'other';
  }
  const TYPE_LABELS = { pdf: 'PDF', word: 'Word', sheet: 'Spreadsheet', image: 'Image', audio: 'Audio', video: 'Video', text: 'Text', mail: 'Email', zip: 'Archive' };
  /** "PDF", "Word", "Image (JPG)"…: the Type column. */
  function fileTypeLabel(name) {
    const ext = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toUpperCase();
    const k = fileKind(name);
    if (k === 'other') return ext || 'File';
    return k === 'pdf' ? 'PDF' : `${TYPE_LABELS[k]}${ext && !['PDF', 'DOCX'].includes(ext) ? ` (${ext})` : ''}`;
  }
  // The case notes' place in Reports (a draft's name never starts with a dot).
  const NOTES_SUB = '.notes';
  const tabsFor = (c) => (CVClosingUI.hasArrestTab(c) ? [TABS[0], ['arrest', 'Arrest'], ...TABS.slice(1)] : TABS);

  async function showCase(id, tab, sub = null) {
    const token = ++state.renderToken;
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
    const c = state.caseObj;
    // Old addresses: #/case/<id>/notes and #/case/<id>/drafts[/<draft>] now live under Reports.
    if (tab === 'notes') { tab = 'reports'; sub = NOTES_SUB; } else if (tab === 'drafts') tab = 'reports';
    // v1.31: Report Fields is the Draft tab.
    if (tab === 'reports' && sub === '.fields') { tab = 'draft'; sub = null; }
    const tabs = tabsFor(c);
    if (!tabs.some(([t]) => t === tab)) tab = 'details';
    state.caseId = id;
    state.lastCaseId = id;
    state.tab = tab;
    renderCaseList();

    const archived = Vault.isArchived(id);
    const panel = h('div', { class: 'tab-panel', role: 'tabpanel' });
    $('#main').replaceChildren(h('section', { class: `case ${archived ? 'archived' : ''}` },
      archived ? h('div', { class: 'archived-banner', role: 'note' },
        I('archive', { cls: 'banner-icon' }),
        h('div', {}, h('strong', {}, 'Archived case'),
          h('span', { class: 'small block' }, 'Read-only. Notes, files, drafts and checks can be opened and searched, but not changed.')),
        h('div', { class: 'spacer' }),
        // v1.67: which Archived sub-folder it is in.
        h('label', { class: 'arch-folder-pick' }, h('span', { class: 'small' }, 'Archive Folder'),
          h('select', { 'aria-label': 'Archive folder', onchange: async (e) => {
            try { await Save.track(`archfolder:${c.id}`, () => Vault.setArchiveFolder(c.id, e.target.value)); c.archiveFolder = e.target.value; renderCaseList(); toast('Moved to the archive folder.', 'success'); } catch (err) { toast(`Not moved: ${err.message}`, 'error'); }
          } }, [['', 'No Sub-folder'], ...Vault.ARCHIVE_FOLDERS].map(([k, label]) => h('option', { value: k, selected: (c.archiveFolder || '') === k }, label)))),
        h('button', { class: 'btn', type: 'button', icon: 'arrow-counterclockwise', onclick: () => restoreCase(c) }, 'Restore to active cases')) : null,
      // v1.46: the Case Number first, the Subject Name under it, and the Operation it's in.
      h('div', { class: 'case-head' },
        h('h1', { id: 'case-title' }, c.number || 'No case number yet'),
        h('div', { class: 'case-subject', id: 'case-subject' }, c.subject || 'No subject yet'),
        h('div', { class: 'case-sub muted', id: 'case-sub' }, caseSubtitle(c))),
      h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(([t, label]) =>
        h('a', { href: `#/case/${encodeURIComponent(id)}/${t}`, role: 'tab', class: `tab ${t === tab ? 'active' : ''}`, 'aria-selected': String(t === tab), icon: TAB_ICONS[t] }, label))),
      panel));
    // Read-only: everything in the tab that could change the case is switched off, now and as
    // the tab redraws. (vault.js refuses the writes too.)
    if (archived) new MutationObserver(() => applyReadOnly(panel)).observe(panel, { childList: true, subtree: true });

    const renderers = { details: renderDetails, arrest: (...a) => CVClosingUI.renderArrest(...a), draft: (panel, cc, tk) => CVReportFieldsUI.render(panel, cc, tk), reports: (panel, cc, tk, s) => (s === NOTES_SUB ? renderNotes(panel, cc, tk) : CVDraftsUI.render(panel, cc, tk, s)), timeline: renderTimeline, files: renderFiles, linkchart: (panel, cc, tk) => CVLinkChartUI.render(panel, cc, tk), mail: (...a) => CVMailUI.render(...a), checks: (...a) => CVChecks.render(...a) };
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
    // v1.27: the file and case numbers and the opened date are on the Details tab itself.
    const op = opOf(c);
    return [op ? h('a', { href: `#/operation/${encodeURIComponent(op.id)}`, class: 'case-op-link', title: 'Open the Mission' }, I('op-folder'), opLabel(op)) : h('a', { href: '#/general', class: 'case-op-link gf-link', title: 'Not in a Mission: open General Files' }, I('folder-fill'), 'General Files'),
      c.agencyNumber && `Agency ${c.agencyNumber}`, c.client, statusPill(c.status)]
      .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
  }

  function refreshCaseHeader(c) {
    const title = $('#case-title');
    if (title) title.textContent = c.number || 'No case number yet';
    const subj = $('#case-subject');
    if (subj) subj.textContent = c.subject || 'No subject yet';
    const sub = $('#case-sub');
    if (sub) sub.replaceChildren(...caseSubtitle(c));
  }

  /* ---------- Details ---------- */

  /** v1.27: the operation's other cases get this case's Case Overview (suspects, contacts,
   * deconfliction), so every case number shows the same one. */
  async function syncOverview(c) {
    const others = operationCases(c).filter((x) => x.id !== c.id);
    for (const o of others) {
      let oc;
      try { oc = await Vault.getCase(o.id); } catch { continue; }
      if (CVOperation.sameOverview(oc, c)) continue;
      oc.suspects = structuredClone(c.suspects || []);
      oc.contacts = structuredClone(c.contacts || {});
      oc.deconfliction = structuredClone(c.deconfliction || []);
      await Vault.saveCase(oc);
    }
  }

  function renderDetails(panel, c) {
    const save = () => {
      refreshCaseHeader(c);
      const snapshot = structuredClone(c);
      Save.schedule(`case:${c.id}`, () => Vault.saveCase(snapshot), 600);
      if (operationCases(c).some((x) => x.id !== c.id)) Save.schedule(`overview:${c.operationId}`, () => syncOverview(snapshot), 1200);
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
      // Closed goes through "Close case…" (disposition), Pending asks what it's waiting on, and
      // Open on a closed case reopens it. If the dialog is cancelled, nothing changes.
      const want = statusSelect.value;
      statusSelect.value = c.status;
      if (want === 'Closed') { CVClosingUI.closeCaseDialog(c); return; }
      if (want === 'Pending') { CVClosingUI.pendingDialog(c); return; }
      if (want === 'Open' && c.status === 'Closed') { CVClosingUI.reopenCase(c); return; }
      c.status = want;
      if (want === 'Open') c.pending = null;
      statusSelect.value = want;
      statusNote.textContent = CVClosingUI.statusLine(c);
      save();
    });
    const statusNote = h('span', { class: 'muted small block status-note' }, CVClosingUI.statusLine(c));
    const archived = Vault.isArchived(c.id);

    const members = archived ? [c] : [c, ...operationCases(c).filter((x) => x.id !== c.id)];
    const op = opOf(c);
    // v1.46: the Subject Name (an independent case is titled by it).
    const subjectIn = bind(h('input', { value: c.subject || '', maxlength: 200, placeholder: 'No subject yet' }), (v) => { c.subject = v.trim(); c.title = CVOperation.caseTitle(c, op); });
    // The Case Number is unique: a number another case has is refused, and it can't be emptied.
    const numberIn = h('input', { value: c.number || '', maxlength: 100 });
    numberIn.addEventListener('change', () => {
      const v = numberIn.value.trim();
      const dup = CVOperation.caseWithNumber(Vault.data.cases, v, c.id);
      if (!v && c.number) { toast('Case Number is required.', 'error', 5000); numberIn.value = c.number; return; }
      if (dup) { toast(`Case Number ${v} already exists${isArchivedEntry(dup) ? ' (archived)' : ''}. Case Numbers must be unique.`, 'error', 7000); numberIn.value = c.number || ''; return; }
      c.number = v;
      save();
      renderCaseList();
    });
    const dupNow = CVOperation.caseWithNumber(Vault.data.cases, c.number, c.id);
    panel.replaceChildren(
      // ---- the operation, the same on every one of its case numbers: name, status, dates
      h('section', { class: 'op-card' },
        h('div', { class: 'case-op-bar', 'data-ro-ok': archived ? null : 'true' },
          h('span', { class: `case-op-label${op ? '' : ' gf-link'}` }, I(op ? 'op-folder' : 'folder-fill'), op ? h('a', { href: `#/operation/${encodeURIComponent(op.id)}` }, opLabel(op)) : 'General Files: not in a Mission'),
          h('div', { class: 'spacer' }),
          // v1.50: Move File (it was "Assign to" / "Move to" and Unlink).
          archived ? null : h('button', { class: 'btn small', type: 'button', icon: 'folder-symlink', title: 'Move this case into a Mission, to another one, or back to General Files', onclick: async () => {
            if (await moveCaseDialog(Vault.data.cases.find((x) => x.id === c.id) || c)) { renderCaseList(); showCase(c.id, 'details'); }
          } }, 'Move File')),
        h('form', { class: 'form-grid details-grid op-top details-row4 details-row-title', onsubmit: (e) => e.preventDefault() },
          field('Subject Name', subjectIn, '', 'The person the case is about. Shown under the Case Number. Several cases can have the same subject.'),
          h('label', { class: 'field' }, h('span', {}, 'Status'), statusSelect, statusNote),
          field('Opened', bind(h('input', { type: 'date', value: c.dates.opened || '' }), (v) => { c.dates.opened = v; })),
          field('Closed', bind(closedInput, (v) => { c.dates.closed = v; }))),
        caseTiles(c, members, archived)),
      miniTimeline(c, members),
      // ---- this case number
      // v1.44: File Number, Original Case Number, Federal Jacket Number and Client in one row; no Tags.
      h('form', { class: 'form-grid details-grid details-row4', onsubmit: (e) => e.preventDefault() },
        field('Case Number', numberIn, '', 'Unique: no two cases, archived ones included, share a Case Number.'),
        field('File Number', bind(h('input', { value: c.fileNumber || '', maxlength: 100, title: 'The investigation file. Several cases can share one file number.' }), (v) => { c.fileNumber = v; })),
        field('Federal Jacket Number', dnaCombo(bind(h('input', { value: c.agencyNumber || '', maxlength: 100, title: 'The federal jacket number for this case.' }), (v) => { c.agencyNumber = v; }))),
        field('Client', (() => { const sel = clientSelect(c.client); sel.addEventListener('change', () => { c.client = sel.value; save(); }); return sel; })()),
        dupNow ? h('p', { class: 'error-text span-2 small', role: 'note' }, `Another case also has Case Number ${c.number} (made before Case Numbers had to be unique). Nothing was changed; give one of them a different number.`) : null,
        h('p', { class: 'muted span-2 small' },
          `Folder: ${CVFormat.pathText(`${archived ? 'archive' : 'cases'}\\${c.id}`)}`
          + `${archived && c.dates.archived ? ` · Archived ${fmtDate(c.dates.archived)}` : ''}`)),
      makeFoldable(partnersSection(c, save), 'overview-partners'),
      // ---- Case Overview: shared by the operation's case numbers (v1.27)
      h('hr', { class: 'overview-sep' }),
      h('div', { class: 'overview-head' }, h('h2', {}, 'Case Overview'),
        h('p', { class: 'muted small' }, members.length > 1 ? `Suspects, contacts and deconfliction for the whole Mission: the same on all ${members.length} case numbers.` : op ? 'Suspects, contacts and deconfliction. Case numbers added to this Mission share them.' : 'Suspects, contacts and deconfliction for this case.')),
      makeFoldable(suspectsSection(c, save), 'overview-suspects'),
      makeFoldable(contactsSection(c, save), 'overview-contacts'),
      makeFoldable(deconflictionSection(c, save), 'overview-deconfliction'),
      // Everything saves by itself as you type; the button saves now and says so.
      // (An archived case gets an empty string here: a null would show as the word "null".)
      archived ? '' : h('div', { class: 'details-save' },
        h('button', { class: 'btn primary', type: 'button', icon: 'save', title: 'Save this case to the SSD now. Changes also save by themselves a moment after you type.', onclick: async () => {
          save();
          await Save.flushAll();
          if (Save.failed.size) toast('Not saved: reconnect the SSD.', 'error');
          else toast('Case saved to the SSD.', 'success', 2500);
        } }, 'Save changes')),
      // Archive and delete side by side, so the gentler choice is always in view.
      h('section', { class: 'case-actions', 'data-ro-ok': 'true', 'aria-labelledby': 'case-actions-title' },
        h('h3', { id: 'case-actions-title', icon: 'sliders' }, 'Case actions'),
        // Same-size buttons, icon and name; the explanation shows when you point at one.
        h('div', { class: 'case-actions-grid' },
          archived
            ? h('button', { class: 'btn action-btn', type: 'button', icon: 'arrow-counterclockwise', title: 'Moves the case back to the active list, with the status it had before, so it can be changed again.', onclick: () => restoreCase(c) }, 'Restore to active cases')
            : null,
          !archived ? (c.status === 'Closed'
            ? h('button', { class: 'btn action-btn', type: 'button', icon: 'unlock', title: 'Back to Open, for new information. The closing is kept in the case\'s history.', onclick: () => CVClosingUI.reopenCase(c) }, 'Reopen case')
            : h('button', { class: 'btn primary action-btn', type: 'button', icon: 'lock-fill', title: 'When the investigation of this case number is finished: choose how it ended, such as arrest, exceptionally cleared or unfounded. Lists loose ends first.', onclick: () => CVClosingUI.closeCaseDialog(c) }, 'Close Case')) : null,
          // v1.27: close every open case number of the operation at once.
          !archived && members.length > 1 && members.some((x) => x.status !== 'Closed') ? h('button', { class: 'btn action-btn', type: 'button', icon: 'lock-fill', title: `Closes all ${members.filter((x) => x.status !== 'Closed').length} open case numbers of this Mission with one disposition.`, onclick: () => CVClosingUI.closeCaseDialog(c, { operation: members }) }, 'Close Mission') : null,
          !archived && !CVClosingUI.hasArrestTab(c) ? h('button', { class: 'btn action-btn', type: 'button', icon: 'person-vcard', title: 'Arrestee, arrest and charges, for the arrest report. Adds an Arrest details tab.', onclick: async () => {
            c.arrest = true;
            delete c.arrestRemoved;
            try { await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c))); go(c.id, 'arrest'); } catch { /* reported */ }
          } }, 'Add arrest details') : null,
          // The arrest details can be deleted again, also on a case closed by arrest (v1.29).
          !archived && CVClosingUI.hasArrestTab(c) ? h('button', { class: 'btn action-btn', type: 'button', icon: 'trash3', title: 'Takes the Arrest details tab off this case and deletes what was entered in it.', onclick: () => CVClosingUI.deleteArrest(c) }, 'Delete Arrest') : null,
          !archived && Vault.conventionalId(c) ? h('button', { class: 'btn action-btn', type: 'button', icon: 'folder', title: `Renames this case's folder on the SSD to the <year>-<case no.> convention (${Vault.conventionalId(c)}). Every file is copied and checked first.`, onclick: () => renameCaseFolder(c) }, 'Rename folder') : null,
          !archived ? h('button', { class: 'btn action-btn', type: 'button', icon: 'archive', title: 'Keeps everything, read-only, in CaseVault-Data\\archive. It leaves the case list but can still be opened, searched and restored.', onclick: () => archiveCase(c) }, 'Archive Case') : null,
          h('button', { class: 'btn danger action-btn', type: 'button', icon: 'trash3', title: 'Permanently deletes the case from the SSD. There is no trash to get it back from.', onclick: () => deleteCase(c) }, 'Delete case…'))));

    // Cases of the operation made before v1.27 each had their own suspects, contacts and
    // deconfliction: join them into the one Case Overview (then it's the same on all of them).
    if (members.length > 1) (async () => {
      const sibs = [];
      for (const o of members.slice(1)) { try { sibs.push(await Vault.getCase(o.id)); } catch { /* moved or missing */ } }
      const merged = CVOperation.mergeOverview([c, ...sibs]);
      if (CVOperation.sameOverview(c, { ...c, ...merged }) || state.caseId !== c.id || !panel.isConnected) return;
      Object.assign(c, merged);
      save();
      renderDetails(panel, c);
    })();
  }

  // Client: who the case is for. A value from before v1.14 that isn't one of these is kept as its
  // own choice, so nothing is lost.
  const CLIENTS = ['State', 'Federal', 'Other'];
  function clientSelect(value, attrs = {}) {
    const v = String(value || '');
    const opts = ['', ...CLIENTS, ...(v && !CLIENTS.includes(v) ? [v] : [])];
    return h('select', { title: 'Who the case is for: State, Federal or Other.', ...attrs }, opts.map((o) => h('option', { value: o, selected: o === v }, o || '—')));
  }

  /* Suspects on the Details tab: name, date of birth (the age is worked out), residence and role
   * (Main, Secondary, Other). Kept in case.json as c.suspects; {{suspect.*}} fills templates with
   * the main suspect and {{suspects}} lists them all. */
  function suspectsSection(c, save) {
    if (!Array.isArray(c.suspects)) c.suspects = [];
    const rows = h('div', { class: 'suspect-rows' });
    const draw = () => {
      rows.replaceChildren(...(c.suspects.length ? c.suspects.map((s, i) => {
        const who = `Suspect ${i + 1}`;
        const input = (key, attrs) => { const el = h('input', { value: s[key] || '', autocomplete: 'off', ...attrs }); el.addEventListener('input', () => { s[key] = el.value.trim(); save(); }); return el; };
        const age = h('output', { class: 'suspect-age', 'aria-label': `${who} age` });
        const showAge = () => { const a = CVDraft.ageOn(s.dob); age.textContent = a == null ? '—' : String(a); };
        const dob = input('dob', { type: 'date', 'aria-label': `${who} date of birth` });
        dob.addEventListener('input', showAge);
        showAge();
        const role = h('select', { 'aria-label': `${who} role` }, CVDraft.SUSPECT_ROLES.map((r) => h('option', { value: r, selected: r === (s.role || 'Primary') }, r)));
        role.addEventListener('change', () => { s.role = role.value; save(); });
        if (!s.role || s.role === 'Main') s.role = 'Primary'; // "Main" before v1.36
        // Demographics (v1.34), kept in s.info: Add From Suspects on the Draft tab copies them into Offenders.
        if (!s.info || typeof s.info !== 'object') s.info = {};
        const PERSON = (k) => CVReportFields.SUSPECT_INFO.find(([key]) => key === k);
        const infoInput = (k, attrs = {}) => {
          // v1.39: the record numbers and a phone, besides the description.
          const EXTRA = { phone: 'Phone Number', moniker: 'Moniker / Social Media' };
          const [, label, kind, opts] = PERSON(k) || [k, EXTRA[k] || k, k === 'phone' ? 'phone' : 'text'];
          let el;
          if (kind === 'select') el = h('select', { 'aria-label': `${who} ${label}` }, opts.map((o) => h('option', { value: o, selected: o === (s.info[k] || '') }, o || '—')));
          else el = h('input', { value: s.info[k] || '', autocomplete: 'off', maxlength: 200, 'aria-label': `${who} ${label}`, type: kind === 'phone' ? 'tel' : 'text', list: kind === 'hair' ? 'suspect-hair' : kind === 'hairStyle' ? 'suspect-hairstyle' : kind === 'eyes' ? 'suspect-eyes' : null, placeholder: kind === 'height' ? '5 ft 10 in' : kind === 'weight' ? '160 Pounds' : '', ...attrs });
          el.addEventListener(kind === 'select' ? 'change' : 'input', () => { s.info[k] = el.value.trim(); save(); });
          return field(label, ['irNumber', 'fbiNumber', 'idocNumber'].includes(k) ? dnaCombo(el) : el, kind === 'wide' ? 'suspect-wide' : '');
        };
        const demo = h('div', { class: 'suspect-demo' },
          // v1.69: the same fields as an offender on the Draft (all but Clothing Description).
          ['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran', 'relation', 'irNumber', 'fbiNumber', 'idocNumber', 'phone', 'moniker', 'marks'].map((k) => infoInput(k)));
        // v1.67: Not Identified: the name box is set aside (kept, in case it's filled later).
        const nameIn = input('name', { maxlength: 120, 'aria-label': `${who} name` });
        const notId = h('input', { type: 'checkbox', checked: !!s.notIdentified, 'aria-label': `${who} not identified` });
        const showNotId = () => { nameIn.disabled = notId.checked; nameIn.placeholder = notId.checked ? 'Not Identified' : ''; card.classList.toggle('not-identified', notId.checked); };
        notId.addEventListener('change', () => { s.notIdentified = notId.checked; showNotId(); save(); });
        const card = h('div', { class: 'suspect-card' }, h('div', { class: 'suspect-row' },
          h('div', { class: 'field suspect-name-field' }, h('span', { class: 'suspect-name-label' }, 'Name', h('label', { class: 'suspect-notid', title: 'The suspect has not been identified yet. Templates and the Draft show "Not Identified".' }, notId, h('span', {}, 'Not Identified'))), nameIn),
          field('DOB', dob),
          h('div', { class: 'field' }, h('span', {}, 'Age'), age),
          field('Residence', input('residence', { maxlength: 200, 'aria-label': `${who} residence`, title: s.residence || '' })),
          field('Role', role),
          h('button', { class: 'icon-btn danger-icon contact-remove', type: 'button', title: 'Remove this suspect', onclick: () => { c.suspects.splice(i, 1); draw(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove ${who}`))),
          demo);
        showNotId();
        return card;
      }) : [h('p', { class: 'muted small suspect-empty' }, 'No suspects yet.')]));
    };
    draw();
    return h('section', { class: 'contacts suspects cv-boxed', 'aria-labelledby': 'suspects-title' },
      h('h3', { id: 'suspects-title', icon: 'person-exclamation', title: 'The people this case is about. The age is worked out from the date of birth. The main suspect fills {{suspect.name}}, {{suspect.dob}}, {{suspect.age}} and so on in templates; {{suspects}} lists them all.' }, 'Suspects'),
      h('datalist', { id: 'suspect-hair' }, CVReportFields.PICKS.hair.map((x) => h('option', { value: x }))),
      h('datalist', { id: 'suspect-hairstyle' }, CVReportFields.PICKS.hairStyle.map((x) => h('option', { value: x }))),
      h('datalist', { id: 'suspect-eyes' }, CVReportFields.PICKS.eyes.map((x) => h('option', { value: x }))),
      rows,
      h('div', { class: 'contact-add' }, h('button', { class: 'btn small', type: 'button', icon: 'person-plus', onclick: () => {
        c.suspects.push({ name: '', dob: '', residence: '', info: {}, role: c.suspects.some((x) => x.role === 'Primary' || x.role === 'Main') ? 'Secondary' : 'Primary' });
        draw();
        const last = rows.lastElementChild && rows.lastElementChild.querySelector('input');
        if (last) last.focus();
      } }, 'Add suspect')));
  }

  /* A slim timeline on the Details tab (v1.37): a line with a small dot for each event of the
   * operation (every case number), in date order, and a Today mark. Point at a dot for its date,
   * title and note; click it to open that case's Timeline tab. */
  function miniTimeline(c, members) {
    const box = h('section', { class: 'mini-tl', 'aria-label': 'Timeline' });
    (async () => {
      const tls = [];
      for (const m of members) { try { tls.push({ caseId: m.id, number: m.number || '', events: ((await Vault.getTimeline(m.id)) || {}).events || [] }); } catch { /* moved */ } }
      const rows = CVOperation.mergeEvents(tls).filter((r) => r.ev && r.ev.date);
      if (!rows.length) { box.replaceChildren(h('div', { class: 'mini-tl-head' }, h('span', { class: 'mini-tl-title' }, 'Timeline'), h('a', { class: 'muted small', href: `#/case/${encodeURIComponent(c.id)}/timeline` }, 'No events yet. Add them on the Timeline tab.'))); return; }
      const t = (d) => new Date(`${d}T12:00:00`).getTime();
      const todayIso = today();
      const first = Math.min(t(rows[0].ev.date), t(todayIso));
      const last = Math.max(t(rows[rows.length - 1].ev.date), t(todayIso));
      const span = Math.max(last - first, 864e5);
      const pos = (d) => `${(3 + 94 * (t(d) - first) / span).toFixed(2)}%`;
      const line = h('div', { class: 'mini-tl-line' });
      const tip = (ev, number) => [`${fmtDate(ev.date)}${ev.time ? ` ${ev.time}` : ''}`, ev.title || (ev.kind === 'deadline' ? 'Deadline' : 'Event'),
        ev.kind === 'deadline' ? (ev.done ? 'Deadline: done' : `Deadline: ${dueLabel(ev.date).text}`) : '', number && members.length > 1 ? `Case ${number}` : '', ev.note || ''].filter(Boolean).join('\n');
      for (const { caseId, number, ev } of rows) {
        const due = ev.kind === 'deadline' && !ev.done ? dueLabel(ev.date) : null;
        const dot = h('a', { class: `mini-tl-dot${ev.kind === 'deadline' ? ' deadline' : ''}${ev.done ? ' done' : ''}${due ? ` ${due.cls}` : ''}`, href: `#/case/${encodeURIComponent(caseId)}/timeline`, 'data-tip': tip(ev, number), 'aria-label': tip(ev, number).replace(/\n/g, ', ') });
        dot.style.setProperty('left', pos(ev.date));
        line.append(dot);
      }
      const now = h('span', { class: 'mini-tl-today', 'data-tip': `Today, ${fmtDate(todayIso)}`, 'aria-label': 'Today' });
      now.style.setProperty('left', pos(todayIso));
      line.append(now);
      box.replaceChildren(
        h('div', { class: 'mini-tl-head' }, h('span', { class: 'mini-tl-title' }, 'Timeline'), h('span', { class: 'muted small' }, `${rows.length} event${rows.length === 1 ? '' : 's'}`), h('div', { class: 'spacer' }),
          h('span', { class: 'muted small' }, `${fmtDate(new Date(first).toISOString().slice(0, 10))} – ${fmtDate(new Date(last).toISOString().slice(0, 10))}`)),
        line);
    })();
    return box;
  }

  /* The operation's case numbers (v1.27): a folder for each, its number under it; the one on
   * screen is highlighted. Click one to open it; + adds a case number to the operation. */
  function caseTiles(c, members, archived) {
    const sorted = [...members].sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }));
    if (!opOf(c)) return null; // v1.46: an independent case has no Operation to show
    return h('div', { class: 'case-tiles', role: 'list', 'aria-label': 'Case numbers in this Mission' },
      sorted.map((x) => {
        const cur = x.id === c.id;
        // v1.37: every case number's folder opens that case's Reports tab (this one's too).
        return h('a', { class: `case-tile${cur ? ' current' : ''} status-${String(x.status).toLowerCase()}`, role: 'listitem', href: `#/case/${encodeURIComponent(x.id)}/reports`, title: `${x.number || 'No case number'} · ${x.status}${cur ? ' (this one)' : ''}: open its Reports` },
          I(cur ? 'folder2-open' : 'folder-fill'), h('span', { class: 'case-tile-num' }, x.number || 'No number'), h('span', { class: 'case-tile-status' }, x.status));
      }),
      archived ? null : h('button', { class: 'case-tile add', type: 'button', title: 'Add a case number to this Mission: a new case in General Files, linked to it, with the same file number, federal jacket number and client', onclick: () => { Save.flushAll(); newCase({ operationId: c.operationId }); } },
        I('plus-lg'), h('span', { class: 'case-tile-num' }, 'Add Case Number')));
  }

  /* LEO partners on the Details tab (v1.26): the agencies working the case with you. Local PD and
   * Sheriff Dept ask which department. Kept in case.json as c.partners [{ agency, name }];
   * {{case.partners}} fills templates. */
  const DEPT_QUESTION = { 'State PD': 'Which state police?', 'Local PD': 'Which police department?', 'Sheriff Dept': 'Which sheriff\'s department?', Other: 'Which agency?' };
  function askDepartment(agency, current = '') {
    return openDialog((close) => {
      const inp = h('input', { type: 'text', value: current, autofocus: true, maxlength: 300, placeholder: agency === 'State PD' ? 'Illinois State Police' : agency === 'Local PD' ? 'Evanston Police Department' : agency === 'Other' ? 'Postal Service OIG; Amtrak Police' : 'Cook County Sheriff\'s Office', 'aria-label': DEPT_QUESTION[agency] });
      return h('form', { class: 'partner-form', onsubmit: (e) => { e.preventDefault(); close(inp.value.trim()); } },
        h('h2', { icon: 'building' }, DEPT_QUESTION[agency]),
        h('p', { class: 'muted small' }, 'More than one? Separate them with a semicolon (;).'),
        field(agency, inp),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'OK')));
    });
  }
  /* LEO Partners as badges (v1.33; v1.51: CaseVault's own colour badge for each agency, not a seal),
   * the Chicago six-pointed star for Local PD and a police shield for the Sheriff. */
  const CHICAGO_STAR = 'M12.00 1.00 L9.70 8.02 L2.47 6.50 L7.40 12.00 L2.47 17.50 L9.70 15.98 L12.00 23.00 L14.30 15.98 L21.53 17.50 L16.60 12.00 L21.53 6.50 L14.30 8.02 Z';
  const emblem = (d) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'bi'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'currentColor'); svg.append(p); return svg; };
  const PARTNER_BADGES = {
    DEA: { name: 'Drug Enforcement Administration', icon: 'capsule-pill', badge: 'badge-dea', color: '#1f6f43' },
    FBI: { name: 'Federal Bureau of Investigation', icon: 'fingerprint', badge: 'badge-fbi', color: '#1f3a6b' },
    ATF: { name: 'Alcohol, Tobacco, Firearms and Explosives', icon: 'fire', badge: 'badge-atf', color: '#8a2d1c' },
    USMS: { name: 'U.S. Marshals Service', icon: 'marshal-star', badge: 'badge-usms', color: '#5a4a1a' },
    IRS: { name: 'IRS Criminal Investigation', icon: 'cash-coin', badge: 'badge-irs', color: '#22636b' },
    CBP: { name: 'Customs and Border Protection', icon: 'globe-americas', badge: 'badge-cbp', color: '#1d4f91' },
    HSI: { name: 'Homeland Security Investigations', icon: 'shield-fill-check', badge: 'badge-hsi', color: '#2d4b73' },
    ICE: { name: 'Immigration and Customs Enforcement', icon: 'shield-shaded', badge: 'badge-ice', color: '#3b4f63' },
    USSS: { name: 'U.S. Secret Service', icon: 'star-fill', badge: 'badge-usss', color: '#7a5a12' },
    USPIS: { name: 'U.S. Postal Inspection Service', icon: 'envelope-paper', badge: 'badge-uspis', color: '#2b5aa6' },
    'State PD': { name: 'State Police', icon: 'patch-check-fill', badge: 'badge-state-pd', color: '#33507a' },
    'Local PD': { name: 'Police Department', svg: CHICAGO_STAR, badge: 'badge-local-pd', color: '#1b74c5' },
    'Sheriff Dept': { name: 'Sheriff\'s Office', icon: 'shield-fill', badge: 'badge-sheriff', color: '#6b4f1d' },
    Other: { name: 'Another agency', icon: 'building', color: '#5c6670' },
  };
  function partnersSection(c, save) {
    if (!Array.isArray(c.partners)) c.partners = [];
    const box = h('div', { class: 'partner-chips' });
    const setNames = (agency, text) => {
      c.partners = c.partners.filter((p) => p.agency !== agency);
      const names = String(text || '').split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
      for (const name of names) c.partners.push({ agency, name });
      return names.length;
    };
    // v1.54: only the agencies working this case show; "Show All Agencies" brings the rest back to
    // pick from. With none picked, all show.
    let showAll = false;
    const toggle = h('button', { class: 'btn small ghost partner-toggle', type: 'button' });
    toggle.addEventListener('click', () => { showAll = !showAll; draw(); });
    const draw = () => {
      const picked = new Set(c.partners.map((p) => p.agency));
      const all = showAll || !picked.size;
      toggle.hidden = !picked.size;
      toggle.replaceChildren(I(all ? 'eye-slash' : 'eye'), all ? ' Show Only Working This Case' : ` Show All Agencies (${CVDraft.PARTNER_AGENCIES.length - picked.size} more)`);
      box.replaceChildren(...CVDraft.PARTNER_AGENCIES.filter((agency) => all || picked.has(agency)).map((agency) => {
      const mine = c.partners.filter((p) => p.agency === agency);
      const on = mine.length > 0;
      const names = mine.map((p) => p.name).filter(Boolean).join('; ');
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': agency });
      cb.addEventListener('change', async () => {
        if (cb.checked && DEPT_QUESTION[agency]) {
          const text = await askDepartment(agency);
          if (!text || !setNames(agency, text)) { cb.checked = false; return; }
        } else if (cb.checked) c.partners.push({ agency });
        else c.partners = c.partners.filter((p) => p.agency !== agency);
        draw(); save();
      });
      const edit = on && DEPT_QUESTION[agency] ? h('button', { class: 'icon-btn partner-edit', type: 'button', title: `Change the ${agency === 'State PD' ? 'state police' : agency === 'Local PD' ? 'police department' : agency === 'Other' ? 'agency' : 'sheriff\'s department'}`, onclick: async () => {
        const text = await askDepartment(agency, names);
        if (text == null) return;
        if (!setNames(agency, text)) c.partners = c.partners.filter((p) => p.agency !== agency);
        draw(); save();
      } }, I('pencil'), h('span', { class: 'sr-only' }, `Change ${agency}`)) : null;
      const b = PARTNER_BADGES[agency] || PARTNER_BADGES.Other;
      const tile = h('div', { class: `partner-chip partner-badge${on ? ' on' : ''}` },
        h('label', { class: 'partner-pick', title: on ? `${b.name}: working this case. Click to take it off.` : `${b.name}: click if working this case.` }, cb,
          h('span', { class: `partner-emblem${b.badge ? ' partner-art' : ''}`, 'aria-hidden': 'true' }, b.badge ? I(b.badge) : b.svg ? emblem(b.svg) : I(b.icon)),
          h('span', { class: 'partner-words' }, h('strong', {}, agency === 'Sheriff Dept' ? 'Sheriff' : agency), h('span', { class: 'partner-full' }, names || b.name))),
        edit);
      tile.style.setProperty('--agency', b.color); // set from script: the page's CSP allows no inline style attributes
      return tile;
    }));
    };
    draw();
    return h('section', { class: 'contacts partners', 'aria-labelledby': 'partners-title' },
      h('h3', { id: 'partners-title', icon: 'shield-check', title: 'The agencies working this case with you. Templates can use {{case.partners}}.' }, 'LEO Partners'),
      box, h('div', { class: 'partner-tools' }, toggle));
  }

  /* Contacts on the Details tab: the case officer, the prosecutor (ASA or AUSA) and anyone else
   * the case needs (finance, asset forfeiture, the narcotic team supervisor…). Kept in case.json
   * as c.contacts; {{case.officer.*}} and {{case.prosecutor.*}} fill templates. */
  const CONTACT_ROLES = ['Team Supervisor', 'Team Member', 'Finance', 'Asset Forfeiture', 'Task Force Officer', 'Analyst', 'Lab', 'Victim Advocate'];
  function contactsSection(c, save) {
    const k = c.contacts = Object.assign({ officer: {}, prosecutor: {}, others: [] }, c.contacts || {});
    k.officer = k.officer || {}; k.prosecutor = k.prosecutor || {}; k.others = Array.isArray(k.others) ? k.others : [];
    if (!k.prosecutor.title) k.prosecutor.title = 'ASA';
    const input = (obj, key, attrs) => {
      const el = h('input', { value: obj[key] || '', ...attrs });
      el.addEventListener('input', () => { obj[key] = el.value.trim(); save(); });
      return el;
    };
    const person = (obj, who) => [
      field('Name', input(obj, 'name', { maxlength: 120, autocomplete: 'off', 'aria-label': `${who} name` })),
      field('Email', input(obj, 'email', { type: 'email', maxlength: 200, autocomplete: 'off', 'aria-label': `${who} email` })),
      field('Phone', input(obj, 'phone', { type: 'tel', maxlength: 40, autocomplete: 'off', 'aria-label': `${who} phone` })),
    ];
    const proTitle = h('select', { 'aria-label': 'Prosecutor title', title: 'ASA: Assistant State\'s Attorney. AUSA: Assistant United States Attorney.' },
      ['ASA', 'AUSA'].map((t) => h('option', { value: t, selected: t === k.prosecutor.title }, t)));
    proTitle.addEventListener('change', () => { k.prosecutor.title = proTitle.value; save(); });

    const roles = h('datalist', { id: 'contact-roles' }, CONTACT_ROLES.map((r) => h('option', { value: r })));
    const others = h('div', { class: 'contact-others' });
    const drawOthers = () => {
      others.replaceChildren(...k.others.map((o, i) => h('div', { class: 'contact-row' },
        field('Role', input(o, 'role', { maxlength: 80, list: 'contact-roles', placeholder: 'Finance', 'aria-label': `Contact ${i + 1} role` })),
        ...person(o, `Contact ${i + 1}`),
        h('button', { class: 'icon-btn danger-icon contact-remove', type: 'button', title: 'Remove this contact', onclick: () => { k.others.splice(i, 1); drawOthers(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove contact ${i + 1}`)))));
    };
    drawOthers();
    const add = h('button', { class: 'btn small', type: 'button', icon: 'person-plus', title: 'Add someone else on the case: the team supervisor, a team member, finance, asset forfeiture…', onclick: () => {
      k.others.push({ role: '', name: '', email: '', phone: '' });
      drawOthers();
      const last = others.lastElementChild && others.lastElementChild.querySelector('input');
      if (last) last.focus();
    } }, 'Add contact');

    return h('section', { class: 'contacts cv-boxed', 'aria-labelledby': 'contacts-title' },
      h('h3', { id: 'contacts-title', icon: 'people', title: 'Who to reach on this case. The case officer and prosecutor fill {{case.officer.name}}, {{case.prosecutor.email}} and so on in templates.' }, 'Contacts'),
      roles,
      h('div', { class: 'contact-row' }, h('div', { class: 'field contact-role' }, h('span', {}, 'Role'), h('strong', { class: 'contact-fixed' }, 'Case Officer')), ...person(k.officer, 'Case officer')),
      h('div', { class: 'contact-row' }, h('label', { class: 'field contact-role' }, h('span', {}, 'Role'), proTitle), ...person(k.prosecutor, 'Prosecutor')),
      others,
      h('div', { class: 'contact-add' }, add));
  }

  /* Deconfliction (v1.21): a table of each deconfliction check before an operation: date, event
   * or location, the system checked, its deconfliction number, and whether there was a conflict
   * (Yes / No). Kept in case.json as c.deconfliction. */
  const DECON_SYSTEMS = ['RISSafe', 'HIDTA Deconfliction', 'DICE', 'Case Explorer', 'SAFETNet', 'Department Deconfliction'];
  function deconflictionSection(c, save) {
    c.deconfliction = Array.isArray(c.deconfliction) ? c.deconfliction : [];
    // v1.33: a card per check, the boxes in rows that wrap, so nothing is cut off (long dates too).
    const rows = h('div', { class: 'decon-list' });
    const cellInput = (row, key, attrs) => {
      const el = h('input', { value: row[key] || '', autocomplete: 'off', ...attrs });
      el.addEventListener('input', () => { row[key] = el.value.trim(); save(); });
      el.addEventListener('change', () => { row[key] = String(el.value).trim(); save(); });
      return el;
    };
    // System (v1.34): a drop-down of the deconfliction systems; Other asks for its name.
    const systemPick = (r, i) => {
      const known = DECON_SYSTEMS.includes(r.system || '');
      const other = h('input', { class: 'decon-other', value: known ? '' : (r.system || ''), autocomplete: 'off', maxlength: 100, placeholder: 'Which system?', 'aria-label': `Check ${i + 1} other system`, hidden: known || !r.system });
      const sel = h('select', { 'aria-label': `Check ${i + 1} system` },
        ['', ...DECON_SYSTEMS, 'Other'].map((o) => h('option', { value: o, selected: o === 'Other' ? (!known && !!r.system) : o === (r.system || '') }, o || '—')));
      sel.addEventListener('change', () => {
        other.hidden = sel.value !== 'Other';
        r.system = sel.value === 'Other' ? other.value.trim() : sel.value;
        save();
        if (!other.hidden) other.focus();
      });
      other.addEventListener('input', () => { r.system = other.value.trim(); save(); });
      return h('div', { class: 'decon-system' }, sel, other);
    };
    const draw = () => {
      rows.replaceChildren(...(c.deconfliction.length ? c.deconfliction.map((r, i) => {
        const conflict = h('select', { 'aria-label': `Check ${i + 1} conflict`, class: r.conflict === 'Yes' ? 'decon-yes' : '' }, ['', 'No', 'Yes'].map((o) => h('option', { value: o, selected: o === (r.conflict || '') }, o || '—')));
        const card = h('div', { class: `decon-card${r.conflict === 'Yes' ? ' conflict' : ''}` });
        conflict.addEventListener('change', () => { r.conflict = conflict.value; conflict.className = r.conflict === 'Yes' ? 'decon-yes' : ''; card.classList.toggle('conflict', r.conflict === 'Yes'); save(); });
        card.append(
          h('div', { class: 'decon-card-head' }, h('strong', {}, `Check ${i + 1}`), h('div', { class: 'spacer' }),
            h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete this check', onclick: () => { c.deconfliction.splice(i, 1); draw(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete check ${i + 1}`))),
          h('div', { class: 'decon-grid' },
            field('Date', cellInput(r, 'date', { type: 'date', 'aria-label': `Check ${i + 1} date` })),
            field('Event / Location', cellInput(r, 'event', { 'aria-label': `Check ${i + 1} event or location` }), 'decon-wide'),
            field('System', systemPick(r, i)),
            field('Deconfliction Number', cellInput(r, 'number', { 'aria-label': `Check ${i + 1} deconfliction number` })),
            field('Conflict', conflict),
            field('Notes', cellInput(r, 'notes', { 'aria-label': `Check ${i + 1} notes` }), 'decon-wide')));
        return card;
      }) : [h('p', { class: 'muted small' }, 'No deconfliction yet.')]));
    };
    draw();
    const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
      c.deconfliction.push({ date: today(), event: '', system: '', number: '', conflict: '', notes: '' });
      draw(); save();
      const last = rows.lastElementChild && rows.lastElementChild.querySelector('.decon-wide input');
      if (last) last.focus();
    } }, 'Add Deconfliction');
    return h('section', { class: 'contacts deconfliction cv-boxed', 'aria-labelledby': 'decon-title' },
      h('h3', { id: 'decon-title', icon: 'shield-exclamation', title: 'Each deconfliction check for this case, and whether it showed a conflict.' }, 'Deconfliction'),
      rows,
      h('div', { class: 'contact-add' }, add));
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
    // v1.67: which Archived sub-folder: EXPIRED (statute of limitations passed), NOLLE PROSEQUI,
    // PROSECUTION, or none.
    const entry = Vault.data.cases.find((x) => x.id === c.id);
    const passed = entry && entry.sol && globalThis.CVLimits && CVLimits.state(entry.sol, today()) === 'expired';
    const folder = await openDialog((close) => {
      const pick = h('div', { class: 'arch-pick', role: 'radiogroup', 'aria-label': 'Archive folder' },
        [...Vault.ARCHIVE_FOLDERS, ['', 'No Sub-folder']].map(([k, label]) => h('label', { class: 'arch-opt' },
          h('input', { type: 'radio', name: 'arch-folder', value: k, checked: k === (passed ? 'expired' : '') }), I(k ? 'folder-archived' : 'archive'), h('span', {}, label))));
      return h('form', { class: 'confirm', onsubmit: (e) => { e.preventDefault(); close((pick.querySelector('input:checked') || {}).value || ''); } },
        h('h2', { icon: 'archive' }, 'Move this case to the archive?'),
        h('p', {}, `"${c.title || 'Untitled case'}" moves to CaseVault-Data\\archive on the SSD, with its notes, timeline, files, drafts and checks. Every file is copied and checked before the original is removed.`),
        formSect('Archive Folder', 'folder-archived'), pick,
        passed ? formHint(`The statute of limitations passed on ${fmtDate(entry.sol.expires)}, so EXPIRED is picked.`) : null,
        h('p', { class: 'muted small explain' }, 'It leaves the case list and opens read-only from "Archived" at the bottom of the list. You can restore it at any time.'),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Archive Case')));
    });
    if (folder == null) return;
    await Save.flushAll();
    if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD, then archive.', 'error', 8000);
    const progress = toast('Archiving: copying and checking files…', 'info', 600000);
    try {
      await Save.track(`archive:${c.id}`, () => Vault.archiveCase(c.id, (n, name) => { progress.textContent = `Archiving: ${n} file${n === 1 ? '' : 's'} copied and checked (${name})…`; }, folder));
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
        archived ? null : h('p', { class: 'muted small explain' }, 'To keep it out of the way but safe, archive it instead.'),
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
    // The case notes are opened from Reports (v1.17).
    const back = h('a', { href: `#/case/${encodeURIComponent(c.id)}/reports`, class: 'back-link' }, '← All reports');
    const ta = h('textarea', { class: 'notes-editor', spellcheck: 'true', 'aria-label': 'Field Notes', placeholder: 'Write notes here. Markdown works: # Heading, **bold**, - list items.' });
    ta.value = text;
    const counter = h('span', { class: 'muted small' });
    const updateCount = () => {
      const words = (ta.value.match(/\S+/g) || []).length;
      counter.textContent = `${words} word${words === 1 ? '' : 's'} · notes.md`;
    };
    updateCount();

    // Notes save by themselves a moment after typing stops; Save (or Ctrl+S) writes them now.
    const key = `notes:${c.id}`;
    const status = h('span', { class: 'note-save-status small muted', role: 'status', 'aria-live': 'polite' }, text ? '✓ Saved on the SSD' : '');
    const markSaved = () => { status.className = 'note-save-status small ok-text'; status.textContent = `✓ Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };
    const saveNotes = (value) => async () => {
      await Vault.saveNotes(c.id, value);
      if (ta.value === value) markSaved();
      window.dispatchEvent(new CustomEvent('cv-notes-changed', { detail: { caseId: c.id, text: value, from: 'page' } }));
    };
    // Written in the floating Field Notes box (v1.24): shown here too, unless you're typing here.
    const onFloat = (e) => {
      const d = e.detail || {};
      if (!panel.isConnected) { window.removeEventListener('cv-notes-changed', onFloat); return; }
      if (d.from !== 'float' || d.caseId !== c.id || panel.contains(document.activeElement)) return;
      ta.value = d.text; updateCount(); markSaved();
    };
    window.addEventListener('cv-notes-changed', onFloat);
    ta.addEventListener('input', () => {
      updateCount();
      status.className = 'note-save-status small warn-text';
      status.textContent = 'Not saved yet…';
      Save.schedule(key, saveNotes(ta.value), 700);
    });
    const btnSave = h('button', { class: 'btn small primary', type: 'button', title: 'Save now (Ctrl+S). Notes also save by themselves.' }, 'Save');
    btnSave.addEventListener('click', async () => {
      const pending = Save.timers.get(key);
      if (pending) { clearTimeout(pending.timer); Save.timers.delete(key); }
      btnSave.disabled = true;
      try { await Save.run(key, saveNotes(ta.value)); markSaved(); } catch { /* shown by the header indicator */ } finally { btnSave.disabled = false; }
    });

    // Formatted (bold shows bold, as in Word) or Markdown; notes.md stays Markdown (v1.19).
    const rich = CVRichEditor.create(ta, { h, icon: I, label: 'Field Notes' });
    const fmtBar = CVFormatBar.attach(ta, { h, icon: I, rich });

    panel.replaceChildren(
      h('div', { class: 'notes-head' }, back, h('h2', { icon: 'journal-text' }, 'Field Notes')),
      h('div', { class: 'toolbar' }, fmtBar, h('div', { class: 'spacer' }), counter, status, btnSave),
      rich.el, ta);
  }

  /* ---------- Timeline ---------- */

  // v1.27: the Timeline is the operation's: the events of all its case numbers, in date order, each
  // marked with its case number. New events go to the case number picked (this one by default).
  async function renderTimeline(panel, c, token) {
    const archivedCase = Vault.isArchived(c.id);
    const members = archivedCase ? [c] : [c, ...operationCases(c).filter((x) => x.id !== c.id)];
    const tls = new Map();
    for (const m of members) {
      try { tls.set(m.id, await Vault.getTimeline(m.id)); } catch (err) { if (m.id === c.id) throw err; }
    }
    if (token !== state.renderToken) return;
    const many = tls.size > 1;
    const numberOf = (id) => (members.find((m) => m.id === id) || {}).number || 'No number';
    let editing = null; // { id, caseId }

    const f = {
      date: h('input', { type: 'date', required: true, value: today() }),
      time: CVTimeField.create({ label: 'Time' }),
      kind: h('select', {}, h('option', { value: 'event' }, 'Event'), h('option', { value: 'deadline' }, 'Deadline')),
      title: h('input', { required: true, maxlength: 200, 'aria-label': 'Title', class: 'tl-title-input' }),
      note: h('textarea', { rows: 2, maxlength: 4000, 'aria-label': 'Note' }),
      caseSel: h('select', { 'aria-label': 'Case number' }, [...tls.keys()].map((id) => h('option', { value: id, selected: id === c.id }, numberOf(id)))),
    };
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Add to timeline');
    const cancel = h('button', { class: 'btn', type: 'button', hidden: true }, 'Cancel');
    const list = h('ol', { class: 'timeline tl-modern' });
    // v1.73: a summary strip and filters above the timeline.
    const stats = h('div', { class: 'tl-stats' });
    let filter = 'all';
    const filters = h('div', { class: 'tl-filters', role: 'tablist' }, ...[['all', 'All'], ['upcoming', 'Upcoming'], ['deadline', 'Deadlines'], ['past', 'Past']].map(([k, label]) =>
      h('button', { type: 'button', class: `tl-filter${k === filter ? ' on' : ''}`, 'data-f': k, role: 'tab', onclick: () => { filter = k; filters.querySelectorAll('.tl-filter').forEach((b) => b.classList.toggle('on', b.dataset.f === k)); draw(); } }, label)));

    const persist = (caseId) => {
      const snapshot = structuredClone(tls.get(caseId));
      return Save.track(`timeline:${caseId}`, () => Vault.saveTimeline(caseId, snapshot)).catch(() => {});
    };

    const resetForm = () => {
      editing = null;
      f.title.value = ''; f.note.value = ''; f.time.value = '';
      f.caseSel.value = c.id;
      submit.textContent = 'Add to timeline';
      cancel.hidden = true;
    };
    cancel.addEventListener('click', resetForm);
    // v1.40: Clear empties the form (back to today, an Event) without leaving an edit in progress.
    const clear = h('button', { class: 'btn', type: 'button', title: 'Clear the form' }, 'Clear');
    clear.addEventListener('click', () => {
      f.date.value = today(); f.kind.value = 'event';
      f.title.value = ''; f.note.value = ''; f.time.value = '';
      f.title.focus();
    });

    const form = h('form', { class: 'timeline-form cv-boxed', onsubmit: async (e) => {
      e.preventDefault();
      const data = { date: f.date.value, time: f.time.value, kind: f.kind.value, title: f.title.value.trim(), note: f.note.value.trim() };
      if (!data.date || !data.title) return;
      const target = many ? f.caseSel.value : c.id;
      const touched = new Set([target]);
      if (editing) {
        const from = tls.get(editing.caseId);
        const ev = from.events.find((x) => x.id === editing.id);
        if (ev && editing.caseId !== target) {
          // Moved to another case number of the operation.
          from.events = from.events.filter((x) => x.id !== ev.id);
          tls.get(target).events.push({ ...ev, ...data, updated: new Date().toISOString() });
          touched.add(editing.caseId);
        } else if (ev) Object.assign(ev, data, { updated: new Date().toISOString() });
      } else {
        tls.get(target).events.push({ id: Vault.newId('e'), ...data, done: false, created: new Date().toISOString() });
      }
      for (const id of touched) Vault.sortEvents(tls.get(id).events);
      resetForm();
      draw();
      for (const id of touched) await persist(id);
      f.title.focus();
    } },
    field('Date', f.date), field('Time', f.time), field('Type', f.kind),
    many ? field('Case Number', f.caseSel, '', 'Which case number of the mission this belongs to') : null,
    field('Title', f.title, 'grow'),
    field('Note', f.note, 'full'),
    h('div', { class: 'full form-actions' }, cancel, clear, submit));

    function draw() {
      const everything = CVOperation.mergeEvents([...tls.entries()].map(([caseId, t]) => ({ caseId, number: numberOf(caseId), events: t.events })));
      const now = today();
      const openDl = everything.filter(({ ev }) => ev.kind === 'deadline' && !ev.done);
      const overdue = openDl.filter(({ ev }) => ev.date < now);
      const next = openDl.filter(({ ev }) => ev.date >= now).sort((a, b) => (a.ev.date + (a.ev.time || '')).localeCompare(b.ev.date + (b.ev.time || '')))[0];
      const stat = (n, label, cls, sub2) => h('div', { class: `tl-stat ${cls}` }, h('span', { class: 'tl-stat-n' }, String(n)), h('span', { class: 'tl-stat-l' }, label), sub2 ? h('span', { class: 'tl-stat-s' }, sub2) : '');
      stats.replaceChildren(
        stat(everything.filter(({ ev }) => ev.kind !== 'deadline').length, 'Events', 'ev'),
        stat(openDl.length, 'Open Deadlines', 'dl'),
        stat(overdue.length, 'Overdue', overdue.length ? 'od' : 'ok'),
        next ? stat((dueLabel(next.ev.date) || { text: fmtDate(next.ev.date) }).text, 'Next Due', 'nx', next.ev.title) : stat('—', 'Next Due', 'nx', 'Nothing due'));
      const keep = ({ ev }) => (filter === 'all' ? true : filter === 'deadline' ? ev.kind === 'deadline' : filter === 'upcoming' ? ev.date >= now : ev.date < now);
      const all = everything.filter(keep);
      if (!all.length) {
        list.replaceChildren(h('li', { class: 'muted empty' }, everything.length ? 'Nothing to show with this filter.' : many ? 'No events yet for any case number of this mission. Add dates, hearings, filings, and deadlines above.' : 'No events yet. Add dates, hearings, filings, and deadlines above.'));
        return;
      }
      // Newest month first or oldest? Kept in date order (as saved); a heading for each month and a
      // Today line where the past ends.
      const items = [];
      let month = '';
      let todayShown = false;
      const monthName = (d) => { const [y, m] = d.split('-'); return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m) - 1]} ${y}`; };
      for (const { caseId, ev } of all) {
        if (!todayShown && ev.date >= now && all.some((x) => x.ev.date < now)) { items.push(h('li', { class: 'tl-today' }, h('span', {}, `Today · ${fmtDate(now)}`))); todayShown = true; }
        const mk = ev.date.slice(0, 7);
        if (mk !== month) { month = mk; items.push(h('li', { class: 'tl-month' }, monthName(ev.date))); }
        const isDeadline = ev.kind === 'deadline';
        const due = isDeadline && !ev.done ? dueLabel(ev.date) : null;
        const done = isDeadline ? h('input', { type: 'checkbox', checked: !!ev.done, 'aria-label': 'Done', title: 'Mark done' }) : null;
        if (done) done.addEventListener('change', () => { ev.done = done.checked; draw(); persist(caseId); });
        const [, , dd] = ev.date.split('-');
        const wk = new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
        items.push(h('li', { class: `tl-item ${ev.kind} ${ev.done ? 'done' : ''} ${due ? due.cls : ''} ${ev.date < now ? 'past' : ''}` },
          h('div', { class: 'tl-when', title: fmtDate(ev.date) }, h('span', { class: 'tl-day' }, String(Number(dd))), h('span', { class: 'tl-wk' }, wk), ev.time ? h('span', { class: 'tl-time' }, ev.time) : ''),
          h('div', { class: 'tl-body' },
            h('div', { class: 'tl-title' },
              done,
              h('span', { class: `badge ${ev.kind}` }, isDeadline ? 'Deadline' : 'Event'),
              many ? h('span', { class: `tl-case${caseId === c.id ? ' current' : ''}`, title: caseId === c.id ? 'This case number' : 'Another case number of this mission' }, numberOf(caseId)) : null,
              h('strong', {}, ev.title),
              due && h('span', { class: `due ${due.cls}` }, due.text)),
            ev.note && h('div', { class: 'tl-note' }, ev.note)),
          h('div', { class: 'tl-actions' },
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
              editing = { id: ev.id, caseId };
              f.date.value = ev.date; f.time.value = ev.time || ''; f.kind.value = ev.kind;
              f.title.value = ev.title; f.note.value = ev.note || '';
              f.caseSel.value = caseId;
              submit.textContent = 'Save changes'; cancel.hidden = false;
              f.title.focus();
            } }, 'Edit'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              if (!(await confirmDialog({ title: 'Delete this entry?', message: `"${ev.title}" on ${fmtDate(ev.date)}${many ? ` (${numberOf(caseId)})` : ''}`, confirmText: 'Delete', danger: true }))) return;
              const t = tls.get(caseId);
              t.events = t.events.filter((x) => x.id !== ev.id);
              if (editing && editing.id === ev.id) resetForm();
              draw();
              persist(caseId);
            } }, 'Delete'))));
      }
      if (!todayShown && all.every((x) => x.ev.date < now)) items.push(h('li', { class: 'tl-today' }, h('span', {}, `Today · ${fmtDate(now)}`)));
      list.replaceChildren(...items);
    }

    draw();
    panel.replaceChildren(many ? h('p', { class: 'muted small tl-op-note' }, `The timeline of the whole mission: all ${tls.size} case numbers.`) : '', form, stats, filters, list);
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

  // Folders whose sub-folders are showing (Recordings → Video, Audio), for this window.
  const openFolders = new Set();

  // Files tab: the case's document folders on the left, the chosen folder's files on the right.
  // sub (from the address) is the folder being shown; '' = all folders.
  async function renderFiles(panel, c, token, sub) {
    const archived = Vault.isArchived(c.id);
    if (!archived) await Vault.ensureFolders(c.id).catch((err) => { if (FS.isDisconnectError(err)) throw err; });
    const files = await Vault.listFiles(c.id);
    if (token !== state.renderToken) return;
    const CF = CVCaseFiles;
    try { sub = sub ? decodeURIComponent(sub) : sub; } catch { /* keep as is */ }
    // 'photos' (v1.29): every picture in the case, whatever folder it's in.
    const current = CF.isCategory(sub) ? sub : (sub === 'unsorted' || sub === 'photos' ? sub : '');
    const isPhoto = (f) => /\.(jpe?g|png|gif|webp|bmp|heic|heif|tiff?)$/i.test(f.name || '');
    const special = current === 'unsorted' || current === 'photos';
    const inFolder = (f) => (current === 'unsorted' ? !f.folder : current === 'photos' ? isPhoto(f) : !current || f.folder === current);
    const shown = files.filter(inFolder);
    const count = (folder) => files.filter((f) => f.folder === folder).length;
    const unsorted = files.filter((f) => !f.folder);
    const prefix = CF.casePrefix(c);

    const input = h('input', { type: 'file', multiple: true, hidden: true });
    input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
    const target = current && !special ? current : '';
    const dropTip = target
      ? `Saved as "${CF.fileName(c, target, 'x.pdf').replace(/\.pdf$/, '')}…" in ${CVFormat.pathText(`files\\${target}`)}. The originals are not changed.`
      : 'You pick the document type for each file next. They are copied to the SSD and named by the case number; the originals are not changed.';
    const drop = h('div', { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Add files', title: dropTip },
      I('upload', { cls: 'drop-icon' }),
      h('strong', {}, target ? `Drop files into ${target.replace('/', ' › ')}` : 'Drop files here'), ' or ', h('span', { class: 'link' }, 'choose files'));
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

    // ---- folder list: your order (drag a folder to move it; Alt+↑/↓ with the keyboard), with
    // sub-folders under their parent. Legacy folders only show when they hold files.
    const settings = Vault.data.settings;
    const topFolders = CF.ALL_FOLDERS.filter((f) => !CF.parentOf(f));
    const saved = Array.isArray(settings.folderOrder) ? settings.folderOrder.filter((f) => topFolders.includes(f)) : [];
    const ordered = [...saved, ...topFolders.filter((f) => !saved.includes(f))];
    const visible = (f) => !(CF.byFolder(f) || {}).legacy || count(f) + CF.childrenOf(f).reduce((n, k) => n + count(k), 0) > 0;
    const saveFolderOrder = (order) => Save.track('settings', () => Vault.updateSettings({ folderOrder: order })).catch(() => {});

    const folderBtn = (key, label, n, { child = false, top = null } = {}) => {
      const a = h('a', {
        href: `#/case/${encodeURIComponent(c.id)}/files${key ? `/${encodeURIComponent(key)}` : ''}`,
        class: `folder-item ${current === key ? 'active' : ''} ${child ? 'child' : ''}`, 'data-ro-ok': 'true', 'aria-current': current === key ? 'page' : null,
        title: top ? `${label}. Drag to reorder the folders (or Alt+↑/↓). Drop a file here to move it into this folder.` : null,
        draggable: top && !archived ? 'true' : null,
      }, h('span', { class: 'folder-name' }, label), h('span', { class: 'folder-count muted' }, n ? String(n) : ''), h('span', { class: 'folder-icon' }, I(FOLDER_ICONS[key] || 'folder')));
      // Drop a file onto a folder to move it there.
      if (key && key !== 'unsorted' && key !== 'photos' && !archived) {
        a.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-casevault-file') || e.dataTransfer.types.includes('application/x-casevault-folder')) { e.preventDefault(); a.classList.add('drop-target'); } });
        a.addEventListener('dragleave', () => a.classList.remove('drop-target'));
        a.addEventListener('drop', async (e) => {
          a.classList.remove('drop-target');
          const file = e.dataTransfer.getData('application/x-casevault-file');
          const folder = e.dataTransfer.getData('application/x-casevault-folder');
          e.preventDefault();
          if (file) {
            const f = files.find((x) => x.name === file);
            if (!f || f.folder === key) return;
            try {
              const to = await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, key, {}));
              toast(`Moved to ${key.replace('/', ' › ')}: ${CF.splitPath(to).base}`, 'success', 5000);
              showCase(c.id, 'files', current || null);
            } catch { /* reported by Save */ }
          } else if (folder && top && folder !== top) {
            const order = ordered.filter((x) => x !== folder);
            order.splice(order.indexOf(top), 0, folder);
            await saveFolderOrder(order);
            showCase(c.id, 'files', current || null);
          }
        });
      }
      if (top && !archived) {
        a.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-casevault-folder', top); e.dataTransfer.effectAllowed = 'move'; });
        a.addEventListener('keydown', async (e) => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          const order = [...ordered];
          const i = order.indexOf(top);
          const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
          if (j < 0 || j >= order.length) return;
          [order[i], order[j]] = [order[j], order[i]];
          await saveFolderOrder(order);
          await showCase(c.id, 'files', current || null);
          const again = [...document.querySelectorAll('.folder-nav .folder-item')].find((x) => x.dataset.top === top);
          if (again) again.focus();
        });
        a.dataset.top = top;
      }
      return a;
    };

    const nav = h('nav', { class: 'folder-nav', 'aria-label': 'Document folders' },
      folderBtn('', 'All documents', files.length),
      folderBtn('photos', 'Photos', files.filter(isPhoto).length),
      ordered.filter(visible).map((f) => {
        const kids = CF.childrenOf(f);
        const btn = folderBtn(f, f, count(f) + kids.reduce((n, k) => n + count(k), 0), { top: f });
        if (!kids.length) return btn;
        // Sub-folders (Recordings: Video, Audio) fold away until you click the folder or its arrow.
        if (current === f || kids.includes(current)) openFolders.add(f);
        const open = openFolders.has(f);
        const box = h('div', { class: 'folder-children', hidden: !open }, kids.map((k) => folderBtn(k, CF.shortName(k), count(k), { child: true })));
        const toggle = h('button', { class: 'folder-toggle', type: 'button', 'data-ro-ok': 'true', 'aria-expanded': String(open), title: open ? `Hide ${kids.map(CF.shortName).join(' and ')}` : `Show ${kids.map(CF.shortName).join(' and ')}` },
          I(open ? 'chevron-down' : 'chevron-right'), h('span', { class: 'sr-only' }, `${f}: sub-folders`));
        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          const now = box.hidden;
          box.hidden = !now;
          if (now) openFolders.add(f); else openFolders.delete(f);
          toggle.setAttribute('aria-expanded', String(now));
          toggle.replaceChildren(I(now ? 'chevron-down' : 'chevron-right'), h('span', { class: 'sr-only' }, `${f}: sub-folders`));
        });
        btn.classList.add('has-children');
        return h('div', { class: 'folder-parent' }, h('div', { class: 'folder-parent-row' }, btn, toggle), box);
      }),
      unsorted.length ? folderBtn('unsorted', 'Unsorted', unsorted.length) : null,
      // v1.76: "Arrange", boxed like the Discovery button.
      archived ? null : h('button', { class: 'btn small folder-reset folder-arrange', type: 'button', icon: 'list-ol', title: 'Put the folders in your own order, with up and down buttons. You can also drag a folder in this list.', onclick: async () => {
        const order = await arrangeFoldersDialog(ordered.filter(visible));
        if (!order) return;
        await saveFolderOrder(order);
        showCase(c.id, 'files', current || null);
      } }, 'Arrange'),
      // v1.49: a password-protected, view-and-print-only package of chosen files, for discovery.
      archived ? null : h('button', { class: 'btn small folder-reset disc-open', type: 'button', icon: 'shield-lock-fill', title: 'Make a password-protected discovery package of chosen files, with Bates numbers, for a USB drive or a DVD.', onclick: () => CVDiscoveryUI.open(c).catch((err) => { if (FS.isDisconnectError(err)) onDriveLost(); else toast(`Could not open Discovery: ${err.message}`, 'error'); }) }, 'Discovery'));

    // A folder from an older version (Warrants Signed…): offer to move its files into the folder
    // that replaced it.
    const legacy = CF.byFolder(current);
    const mergeNote = legacy && legacy.mergeInto && shown.length && !archived
      ? h('p', { class: 'hint merge-hint' }, `${current} is no longer used; ${legacy.mergeInto} replaces it. `,
        h('button', { class: 'btn small', type: 'button', icon: 'arrow-left-right', onclick: async () => {
          if (!(await confirmDialog({ title: `Move ${shown.length} file${shown.length === 1 ? '' : 's'} to ${legacy.mergeInto}?`, message: legacy.keepName ? 'The files keep their names.' : `Each file is renamed by the convention for ${legacy.mergeInto}.`, confirmText: 'Move' }))) return;
          let moved = 0;
          for (const f of shown) {
            try { await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, legacy.mergeInto, { keepName: !!legacy.keepName })); moved++; } catch { break; }
          }
          if (moved) toast(`Moved ${moved} file${moved === 1 ? '' : 's'} to ${legacy.mergeInto}.`, 'success', 5000);
          location.hash = `#/case/${encodeURIComponent(c.id)}/files/${encodeURIComponent(legacy.mergeInto)}`;
        } }, `Move them to ${legacy.mergeInto}`))
      : null;

    // ---- file table: Name, Type, Size, Added. Click a heading to sort; "Custom" is your own
    // order (drag the rows), kept per folder in the case's file-order.json.
    const sortPref = settings.filesSort && typeof settings.filesSort === 'object' ? settings.filesSort : { key: 'custom', dir: 1 };
    const inOneFolder = current && !special;
    let fileOrder = {};
    try { fileOrder = (await Vault.readCaseJSON(c.id, 'file-order.json')) || {}; } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    if (token !== state.renderToken) return;
    const custom = (fileOrder[current || ''] || []);
    const byCustom = (a, b) => {
      const ia = custom.indexOf(a.base); const ib = custom.indexOf(b.base);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    };
    // The Document column: what the file is (its folder's document type), e.g. "Arrest Report".
    const docLabel = (f) => (f.folder ? (CF.byFolder(f.folder) || {}).label || f.folder : 'Unsorted');
    // v1.27: Name "2024-JH123456 | Arrest Report" (no extension), File ".docx", Added "09.30 08.57".
    const extOf = (base) => ((/(\.[a-z0-9]{1,6})$/i.exec(base) || [])[1] || '').toLowerCase();
    // v1.70: an Additional Exhibit's photos show as "Exhibit 1a" here (the file keeps its name).
    // v1.76: "2026-EX-100 | Purchase": the document type is left out (the Document column shows it),
    // unless it is all the name has.
    const nameOf = (base, f) => {
      const stem = base.slice(0, base.length - extOf(base).length).replace(/\bAdditional (?=Exhibit\b)/g, '');
      if (prefix && stem.toLowerCase().startsWith(prefix.toLowerCase()) && stem.length > prefix.length) {
        let rest = stem.slice(prefix.length).replace(/^[\s_-]+/, '');
        const label = f && f.folder ? docLabel(f) : '';
        // v1.79: only "Type - Description" loses its type ("Exhibit 3b" stays "Exhibit 3b").
        const m = label ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+-\\s+(.+)$`, 'i').exec(rest) : null;
        if (m && !/^\(\d+\)$/.test(m[1])) rest = m[1];
        return rest ? `${stem.slice(0, prefix.length)} | ${rest}` : stem;
      }
      return stem || base;
    };
    const addedText = (ms) => (ms ? fmtDate(Vault.localDay(new Date(ms))) : '—');
    const cmp = {
      custom: (a, b) => byCustom(a, b), // v1.79: every view has its own order, All documents too
      name: (a, b) => a.base.localeCompare(b.base, undefined, { numeric: true }),
      type: (a, b) => docLabel(a).localeCompare(docLabel(b)) || a.base.localeCompare(b.base),
      ext: (a, b) => extOf(a.base).localeCompare(extOf(b.base)) || a.base.localeCompare(b.base),
      size: (a, b) => (a.size || 0) - (b.size || 0),
      added: (a, b) => (a.modified || 0) - (b.modified || 0),
    };
    const rows = [...shown].sort((a, b) => (cmp[sortPref.key] || cmp.custom)(a, b) * (sortPref.key === 'custom' ? 1 : sortPref.dir));
    const setSort = (key) => {
      const next = { key, dir: sortPref.key === key && key !== 'custom' ? -sortPref.dir : 1 };
      Save.track('settings', () => Vault.updateSettings({ filesSort: next })).catch(() => {});
      showCase(c.id, 'files', current || null);
    };
    const th = (key, label, cls = '') => h('th', { class: `${cls} sortable ${sortPref.key === key ? 'sorted' : ''}`, 'aria-sort': sortPref.key === key ? (sortPref.dir > 0 ? 'ascending' : 'descending') : null },
      h('button', { type: 'button', class: 'th-btn', 'data-ro-ok': 'true', title: `Sort by ${label.toLowerCase()}`, onclick: () => setSort(key) },
        label, sortPref.key === key ? I(sortPref.dir > 0 ? 'chevron-down' : 'chevron-up', { cls: 'sort-icon' }) : null));
    const dragRows = sortPref.key === 'custom' && !archived;
    const saveCustom = async (list) => {
      fileOrder[current || ''] = list;
      await Save.track(`file-order:${c.id}`, () => Vault.writeCaseJSON(c.id, 'file-order.json', fileOrder)).catch(() => {});
    };

    const table = shown.length
      ? h('div', { class: 'files-table-wrap' }, h('table', { class: `files${shown.some((f) => f.folder === 'Link Charts' && /\.pdf$/i.test(f.base)) ? ' has-lc' : ''}` },
        h('colgroup', {}, dragRows ? h('col', { class: 'col-grip' }) : null, h('col', { class: 'col-name' }), h('col', { class: 'col-type' }), h('col', { class: 'col-ext' }), h('col', { class: 'col-size' }), h('col', { class: 'col-added' }), h('col', { class: 'col-actions' })),
        h('thead', {}, h('tr', {},
          dragRows ? h('th', { class: 'grip-cell', title: 'Your own order: drag the rows' }, h('span', { class: 'sr-only' }, 'Order')) : null,
          th('name', 'Name'), th('type', 'Document'), th('ext', 'File', 'fext-head'), th('size', 'Size', 'num'), th('added', 'Updated', 'date-cell'),
          h('th', { class: 'actions-head' }, !archived
            ? h('button', { type: 'button', class: `th-btn small ${sortPref.key === 'custom' ? 'sorted' : ''}`, 'data-ro-ok': 'true', icon: 'list-check', title: 'Your own order for this folder: drag the rows to arrange them.', onclick: () => setSort('custom') }, 'Custom')
            : h('span', { class: 'sr-only' }, 'Actions')))),
        h('tbody', {}, rows.map((f) => {
          const tr = h('tr', { 'data-base': f.base, draggable: !archived ? 'true' : null },
            dragRows ? h('td', { class: 'grip-cell', title: 'Drag to reorder' }, I('grip-vertical')) : null,
            h('td', { class: 'fname' },
              h('span', { class: 'fname-text' },
                h('button', { 'data-ro-ok': 'true', class: 'linkish fname-link', type: 'button', title: f.base, onclick: () => previewFile(c, f.name) }, ((nm) => { const i = nm.indexOf(' | '); return i < 0 ? nm : [h('span', { class: 'fn-pre' }, `${nm.slice(0, i)} |`), ` ${nm.slice(i + 3)}`]; })(nameOf(f.base, f))),
                !inOneFolder ? h('span', { class: 'fname-folder muted small' }, (f.folder || 'Unsorted').replace('/', ' › ')) : null),
              f.folder && prefix && !CF.followsConvention(c, f.folder, f.base) ? h('span', { class: 'pill warn-pill', title: `Not named ${prefix}-<file name>` }, 'name') : null),
            // v1.79: the Document column shows the file's icon (its type in the hover box).
            h('td', { class: 'ftype fdoc-icon', title: `${docLabel(f)} · ${fileTypeLabel(f.base)}` }, h('span', { class: `file-icon ${fileKind(f.base)}` }, I(FILE_ICONS[fileKind(f.base)])), h('span', { class: 'sr-only' }, docLabel(f))),
            h('td', { class: 'fext muted', title: fileTypeLabel(f.base) }, extOf(f.base) || '—'),
            h('td', { class: 'num muted' }, fmtSize(f.size)),
            h('td', { class: 'muted fadded date-cell', title: `Last updated ${fmtDateTime(f.modified)}` }, h('span', { class: 'fadded-day' }, addedText(f.modified)), f.modified ? h('span', { class: 'fadded-time' }, fmtTime(f.modified)) : null),
            h('td', { class: 'actions' },
              // v1.56: a Link Chart PDF goes back to the Link Chart tab.
              f.folder === 'Link Charts' && /\.pdf$/i.test(f.base) ? h('button', { class: 'icon-btn', type: 'button', title: 'Open in Link Chart: send this chart back to the Link Chart tab to change it', onclick: async () => { if (await CVLinkChartUI.openFromFile(c, f.name)) showCase(c.id, 'linkchart'); } }, I('diagram-3-fill'), h('span', { class: 'sr-only' }, `Open ${f.base} in Link Chart`)) : null,
              h('button', { class: 'icon-btn', type: 'button', title: f.folder ? 'Rename or move to another folder' : 'File it in a folder', onclick: () => moveFileDialog(c, f, current) }, I('pencil-square'), h('span', { class: 'sr-only' }, `Rename or move ${f.base}`)),
              h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete from the SSD', onclick: async () => {
                if (!(await confirmDialog({ title: 'Delete this file?', message: `"${f.base}" will be permanently deleted from the SSD.`, confirmText: 'Delete', danger: true }))) return;
                try {
                  await Save.track(`file-del:${c.id}:${f.name}`, () => Vault.deleteFile(c.id, f.name));
                  showCase(c.id, 'files', current || null);
                } catch { /* reported by Save */ }
              } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${f.base}`))));
          if (!archived) {
            tr.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData('application/x-casevault-file', f.name);
              e.dataTransfer.effectAllowed = 'move';
              tr.classList.add('dragging');
            });
            tr.addEventListener('dragend', () => tr.classList.remove('dragging'));
          }
          if (dragRows) {
            tr.addEventListener('dragover', (e) => {
              if (!e.dataTransfer.types.includes('application/x-casevault-file')) return;
              e.preventDefault();
              const r = tr.getBoundingClientRect();
              tr.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
              tr.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
            });
            tr.addEventListener('dragleave', () => tr.classList.remove('drop-before', 'drop-after'));
            tr.addEventListener('drop', async (e) => {
              const name = e.dataTransfer.getData('application/x-casevault-file');
              const after = tr.classList.contains('drop-after');
              tr.classList.remove('drop-before', 'drop-after');
              const moving = rows.find((x) => x.name === name);
              if (!moving || moving === f) return;
              e.preventDefault();
              const list = rows.map((x) => x.base).filter((b) => b !== moving.base);
              list.splice(list.indexOf(f.base) + (after ? 1 : 0), 0, moving.base);
              await saveCustom(list);
              showCase(c.id, 'files', current || null);
            });
          }
          return tr;
        }))))
      : h('p', { class: 'muted' }, current ? (current === 'photos' ? 'No photos in this case yet.' : `No documents in ${current === 'unsorted' ? 'Unsorted' : current.replace('/', ' › ')} yet.`) : 'No files attached yet.');

    const where = CVFormat.pathText(`${archived ? 'archive' : 'cases'}\\${c.id}\\files${current && !special ? `\\${current}` : ''}`);
    panel.replaceChildren(...[
      prefix ? null : h('p', { class: 'hint' }, 'This case has no case number yet, so files are named ', h('code', {}, `${new Date().getFullYear()}-NOCASENO …`), '. Add the number on the Details tab first to have them named ', h('code', {}, '2026-<CaseNo> <Type>'), '.'),
      mergeNote,
      unsorted.length && !archived ? h('p', { class: 'hint' }, `${unsorted.length} file${unsorted.length === 1 ? ' was' : 's were'} added before document folders existed. Open "Unsorted" and use "File it…" to move each into its folder with a conventional name.`) : null,
      h('div', { class: 'files-layout' }, nav,
        h('div', { class: 'files-main' }, drop, input,
          h('div', { class: 'files-where-row' },
            h('p', { class: 'muted small files-where' }, `${shown.length} file${shown.length === 1 ? '' : 's'} · ${where}${dragRows ? ' · drag rows to arrange them' : ''}${!archived ? ' · drag a file onto a folder to move it' : ''}`),
            // v1.76: arrange the files of a folder (up and down buttons, or drag), like the folders.
            !archived && shown.length > 1 ? h('button', { class: 'btn small files-arrange', type: 'button', icon: 'list-ol', title: 'Put the files of this folder in your own order', onclick: async () => {
              const ordered = [...shown].sort(byCustom).map((f) => f.base);
              const byBase = new Map(shown.map((f) => [f.base, f]));
              const order = await arrangeFoldersDialog(ordered, {
                title: 'Arrange files', note: `The order of the files in ${current ? (current === 'unsorted' ? 'Unsorted' : current === 'photos' ? 'Photos' : current.replace('/', ' › ')) : 'All documents'}. Drag a file or use the arrows.`,
                label: (b) => nameOf(b, byBase.get(b)), icon: (b) => I(FILE_ICONS[fileKind(b)]),
                standard: () => [...ordered].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), standardLabel: 'By name', standardTitle: 'Put the files back in name order.',
              });
              if (!order) return;
              await saveCustom(order);
              if (sortPref.key !== 'custom') await Save.track('settings', () => Vault.updateSettings({ filesSort: { key: 'custom', dir: 1 } })).catch(() => {});
              showCase(c.id, 'files', current || null);
            } }, 'Arrange') : null),
          table))].filter(Boolean));
  }

  // The folder list in your own order: ↑/↓ buttons (or drag a row). Resolves the new order, or null.
  // v1.76: the same dialog arranges the files of one folder (opts: title, note, label, icon, standard).
  function arrangeFoldersDialog(folders, opts = {}) {
    const order = [...folders];
    const labelOf = opts.label || ((f) => f);
    const iconOf = opts.icon || ((f) => I(FOLDER_ICONS[f] || 'folder'));
    return openDialog((close) => {
      const list = h('ol', { class: 'arrange-list' });
      let dragging = null;
      const move = (i, j) => { if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(order[j]); };
      function draw(focusName) {
        list.replaceChildren(...order.map((f, i) => {
          const li = h('li', { class: 'arrange-item', draggable: 'true' },
            h('span', { class: 'grip-cell', 'aria-hidden': 'true' }, I('grip-vertical')),
            h('span', { class: 'folder-icon' }, iconOf(f)),
            h('span', { class: 'arrange-name' }, labelOf(f)),
            h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0, 'data-dir': 'up', onclick: () => move(i, i - 1) }, I('arrow-up'), h('span', { class: 'sr-only' }, `Move ${labelOf(f)} up`)),
            h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === order.length - 1, 'data-dir': 'down', onclick: () => move(i, i + 1) }, I('arrow-down'), h('span', { class: 'sr-only' }, `Move ${labelOf(f)} down`)));
          li.addEventListener('dragstart', (e) => { dragging = f; e.dataTransfer.setData('text/plain', f); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
          li.addEventListener('dragend', () => { dragging = null; li.classList.remove('dragging'); });
          li.addEventListener('dragover', (e) => { if (dragging && dragging !== f) { e.preventDefault(); li.classList.add('drop-target'); } });
          li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
          li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.classList.remove('drop-target');
            if (!dragging || dragging === f) return;
            const moving = dragging;
            const from = order.indexOf(moving);
            order.splice(from, 1);
            // Dragged down: lands after this folder; dragged up: before it.
            order.splice(order.indexOf(f) + (from < i ? 1 : 0), 0, moving);
            draw(moving);
          });
          return li;
        }));
        if (focusName) {
          const li = list.children[order.indexOf(focusName)];
          const btn = li && (li.querySelector('button:not([disabled])'));
          if (btn) btn.focus();
        }
      }
      draw();
      return h('form', { class: 'arrange-form', onsubmit: (e) => { e.preventDefault(); close([...order]); } },
        h('h2', { icon: 'list-ol' }, opts.title || 'Arrange folders'),
        h('p', { class: 'muted small explain' }, opts.note || 'The order is the same for every case. Sub-folders such as Video and Audio stay under their folder.'),
        list,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn ghost', type: 'button', icon: 'arrow-counterclockwise', title: opts.standardTitle || 'Put the folders back in the standard order.', onclick: () => close(opts.standard ? opts.standard() : CVCaseFiles.ALL_FOLDERS.filter((f) => !CVCaseFiles.parentOf(f))) }, opts.standardLabel || 'Standard order'),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save order')));
    });
  }

  function chooseTypes(c, list, preset) {
    const CF = CVCaseFiles;
    return openDialog((close) => {
      const rows = list.map((file) => {
        const folder = h('select', { 'aria-label': `Document type for ${file.name}` },
          CF.FOLDERS.map((f) => h('option', { value: f, selected: f === (preset || CF.guessFolder(file.name)) }, f.replace('/', ' › '))));
        const desc = h('input', { type: 'text', maxlength: 80, 'aria-label': `File name for ${file.name}` }); // v1.76: no placeholder (it was cut off)
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
      h('p', { class: 'muted small explain' }, 'Each file goes into its document folder and is named ', h('code', {}, '<year>-<case no.> <document type>'), '. A number like (2) is added when the name is taken.'),
      // v1.76: fixed column widths, so the boxes stay put while "Saved as" changes with the typing.
      h('div', { class: 'table-scroll' }, h('table', { class: 'files type-table' },
        h('colgroup', {}, h('col', { class: 'tt-file' }), h('col', { class: 'tt-type' }), h('col', { class: 'tt-name' }), h('col', { class: 'tt-saved' })),
        h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Document type'), h('th', {}, 'File name'), h('th', {}, 'Saved as'))),
        h('tbody', {}, rows.map((r) => r.el)))),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit', autofocus: true }, 'Save to SSD')));
    });
  }

  async function moveFileDialog(c, f, current) {
    const CF = CVCaseFiles;
    const plan = await openDialog((close) => {
      const folder = h('select', {}, CF.FOLDERS.map((x) => h('option', { value: x, selected: x === (f.folder || CF.guessFolder(f.base)) }, x.replace('/', ' › '))));
      const desc = h('input', { type: 'text', maxlength: 80 });
      const keep = h('input', { type: 'checkbox' });
      const result = h('code', {});
      const show = () => { result.textContent = keep.checked ? f.base : CF.fileName(c, folder.value, f.base, desc.value); desc.disabled = keep.checked; };
      for (const el of [folder, desc, keep]) el.addEventListener('input', show);
      keep.addEventListener('change', show);
      show();
      return h('form', { onsubmit: (e) => { e.preventDefault(); close({ folder: folder.value, description: desc.value.trim(), keepName: keep.checked }); } },
        // v1.80: one Save for both: a new name, another folder, or both.
        h('h2', {}, f.folder ? 'Rename or Move' : 'File This Document'),
        h('p', { class: 'muted small' }, f.base),
        h('p', { class: 'muted small' }, 'Type a new name, pick another folder, or both, then click Save.'),
        field('Document folder', folder),
        field('File name', desc, '', 'Optional: the name after the year and case number. Empty keeps the current name.'),
        h('label', { class: 'check-row' }, keep, h('span', {}, 'Keep the current file name')),
        h('p', {}, 'New name: ', result),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
    });
    if (!plan) return;
    try {
      const to = await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, plan.folder, plan));
      // v1.79: a renamed file keeps its place in your own order.
      const newBase = String(to).split(/[\\/]/).pop();
      if (newBase && newBase !== f.base) {
        try {
          const order = (await Vault.readCaseJSON(c.id, 'file-order.json')) || {};
          let changed = false;
          for (const k of Object.keys(order)) if (Array.isArray(order[k]) && order[k].includes(f.base)) { order[k] = order[k].map((b) => (b === f.base ? newBase : b)); changed = true; }
          if (changed) await Vault.writeCaseJSON(c.id, 'file-order.json', order);
        } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      }
      toast(`Saved as ${CVFormat.pathText(to)}`, 'success', 6000);
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
      // v1.68: a folder not tied to a case passes its own reader.
      file = c.readFile ? await c.readFile(name) : await Vault.readFile(c.id, name);
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
          const note = h('p', { class: 'muted small' }, 'XFA form, shown read-only.');
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
          h('code', { class: 'path' }, CVFormat.pathText(c.readFile ? `${Vault.root.name}\\shared\\${c.where}\\${name}` : `${Vault.root.name}\\${Vault.isArchived(c.id) ? 'archive' : 'cases'}\\${c.id}\\files\\${name}`)),
          h('p', { class: 'muted small explain' }, 'Tip: in File Explorer, paste the folder part of that path after your CaseVault drive letter.'));
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
      const info = h('section', { 'data-section': 'vault' },
        h('h3', {}, 'This vault'),
        h('div', { class: 'vault-facts' },
          [['folder2-open', 'Folder', Vault.root.name], ['collection', 'Cases', String(v.cases.length)], ['calendar-event', 'Created', v.created ? fmtDateTime(Date.parse(v.created)) : '—'],
            ['shield-check', 'App version', Vault.APP_VERSION], [MODE === 'direct' ? 'usb-drive' : 'plug', 'Mode', MODE === 'direct' ? 'Direct' : 'Helper', MODE === 'direct' ? 'The browser opens the SSD itself.' : 'The CaseVault helper on 127.0.0.1 opens the SSD.']]
            .map(([ic, k, val, tip]) => h('div', { class: 'fact', title: tip || null }, h('span', { class: 'fact-icon' }, I(ic)), h('span', {}, h('span', { class: 'small muted block' }, k), h('strong', {}, val))))),
        h('p', { class: 'muted small' }, 'Vault ID ', h('span', { class: 'mono' }, v.vaultId || '—')));
      const backupsSec = h('section', { 'data-section': 'backups' },
        h('h3', {}, 'Backups'),
        h('p', {}, `A copy of vault.json is saved to the backups folder once a day. ${backups.length} backup${backups.length === 1 ? '' : 's'} on the SSD${backups[0] ? `, newest: ${backups[0]}` : ''}.`),
        h('p', { class: 'muted small explain' }, 'This covers the case index and settings. To back up whole cases (notes, timelines, files), copy the entire CaseVault-Data folder to a second encrypted drive.'),
        h('div', { class: 'row' },
          h('label', { class: 'inline' }, 'Keep the newest ', keep, ' backups'),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', icon: 'save', onclick: async () => {
            try { const name = await Save.track('backup', () => Vault.backupNow()); toast(`Backup saved: ${name}`, 'success'); close(); } catch { /* reported */ }
          } }, 'Back up now')));
      const maintenance = h('section', { 'data-section': 'maintenance' },
        h('h3', {}, 'Maintenance'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', type: 'button', icon: 'arrow-repeat', onclick: async () => {
            try { await Save.track('reindex', () => Vault.rebuildIndex()); renderCaseList(); toast('Case index rebuilt from the case folders.', 'success'); } catch { /* reported */ }
          } }, 'Rebuild case index'),
          h('button', { class: 'btn', type: 'button', icon: 'clipboard2-pulse', onclick: () => { close(); showSelfTest(); } }, 'Run self-test…'),
          MODE === 'direct' && h('button', { class: 'btn', type: 'button', icon: 'folder2-open', onclick: async () => { close(); await Save.flushAll(); pickFolder(); } }, 'Open a different vault…'),
          MODE === 'direct' && h('button', { class: 'btn', type: 'button', icon: 'box-arrow-left', onclick: async () => {
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
          } }, 'Disconnect')));

      // Each section is a card; the list on the left jumps to it and follows the scrolling.
      const SECTION_ICONS = { vault: 'safe2', backups: 'save', privacy: 'eye-slash', affiant: 'person-badge', templates: 'file-earmark-ruled', library: 'bookshelf', behavior: 'robot', links: 'link-45deg', online: 'globe2', pii: 'fingerprint', mail: 'envelope-at', log: 'list-check', maintenance: 'tools' };
      const sections = [info, backupsSec, privacySettings(v), affiantSettings(v), CVDraftsUI.templateSettings(), CVLibraryUI.librarySection(), CVLibraryUI.behaviorSection(), CVReferenceUI.linksSection(),
        CVSecureSettings.onlineSection(), CVSecureSettings.watchSection(), CVSecureSettings.mailSection(), CVSecureSettings.logSection(), maintenance];
      const scroller = h('div', { class: 'vault-content' });
      // Scroll only the sections' own box. scrollIntoView would also scroll the panel itself,
      // which pushed the Done button off the top.
      const scrollToSection = (sec, smooth = false) => (sec.cvUnfold && sec.cvUnfold(), scroller.scrollTo({ top: sec.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' }));
      const nav = h('nav', { class: 'vault-nav', 'aria-label': 'Vault settings' });
      sections.forEach((sec, i) => {
        const key = sec.dataset.section || `s${i}`;
        sec.dataset.section = key;
        sec.classList.add('vault-card');
        const title = sec.querySelector('h3');
        if (title && !title.querySelector('svg')) title.append(' ', I(SECTION_ICONS[key] || 'gear'));
        // The section's explanation goes into a hover box on its heading and icon (v1.29: no ⓘ).
        const intro = title && title.nextElementSibling;
        if (intro && intro.matches('p.muted')) {
          title.dataset.tip = [title.dataset.tip || title.getAttribute('title'), intro.textContent.trim()].filter(Boolean).join('\n');
          title.dataset.tipLong = '1';
          title.removeAttribute('title');
          title.tabIndex = 0;
          intro.remove();
        }
        scroller.append(sec);
        nav.append(h('button', { type: 'button', class: 'vault-nav-item', 'data-target': key, onclick: () => scrollToSection(sec, true) },
          h('span', {}, title ? title.textContent.replace(/\s*\(.*\)$/, '').trim() : key), I(SECTION_ICONS[key] || 'gear')));
      });
      const spy = new IntersectionObserver((entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!top) return;
        for (const b of nav.children) b.classList.toggle('active', b.dataset.target === top.target.dataset.section);
      }, { root: scroller, rootMargin: '0px 0px -70% 0px' });
      sections.forEach((sec) => spy.observe(sec));
      nav.firstChild.classList.add('active');
      // Open at one section (Menu → Library): scroll to it once the panel is on screen, and mark
      // it in the list on the left.
      if (section) setTimeout(() => {
        const el = scroller.querySelector(`[data-section="${section}"]`);
        if (!el) return;
        scrollToSection(el);
        setTimeout(() => { for (const b of nav.children) b.classList.toggle('active', b.dataset.target === section); }, 200);
      }, 60);
      // v1.54: each section is a card that folds away with the button in its heading.
      sections.forEach((sec) => { sec.classList.add('vault-sec', 'cv-boxed'); makeFoldable(sec, `vault-${sec.dataset.section}`); });
      return h('div', { class: 'vault-panel' },
        h('div', { class: 'vault-panel-head' }, h('span', { class: 'vault-badge' }, I('safe2')), h('div', {}, h('h2', {}, 'Vault'), h('p', { class: 'muted small explain' }, `${Vault.root.name} · ${v.cases.length} case${v.cases.length === 1 ? '' : 's'}`)),
          h('div', { class: 'spacer' }), h('button', { class: 'btn primary', type: 'button', icon: 'check2', onclick: () => close() }, 'Done')),
        h('div', { class: 'vault-panel-body' }, nav, scroller));
    });
  }

  // Self-test: made-up documents through every reader, the checker, privacy and the AI engine.
  async function showSelfTest() {
    if (!state.connected) return;
    const env = { Vault, FS, Engine: CVChecks.Engine, mode: MODE };
    const icons = { waiting: 'three-dots', running: 'arrow-repeat', pass: 'check-circle-fill', warn: 'exclamation-triangle-fill', fail: 'x-circle' };
    let results = [];
    const list = h('ol', { class: 'selftest-list' });
    const summary = h('p', { class: 'muted' }, 'Running. This takes up to a minute; the AI test can take longer the first time.');
    const copy = h('button', { class: 'btn', type: 'button', disabled: true, onclick: async () => {
      try { await navigator.clipboard.writeText(CVSelfTest.report(results, env)); toast('Report copied. It holds no case data.', 'success'); } catch { toast('Could not copy.', 'error'); }
    } }, 'Copy report');
    const draw = (r) => {
      results = r;
      list.replaceChildren(...r.map((x) => h('li', { class: `selftest-item ${x.status}` },
        h('span', { class: 'selftest-icon' }, I(icons[x.status] || 'three-dots')),
        h('div', {}, h('strong', {}, x.name), h('span', { class: 'sr-only' }, ` ${x.status}`), x.detail ? h('span', { class: 'small block muted' }, x.detail) : null))));
    };
    const dialog = openDialog((close) => h('div', { class: 'selftest' },
      h('h2', { icon: 'clipboard2-pulse' }, 'Self-test'),
      h('p', { class: 'muted small explain' }, 'Uses its own made-up documents, never your cases. Writes one small test file to the SSD and deletes it.'),
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

  // "My Profile": the affiant profile that fills {{affiant.*}} in templates. Saved in vault.json.
  function affiantSettings(v) {
    const a = v.settings.affiant || {};
    const LABELS = { name: 'Name', title: 'Title or rank', agency: 'Agency', address: 'Address', phone: 'Phone', email: 'Email' };
    const TYPES = { phone: 'tel', email: 'email' };
    const inputs = {};
    const save = () => {
      const next = {};
      for (const k of CVDraft.AFFIANT_FIELDS) next[k] = inputs[k].value.trim();
      return Save.track('settings', () => Vault.updateSettings({ affiant: next }));
    };
    const rows = CVDraft.AFFIANT_FIELDS.map((k) => {
      const id = `affiant-${k}`;
      inputs[k] = k === 'address'
        ? h('textarea', { id, rows: 3, autocomplete: 'off', class: 'affiant-wide' })
        : h('input', { id, type: TYPES[k] || 'text', autocomplete: 'off' });
      inputs[k].value = a[k] || '';
      inputs[k].addEventListener('change', () => { save().catch(() => {}); });
      return h('div', { class: `field${k === 'address' ? ' affiant-address' : ''}`, title: `Fills {{affiant.${k}}} in templates.` }, h('label', { for: id }, LABELS[k]), inputs[k]);
    });
    return h('section', { 'data-section': 'affiant' },
      h('h3', {}, 'My Profile'),
      h('p', { class: 'muted small explain' }, 'Filled into templates wherever they say ', h('code', {}, '{{affiant.name}}'), ' and so on. Anything left empty becomes a [CONFIRM: ...] placeholder. Stored in vault.json on the SSD.'),
      h('div', { class: 'affiant-grid' }, rows),
      h('div', { class: 'row profile-actions' }, h('div', { class: 'spacer' }),
        h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', title: 'Save your profile to vault.json on the SSD. Each box also saves when you leave it.', onclick: async () => {
          try { await save(); toast('Profile saved to the SSD.', 'success'); } catch { /* reported by Save */ }
        } }, 'Save changes')));
  }

  // The privacy screen hides CaseVault after 15 minutes alone, unless you chose another time
  // (or Off) in Vault → Privacy screen. Vaults from before v1.15 said 0 without anyone choosing it.
  function idleMinutes() {
    const s = (Vault.data && Vault.data.settings) || {};
    return s.privacyIdleSet ? Number(s.privacyIdleMinutes) || 0 : 15;
  }

  // Privacy screen settings, shown inside the Vault panel. The PIN form is inline because the app
  // has a single dialog element.
  function privacySettings(v) {
    const status = h('span', {});
    const form = h('div', { class: 'row', hidden: true });
    const pin1 = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, class: 'narrow pin', placeholder: 'PIN', 'aria-label': 'New PIN, 4 to 6 digits', autocomplete: 'off' });
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
        toast('Privacy screen PIN saved. Only a salted hash is stored.', 'success');
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
        .map(([m, label]) => h('option', { value: m, selected: idleMinutes() === m }, label)));
    idle.addEventListener('change', () => {
      Save.track('settings', () => Vault.updateSettings({ privacyIdleMinutes: Number(idle.value), privacyIdleSet: true })).catch(() => {});
    });
    draw();
    return h('section', { 'data-section': 'privacy' },
      h('h3', {}, 'Privacy screen'),
      h('p', { class: 'muted small explain' }, 'Press ', h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'H'), ', press ', h('kbd', {}, 'Esc'), ' twice quickly, or click ', h('strong', {}, 'Hide'),
        ' to cover CaseVault with a blank screen. The tab title changes to "New Tab", media pauses and pending edits are saved.'),
      h('div', { class: 'row' }, status, h('div', { class: 'spacer' }), setBtn, removeBtn),
      form,
      h('div', { class: 'row' }, h('label', { class: 'inline' }, 'Hide automatically after ', idle, ' without activity')),
      h('p', { class: 'hint' }, 'For real security when you leave, press ', h('kbd', {}, 'Windows key'), ' + ', h('kbd', {}, 'L'), ' to lock the PC. The privacy screen only hides what is on screen.'));
  }

  // v1.28: Vault, Library and Reference are on the Overview, not in the menu.
  $('#btn-options').addEventListener('click', () => CVOptions.open(window.CaseVaultUI));
  $('#btn-contact-dev').addEventListener('click', () => CVOptions.contactDev(window.CaseVaultUI));

  // The menu (top right): Reference, Library, Vault, Theme, Options, Contact Dev.
  const menuBtn = $('#btn-menu');
  const menu = $('#app-menu');
  menuBtn.append(I('three-dots-vertical'));
  const setMenu = (open, focus = false) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open && focus) menu.querySelector('.menu-item').focus();
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden, true));
  // Choosing an item closes the menu (the theme item stays open, so you can click through the themes).
  menu.addEventListener('click', (e) => { const item = e.target.closest('.menu-item'); if (item && item.id !== 'btn-theme') setMenu(false); });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setMenu(false); menuBtn.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) setMenu(false); }, true);
  $('#btn-chat').addEventListener('click', () => CVChatUI.toggle());

  // Theme: automatic -> light -> dark. The button shows what's in effect.
  function drawThemeButton() {
    const t = CVTheme.get();
    const btn = $('#btn-theme');
    btn.replaceChildren(I(t === 'auto' ? 'circle-half' : t === 'dark' ? 'moon-stars-fill' : 'sun-fill'), h('span', {}, `Theme: ${{ auto: 'Automatic', light: 'Light', dark: 'Dark' }[t]}`));
    btn.title = `${CVTheme.LABELS[t]}. Click to change.`;
  }
  $('#btn-theme').addEventListener('click', () => { CVTheme.next(); toast(CVTheme.LABELS[CVTheme.get()], 'info', 1800); });
  CVTheme.onChange(drawThemeButton);
  drawThemeButton();
  CVIcons.decorate();

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
      if (document.body.classList.contains('sidebar-locked')) { toast('The case list is locked. Unlock it with the padlock at its top.'); return; }
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
    // The header toggle shows only at phone width; otherwise the rail's toggle keeps focus.
    if (focus) (collapsed && expandBtn.getClientRects().length ? expandBtn : collapseBtn).focus();
    if (save && state.connected && !!Vault.data.settings.sidebarCollapsed !== collapsed) {
      Save.track('settings', () => Vault.updateSettings({ sidebarCollapsed: collapsed })).catch(() => {});
    }
  }
  // Lock (v1.24): the case list stays exactly as it is, shown or hidden and at its width, until
  // it's unlocked with the padlock. Remembered in vault.json.
  let setSidebarWidth = () => {};
  const lockBtn = h('button', { id: 'btn-sidebar-lock', class: 'icon-btn', type: 'button', 'aria-pressed': 'false' });
  function setSidebarLock(locked, { save = true } = {}) {
    document.body.classList.toggle('sidebar-locked', locked);
    lockBtn.setAttribute('aria-pressed', String(locked));
    const label = locked ? 'Unlock the case list (it can then be hidden or resized)' : 'Lock the case list as it is (size and shown or hidden)';
    lockBtn.title = label;
    lockBtn.replaceChildren(I(locked ? 'lock-fill' : 'unlock'), h('span', { class: 'sr-only' }, label));
    $('#btn-sidebar-collapse').disabled = locked;
    $('#btn-sidebar-expand').disabled = locked;
    if (save && state.connected && !!Vault.data.settings.sidebarLocked !== locked) {
      Save.track('settings', () => Vault.updateSettings({ sidebarLocked: locked })).catch(() => {});
    }
  }
  lockBtn.addEventListener('click', () => setSidebarLock(!document.body.classList.contains('sidebar-locked')));
  $('#btn-sidebar-collapse').after(lockBtn); // v1.34: hide button far left, padlock far right
  // v1.50: next to the hide-the-list button: Search (an icon that opens the search box), Home and
  // Hide (the privacy screen, moved here from the header, so the header keeps just the menu).
  const searchBtn = h('button', { id: 'btn-side-search', class: 'icon-btn', type: 'button', title: 'Search cases', 'aria-controls': 'case-search', 'aria-expanded': 'false' }, I('search'), h('span', { class: 'sr-only' }, 'Search cases'));
  const homeBtn = h('a', { id: 'btn-side-home', class: 'icon-btn', href: '#/', title: 'Home: the Overview' }, I('house-door'), h('span', { class: 'sr-only' }, 'Home'));
  // v1.68: Power Off (next to the SSD icon): saves everything, then the helper stops itself, the
  // browser window, Ollama, and locks and ejects the V: and W: drives.
  $('#btn-power').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Power Off CaseVault', message: 'Saves your work, then closes CaseVault, this browser window, the CaseVault helper and the AI engine, and locks and ejects the V: and W: drives. Unplug the SSD once Windows says it is safe.', confirmText: 'Power Off', danger: true });
    if (!ok) return;
    try { await Save.flushAll(); } catch { /* reported by Save */ }
    if (Save.failed && Save.failed.size) { toast('Some changes did not save. Power Off stopped so nothing is lost.', 'error', 6000); return; }
    let sent = false;
    if (HelperFS.servedByHelper) { try { await HelperFS.shutdown(); sent = true; } catch { /* helper not running */ } }
    document.body.replaceChildren(h('div', { class: 'power-off-screen' },
      I('power'),
      h('h1', {}, 'CaseVault Is Off'),
      h('p', {}, sent ? 'The helper is closing this window and ejecting the drives. Wait for Windows to say it is safe, then unplug the SSD.' : 'Your work is saved. Close this window, then eject the SSD from the taskbar.')));
    document.title = 'CaseVault - Off';
    setTimeout(() => { try { window.close(); } catch { /* the helper closes it */ } }, 800);
  });
  const privacyBtn = $('#btn-privacy');
  privacyBtn.classList.remove('tb-square');
  $('#btn-sidebar-collapse').after(searchBtn, homeBtn, privacyBtn);
  const tools = $('.sidebar-tools');
  const showSearch = (on) => {
    tools.classList.toggle('search-open', on);
    searchBtn.setAttribute('aria-expanded', String(on));
    searchBtn.classList.toggle('on', on);
  };
  showSearch(false);
  searchBtn.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-collapsed')) { if (document.body.classList.contains('sidebar-locked')) return; setSidebar(false, { focus: false }); }
    const on = !tools.classList.contains('search-open') || document.activeElement !== $('#case-search');
    showSearch(on || !!$('#case-search').value.trim());
    if (on) $('#case-search').focus();
  });
  $('#case-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if ($('#case-search').value) { $('#case-search').value = ''; renderCaseList(); }
    showSearch(false);
    searchBtn.focus();
  });
  $('#case-search').addEventListener('blur', () => { if (!$('#case-search').value.trim()) showSearch(false); });
  setSidebarLock(false, { save: false });

  // Drag the case list's right edge to make it wider or narrower (or focus it and use ← →).
  // Double-click puts it back. The width is kept in this browser, like the theme.
  (function sidebarResizer() {
    const side = $('#sidebar');
    const KEY = 'casevault-sidebar-width';
    const MIN = 200; const MAX = 520; const DEF = 300;
    // keep: remember it in this browser and in the vault (vault.json on the SSD), so it stays the
    // same in Edge and Firefox and on another PC until it's dragged again (v1.24).
    const setW = (w, keep = true) => {
      const px = Math.round(Math.min(MAX, Math.max(MIN, w)));
      document.documentElement.style.setProperty('--sidebar-w', `${px}px`);
      grip.setAttribute('aria-valuenow', String(px));
      if (keep) {
        try { if (px === DEF) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(px)); } catch { /* this session only */ }
        if (state.connected && Vault.data.settings.sidebarWidth !== px) Save.track('settings', () => Vault.updateSettings({ sidebarWidth: px })).catch(() => {});
      }
    };
    setSidebarWidth = (w, { save = true } = {}) => setW(w, save);
    const grip = h('div', { class: 'sidebar-resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Case list width', 'aria-valuemin': MIN, 'aria-valuemax': MAX, tabindex: 0, title: 'Drag to make the case list wider or narrower. Double-click to reset.' });
    side.append(grip);
    let saved = DEF;
    try { saved = Number(localStorage.getItem(KEY)) || DEF; } catch { /* default */ }
    setW(saved, false);
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || document.body.classList.contains('sidebar-locked')) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const left = side.getBoundingClientRect().left;
      document.body.classList.add('resizing-sidebar');
      const move = (ev) => setW(ev.clientX - left, false);
      const up = (ev) => { setW(ev.clientX - left); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); document.body.classList.remove('resizing-sidebar'); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', () => { if (!document.body.classList.contains('sidebar-locked')) setW(DEF); });
    grip.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('sidebar-locked')) return;
      const cur = side.getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setW(cur - 20); } else if (e.key === 'ArrowRight') { e.preventDefault(); setW(cur + 20); }
    });
  })();

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
  window.CaseVaultUI = { h, icon: I, $, toast, openDialog, confirmDialog, field, fmtDate, fmtDateTime, fmtSize, Save, state, go, refresh: () => route(), previewFile, onDriveLost, showVaultPanel, makeFoldable };
  CVChecks.init(window.CaseVaultUI);
  CVOutbound.init(window.CaseVaultUI);
  CVOutbound.onChange(renderNetStatus);
  CVApiKey.init(window.CaseVaultUI);
  CVOnlineUI.init(window.CaseVaultUI);
  CVMailUI.init(window.CaseVaultUI);
  CVDiscoveryUI.init(window.CaseVaultUI);
  CVLinkChartUI.init(window.CaseVaultUI);
  CVSecureSettings.init(window.CaseVaultUI);
  CVMemory.mount($('#mem-status'), {
    isHelper: () => MODE === 'helper',
    engineConnected: () => CVChecks.Engine.status() === 'connected' && !CVChecks.Engine.inBrowser(),
  });
  CVActivityLib.mount(CVActivity, $('#ai-activity'));
  CVDraftsUI.init(window.CaseVaultUI);
  CVClosingUI.init(window.CaseVaultUI);
  CVReportFieldsUI.init(window.CaseVaultUI);
  CVReferenceUI.init(window.CaseVaultUI);
  CVLibraryUI.init(window.CaseVaultUI);
  CVChatUI.init(window.CaseVaultUI);
  CVNotesFloat.init(window.CaseVaultUI);

  // Privacy screen: the "Hide" button or the idle timer. See js/privacy.js.
  CVPrivacy.init({
    flush: () => Save.flushAll(),
    getPinRecord: () => (Vault.data && Vault.data.settings.privacyPin) || null,
    getIdleMinutes: idleMinutes,
    button: $('#btn-privacy'),
  });

  Save.render();
  launch();
})();
