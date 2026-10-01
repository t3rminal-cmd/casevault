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

  const parseTags = (s) => [...new Set(String(s).split(',').map((t) => t.trim()).filter(Boolean))];
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
    ['full', '.preview, .doc-view, .lib-preview, .pdf-view, .word-view'],
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
      const xBtn = h('button', { class: 'icon-btn dialog-x', type: 'button', title: 'Close', 'aria-label': 'Close (Esc)', onclick: () => close(undefined) }, I('x-lg'));
      const head = dialogEl.querySelector('.vault-panel-head, .opt-head, .preview-head');
      if (head) { xBtn.classList.add('in-head'); head.append(xBtn); } else dialogEl.append(xBtn);
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
  const matchesSearch = (c, q) => !q || [c.title, c.fileNumber, c.number, c.agencyNumber, c.client, c.status, ...(c.tags || [])].join(' ').toLowerCase().includes(q);

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
    const due = c.nextDeadline && !isArchivedEntry(c) ? dueLabel(c.nextDeadline.date) : null;
    // Any open deadline on the case's Timeline rings the red bell (right of the title).
    // v1.28: the bell sits right after the title; a case number inside an operation leaves it to
    // the operation's name.
    const alarm = !!due && !inGroup;
    const tip = [
      `${c.title || 'Untitled case'} · ${c.status}`,
      c.status === 'Pending' && c.pending ? `Waiting on ${c.pending.reason}${c.pending.followUp ? `, follow up ${fmtDate(c.pending.followUp)}` : ''}` : null,
      due ? `${due.cls === 'overdue' || due.cls === 'soon' ? 'Alarm: ' : 'Next deadline: '}${c.nextDeadline.title || 'Deadline'}, ${fmtDate(c.nextDeadline.date)}${c.nextDeadline.time ? ` ${c.nextDeadline.time}` : ''} (${due.text})` : null,
    ].filter(Boolean).join('\n');
    return h('li', {},
      h('a', {
        href: `#/case/${encodeURIComponent(c.id)}`,
        class: `case-item ${c.id === state.caseId ? 'active' : ''}`,
        'aria-current': c.id === state.caseId ? 'page' : null,
        title: tip,
      },
      // Title on the left; the status and the red bell together on the right (v1.20).
      h('div', { class: 'case-item-top' },
        h('span', { class: `case-item-title${inGroup ? ' is-number' : ''}` }, inGroup ? (c.number || 'No case number yet') : (c.title || 'Untitled case')),
        alarm ? h('span', { class: `case-bell ${due.cls}`, 'aria-label': `Deadline ${due.text}` }, I('bell-fill')) : null,
        h('span', { class: 'case-item-flags' },
          h('span', { class: `case-status status-${String(c.status).toLowerCase()}` }, c.status))),
      // Just the numbers: file number | case number | client, e.g. "100 | JH123456 | State".
      // (No empty line when there are no numbers to show, v1.29. Inside an operation only the case
      // number shows, v1.32: the file number, original case and client are on the operation.)
      (() => { const meta = inGroup ? '' : [c.fileNumber, c.number, c.client].filter(Boolean).join(' | '); return meta ? h('div', { class: 'case-item-meta muted' }, meta) : null; })()));
  }

  /* Operations (v1.26): the Title or Operation Name ties several case numbers together. Cases that
   * share one are grouped in the case list under the operation, most recent first. */
  const opKey = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase();
  /** Active cases of the same operation as c (c included), most recently changed first. */
  function operationCases(title) {
    const k = opKey(title);
    return k ? (Vault.data?.cases || []).filter((x) => !isArchivedEntry(x) && opKey(x.title) === k).sort((a, b) => (b.updated || '').localeCompare(a.updated || '')) : [];
  }
  /** Every operation with its case count: [{ name, count, latest }], busiest first. */
  function operationList() {
    const m = new Map();
    for (const x of (Vault.data?.cases || []).filter((y) => !isArchivedEntry(y))) {
      const k = opKey(x.title);
      if (!k) continue;
      const cur = m.get(k) || { name: String(x.title).trim(), count: 0, latest: x };
      cur.count += 1;
      if ((x.updated || '') > (cur.latest.updated || '')) cur.latest = x;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  // Which operations are folded is kept in vault.json on the SSD (v1.28): operation names are case
  // data, so they never go in the browser's storage on the PC. (v1.26–1.27 kept them there; that
  // copy is removed.)
  try { localStorage.removeItem('casevault-op-closed'); } catch { /* nothing kept */ }
  const closedOps = () => new Set(((Vault.data && Vault.data.settings && Vault.data.settings.foldedOps) || []).filter((x) => typeof x === 'string'));
  function operationGroup(group) {
    const k = opKey(group[0].title);
    const hasActive = group.some((c) => c.id === state.caseId);
    const open = hasActive || !closedOps().has(k);
    const bell = group.some((c) => c.nextDeadline && dueLabel(c.nextDeadline.date));
    const det = h('details', { class: 'op-group', open },
      h('summary', { class: 'op-head', title: `${group[0].title}: ${group.length} case numbers` },
        h('span', { class: 'op-folder' }, I('folder-fill')),
        h('span', { class: 'op-text' },
          h('span', { class: 'op-name-row' }, h('span', { class: 'op-name' }, group[0].title),
            bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null),
          // v1.32: the operation's file number, original case number and client, once.
          (() => { const o = opInfo(group); const t = [o.fileNumber, o.number, o.client].filter(Boolean).join(' | '); return t ? h('span', { class: 'op-meta muted' }, t) : null; })()),
        group.length > 1 ? h('span', { class: 'op-count' }, String(group.length)) : null),
      h('ul', { class: 'op-cases' }, group.map((c) => caseItem(c, true))));
    det.addEventListener('toggle', () => {
      // A <details> drawn open fires "toggle" too: save only a real change (v1.29: saving on
      // every draw redrew the list, which saved again, and the drive icon kept blinking).
      const set = closedOps();
      if (det.open === !set.has(k)) return;
      if (det.open) set.delete(k); else set.add(k);
      Save.track('settings', () => Vault.updateSettings({ foldedOps: [...set] })).catch(() => {});
    });
    return h('li', { class: 'op-item' }, det);
  }
  // v1.32: every operation is a folder (one case number or several), in File Number order.
  const fileKey = (f) => String(f || '').trim();
  const byFileNumber = (a, b) => {
    const x = fileKey(a); const y = fileKey(b);
    if (!x !== !y) return x ? -1 : 1; // no file number last
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
  };
  /** The operation's first case: its file number, original case number and client. */
  function opInfo(group) {
    const first = [...group].sort((a, b) => (a.opened || a.dates?.opened || '').localeCompare(b.opened || b.dates?.opened || '') || String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }))[0] || {};
    return { fileNumber: group.map((c) => c.fileNumber).filter(Boolean).sort(byFileNumber)[0] || '', number: first.number || '', client: first.client || group.map((c) => c.client).find(Boolean) || '' };
  }
  function groupedItems(cases) {
    const byOp = new Map();
    for (const c of cases) { const k = opKey(c.title) || `#${c.id}`; byOp.set(k, [...(byOp.get(k) || []), c]); }
    const groups = [...byOp.values()].map((g) => g.sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true })));
    groups.sort((a, b) => byFileNumber(opInfo(a).fileNumber, opInfo(b).fileNumber) || String(a[0].title || '').localeCompare(String(b[0].title || '')));
    return groups.map((g) => operationGroup(g));
  }

  function renderCaseList() {
    const list = $('#case-list');
    const section = $('#archived-cases');
    if (!Vault.data) { list.replaceChildren(); section.hidden = true; return; }
    const cases = filteredCases();
    const activeCount = Vault.data.cases.filter((c) => !isArchivedEntry(c)).length;
    list.replaceChildren(...(cases.length ? groupedItems(cases) : [h('li', { class: 'empty muted' },
      activeCount ? 'No cases match.' : Vault.data.cases.length ? 'No active cases.' : 'No cases yet. Click "New case".')]));

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

  /* =====================================================================
   * Routing: #/  or  #/case/<id>/<tab>
   * ===================================================================== */

  function go(caseId, tab, sub) {
    location.hash = caseId ? `#/case/${encodeURIComponent(caseId)}/${tab || 'details'}${sub ? `/${encodeURIComponent(sub)}` : ''}` : '#/';
  }

  function route() {
    if (!state.connected) return;
    if (/^#\/online\b/.test(location.hash)) return showOnline();
    // Old #/chat links open the floating Ask AI box over the overview.
    if (/^#\/chat\b/.test(location.hash)) { history.replaceState(null, '', '#/'); CVChatUI.toggle(true); }
    const ref = location.hash.match(/^#\/reference(?:\/([\w-]+))?/);
    if (ref) return showReference(ref[1] || null);
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

    $('#main').replaceChildren(h('section', { class: 'dashboard' },
      welcomeHero(cases, deadlines),
      h('div', { class: 'stats' },
        ...Vault.STATUSES.map((s) => h('div', { class: `stat stat-${s.toLowerCase()}` },
          h('span', { class: 'stat-icon' }, I(STATUS_ICONS[s])),
          h('div', {}, h('div', { class: 'stat-num' }, count(s)), h('div', { class: 'stat-label' }, s))))),
      operationFolders(cases, tlBox),
      tlBox,
      h('div', { class: 'dash-section' }, h('h2', { class: 'section-title' }, 'Upcoming deadlines'),
      deadlines.length
        ? h('ul', { class: 'plain-list' }, deadlines.map((c) => {
          const due = dueLabel(c.nextDeadline.date);
          return h('li', {}, h('a', { href: `#/case/${encodeURIComponent(c.id)}/timeline`, class: 'row-link' },
            h('span', { class: `due ${due.cls}` }, `${fmtDate(c.nextDeadline.date)}${c.nextDeadline.time ? ' ' + c.nextDeadline.time : ''}`),
            h('span', {}, c.nextDeadline.title || 'Deadline', ' — ', c.title),
            h('span', { class: `due ${due.cls}` }, due.text)));
        }))
        : h('p', { class: 'muted' }, 'No open deadlines. Add them from a case\'s Timeline tab.')),
      h('div', { class: 'dash-section' }, h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Recently updated'), h('div', { class: 'spacer' }),
        recent.length ? h('button', { class: 'btn small ghost', type: 'button', title: 'Empties this list. Cases you change after this show here again.', onclick: async () => {
          try { await Save.track('settings', () => Vault.updateSettings({ recentClearedAt: new Date().toISOString() })); showDashboard(); } catch { /* reported */ }
        } }, 'Clear') : null),
      recent.length
        ? h('ul', { class: 'plain-list' }, recent.map((c) => h('li', {}, h('a', { href: `#/case/${encodeURIComponent(c.id)}`, class: 'row-link recent-row' },
          h('span', { class: 'recent-title' }, h('span', {}, c.title || 'Untitled case'), h('span', { class: 'muted' }, [c.fileNumber && ` · File ${c.fileNumber}`, c.number && ` · Case ${c.number}`].filter(Boolean).join(''))),
          statusPill(c.status)))))
        : h('p', { class: 'muted' }, cases.length ? 'Nothing changed since you cleared this list.' : 'Create your first case with "New case".')),
      h('div', { class: 'dash-section dash-quick' }, h('h2', { class: 'section-title' }, 'Quick links'), CVReferenceUI.quickLinks())));
  }

  /* Operations on the Overview (v1.28): a blue folder for each operation (Title or Operation Name),
   * its name under it. Click one to open it: its case numbers, each with its Reports, Field Notes,
   * Files (photos, documents) and Timeline. Which one is open is remembered for this visit. */
  const opFolderState = { open: '' };
  function operationFolders(cases, tlBox = null) {
    const active = cases.filter((c) => !isArchivedEntry(c));
    const ops = new Map();
    for (const c of active) {
      const k = opKey(c.title) || `#${c.id}`;
      ops.set(k, [...(ops.get(k) || []), c]);
    }
    // In File Number order (v1.32), as in the case list.
    const list = [...ops.entries()].map(([k, group]) => ({ k, name: String(group[0].title || 'Untitled case').trim(), group: group.sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true })), fileNumber: opInfo(group).fileNumber }))
      .sort((a, b) => byFileNumber(a.fileNumber, b.fileNumber) || a.name.localeCompare(b.name));
    const box = h('div', { class: 'dash-section op-folders-section' });
    const draw = () => {
      const open = list.find((o) => o.k === opFolderState.open);
      const tiles = h('div', { class: 'op-folders', role: 'list' }, list.map((o) => {
        const bell = o.group.some((c) => c.nextDeadline && dueLabel(c.nextDeadline.date) && c.status !== 'Closed');
        return h('button', { type: 'button', role: 'listitem', class: `op-folder-tile ${open === o ? 'open' : ''}`, 'aria-expanded': String(open === o),
          title: `${o.name}: ${o.group.length} case number${o.group.length === 1 ? '' : 's'}`,
          onclick: () => { opFolderState.open = open === o ? '' : o.k; draw(); } },
        h('span', { class: 'op-folder-art' }, I(open === o ? 'folder2-open' : 'folder-fill'), o.group.length > 1 ? h('span', { class: 'op-folder-count' }, String(o.group.length)) : null),
        h('span', { class: 'op-folder-name' }, o.name, bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null));
      }));
      const inside = open ? h('div', { class: 'op-open' },
        h('div', { class: 'op-open-head' }, h('strong', {}, open.name), h('span', { class: 'muted small' }, `${open.group.length} case number${open.group.length === 1 ? '' : 's'}`),
          h('div', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn small', onclick: () => newCase({ title: open.name }) }, 'Add Case Number')),
        h('div', { class: 'op-open-cases' }, open.group.map((c) => {
          const to = (tab, sub) => `#/case/${encodeURIComponent(c.id)}/${tab}${sub ? `/${sub}` : ''}`;
          return h('div', { class: 'op-case-card' },
            h('a', { class: 'op-case-top', href: to('details') }, h('span', { class: 'op-case-num' }, c.number || 'No case number yet'), statusPill(c.status)),
            h('div', { class: 'op-case-links' },
              h('a', { class: 'op-word', href: to('reports') }, 'Reports'),
              h('a', { class: 'op-word', href: to('files', 'photos') }, 'Photos'),
              h('a', { class: 'op-word', href: to('files') }, 'Files')));
        }))) : null;
      box.replaceChildren(...[h('h2', { class: 'section-title' }, 'Operations'),
        list.length ? tiles : h('p', { class: 'muted' }, 'Create a case with New Case: Its operation appears here as a folder.'), inside].filter(Boolean));
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
    draw();
    return box;
  }

  /* The landing page's welcome banner (v1.21): a greeting, the date and time, what needs you
   * today, and one-click actions. */
  function welcomeHero(cases, deadlines) {
    const who = ((Vault.data.settings.affiant || {}).name || '').trim();
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Working Late' : hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    const open = cases.filter((c) => c.status === 'Open').length;
    const soon = deadlines.filter((c) => ['overdue', 'soon', 'today'].includes(dueLabel(c.nextDeadline.date).cls)).length;
    const clock = h('div', { class: 'hero-clock', 'aria-hidden': 'true' });
    const dateLine = h('div', { class: 'hero-date' });
    const tick = () => {
      if (!clock.isConnected && clock.dataset.started) return false;
      const d = new Date();
      clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dateLine.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      return true;
    };
    tick();
    clock.dataset.started = '1';
    const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 15000);
    const summary = [
      `${open} open case${open === 1 ? '' : 's'}`,
      soon ? `${soon} deadline${soon === 1 ? '' : 's'} due soon` : 'No deadlines due this week',
    ].join(' · ');
    const action = (label, icon, onclick, primary) => h('button', { class: `btn ${primary ? 'primary' : 'hero-btn'}`, type: 'button', icon, onclick }, label);
    return h('div', { class: 'hero' },
      h('div', { class: 'hero-art', 'aria-hidden': 'true' }, h('span', { class: 'hero-ring r1' }), h('span', { class: 'hero-ring r2' }), h('span', { class: 'hero-ring r3' }), I('shield-lock-fill')),
      h('div', { class: 'hero-text' },
        dateLine,
        h('h1', { class: 'hero-title' }, `${greet}${who ? `, ${who.split(/\s+/)[0]}` : ''}`),
        h('p', { class: 'hero-sub' }, summary),
        h('div', { class: 'hero-actions' },
          action('New Case', 'plus-lg', () => newCase(), true),
          action('Ask AI', 'chat-dots-fill', () => { const b = document.getElementById('btn-chat'); if (b) b.click(); }),
          action('Reference', 'book', () => { location.hash = '#/reference'; }),
          action('Library', 'bookshelf', () => showVaultPanel('library')),
          action('Vault', 'safe2', () => showVaultPanel()))),
      clock);
  }

  /* =====================================================================
   * New case
   * ===================================================================== */

  async function newCase(prefill = {}) {
    if (!state.connected) return;
    if (prefill instanceof Event) prefill = {};
    const result = await openDialog((close) => {
      const numberIn = h('input', { name: 'number', maxlength: 100 });
      // One file number can hold several cases: offer the file numbers already in use.
      const fileNumbers = [...new Set((Vault.data.cases || []).map((x) => x.fileNumber).filter(Boolean))].sort();
      const fileList = h('datalist', { id: 'file-numbers' }, fileNumbers.map((n) => h('option', { value: n })));
      const openedIn = h('input', { name: 'opened', type: 'date', value: today() });
      const folderNote = h('span', {});
      const showFolder = () => {
        const name = CVCaseFiles.caseFolderName({ number: numberIn.value, dates: { opened: openedIn.value } });
        folderNote.replaceChildren(...(name
          ? ['Case folder ', h('code', {}, CVFormat.pathText(`cases\\${name}`)), ' · files named ', h('code', {}, `${name} Arrest Report.pdf`), ' and so on']
          : ['Add the case number to name the folder and files ', h('code', {}, '<year>-<case no.>'), '.']));
      };
      numberIn.addEventListener('input', showFolder);
      openedIn.addEventListener('input', showFolder);
      showFolder();
      // v1.26: the operation can be picked from the ones in use; its file number, agency case
      // number and client are filled in (still editable).
      const titleIn = h('input', { name: 'title', required: true, autofocus: true, maxlength: 200, autocomplete: 'off', value: prefill.title || '' });
      const fileIn = h('input', { name: 'fileNumber', maxlength: 100, list: 'file-numbers', title: 'The investigation file. Several cases can share one file number.' });
      const agencyIn = h('input', { name: 'agencyNumber', maxlength: 100, title: 'Your agency\'s own internal number for this case.' });
      const clientIn = clientSelect('', { name: 'client' });
      const opNote = h('p', { class: 'muted small span-2 op-note' });
      const fillFrom = (name) => {
        const sib = operationCases(name)[0];
        opNote.textContent = sib ? `Adds a case number to ${sib.title} (${operationCases(name).length} so far: ${operationCases(name).map((x) => x.number).filter(Boolean).join(', ') || 'no numbers yet'}).` : '';
        if (!sib) return;
        if (!fileIn.value) fileIn.value = sib.fileNumber || '';
        if (!agencyIn.value) agencyIn.value = sib.agencyNumber || '';
        if (!clientIn.value && sib.client) { if (![...clientIn.options].some((o) => o.value === sib.client)) clientIn.append(h('option', { value: sib.client }, sib.client)); clientIn.value = sib.client; }
      };
      const titleBox = window.CVCombo ? CVCombo.attach(titleIn, { label: 'Show the operations', items: () => operationList().map((o) => ({ value: o.name, label: o.name, hint: `${o.count} case${o.count === 1 ? '' : 's'}` })), onPick: (it) => fillFrom(it.value) }) : titleIn;
      titleIn.addEventListener('change', () => fillFrom(titleIn.value));
      if (prefill.title) setTimeout(() => fillFrom(prefill.title), 0);
      const form = h('form', { class: 'form-grid', onsubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        close({
          title: fd.get('title').trim(), fileNumber: fd.get('fileNumber').trim(), number: fd.get('number').trim(), agencyNumber: fd.get('agencyNumber').trim(), client: fd.get('client'),
          status: fd.get('status'), opened: fd.get('opened'), tags: parseTags(fd.get('tags')),
        });
      } },
      h('h2', { class: 'span-2' }, 'New case'),
      field('Title or Operation Name', titleBox, 'span-2', 'Pick an operation to add another case number to it, or type a new name.'),
      opNote,
      field('File number', fileIn),
      field('Original Case Number', numberIn, '', 'The first report number of the case. An operation with several case numbers keeps its first one here.'),
      fileList,
      field('Federal Jacket Number', agencyIn),
      field('Client', clientIn),
      field('Status', h('select', { name: 'status' }, Vault.STATUSES.map((s) => h('option', {}, s)))),
      field('Opened', openedIn),
      h('p', { class: 'muted small span-2' }, folderNote),
      field('Tags', h('input', { name: 'tags', maxlength: 300 }), 'span-2', 'Separate tags with commas.'),
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

  /** A labelled box. tip: the explanation, shown in the hover box (no brackets in labels). */
  function field(label, input, cls = '', tip = '') {
    return h('label', { class: `field ${cls}`, title: tip || null }, h('span', {}, label), input);
  }

  $('#btn-new-case').addEventListener('click', newCase);

  /* =====================================================================
   * Case view
   * ===================================================================== */

  // Reports (v1.17) holds the case notes and every draft in one list.
  const TABS = [['details', 'Details'], ['timeline', 'Timeline'], ['draft', 'Draft'], ['reports', 'Reports'], ['files', 'Files'], ['mail', 'Mail'], ['checks', 'Checks']];
  // The Arrest details tab appears once a case has arrest details, or is closed "by arrest".
  const FOLDER_ICONS = {
    '': 'collection', unsorted: 'folder', photos: 'image', 'Case Overview': 'journal-richtext', 'Case Initiation': 'flag', 'Affidavit Drafts': 'pencil-square', 'Affidavit Final': 'file-earmark-ruled', Affidavits: 'file-earmark-ruled',
    'Warrant Drafts': 'pencil-fill', 'Warrant Final': 'file-earmark-text', 'Warrants Signed': 'shield-fill-check', 'Arrest Report': 'person-badge', 'Supplementary Report': 'file-earmark-text',
    'Case Report': 'journal-bookmark', Deconfliction: 'signpost-split', 'Drug Exhibits': 'capsule-pill', 'Other Exhibits': 'box-seam', Email: 'envelope',
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
  const tabsFor = (c) => (CVClosingUI.hasArrestTab(c) ? [TABS[0], ['arrest', 'Arrest details'], ...TABS.slice(1)] : TABS);

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
        h('button', { class: 'btn', type: 'button', icon: 'arrow-counterclockwise', onclick: () => restoreCase(c) }, 'Restore to active cases')) : null,
      h('div', { class: 'case-head' },
        h('h1', { id: 'case-title' }, c.title || 'Untitled case'),
        h('div', { class: 'case-sub muted', id: 'case-sub' }, caseSubtitle(c))),
      h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(([t, label]) =>
        h('a', { href: `#/case/${encodeURIComponent(id)}/${t}`, role: 'tab', class: `tab ${t === tab ? 'active' : ''}`, 'aria-selected': String(t === tab) }, label))),
      panel));
    // Read-only: everything in the tab that could change the case is switched off, now and as
    // the tab redraws. (vault.js refuses the writes too.)
    if (archived) new MutationObserver(() => applyReadOnly(panel)).observe(panel, { childList: true, subtree: true });

    const renderers = { details: renderDetails, arrest: (...a) => CVClosingUI.renderArrest(...a), draft: (panel, cc, tk) => CVReportFieldsUI.render(panel, cc, tk), reports: (panel, cc, tk, s) => (s === NOTES_SUB ? renderNotes(panel, cc, tk) : CVDraftsUI.render(panel, cc, tk, s)), timeline: renderTimeline, files: renderFiles, mail: (...a) => CVMailUI.render(...a), checks: (...a) => CVChecks.render(...a) };
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
    return [c.agencyNumber && `Agency ${c.agencyNumber}`, c.client, statusPill(c.status)]
      .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
  }

  function refreshCaseHeader(c) {
    const title = $('#case-title');
    if (title) title.textContent = c.title || 'Untitled case';
    const sub = $('#case-sub');
    if (sub) sub.replaceChildren(...caseSubtitle(c));
  }

  /* ---------- Details ---------- */

  /** v1.27: the operation's other cases get this case's Case Overview (suspects, contacts,
   * deconfliction), so every case number shows the same one. */
  async function syncOverview(c) {
    const others = operationCases(c.title).filter((x) => x.id !== c.id);
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
      if (operationCases(c.title).some((x) => x.id !== c.id)) Save.schedule(`overview:${opKey(c.title)}`, () => syncOverview(snapshot), 1200);
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

    const members = archived ? [c] : [c, ...operationCases(c.title).filter((x) => x.id !== c.id)];
    // The operation's name: renaming it renames it on every case number of the operation (v1.27).
    const titleIn = bind(h('input', { value: c.title, maxlength: 200 }), (v) => { c.title = v; });
    let titleWas = c.title;
    titleIn.addEventListener('change', async () => {
      const others = operationCases(titleWas).filter((x) => x.id !== c.id);
      const now = c.title;
      titleWas = now;
      if (!others.length || !opKey(now)) return;
      for (const o of others) {
        try { const oc = await Vault.getCase(o.id); oc.title = now; await Save.track(`case:${o.id}`, () => Vault.saveCase(oc)); } catch { /* reported */ }
      }
      toast(`The operation is now "${now}" on all ${others.length + 1} case numbers.`, 'success', 4000);
      renderCaseList();
    });
    panel.replaceChildren(
      // ---- the operation, the same on every one of its case numbers: name, status, dates
      h('section', { class: 'op-card' },
        h('form', { class: 'form-grid details-grid op-top', onsubmit: (e) => e.preventDefault() },
          field('Title or Operation Name', titleIn, 'span-2', 'The case title, or the operation\'s name. An operation holds several case numbers; renaming it here renames it on all of them.'),
          h('label', { class: 'field' }, h('span', {}, 'Status'), statusSelect, statusNote),
          field('Opened', bind(h('input', { type: 'date', value: c.dates.opened || '' }), (v) => { c.dates.opened = v; })),
          field('Closed', bind(closedInput, (v) => { c.dates.closed = v; }))),
        caseTiles(c, members, archived)),
      // ---- this case number
      h('form', { class: 'form-grid details-grid', onsubmit: (e) => e.preventDefault() },
        field('File number', bind(h('input', { value: c.fileNumber || '', maxlength: 100, title: 'The investigation file. Several cases can share one file number.' }), (v) => { c.fileNumber = v; })),
        field('Original Case Number', bind(h('input', { value: c.number, maxlength: 100 }), (v) => { c.number = v; })),
        field('Federal Jacket Number', bind(h('input', { value: c.agencyNumber || '', maxlength: 100, title: 'The federal jacket number for this case.' }), (v) => { c.agencyNumber = v; })),
        field('Client', (() => { const sel = clientSelect(c.client); sel.addEventListener('change', () => { c.client = sel.value; save(); }); return sel; })()),
        field('Tags', bind(h('input', { value: c.tags.join(', '), maxlength: 300 }), (v) => { c.tags = parseTags(v); }), 'span-2', 'Separate tags with commas.'),
        h('p', { class: 'muted span-2 small' },
          `Folder: ${CVFormat.pathText(`${archived ? 'archive' : 'cases'}\\${c.id}`)}`
          + `${archived && c.dates.archived ? ` · Archived ${fmtDate(c.dates.archived)}` : ''}`)),
      partnersSection(c, save),
      // ---- Case Overview: shared by the operation's case numbers (v1.27)
      h('hr', { class: 'overview-sep' }),
      h('div', { class: 'overview-head' }, h('h2', {}, 'Case Overview'),
        h('p', { class: 'muted small' }, members.length > 1 ? `Suspects, contacts and deconfliction for the whole operation: the same on all ${members.length} case numbers.` : 'Suspects, contacts and deconfliction. Case numbers added to this operation share them.')),
      suspectsSection(c, save),
      contactsSection(c, save),
      deconflictionSection(c, save),
      // Everything saves by itself as you type; the button saves now and says so.
      archived ? null : h('div', { class: 'details-save' },
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
          !archived && members.length > 1 && members.some((x) => x.status !== 'Closed') ? h('button', { class: 'btn action-btn', type: 'button', icon: 'lock-fill', title: `Closes all ${members.filter((x) => x.status !== 'Closed').length} open case numbers of this operation with one disposition.`, onclick: () => CVClosingUI.closeCaseDialog(c, { operation: members }) }, 'Close Operation') : null,
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
          const [, label, kind, opts] = PERSON(k) || [k, k, 'text'];
          let el;
          if (kind === 'select') el = h('select', { 'aria-label': `${who} ${label}` }, opts.map((o) => h('option', { value: o, selected: o === (s.info[k] || '') }, o || '—')));
          else el = h('input', { value: s.info[k] || '', autocomplete: 'off', maxlength: 200, 'aria-label': `${who} ${label}`, list: kind === 'hair' ? 'suspect-hair' : kind === 'eyes' ? 'suspect-eyes' : null, placeholder: kind === 'height' ? '5 ft 10 in' : kind === 'weight' ? '160 Pounds' : '', ...attrs });
          el.addEventListener(kind === 'select' ? 'change' : 'input', () => { s.info[k] = el.value.trim(); save(); });
          return field(label, el, kind === 'wide' ? 'suspect-wide' : '');
        };
        const demo = h('div', { class: 'suspect-demo' },
          ['gender', 'race', 'complexion', 'height', 'weight', 'hair', 'eyes', 'marks'].map((k) => infoInput(k)));
        return h('div', { class: 'suspect-card' }, h('div', { class: 'suspect-row' },
          field('Name', input('name', { maxlength: 120, 'aria-label': `${who} name` })),
          field('DOB', dob),
          h('div', { class: 'field' }, h('span', {}, 'Age'), age),
          field('Residence', input('residence', { maxlength: 200, 'aria-label': `${who} residence`, title: s.residence || '' })),
          field('Role', role),
          h('button', { class: 'icon-btn danger-icon contact-remove', type: 'button', title: 'Remove this suspect', onclick: () => { c.suspects.splice(i, 1); draw(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove ${who}`))),
          demo);
      }) : [h('p', { class: 'muted small suspect-empty' }, 'No suspects yet.')]));
    };
    draw();
    return h('section', { class: 'contacts suspects', 'aria-labelledby': 'suspects-title' },
      h('h3', { id: 'suspects-title', icon: 'person-exclamation', title: 'The people this case is about. The age is worked out from the date of birth. The main suspect fills {{suspect.name}}, {{suspect.dob}}, {{suspect.age}} and so on in templates; {{suspects}} lists them all.' }, 'Suspects'),
      h('datalist', { id: 'suspect-hair' }, CVReportFields.PICKS.hair.map((x) => h('option', { value: x }))),
      h('datalist', { id: 'suspect-eyes' }, CVReportFields.PICKS.eyes.map((x) => h('option', { value: x }))),
      rows,
      h('div', { class: 'contact-add' }, h('button', { class: 'btn small', type: 'button', icon: 'person-plus', onclick: () => {
        c.suspects.push({ name: '', dob: '', residence: '', info: {}, role: c.suspects.some((x) => x.role === 'Primary' || x.role === 'Main') ? 'Secondary' : 'Primary' });
        draw();
        const last = rows.lastElementChild && rows.lastElementChild.querySelector('input');
        if (last) last.focus();
      } }, 'Add suspect')));
  }

  /* The operation's case numbers (v1.27): a folder for each, its number under it; the one on
   * screen is highlighted. Click one to open it; + adds a case number to the operation. */
  function caseTiles(c, members, archived) {
    const sorted = [...members].sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }));
    return h('div', { class: 'case-tiles', role: 'list', 'aria-label': 'Case numbers in this operation' },
      sorted.map((x) => {
        const cur = x.id === c.id;
        const tag = cur ? 'div' : 'a';
        return h(tag, { class: `case-tile${cur ? ' current' : ''} status-${String(x.status).toLowerCase()}`, role: 'listitem', href: cur ? null : `#/case/${encodeURIComponent(x.id)}`, title: `${x.number || 'No case number'} · ${x.status}${cur ? ' (this one)' : ''}` },
          I(cur ? 'folder2-open' : 'folder-fill'), h('span', { class: 'case-tile-num' }, x.number || 'No number'), h('span', { class: 'case-tile-status' }, x.status));
      }),
      archived ? null : h('button', { class: 'case-tile add', type: 'button', title: 'Add a case number to this operation: a new case with the same operation name, file number, federal jacket number and client', onclick: () => { Save.flushAll(); newCase({ title: c.title }); } },
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
  /* LEO Partners as badges (v1.33): a colour and a plain icon for each agency (no agency seals),
   * the Chicago six-pointed star for Local PD and a police shield for the Sheriff. */
  const CHICAGO_STAR = 'M12.00 1.00 L9.70 8.02 L2.47 6.50 L7.40 12.00 L2.47 17.50 L9.70 15.98 L12.00 23.00 L14.30 15.98 L21.53 17.50 L16.60 12.00 L21.53 6.50 L14.30 8.02 Z';
  const emblem = (d) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'bi'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'currentColor'); svg.append(p); return svg; };
  const PARTNER_BADGES = {
    DEA: { name: 'Drug Enforcement Administration', icon: 'capsule-pill', color: '#1f6f43' },
    FBI: { name: 'Federal Bureau of Investigation', icon: 'fingerprint', color: '#1f3a6b' },
    ATF: { name: 'Alcohol, Tobacco, Firearms and Explosives', icon: 'fire', color: '#8a2d1c' },
    USMS: { name: 'U.S. Marshals Service', icon: 'award-fill', color: '#5a4a1a' },
    IRS: { name: 'IRS Criminal Investigation', icon: 'cash-coin', color: '#22636b' },
    CBP: { name: 'Customs and Border Protection', icon: 'globe-americas', color: '#1d4f91' },
    HSI: { name: 'Homeland Security Investigations', icon: 'shield-fill-check', color: '#2d4b73' },
    ICE: { name: 'Immigration and Customs Enforcement', icon: 'shield-shaded', color: '#3b4f63' },
    USSS: { name: 'U.S. Secret Service', icon: 'star-fill', color: '#7a5a12' },
    USPIS: { name: 'U.S. Postal Inspection Service', icon: 'envelope-paper', color: '#2b5aa6' },
    'State PD': { name: 'State Police', icon: 'patch-check-fill', color: '#33507a' },
    'Local PD': { name: 'Police Department', svg: CHICAGO_STAR, color: '#1b74c5' },
    'Sheriff Dept': { name: 'Sheriff\'s Office', icon: 'shield-fill', color: '#6b4f1d' },
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
    const draw = () => box.replaceChildren(...CVDraft.PARTNER_AGENCIES.map((agency) => {
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
          h('span', { class: 'partner-emblem', 'aria-hidden': 'true' }, b.svg ? emblem(b.svg) : I(b.icon)),
          h('span', { class: 'partner-words' }, h('strong', {}, agency === 'Sheriff Dept' ? 'Sheriff' : agency), h('span', { class: 'partner-full' }, names || b.name))),
        edit);
      tile.style.setProperty('--agency', b.color); // set from script: the page's CSP allows no inline style attributes
      return tile;
    }));
    draw();
    return h('section', { class: 'contacts partners', 'aria-labelledby': 'partners-title' },
      h('h3', { id: 'partners-title', icon: 'shield-check', title: 'The agencies working this case with you. Templates can use {{case.partners}}.' }, 'LEO Partners'),
      box);
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

    return h('section', { class: 'contacts', 'aria-labelledby': 'contacts-title' },
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
    return h('section', { class: 'contacts deconfliction', 'aria-labelledby': 'decon-title' },
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
    const ok = await confirmDialog({
      title: 'Move this case to the archive?',
      message: h('div', {},
        h('p', {}, `"${c.title || 'Untitled case'}" moves to CaseVault-Data\\archive on the SSD, with its notes, timeline, files, drafts and checks. Every file is copied and checked before the original is removed.`),
        h('p', { class: 'muted small explain' }, 'It leaves the case list and opens read-only from "Archived" at the bottom of the list. You can restore it at any time.')),
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
    const members = archivedCase ? [c] : [c, ...operationCases(c.title).filter((x) => x.id !== c.id)];
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
    const list = h('ol', { class: 'timeline' });

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

    const form = h('form', { class: 'timeline-form', onsubmit: async (e) => {
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
    many ? field('Case Number', f.caseSel, '', 'Which case number of the operation this belongs to') : null,
    field('Title', f.title, 'grow'),
    field('Note', f.note, 'full'),
    h('div', { class: 'full form-actions' }, cancel, submit));

    function draw() {
      const all = CVOperation.mergeEvents([...tls.entries()].map(([caseId, t]) => ({ caseId, number: numberOf(caseId), events: t.events })));
      if (!all.length) {
        list.replaceChildren(h('li', { class: 'muted empty' }, many ? 'No events yet for any case number of this operation. Add dates, hearings, filings, and deadlines above.' : 'No events yet. Add dates, hearings, filings, and deadlines above.'));
        return;
      }
      list.replaceChildren(...all.map(({ caseId, ev }) => {
        const isDeadline = ev.kind === 'deadline';
        const due = isDeadline && !ev.done ? dueLabel(ev.date) : null;
        const done = isDeadline ? h('input', { type: 'checkbox', checked: !!ev.done, 'aria-label': 'Done', title: 'Mark done' }) : null;
        if (done) done.addEventListener('change', () => { ev.done = done.checked; draw(); persist(caseId); });
        return h('li', { class: `tl-item ${ev.kind} ${ev.done ? 'done' : ''} ${due ? due.cls : ''}` },
          h('div', { class: 'tl-when' }, h('div', {}, fmtDate(ev.date)), ev.time && h('div', { class: 'muted small' }, ev.time)),
          h('div', { class: 'tl-body' },
            h('div', { class: 'tl-title' },
              done,
              h('span', { class: `badge ${ev.kind}` }, isDeadline ? 'Deadline' : 'Event'),
              many ? h('span', { class: `tl-case${caseId === c.id ? ' current' : ''}`, title: caseId === c.id ? 'This case number' : 'Another case number of this operation' }, numberOf(caseId)) : null,
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
            } }, 'Delete')));
      }));
    }

    draw();
    panel.replaceChildren(many ? h('p', { class: 'muted small tl-op-note' }, `The timeline of the whole operation: all ${tls.size} case numbers.`) : null, form, list);
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
      archived ? null : h('button', { class: 'btn small ghost folder-reset', type: 'button', icon: 'list-check', title: 'Put the folders in your own order, with up and down buttons. You can also drag a folder in this list.', onclick: async () => {
        const order = await arrangeFoldersDialog(ordered.filter(visible));
        if (!order) return;
        await saveFolderOrder(order);
        showCase(c.id, 'files', current || null);
      } }, 'Arrange folders'));

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
    const nameOf = (base) => {
      const stem = base.slice(0, base.length - extOf(base).length);
      if (prefix && stem.toLowerCase().startsWith(prefix.toLowerCase()) && stem.length > prefix.length) {
        const rest = stem.slice(prefix.length).replace(/^[\s_-]+/, '');
        return rest ? `${stem.slice(0, prefix.length)} | ${rest}` : stem;
      }
      return stem || base;
    };
    const addedText = (ms) => (ms ? fmtDate(Vault.localDay(new Date(ms))) : '—');
    const cmp = {
      custom: (a, b) => (inOneFolder ? byCustom(a, b) : 0),
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
    const dragRows = inOneFolder && sortPref.key === 'custom' && !archived;
    const saveCustom = async (list) => {
      fileOrder[current] = list;
      await Save.track(`file-order:${c.id}`, () => Vault.writeCaseJSON(c.id, 'file-order.json', fileOrder)).catch(() => {});
    };

    const table = shown.length
      ? h('div', { class: 'files-table-wrap' }, h('table', { class: 'files' },
        h('colgroup', {}, dragRows ? h('col', { class: 'col-grip' }) : null, h('col', { class: 'col-name' }), h('col', { class: 'col-type' }), h('col', { class: 'col-ext' }), h('col', { class: 'col-size' }), h('col', { class: 'col-added' }), h('col', { class: 'col-actions' })),
        h('thead', {}, h('tr', {},
          dragRows ? h('th', { class: 'grip-cell', title: 'Your own order: drag the rows' }, h('span', { class: 'sr-only' }, 'Order')) : null,
          th('name', 'Name'), th('type', 'Document'), th('ext', 'File', 'fext-head'), th('size', 'Size', 'num'), th('added', 'Added'),
          h('th', { class: 'actions-head' }, inOneFolder
            ? h('button', { type: 'button', class: `th-btn small ${sortPref.key === 'custom' ? 'sorted' : ''}`, 'data-ro-ok': 'true', icon: 'list-check', title: 'Your own order for this folder: drag the rows to arrange them.', onclick: () => setSort('custom') }, 'Custom')
            : h('span', { class: 'sr-only' }, 'Actions')))),
        h('tbody', {}, rows.map((f) => {
          const tr = h('tr', { 'data-base': f.base, draggable: !archived ? 'true' : null },
            dragRows ? h('td', { class: 'grip-cell', title: 'Drag to reorder' }, I('grip-vertical')) : null,
            h('td', { class: 'fname' },
              h('span', { class: `file-icon ${fileKind(f.base)}` }, I(FILE_ICONS[fileKind(f.base)])),
              h('span', { class: 'fname-text' },
                h('button', { 'data-ro-ok': 'true', class: 'linkish fname-link', type: 'button', title: f.base, onclick: () => previewFile(c, f.name) }, nameOf(f.base)),
                !inOneFolder ? h('span', { class: 'fname-folder muted small' }, (f.folder || 'Unsorted').replace('/', ' › ')) : null),
              f.folder && prefix && !CF.followsConvention(c, f.folder, f.base) ? h('span', { class: 'pill warn-pill', title: `Not named ${prefix}-<file name>` }, 'name') : null),
            h('td', { class: 'ftype muted', title: fileTypeLabel(f.base) }, docLabel(f)),
            h('td', { class: 'fext muted', title: fileTypeLabel(f.base) }, extOf(f.base) || '—'),
            h('td', { class: 'num muted' }, fmtSize(f.size)),
            h('td', { class: 'muted fadded', title: fmtDateTime(f.modified) }, addedText(f.modified)),
            h('td', { class: 'actions' },
              h('button', { 'data-ro-ok': 'true', class: 'icon-btn', type: 'button', title: 'Open', onclick: () => previewFile(c, f.name) }, I('eye'), h('span', { class: 'sr-only' }, `Open ${f.base}`)),
              h('button', { class: 'icon-btn', type: 'button', title: f.folder ? 'Move or rename' : 'File it in a folder', onclick: () => moveFileDialog(c, f, current) }, I('arrow-left-right'), h('span', { class: 'sr-only' }, `Move or rename ${f.base}`)),
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
          h('p', { class: 'muted small files-where' }, `${shown.length} file${shown.length === 1 ? '' : 's'} · ${where}${dragRows ? ' · drag rows to arrange them' : ''}${!archived ? ' · drag a file onto a folder to move it' : ''}`),
          table))].filter(Boolean));
  }

  // The folder list in your own order: ↑/↓ buttons (or drag a row). Resolves the new order, or null.
  function arrangeFoldersDialog(folders) {
    const order = [...folders];
    return openDialog((close) => {
      const list = h('ol', { class: 'arrange-list' });
      let dragging = null;
      const move = (i, j) => { if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(order[j]); };
      function draw(focusName) {
        list.replaceChildren(...order.map((f, i) => {
          const li = h('li', { class: 'arrange-item', draggable: 'true' },
            h('span', { class: 'grip-cell', 'aria-hidden': 'true' }, I('grip-vertical')),
            h('span', { class: 'folder-icon' }, I(FOLDER_ICONS[f] || 'folder')),
            h('span', { class: 'arrange-name' }, f),
            h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0, 'data-dir': 'up', onclick: () => move(i, i - 1) }, I('arrow-up'), h('span', { class: 'sr-only' }, `Move ${f} up`)),
            h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === order.length - 1, 'data-dir': 'down', onclick: () => move(i, i + 1) }, I('arrow-down'), h('span', { class: 'sr-only' }, `Move ${f} down`)));
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
        h('h2', { icon: 'list-check' }, 'Arrange folders'),
        h('p', { class: 'muted small explain' }, 'The order is the same for every case. Sub-folders such as Video and Audio stay under their folder.'),
        list,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn ghost', type: 'button', icon: 'arrow-counterclockwise', title: 'Put the folders back in the standard order.', onclick: () => close(CVCaseFiles.ALL_FOLDERS.filter((f) => !CVCaseFiles.parentOf(f))) }, 'Standard order'),
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
        const desc = h('input', { type: 'text', maxlength: 80, placeholder: 'optional: a better file name', 'aria-label': `File name for ${file.name}` });
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
      h('div', { class: 'table-scroll' }, h('table', { class: 'files' },
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
        field('File name', desc, '', 'Optional: the name after the year and case number. Empty keeps the current name.'),
        h('label', { class: 'check-row' }, keep, h('span', {}, 'Keep the current file name')),
        h('p', {}, 'New name: ', result),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Move')));
    });
    if (!plan) return;
    try {
      const to = await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, plan.folder, plan));
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
          h('code', { class: 'path' }, CVFormat.pathText(`${Vault.root.name}\\${Vault.isArchived(c.id) ? 'archive' : 'cases'}\\${c.id}\\files\\${name}`)),
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
      const scrollToSection = (sec, smooth = false) => scroller.scrollTo({ top: sec.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' });
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
  window.CaseVaultUI = { h, icon: I, $, toast, openDialog, confirmDialog, field, fmtDate, fmtDateTime, fmtSize, Save, state, go, refresh: () => route(), previewFile, onDriveLost, showVaultPanel };
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
