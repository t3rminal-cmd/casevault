/* CaseVault — the backup screens (v1.151, moved out of app.js): Back Up Everything (Chrome/Edge
 * straight to a drive, or through the helper in Firefox), Restore Cases from a full backup, and
 * Test Restore. The vault side is in js/vault.js and js/backup-restore.js.
 */
'use strict';

(function (root) {
  function init(deps) {
    const { h, I, MODE, Save, confirmDialog, encryptionText, ENCRYPTION_STEPS, field, fmtSize, onDriveLost, openDialog, plural, renderCaseList, route, state, toast, today } = deps;

    // v1.87: in Firefox the helper (1.11 or later) copies and checks the vault on another drive.
    async function helperBackup() {
      let drives;
      try { drives = await HelperFS.backupDrives(); } catch (err) { toast(`The helper did not answer: ${err.message}`, 'error'); return false; }
      if (!drives) return null; // an older helper: copy by hand
      const pick = await openDialog((close) => {
        const list = h('div', { class: 'arch-pick backup-drives', role: 'radiogroup', 'aria-label': 'Backup drive' });
        const go = h('button', { class: 'btn primary', type: 'submit', icon: 'hdd-fill', disabled: true }, 'Back Up to This Drive');
        const refresh = async () => { try { draw(drives = (await HelperFS.backupDrives()) || []); } catch (err) { toast(err.message, 'error'); } };
        const draw = (items) => {
          list.replaceChildren(...(items.length ? items.map((d) => {
            const net = d.bitlocker === 'network';
            // Added with Add Backup Folder (not a drive Windows found): it can be taken off the list again.
            const listed = d.saved === true || /^Network folder/.test(d.kind || '');
            const remove = listed ? h('button', { class: 'btn small backup-net-remove', type: 'button', title: 'Take this folder off the list (the backups already in it stay there)', onclick: async (e) => {
              e.preventDefault(); e.stopPropagation();
              try { await HelperFS.removeNetworkFolder(d.path); await refresh(); } catch (err) { toast(err.message, 'error'); }
            } }, 'Remove') : null;
            return h('label', { class: `arch-opt${d.reachable === false ? ' backup-off' : ''}` },
              h('input', { type: 'radio', name: 'backup-drive', value: d.path, disabled: d.reachable === false }), I(net ? 'globe2' : listed ? 'folder-fill' : 'hdd-fill'),
              h('span', {}, h('strong', {}, listed ? d.path : `${d.label || 'Drive'} (${d.path.replace(/[\\/]+$/, '')})`),
                h('span', { class: 'muted small block' }, d.total ? `${fmtSize(d.free)} free of ${fmtSize(d.total)}${d.kind === 'Removable' ? ' · removable' : ''}${d.kind === 'Network' ? ' · network drive' : ''}` : d.kind),
                d.bitlocker ? h('span', { class: `small block enc-${d.bitlocker}` }, I(d.bitlocker === 'on' ? 'shield-lock-fill' : net ? 'globe2' : 'unlock'), ` ${encryptionText(d.bitlocker)}`) : null),
              remove);
          }) : [h('p', { class: 'muted' }, 'No other drive found. Plug in the backup drive and unlock it, or add a backup folder, then click Look Again.')]));
          go.disabled = true;
          // v1.103: until a backup folder is added, the box to add one (C:\CaseVault-Backups) is open.
          netRow.hidden = items.some((d) => d.saved === true || /^Network folder/.test(d.kind || ''));
        };
        // v1.102: Add a backup folder: a shared folder on another PC at home (\\BEELINK\CaseVault-Backups),
        // or v1.103 a folder on this PC's drive, filled in as C:\CaseVault-Backups.
        const netIn = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: 'C:\\CaseVault-Backups', placeholder: 'C:\\CaseVault-Backups', 'aria-label': 'Backup folder' });
        const netAdd = h('button', { class: 'btn', type: 'button', onclick: async () => {
          const path = netIn.value.trim();
          if (!path) { netIn.focus(); return; }
          netAdd.disabled = true;
          try { await HelperFS.addNetworkFolder(path); await refresh(); toast(`Added ${path}.`, 'success', 2500); } catch (err) { toast(err.message, 'error', 9000); }
          netAdd.disabled = false;
        } }, 'Add');
        netIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); netAdd.click(); } });
        const netRow = h('div', { class: 'backup-net-row', hidden: true },
          h('label', { class: 'field' }, h('span', {}, 'Backup folder'), netIn), netAdd,
          h('p', { class: 'muted small' }, 'A folder on this PC, like C:\\CaseVault-Backups (made if it isn\'t there), or a shared folder on another PC, like \\\\BEELINK\\CaseVault-Backups. Never a folder on the SSD. See docs/BACKUP-TO-ANOTHER-PC.md.'));
        list.addEventListener('change', () => { go.disabled = !list.querySelector('input:checked'); });
        draw(drives);
        return h('form', { class: 'backup-form', onsubmit: (e) => { e.preventDefault(); const c = list.querySelector('input:checked'); if (c) close(drives.find((d) => d.path === c.value) || { path: c.value }); } },
          h('h2', { icon: 'hdd-fill' }, 'Back Up the Whole Vault'),
          h('p', {}, 'Every case, file, report, template and setting in CaseVault-Data is copied to the drive or folder you pick, then read back and checked file by file. You can keep working while it runs.'),
          h('p', { class: 'muted small' }, 'Pick an encrypted drive that is not part of this SSD, or add a backup folder: C:\\CaseVault-Backups on this PC, or a shared folder on another PC at home. The SSD\'s own partitions are never offered.'),
          list,
          h('div', { class: 'backup-net-open' }, h('button', { class: 'btn small', type: 'button', icon: 'folder-plus', onclick: () => { netRow.hidden = !netRow.hidden; if (!netRow.hidden) netIn.focus(); } }, 'Add Backup Folder')),
          netRow,
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
            h('button', { class: 'btn', type: 'button', icon: 'arrow-repeat', onclick: refresh }, 'Look Again'),
            go));
      });
      if (!pick) return false;
      // v1.102: to another PC: CaseVault can't see that PC's disk, so the first time it asks you to say
      // it is encrypted and the shared folder is only yours. The answer is kept for that folder.
      if (pick.bitlocker === 'network') {
        const okList = (Vault.data.settings.networkBackupOk || []);
        if (!okList.some((p) => p.toLowerCase() === pick.path.toLowerCase())) {
          const sure = await openDialog((close) => {
            const tick = h('input', { type: 'checkbox' });
            const yes = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => close(true) }, 'Back Up to This Folder');
            tick.addEventListener('change', () => { yes.disabled = !tick.checked; });
            return h('div', { class: 'confirm backup-form' },
              h('h2', { icon: 'globe2' }, 'Backing Up to Another PC'),
              h('p', {}, `The backup is a full copy of every case. It goes over your home network to ${pick.path}. CaseVault can\'t see whether that PC\'s drive is encrypted.`),
              h('ul', { class: 'backup-steps' },
                h('li', {}, 'That PC\'s drive has BitLocker on (or Device encryption on Windows Home).'),
                h('li', {}, 'The shared folder is shared with your account only, not Everyone.'),
                h('li', {}, 'The share encrypts its traffic (docs/BACKUP-TO-ANOTHER-PC.md shows how).')),
              h('label', { class: 'check-row' }, tick, h('span', {}, 'I checked: that PC is encrypted and the shared folder is only mine.')),
              CVKit.cancelRow(h, () => close(false), yes));
          });
          if (!sure) return false;
          await Save.track('settings', () => Vault.updateSettings({ networkBackupOk: [...okList, pick.path] })).catch(() => {});
        }
      }
      // v1.98: a backup is a full copy of every case: on a drive without BitLocker, anyone can read it.
      if (pick.bitlocker === 'off' || pick.bitlocker === 'suspended') {
        const go = await openDialog((close) => h('div', { class: 'confirm backup-form' },
          h('h2', { icon: 'unlock' }, 'This Drive Is Not Encrypted'),
          h('p', {}, `${pick.label || 'This drive'} (${pick.path.replace(/[\\/]+$/, '')}) ${pick.bitlocker === 'suspended' ? 'has BitLocker paused' : 'has no BitLocker'}. The backup is a full copy of every case: anyone who gets the drive can read all of it.`),
          h('p', { class: 'muted small' }, pick.bitlocker === 'suspended' ? 'In File Explorer, right-click the drive → Manage BitLocker → Resume protection, then back up.' : ENCRYPTION_STEPS),
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn primary', type: 'button', onclick: () => close(false) }, 'Cancel'),
            h('button', { class: 'btn danger', type: 'button', onclick: () => close(true) }, 'Back Up Anyway'))));
        if (!go) return false;
      }
      await Save.flushAll();
      if (Save.failed.size) { toast('Some changes are not saved yet. Reconnect the SSD, then back up.', 'error', 8000); return false; }
      const progress = toast('Backing up: starting…', 'info', 24 * 3600000);
      try {
        let st = await HelperFS.backupStart(pick.path);
        while (st.state === 'running') {
          await new Promise((r) => setTimeout(r, 800));
          st = await HelperFS.backupStatus();
          progress.textContent = st.total ? `Backing up: ${st.files} of ${st.total} files copied and checked (${fmtSize(st.bytes)} of ${fmtSize(st.totalBytes)})` : 'Backing up: counting the files…';
        }
        progress.remove();
        if (st.state !== 'done') { toast(`The backup did not finish: ${st.message || 'unknown error'}`, 'error', 15000); return false; }
        await Save.track('settings', () => Vault.recordHelperBackup(st));
        await openDialog((close) => h('div', { class: 'backup-form' },
          h('h2', { icon: 'check-circle-fill' }, 'Full Backup Done'),
          h('p', {}, `${st.files} file${st.files === 1 ? '' : 's'} (${fmtSize(st.bytes)}) copied to ${CVFormat.pathText(st.folder)} and checked file by file.`),
          h('p', { class: 'muted small' }, 'Keep the backup drive somewhere other than where the SSD is kept. To restore, copy the backup folder\'s contents into an empty CaseVault-Data folder and open it.'),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
        if (location.hash === '#/' || location.hash === '') route();
        return true;
      } catch (err) {
        progress.remove();
        toast(`The backup did not finish: ${err.message}`, 'error', 15000);
        return false;
      }
    }

    async function fullBackupDialog() {
      if (MODE !== 'direct') {
        const done = await helperBackup();
        if (done !== null) return done;
        const ok = await openDialog((close) => h('div', { class: 'backup-form' },
          h('h2', { icon: 'hdd-fill' }, 'Back Up the Whole Vault'),
          h('p', {}, 'This helper is older than 1.11, so CaseVault cannot reach a second drive itself. Update W:\\casevault-helper to back up with one click, or copy the folder with File Explorer:'),
          h('ol', { class: 'backup-steps' },
            h('li', {}, 'Close CaseVault (⋮ → Power Off) so nothing is being saved.'),
            h('li', {}, 'Plug in the backup drive (an encrypted drive, not this PC).'),
            h('li', {}, h('span', {}, 'Copy the whole ', h('strong', {}, 'CaseVault-Data'), ' folder from the SSD to the backup drive.')),
            h('li', {}, 'Open the copy\'s vault.json to check it is there, then come back here.')),
          h('p', { class: 'muted small' }, 'With helper 1.11 or later, or in Chrome or Edge, CaseVault copies and checks every file for you.'),
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
            h('button', { class: 'btn primary', type: 'button', icon: 'check-circle-fill', onclick: () => close(true) }, 'I Copied It Today'))));
        if (!ok) return false;
        await Save.track('settings', () => Vault.recordManualBackup());
        toast('Full backup recorded for today.', 'success');
        if (location.hash === '#/' || location.hash === '') route();
        return true;
      }
      const go = await confirmDialog({
        title: 'Back Up the Whole Vault',
        message: h('div', {},
          h('p', {}, 'Every case, file, report, template and setting in CaseVault-Data is copied to a new folder on the drive you pick next, then read back and checked byte for byte.'),
          h('p', { class: 'muted small' }, 'Pick a folder on a different encrypted drive, not on this SSD and not on this PC. The copy is named CaseVault-Backup-<date>.')),
        confirmText: 'Pick the Backup Drive',
      });
      if (!go) return false;
      let dir;
      try { dir = await window.showDirectoryPicker({ id: 'cv-full-backup', mode: 'readwrite' }); } catch (err) { if (err && err.name !== 'AbortError') toast(err.message, 'error'); return false; }
      await Save.flushAll();
      if (Save.failed.size) { toast('Some changes are not saved yet. Reconnect the SSD, then back up.', 'error', 8000); return false; }
      const progress = toast('Backing up: starting…', 'info', 3600000);
      try {
        const r = await Save.track('fullbackup', () => Vault.fullBackup(dir, (n, name, bytes) => { progress.textContent = `Backing up: ${n} file${n === 1 ? '' : 's'} copied and checked (${fmtSize(bytes)}), ${name}`; }));
        progress.remove();
        await openDialog((close) => h('div', { class: 'backup-form' },
          h('h2', { icon: 'check-circle-fill' }, 'Full Backup Done'),
          h('p', {}, `${r.files} file${r.files === 1 ? '' : 's'} (${fmtSize(r.bytes)}) copied to "${dir.name}\\${r.folder}" and checked byte for byte.`),
          h('p', { class: 'muted small' }, 'Keep the backup drive somewhere other than where the SSD is kept. To restore, copy the backup folder\'s contents into an empty CaseVault-Data folder and open it.'),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
        if (location.hash === '#/' || location.hash === '') route();
        return true;
      } catch (err) {
        progress.remove();
        if (FS.isDisconnectError(err) && !(await Vault.ping().catch(() => false))) { onDriveLost(); return false; }
        toast(`The backup did not finish: ${err.message}`, 'error', 12000);
        return false;
      }
    }

    /** v1.149: Test Restore: a picked backup folder is read in the browser; 20 random files (and
     * vault.json) are read in full and compared with the SSD. Nothing is written. */
    async function pickFolderFiles() {
      return new Promise((resolve) => {
        const input = h('input', { type: 'file', multiple: true, hidden: true });
        input.webkitdirectory = true;
        input.addEventListener('change', () => { resolve([...input.files].map((file) => ({ path: file.webkitRelativePath || file.name, file }))); input.remove(); });
        input.addEventListener('cancel', () => { resolve(null); input.remove(); });
        document.body.append(input);
        input.click();
      });
    }
    async function ssdFileAt(rel) {
      const parts = rel.split('/');
      let dir = Vault.root;
      for (const p of parts.slice(0, -1)) { dir = await FS.getDir(dir, p); if (!dir) return null; }
      return FS.getFile(dir, parts[parts.length - 1]);
    }
    async function sameFileBytes(a, b) {
      if (a.size !== b.size) return false;
      const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
      const p = new Uint8Array(x); const q = new Uint8Array(y);
      for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
      return true;
    }
    async function testRestoreDialog() {
      const files = await pickFolderFiles();
      if (!files) return;
      const pick = CVBackupRestore.testPick(files, 20);
      if (!pick) { toast('No backup found in that folder. Pick a CaseVault-Backup-<date> folder on the backup drive.', 'error', 9000); return; }
      const progress = toast('Testing the backup…', 'info', 24 * 3600000);
      const t = { read: 0, unreadable: 0, badJson: 0, same: 0, changed: 0, gone: 0, count: pick.files.length, expected: null };
      const rows = [];
      try {
        if (pick.info) { try { const info = JSON.parse(await pick.info.text()); if (Number.isFinite(info.files)) t.expected = info.files; } catch { /* no count to check */ } }
        for (const x of pick.sample) {
          let state2 = '';
          try {
            await x.file.arrayBuffer();
            t.read += 1;
            if (/\.json$/i.test(x.rel)) { try { JSON.parse(await x.file.text()); } catch { t.badJson += 1; state2 = 'Damaged'; } }
            if (!state2) {
              const live = await ssdFileAt(x.rel).catch(() => null);
              if (!live) { t.gone += 1; state2 = 'Not on the SSD now'; }
              else if (await sameFileBytes(x.file, live)) { t.same += 1; state2 = 'Same'; }
              else { t.changed += 1; state2 = 'Changed since'; }
            }
          } catch { t.unreadable += 1; state2 = 'Unreadable'; }
          rows.push({ rel: x.rel, state: state2 });
        }
      } finally { progress.remove(); }
      const verdict = CVBackupRestore.testVerdict(t);
      await openDialog((close) => h('div', { class: 'test-restore' },
        h('h2', { icon: verdict.ok ? 'check-circle-fill' : 'exclamation-triangle-fill' }, verdict.ok ? 'Backup Reads Back Fine' : 'Backup Has Problems'),
        h('p', { class: 'muted small' }, `${pick.backup} · ${CVBackupRestore.backupWhen(pick.backup)}. Nothing was changed.`),
        h('ul', { class: 'test-restore-lines' }, verdict.lines.map((l) => h('li', {}, l))),
        h('details', { class: 'backup-list' }, h('summary', {}, `The ${plural(rows.length, 'file')} read`),
          h('ul', { class: 'test-restore-files' }, rows.map((r) => h('li', { class: `tr-${r.state === 'Same' ? 'same' : r.state === 'Changed since' ? 'changed' : 'bad'}` }, h('span', { class: 'mono small' }, r.rel), h('span', { class: 'small nowrap' }, r.state))))),
        verdict.ok ? null : h('p', { class: 'small warn-text' }, 'Make a new full backup to another drive (Back Up Everything), then test that one.'),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
    }

    async function restoreFromBackupDialog() {
      // The browser reads the picked folder (it asks "upload N files?": nothing leaves the PC).
      const files = await pickFolderFiles();
      if (!files) return;
      const found = CVBackupRestore.group(files);
      const cases = [];
      for (const g of found) {
        const cj = g.files.find((x) => x.path === 'case.json');
        let c = null;
        try { c = JSON.parse(await cj.file.text()); } catch { /* unreadable: left out */ }
        if (c) cases.push({ ...g, c, inVault: Vault.data.cases.some((e) => e.id === g.id) });
      }
      if (!cases.length) { toast('No cases found in that folder. Pick a CaseVault-Backup-<date> folder (or the CaseVault-Data folder inside it).', 'error', 9000); return; }
      const picked = await openDialog((close) => {
        const boxes = cases.map((x) => {
          const tick = h('input', { type: 'checkbox', checked: !x.inVault, value: x.id });
          return { x, tick, row: h('label', { class: `restore-row${x.inVault ? ' restore-exists' : ''}` }, tick,
            h('span', { class: 'restore-what' }, h('strong', {}, x.c.number || x.c.title || x.id), x.c.subject ? h('span', { class: 'muted small block' }, x.c.subject) : null),
            h('span', { class: 'small restore-meta' }, `${x.c.status || ''}${x.location === 'archive' ? ' · archived' : ''} · ${plural(x.files.length, 'file')} · backup ${CVBackupRestore.backupWhen(x.backup)}`),
            x.inVault ? h('span', { class: 'small warn-text block restore-note' }, 'In the vault now: restoring replaces it (the current copy goes to Recently Deleted).') : null) };
        });
        const go = h('button', { class: 'btn primary', type: 'submit', icon: 'arrow-counterclockwise' }, 'Restore');
        const count = () => { const n = boxes.filter((b) => b.tick.checked).length; go.disabled = !n; go.textContent = n ? `Restore ${plural(n, 'case')}` : 'Restore'; };
        boxes.forEach((b) => b.tick.addEventListener('change', count));
        count();
        return h('form', { class: 'restore-form', onsubmit: (e) => { e.preventDefault(); close(boxes.filter((b) => b.tick.checked).map((b) => b.x)); } },
          h('h2', { icon: 'arrow-counterclockwise' }, 'Restore Cases from a Backup'),
          h('p', { class: 'muted small' }, `${plural(cases.length, 'case')} in this backup. Tick the ones to bring back; each comes back with its notes, timeline, reports and files.`),
          h('div', { class: 'restore-list' }, boxes.map((b) => b.row)),
          CVKit.cancelRow(h, () => close(null), go));
      });
      if (!picked || !picked.length) return;
      await Save.flushAll();
      const progress = toast('Restoring…', 'info', 24 * 3600000);
      let done = 0;
      try {
        for (const x of picked) {
          progress.textContent = `Restoring ${x.c.number || x.id}…`;
          await Save.track(`restore:${x.id}`, () => Vault.restoreCaseFromBackup(x.id, x.location, x.files.map((f) => ({ path: f.path, data: f.file }))));
          done += 1;
        }
        toast(`${plural(done, 'case')} restored.`, 'success', 6000);
      } catch (err) {
        if (FS.isDisconnectError(err)) return onDriveLost();
        toast(`${done ? `${plural(done, 'case')} restored, then: ` : ''}${err.message}`, 'error', 12000);
      } finally {
        progress.remove();
        renderCaseList();
      }
    }

    return { fullBackupDialog, restoreFromBackupDialog, testRestoreDialog };
  }
  root.CVBackupUI = { init };
})(this);
