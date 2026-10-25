/* CaseVault — Export Encrypted and Import Case (v1.153), loaded the first time either is used.
 * The file format is in js/case-export.js. v1.154: the export is saved on the SSD, in
 * CaseVault-Data\exports\<a folder you pick or make>, never on the PC. The password is never kept,
 * so it has to be given to whoever opens it separately.
 */
'use strict';

(function (root) {
  let ui = null;
  const X = () => root.CVCaseExport;

  const NEW = '\u0000new';
  /** The folder to save in: one already in exports\, or a new one (named after the case at first). */
  function folderPick(folders, suggest) {
    const { h, field } = ui;
    const sel = h('select', { 'aria-label': 'Folder on the SSD' },
      folders.map((f) => h('option', { value: f.name }, `${f.name} (${f.files.length} file${f.files.length === 1 ? '' : 's'})`)),
      h('option', { value: NEW }, 'New Folder…'));
    const name = h('input', { maxlength: 80, value: suggest, 'aria-label': 'New folder name', autocomplete: 'off' });
    const nameField = field('New Folder Name', name);
    const show = () => { nameField.hidden = sel.value !== NEW; };
    sel.value = folders.some((f) => f.name === suggest) ? suggest : folders.length ? folders[0].name : NEW;
    sel.addEventListener('change', () => { show(); if (sel.value === NEW) name.focus(); });
    show();
    return { el: h('div', { class: 'export-folder' }, field('Save in Folder on the SSD', sel, '', 'CaseVault-Data\\exports on the CASEVAULT drive'), nameField), value: () => (sel.value === NEW ? name.value.trim() : sel.value) };
  }
  const pct = (done, total) => (total ? `${Math.round((done / total) * 100)}%` : '');

  /** Export Encrypted: a password (twice) and a folder on the SSD, then the .cvcase file is saved there. */
  async function exportDialog(c) {
    const { h, openDialog, toast, Save, field, fmtSize } = ui;
    await Save.flushAll();
    let files;
    try { files = await Vault.caseFolderFiles(c.id); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); toast(`Not exported: ${err.message}`, 'error'); return; }
    const bytes = files.reduce((n, f) => n + f.blob.size, 0);
    const folders = await Vault.listExportFolders().catch(() => []);
    const where = folderPick(folders, FS.safeName(c.number || 'Exports') || 'Exports');
    const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, 'aria-label': 'Password' });
    const pw2 = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password again' });
    const meter = h('span', { class: 'muted small export-strength' });
    pw.addEventListener('input', () => {
      const st = root.CVLockerCore && CVLockerCore.strength ? CVLockerCore.strength(pw.value) : null;
      meter.textContent = st ? `${{ weak: 'Weak', ok: 'OK', strong: 'Strong' }[st.level] || ''}: ${st.why}` : '';
      meter.className = `muted small export-strength ${st ? st.level : ''}`;
    });
    const err = h('p', { class: 'error-text', role: 'alert' });
    const status = h('p', { class: 'muted small', role: 'status' });
    const go = h('button', { class: 'btn primary', type: 'submit', icon: 'lock-fill' }, 'Export Encrypted');
    await openDialog((close) => h('form', { class: 'case-export-form', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (pw.value.length < 8) { err.textContent = 'Use a password of at least 8 characters.'; pw.focus(); return; }
      if (pw.value !== pw2.value) { err.textContent = 'The two passwords are not the same.'; pw2.focus(); return; }
      if (!where.value()) { err.textContent = 'Type a name for the new folder.'; return; }
      go.disabled = true;
      try {
        const blob = await X().pack(files, pw.value, { caseId: c.id, number: c.number || '', subject: CVOperation.subjectLabel(c.subject) || '' }, { onProgress: (d, t) => { status.textContent = `Encrypting… ${pct(d, t)}`; } });
        status.textContent = 'Saving on the SSD and checking the copy…';
        const saved = await Save.track(`export:${c.id}`, () => Vault.saveExport(where.value(), X().fileName(c.number), blob));
        close(true);
        toast(`Saved on the SSD: ${saved.path}. Give the password separately.`, 'success', 9000);
      } catch (e2) { if (FS.isDisconnectError(e2)) { close(false); return ui.onDriveLost(); } go.disabled = false; status.textContent = ''; err.textContent = `Not exported: ${e2.message}`; }
    } },
    h('h2', { icon: 'lock-fill' }, 'Export Encrypted'),
    h('p', { class: 'muted small' }, `Case ${c.number || ''}: ${files.length} files, ${fmtSize(bytes)}. Everything in the case folder goes into one file, locked with this password (AES-256, the same as Discovery). It is saved on the SSD (never on this PC), in the folder you pick below.`),
    bytes > 1024 * 1024 * 1024 ? h('p', { class: 'warn-text small' }, 'This case is over 1 GB: the export can take several minutes and needs that much free memory.') : null,
    field('Password', pw, '', 'At least 8 characters. CaseVault doesn\'t keep it: without it the file cannot be opened.'),
    meter,
    field('Password Again', pw2),
    where.el,
    err, status,
    CVKit.cancelRow(h, () => close(false), go)));
  }

  /** Import Case: a .cvcase saved on the SSD (or chosen from another drive), its password, then the
   * case goes into this vault. */
  async function importDialog() {
    const { h, openDialog, toast, field, confirmDialog } = ui;
    const saved = (await Vault.listExportFolders().catch(() => [])).flatMap((f) => f.files.map((x) => ({ folder: f.name, ...x })));
    const OTHER = '\u0000other';
    const pick = h('select', { 'aria-label': 'Case export on the SSD' },
      saved.map((x, i) => h('option', { value: String(i) }, `${x.folder} \\ ${x.name}`)),
      h('option', { value: OTHER }, 'From Another Drive…'));
    const input = h('input', { type: 'file', accept: '.cvcase', 'aria-label': 'Case export file' });
    const inputField = field('File on Another Drive', input);
    const showInput = () => { inputField.hidden = pick.value !== OTHER; };
    pick.addEventListener('change', showInput);
    showInput();
    const pw = h('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Password' });
    const err = h('p', { class: 'error-text', role: 'alert' });
    const status = h('p', { class: 'muted small', role: 'status' });
    const go = h('button', { class: 'btn primary', type: 'submit', icon: 'unlock' }, 'Import Case');
    const got = await openDialog((close) => h('form', { class: 'case-export-form', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      go.disabled = true;
      try {
        const x = pick.value === OTHER ? null : saved[Number(pick.value)];
        const file = x ? await Vault.readExport(x.folder, x.name) : input.files && input.files[0];
        if (!file) { go.disabled = false; err.textContent = 'Pick the .cvcase file first.'; return; }
        status.textContent = 'Checking the password…';
        const r = await X().unpack(file, pw.value, { onProgress: (d, t) => { status.textContent = `Decrypting… ${pct(d, t)}`; } });
        close(r);
      } catch (e2) { go.disabled = false; status.textContent = ''; err.textContent = e2.name === 'WrongPassword' ? 'Wrong password.' : e2.message; }
    } },
    h('h2', { icon: 'unlock' }, 'Import Case'),
    h('p', { class: 'muted small' }, 'A case made with Export Encrypted (a .cvcase file) and its password. Exports saved on this SSD are listed; one on another drive can be chosen too.'),
    field('Case Export', pick), inputField, field('Password', pw),
    err, status,
    CVKit.cancelRow(h, () => close(null), go)));
    if (!got) return;
    const m = got.manifest;
    const id = m.caseId || '';
    if (!id || !got.files.some((f) => f.path === 'case.json')) { toast('This case export has no case in it.', 'error'); return; }
    const here = (Vault.data.cases || []).find((x) => x.id === id);
    if (here && !(await confirmDialog({ title: `Replace case ${here.number || id}?`, message: 'This vault already has this case. The one here now goes to Recently Deleted (for 30 days), and the imported one takes its place.', confirmText: 'Replace' }))) return;
    try {
      const c = await ui.Save.track(`import:${id}`, () => Vault.restoreCaseFromBackup(id, 'active', got.files, () => {}, 'Imported from an encrypted case export'));
      toast(`Case ${c.number || ''} imported.`, 'success');
      ui.go(c.id);
      ui.refresh();
    } catch (e3) { if (FS.isDisconnectError(e3)) return ui.onDriveLost(); toast(`Not imported: ${e3.message}`, 'error'); }
  }

  function init(kit) { ui = kit; }
  root.CVCaseExportUI = { init, exportDialog, importDialog };
})(this);
