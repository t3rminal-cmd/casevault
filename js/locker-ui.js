/* CaseVault — Secure Locker (v1.111): Other Files → Secure Locker.
 *
 * One password of its own (not the PIN) opens three parts:
 *   Password Manager      the passwords you keep (site, username, password, web address, notes)
 *   Confidential Files    informant files and anything else to keep locked (any file type)
 *   Covert                covert aliases, and covert accounts
 * Everything is encrypted on the SSD (js/secure/locker-core.js); a recovery key, shown once when
 * the locker is made, opens it if the password is forgotten.
 *
 * The locker locks itself: on leaving its page, after 5 minutes without use, when the privacy
 * screen comes on, and when the vault closes. A password copied with Copy is cleared from the
 * clipboard after 30 seconds.
 */
'use strict';

(function (root) {
  let ui = null;
  const L = () => root.CVLockerCore;
  const IDLE_MS = 5 * 60 * 1000;
  const CLIP_MS = 30 * 1000;
  const MAX_FILE = 200 * 1024 * 1024;
  const mem = { key: null, header: null, data: null, idle: null, tab: 'passwords', fails: 0, wait: 0, query: {} };

  /* ---------- lock state ---------- */
  function lock(why = '') {
    const was = !!mem.key;
    mem.key = null; mem.data = null;
    clearTimeout(mem.idle);
    if (was && why && ui) ui.toast(`Secure Locker locked${why ? `: ${why}` : ''}.`, 'info', 4000);
    if (was && isOpenPage()) render();
  }
  const isOpenPage = () => /^#\/locker\b/.test(location.hash);
  function touch() {
    clearTimeout(mem.idle);
    if (mem.key) mem.idle = setTimeout(() => lock('5 minutes without use'), IDLE_MS);
  }
  const unlocked = () => !!mem.key;

  async function saveData() {
    const bytes = await L().encryptJSON(mem.key, mem.data, 'data.bin');
    await ui.Save.track('locker:data', () => Vault.lockerWrite('data.bin', bytes));
  }
  async function loadData() {
    const bytes = await Vault.lockerRead('data.bin');
    mem.data = L().normalizeData(bytes ? await L().decryptJSON(mem.key, bytes, 'data.bin') : null);
  }

  /* ---------- clipboard ---------- */
  let clipTimer = null;
  async function copySecret(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      ui.toast(`${what} copied. It is cleared from the clipboard in 30 seconds.`, 'success', 4000);
      clearTimeout(clipTimer);
      clipTimer = setTimeout(() => { navigator.clipboard.writeText(' ').catch(() => {}); }, CLIP_MS);
    } catch { ui.toast('Could not copy: click in the CaseVault window first, then Copy again.', 'error'); }
  }

  /* ---------- the page ---------- */
  async function show(main) {
    const { h } = ui;
    main.replaceChildren(h('section', { class: 'ops-page locker-page' }, h('p', { class: 'muted' }, 'Opening the Secure Locker…')));
    try { mem.header = await Vault.lockerHeader(); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); ui.toast(err.message, 'error'); return; }
    render();
  }

  function pageHead(extra) {
    const { h, icon: I } = ui;
    return h('div', {},
      h('a', { href: '#/', class: 'back-link' }, '← Overview'),
      h('div', { class: 'page-head' },
        h('span', { class: 'page-icon locker-icon' }, I('safe2')),
        h('div', { class: 'page-title' }, h('h1', {}, 'Secure Locker'), h('div', { class: 'muted small' }, 'Other Files · Password Manager, Confidential Files and Covert, encrypted on the SSD behind their own password.')),
        h('div', { class: 'spacer' }), extra || ''));
  }

  function render() {
    const main = document.querySelector('#main');
    if (!main || !isOpenPage()) return;
    const sec = ui.h('section', { class: 'ops-page locker-page' });
    if (!mem.header) sec.append(pageHead(), setupForm());
    else if (!mem.key) sec.append(pageHead(), unlockForm());
    else sec.append(...openView());
    main.replaceChildren(sec);
    const f = sec.querySelector('[autofocus]');
    if (f) f.focus();
  }

  /* ---------- first time: set the password, show the recovery key ---------- */
  function setupForm() {
    const { h } = ui;
    const pw = h('input', { type: 'password', autocomplete: 'new-password', autofocus: true, 'aria-label': 'New locker password' });
    const again = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'The same password again' });
    const msg = h('p', { class: 'small error-text', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'submit', icon: 'lock-fill' }, 'Make the Locker');
    return h('form', { class: 'card locker-card', onsubmit: async (e) => {
      e.preventDefault();
      const problem = L().passwordProblem(pw.value, again.value);
      if (problem) { msg.textContent = problem; return; }
      btn.disabled = true; msg.textContent = '';
      try {
        const { header, key, recoveryKey } = await L().create(pw.value);
        pw.value = ''; again.value = '';
        // Nothing is saved until the recovery key has been seen and ticked off.
        if (!(await recoveryDialog(recoveryKey, true))) { btn.disabled = false; msg.textContent = 'Not made: the recovery key was not confirmed. Make the Locker again to get a new one.'; return; }
        await ui.Save.track('locker:header', () => Vault.lockerWrite('locker.json', header));
        mem.header = header; mem.key = key; mem.data = L().emptyData();
        await saveData();
        touch();
        ui.toast('Secure Locker made and open.', 'success');
        render();
      } catch (err) { btn.disabled = false; if (FS.isDisconnectError(err)) return ui.onDriveLost(); msg.textContent = err.message; }
    } },
    h('h2', { icon: 'shield-lock-fill' }, 'Make your Secure Locker'),
    h('p', {}, 'Choose a password for the locker. It is not your PIN and is never kept anywhere: CaseVault uses it to encrypt the locker (AES-256), so a copied SSD or backup shows nothing readable.'),
    h('ul', { class: 'small locker-points' },
      h('li', {}, `At least ${L().MIN_PASSWORD} characters. A short sentence you remember is good.`),
      h('li', {}, 'Next you get a recovery key, once. Print it or write it down and keep it away from the SSD: it opens the locker if you forget the password.'),
      h('li', {}, 'Without the password and the recovery key, nobody, you included, can open the locker.')),
    h('div', { class: 'form-grid' }, ui.field('Password', pw), ui.field('Password again', again)),
    msg, h('div', { class: 'dialog-actions' }, btn));
  }

  /** The recovery key, shown once: Copy, Print, and a tick before going on. */
  function recoveryDialog(key, first) {
    const { h, openDialog } = ui;
    return openDialog((close) => {
      const tick = h('input', { type: 'checkbox' });
      const go = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => close(true) }, 'Done');
      tick.addEventListener('change', () => { go.disabled = !tick.checked; });
      const print = () => {
        const w = window.open('', '_blank', 'width=640,height=480');
        if (!w) { ui.toast('The print window was blocked. Write the key down instead.', 'error'); return; }
        const d = w.document;
        d.title = 'CaseVault Secure Locker recovery key';
        const p = (t, s) => { const el = d.createElement(t); el.textContent = s; d.body.append(el); return el; };
        p('h2', 'CaseVault Secure Locker: recovery key');
        p('p', `Made ${new Date().toLocaleString()}. Keep this away from the SSD.`);
        const k = p('pre', key); k.style.font = 'bold 22px Consolas, monospace';
        p('p', 'Secure Locker → "Forgot the password?" → type this key, then choose a new password.');
        w.print();
      };
      return h('div', { class: 'locker-form recovery-form' },
        h('h2', { icon: 'key' }, first ? 'Your recovery key' : 'Your new recovery key'),
        h('p', {}, 'It opens the locker if you forget the password. CaseVault shows it only now.', first ? '' : ' The old recovery key no longer works.'),
        h('div', { class: 'recovery-key', 'aria-label': 'Recovery key' }, key),
        h('div', { class: 'locker-row' },
          h('button', { class: 'btn', type: 'button', icon: 'copy', onclick: () => copySecret(key, 'Recovery key') }, 'Copy'),
          h('button', { class: 'btn', type: 'button', icon: 'printer', onclick: print }, 'Print')),
        h('label', { class: 'check-row' }, tick, h('span', {}, 'I printed or wrote down the recovery key and keep it away from the SSD.')),
        h('div', { class: 'dialog-actions' }, go));
    });
  }

  /* ---------- locked: password, or the recovery key ---------- */
  function unlockForm() {
    const { h } = ui;
    const pw = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true, 'aria-label': 'Locker password' });
    const msg = h('p', { class: 'small error-text', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'submit', icon: 'unlock' }, 'Unlock');
    return h('form', { class: 'card locker-card', onsubmit: async (e) => {
      e.preventDefault();
      if (Date.now() < mem.wait) { msg.textContent = `Wait ${Math.ceil((mem.wait - Date.now()) / 1000)} seconds, then try again.`; return; }
      btn.disabled = true; msg.textContent = 'Checking…';
      try {
        mem.key = await L().open(mem.header, pw.value, 'pw');
        pw.value = '';
        mem.fails = 0;
        await loadData();
        touch();
        render();
      } catch (err) {
        mem.key = null;
        btn.disabled = false;
        if (FS.isDisconnectError(err)) return ui.onDriveLost();
        if (err.name !== 'WrongSecretError') { msg.textContent = err.message; return; }
        mem.fails += 1;
        const secs = mem.fails < 3 ? 0 : Math.min(60, 2 ** (mem.fails - 2));
        mem.wait = Date.now() + secs * 1000;
        msg.textContent = `Wrong password.${secs ? ` Wait ${secs} seconds before the next try.` : ''}`;
        pw.select();
      }
    } },
    h('h2', { icon: 'lock-fill' }, 'The Secure Locker is locked'),
    h('p', { class: 'muted small' }, 'Type the locker password (not your PIN).'),
    ui.field('Password', pw), msg,
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn ghost', type: 'button', icon: 'key', onclick: () => forgotDialog() }, 'Forgot the password?'), btn));
  }

  async function forgotDialog() {
    const { h, openDialog } = ui;
    const done = await openDialog((close) => {
      const rk = h('input', { autocomplete: 'off', spellcheck: 'false', autofocus: true, placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', 'aria-label': 'Recovery key' });
      const pw = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password' });
      const again = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password again' });
      const msg = h('p', { class: 'small error-text', role: 'alert' });
      const ok = h('button', { class: 'btn primary', type: 'submit' }, 'Set New Password');
      return h('form', { class: 'locker-form', onsubmit: async (e) => {
        e.preventDefault();
        if (!L().recoveryLooksRight(rk.value)) { msg.textContent = 'A recovery key is 32 letters and digits (the dashes don\'t matter).'; return; }
        const problem = L().passwordProblem(pw.value, again.value);
        if (problem) { msg.textContent = problem; return; }
        ok.disabled = true; msg.textContent = 'Checking…';
        try {
          const header = await L().changePassword(mem.header, rk.value, 'rk', pw.value);
          await ui.Save.track('locker:header', () => Vault.lockerWrite('locker.json', header));
          mem.header = header;
          mem.key = await L().open(header, pw.value, 'pw');
          close(true);
        } catch (err) { ok.disabled = false; msg.textContent = err.message; }
      } },
      h('h2', { icon: 'key' }, 'Forgot the locker password'),
      h('p', { class: 'small' }, 'Type the recovery key you printed or wrote down when the locker was made, and choose a new password. The recovery key keeps working.'),
      ui.field('Recovery key', rk), h('div', { class: 'form-grid' }, ui.field('New password', pw), ui.field('New password again', again)), msg,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'), ok));
    });
    if (!done) return;
    await loadData();
    touch();
    ui.toast('New password set. The locker is open.', 'success');
    render();
  }

  /* ---------- open ---------- */
  const TABS = [['passwords', 'Password Manager', 'key'], ['files', 'Confidential Files', 'shield-lock-fill'], ['covert', 'Covert', 'incognito']];
  function openView() {
    const { h } = ui;
    const counts = { passwords: mem.data.passwords.length, files: mem.data.files.length, covert: mem.data.aliases.length + mem.data.accounts.length };
    const tabs = h('nav', { class: 'tabs locker-tabs', role: 'tablist' }, TABS.map(([k, label, icon]) => h('button', {
      type: 'button', role: 'tab', class: `tab${mem.tab === k ? ' active' : ''}`, 'aria-selected': String(mem.tab === k),
      onclick: () => { mem.tab = k; touch(); render(); },
    }, h('span', { class: 'tab-main' }, ui.icon(icon), h('span', { class: 'tab-name' }, label), h('span', { class: 'tab-count' }, String(counts[k]))))));
    const body = mem.tab === 'files' ? filesPart() : mem.tab === 'covert' ? h('div', {}, tablePart('aliases'), tablePart('accounts')) : tablePart('passwords');
    const tools = h('div', { class: 'locker-row' },
      h('button', { class: 'btn small', type: 'button', icon: 'key', title: 'Choose a new locker password', onclick: () => changeDialog() }, 'Change Password'),
      h('button', { class: 'btn small', type: 'button', icon: 'arrow-repeat', title: 'Make a new recovery key; the old one stops working', onclick: () => newRecoveryDialog() }, 'New Recovery Key'),
      h('button', { class: 'btn primary small', type: 'button', icon: 'lock-fill', title: 'Lock now. It also locks by itself after 5 minutes without use and when you leave this page.', onclick: () => lock() }, 'Lock'));
    const page = h('div', { class: 'locker-open' }, tabs, body);
    page.addEventListener('input', touch);
    page.addEventListener('click', touch);
    return [pageHead(tools), h('p', { class: 'muted small locker-note' }, ui.icon('unlock'), ' Open. Locks after 5 minutes without use, when you leave this page, or with Lock.'), page];
  }

  /* A table you add to: Password Manager, Covert Aliases, Covert Accounts. */
  function tablePart(t) {
    const { h, icon: I } = ui;
    const T = L().TABLES[t];
    const rows = mem.data[t];
    const q = h('input', { type: 'search', placeholder: `Search ${T.title}`, 'aria-label': `Search ${T.title}`, value: mem.query[t] || '' });
    const tbody = h('tbody', {});
    const cols = T.fields.filter(([, , kind]) => kind !== 'wide');
    const draw = () => {
      mem.query[t] = q.value;
      const list = L().filterRows(t, rows, q.value);
      tbody.replaceChildren(...(list.length ? list.map((r) => h('tr', {},
        ...cols.map(([k, label, kind]) => h('td', { class: kind === 'secret' ? 'secret-cell' : '' }, kind === 'secret' ? secretCell(r[k], `${label} for ${r[cols[0][0]] || T.item}`) : (r[k] || h('span', { class: 'muted' }, '—')))),
        h('td', { class: 'col-actions nowrap' },
          r.notes || r.backstory ? h('span', { class: 'muted small locker-has-notes', title: r.notes || r.backstory }, I('pencil')) : '',
          h('button', { type: 'button', class: 'icon-btn', title: `Edit this ${T.item.toLowerCase()}`, onclick: () => editRow(t, r) }, I('pencil'), h('span', { class: 'sr-only' }, 'Edit')),
          h('button', { type: 'button', class: 'icon-btn danger-icon', title: `Delete this ${T.item.toLowerCase()}`, onclick: async () => {
            if (!(await ui.confirmDialog({ title: `Delete ${r[cols[0][0]] || T.item}?`, message: `This ${T.item.toLowerCase()} is deleted from the locker.`, confirmText: 'Delete', danger: true }))) return;
            mem.data[t] = mem.data[t].filter((x) => x !== r);
            await saveSafe(); render();
          } }, I('trash3'), h('span', { class: 'sr-only' }, 'Delete')))))
        : [h('tr', {}, h('td', { colspan: cols.length + 1, class: 'muted empty-cell' }, rows.length ? 'Nothing matches.' : `No ${T.title.toLowerCase()} yet. Add ${T.item} to start.`))]));
    };
    q.addEventListener('input', draw);
    draw();
    return h('section', { class: 'locker-section' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title caps', icon: T.icon }, T.title), h('div', { class: 'spacer' }), q,
        h('button', { class: 'btn primary small', type: 'button', icon: 'plus-lg', onclick: () => editRow(t, null) }, `Add ${T.item}`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table locker-table' },
        h('thead', {}, h('tr', {}, ...cols.map(([, label]) => h('th', {}, label)), h('th', { class: 'col-actions' }, ''))), tbody)));
  }

  function secretCell(value, what) {
    const { h, icon: I } = ui;
    if (!value) return h('span', { class: 'muted' }, '—');
    const text = h('span', { class: 'secret-text' }, '••••••••');
    let shown = false;
    const eye = h('button', { type: 'button', class: 'icon-btn', title: 'Show', onclick: () => {
      shown = !shown; text.textContent = shown ? value : '••••••••';
      eye.title = shown ? 'Hide' : 'Show'; eye.replaceChildren(I(shown ? 'eye-slash' : 'eye'));
      if (shown) setTimeout(() => { if (shown) eye.click(); }, 20000);
    } }, I('eye'));
    return h('span', { class: 'secret-wrap' }, text, eye, h('button', { type: 'button', class: 'icon-btn', title: 'Copy', onclick: () => copySecret(value, what) }, I('copy')));
  }

  async function editRow(t, row) {
    const { h, openDialog } = ui;
    const T = L().TABLES[t];
    const draft = { ...(row || {}) };
    const saved = await openDialog((close) => {
      const inputs = T.fields.map(([k, label, kind]) => {
        let el;
        if (kind === 'wide') { el = h('textarea', { rows: 3 }); el.value = draft[k] || ''; }
        else el = h('input', { type: kind === 'secret' ? 'password' : kind === 'date' ? 'date' : 'text', autocomplete: kind === 'secret' ? 'new-password' : 'off', spellcheck: 'false', value: draft[k] || '' });
        el.addEventListener('input', () => { draft[k] = el.value; });
        let box = el;
        if (kind === 'secret') {
          const eye = h('button', { type: 'button', class: 'icon-btn', title: 'Show', onclick: () => { el.type = el.type === 'password' ? 'text' : 'password'; eye.replaceChildren(ui.icon(el.type === 'password' ? 'eye' : 'eye-slash')); } }, ui.icon('eye'));
          const gen = h('button', { type: 'button', class: 'btn small', title: 'Make a strong random password (20 characters)', onclick: () => { el.value = L().generatePassword(); draft[k] = el.value; el.type = 'text'; } }, 'Generate');
          box = h('span', { class: 'secret-edit' }, el, eye, gen);
        }
        return ui.field(label, box, kind === 'wide' ? 'span-2' : '');
      });
      inputs[0].querySelector('input, textarea').setAttribute('autofocus', 'true');
      return h('form', { class: 'locker-form', onsubmit: (e) => { e.preventDefault(); close(true); } },
        h('h2', { icon: T.icon }, row ? `Edit ${T.item}` : `Add ${T.item}`),
        h('div', { class: 'form-grid' }, inputs),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
    });
    if (!saved || !mem.key) return;
    const clean = L().normalizeData({ [t]: [{ ...draft, id: draft.id || L().newId() }] })[t][0];
    if (row) mem.data[t] = mem.data[t].map((x) => (x === row ? clean : x));
    else mem.data[t].push(clean);
    await saveSafe();
    render();
  }

  async function saveSafe() {
    try { await saveData(); } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); }
  }

  /* Confidential Files: any file, encrypted one by one. */
  function filesPart() {
    const { h, icon: I } = ui;
    const picker = h('input', { type: 'file', multiple: true, hidden: true });
    picker.addEventListener('change', async () => { const fs = [...picker.files]; picker.value = ''; await addFiles(fs); });
    const q = h('input', { type: 'search', placeholder: 'Search Confidential Files', 'aria-label': 'Search Confidential Files', value: mem.query.files || '' });
    const tbody = h('tbody', {});
    const draw = () => {
      mem.query.files = q.value;
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const list = mem.data.files.filter((f) => { const t = `${f.name} ${f.label} ${f.notes}`.toLowerCase(); return words.every((w) => t.includes(w)); }).sort((a, b) => String(b.added).localeCompare(String(a.added)));
      tbody.replaceChildren(...(list.length ? list.map((f) => h('tr', {},
        h('td', {}, h('button', { type: 'button', class: 'linklike', title: 'Open', onclick: () => openFile(f) }, I('shield-lock-fill'), ' ', f.name)),
        h('td', {}, f.label || h('span', { class: 'muted' }, '—')),
        h('td', { class: 'num muted' }, ui.fmtSize(f.size)),
        h('td', { class: 'muted date-cell' }, f.added ? ui.fmtDate(f.added.slice(0, 10)) : '—'),
        h('td', { class: 'col-actions nowrap' },
          h('button', { type: 'button', class: 'icon-btn', title: 'Informant / label and notes', onclick: () => labelFile(f) }, I('pencil'), h('span', { class: 'sr-only' }, 'Edit label')),
          h('button', { type: 'button', class: 'icon-btn', title: 'Save a copy outside the locker (not encrypted)', onclick: () => saveCopy(f) }, I('download'), h('span', { class: 'sr-only' }, 'Save a copy')),
          h('button', { type: 'button', class: 'icon-btn danger-icon', title: 'Delete from the locker', onclick: () => deleteFile(f) }, I('trash3'), h('span', { class: 'sr-only' }, 'Delete')))))
        : [h('tr', {}, h('td', { colspan: 5, class: 'muted empty-cell' }, mem.data.files.length ? 'Nothing matches.' : 'No confidential files yet. Add Files, or drop files here.'))]));
    };
    q.addEventListener('input', draw);
    draw();
    const sec = h('section', { class: 'locker-section locker-drop' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title caps', icon: 'shield-lock-fill' }, 'Confidential Files'), h('div', { class: 'spacer' }), q,
        h('button', { class: 'btn primary small', type: 'button', icon: 'upload', onclick: () => picker.click() }, 'Add Files'), picker),
      h('p', { class: 'muted small' }, 'Informant files and anything else to keep locked: each file is encrypted on the SSD. Give each an informant number or label to find it again. The original you picked is not deleted: delete it yourself once it is in the locker.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table locker-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Informant / Label'), h('th', { class: 'num' }, 'Size'), h('th', { class: 'date-cell' }, 'Added'), h('th', { class: 'col-actions' }, ''))), tbody)));
    sec.addEventListener('dragover', (e) => { e.preventDefault(); sec.classList.add('drag'); });
    sec.addEventListener('dragleave', () => sec.classList.remove('drag'));
    sec.addEventListener('drop', (e) => { e.preventDefault(); sec.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });
    return sec;
  }

  async function addFiles(files) {
    if (!files.length || !mem.key) return;
    let n = 0;
    for (const file of files) {
      if (file.size > MAX_FILE) { ui.toast(`${file.name} is over 200 MB: too big for the locker.`, 'error', 7000); continue; }
      try {
        const id = L().newId();
        const bytes = await L().encrypt(mem.key, new Uint8Array(await file.arrayBuffer()), `f-${id}.bin`);
        await ui.Save.track(`locker:f-${id}`, () => Vault.lockerWrite(`f-${id}.bin`, bytes));
        mem.data.files.push({ id, name: file.name, type: file.type || '', size: file.size, added: new Date().toISOString(), label: '', notes: '' });
        n++;
      } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); ui.toast(`${file.name}: ${err.message}`, 'error'); }
    }
    if (n) { await saveSafe(); ui.toast(`${n} file${n === 1 ? '' : 's'} locked in Confidential Files.`, 'success'); }
    render();
  }

  async function fileBytes(f) {
    const enc = await Vault.lockerRead(`f-${f.id}.bin`);
    if (!enc) throw new Error(`${f.name} is missing from the locker folder.`);
    return L().decrypt(mem.key, enc, `f-${f.id}.bin`);
  }

  async function openFile(f) {
    const { h } = ui;
    let bytes;
    try { bytes = await fileBytes(f); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); ui.toast(err.message, 'error'); return; }
    const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    const isImg = /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name);
    const isText = /^text\//.test(f.type) || /\.(txt|md|csv)$/i.test(f.name);
    if (!isPdf && !isImg && !isText) { saveCopy(f, bytes); return; }
    let url = null; let viewer = null;
    await ui.openDialog((close) => {
      let body;
      if (isPdf && root.CVPdfViewer) { viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: f.name, fileName: f.name }); body = viewer; }
      else if (isImg) { url = URL.createObjectURL(new Blob([bytes], { type: f.type || 'image/jpeg' })); body = h('div', { class: 'locker-img' }, h('img', { src: url, alt: f.name })); }
      else body = h('pre', { class: 'locker-text' }, new TextDecoder().decode(bytes));
      return h('div', { class: 'locker-view pdf-view' }, h('h2', { icon: 'shield-lock-fill' }, f.name), body,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Close')));
    });
    if (viewer && viewer.destroy) viewer.destroy();
    if (url) URL.revokeObjectURL(url);
    bytes.fill(0);
  }

  async function saveCopy(f, bytes = null) {
    if (!(await ui.confirmDialog({ title: `Save a copy of ${f.name}?`, message: 'The copy is NOT encrypted: it goes where the browser saves downloads (usually Downloads on this PC). Delete it when you are done with it.', confirmText: 'Save a Copy' }))) return;
    try {
      const b = bytes || await fileBytes(f);
      const url = URL.createObjectURL(new Blob([b], { type: f.type || 'application/octet-stream' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: f.name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); ui.toast(err.message, 'error'); }
  }

  async function labelFile(f) {
    const { h, openDialog } = ui;
    const vals = await openDialog((close) => {
      const label = h('input', { value: f.label, maxlength: 120, autofocus: true, placeholder: 'CI-1234', 'aria-label': 'Informant or label' });
      const notes = h('textarea', { rows: 3 }); notes.value = f.notes;
      return h('form', { class: 'locker-form', onsubmit: (e) => { e.preventDefault(); close({ label: label.value.trim(), notes: notes.value }); } },
        h('h2', { icon: 'pencil' }, f.name), ui.field('Informant / Label', label), ui.field('Notes', notes),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
    });
    if (!vals || !mem.key) return;
    Object.assign(f, vals);
    await saveSafe(); render();
  }

  async function deleteFile(f) {
    if (!(await ui.confirmDialog({ title: `Delete ${f.name}?`, message: 'It is deleted from the locker for good.', confirmText: 'Delete', danger: true }))) return;
    mem.data.files = mem.data.files.filter((x) => x !== f);
    await saveSafe();
    try { await Vault.lockerRemove(`f-${f.id}.bin`); } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); }
    render();
  }

  /* ---------- password and recovery key ---------- */
  async function changeDialog() {
    const { h, openDialog } = ui;
    const done = await openDialog((close) => {
      const cur = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true, 'aria-label': 'Current password' });
      const pw = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password' });
      const again = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password again' });
      const msg = h('p', { class: 'small error-text', role: 'alert' });
      const ok = h('button', { class: 'btn primary', type: 'submit' }, 'Change Password');
      return h('form', { class: 'locker-form', onsubmit: async (e) => {
        e.preventDefault();
        const problem = L().passwordProblem(pw.value, again.value);
        if (problem) { msg.textContent = problem; return; }
        ok.disabled = true; msg.textContent = 'Checking…';
        try {
          const header = await L().changePassword(mem.header, cur.value, 'pw', pw.value);
          await ui.Save.track('locker:header', () => Vault.lockerWrite('locker.json', header));
          mem.header = header; close(true);
        } catch (err) { ok.disabled = false; msg.textContent = err.message; }
      } },
      h('h2', { icon: 'key' }, 'Change the locker password'),
      ui.field('Current password', cur), h('div', { class: 'form-grid' }, ui.field('New password', pw), ui.field('New password again', again)), msg,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'), ok));
    });
    if (done) ui.toast('Locker password changed. The recovery key is the same.', 'success');
  }

  async function newRecoveryDialog() {
    const { h, openDialog } = ui;
    const res = await openDialog((close) => {
      const cur = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true, 'aria-label': 'Locker password' });
      const msg = h('p', { class: 'small error-text', role: 'alert' });
      const ok = h('button', { class: 'btn primary', type: 'submit' }, 'Make a New Recovery Key');
      return h('form', { class: 'locker-form', onsubmit: async (e) => {
        e.preventDefault();
        ok.disabled = true; msg.textContent = 'Checking…';
        try { close(await L().newRecovery(mem.header, cur.value)); } catch (err) { ok.disabled = false; msg.textContent = err.message; }
      } },
      h('h2', { icon: 'arrow-repeat' }, 'New recovery key'),
      h('p', { class: 'small' }, 'Lost the recovery key, or worried someone saw it? Make a new one: the old one stops working.'),
      ui.field('Locker password', cur), msg,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), ok));
    });
    if (!res) return;
    if (!(await recoveryDialog(res.recoveryKey, false))) { ui.toast('Not changed: the new recovery key was not confirmed. The old one still works.', 'info', 6000); return; }
    try { await ui.Save.track('locker:header', () => Vault.lockerWrite('locker.json', res.header)); mem.header = res.header; ui.toast('New recovery key saved. The old one no longer works.', 'success'); } catch { /* reported */ }
  }

  function init(kit) {
    ui = kit;
    // Lock when leaving the page, when the privacy screen comes on, and when the window is hidden for long.
    window.addEventListener('hashchange', () => { if (!isOpenPage() && mem.key) lock(); });
    document.addEventListener('cv-privacy-screen', () => lock());
  }

  root.CVLockerUI = { init, show, lock, isUnlocked: unlocked };
})(this);
