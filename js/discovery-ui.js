/* CaseVault — Discovery (v1.49), on the Files tab: pick the case's files (left), they go to the
 * production list (right), then CaseVault writes a password-protected, view-and-print-only package
 * to a USB drive or folder (or onto the SSD, to burn to a DVD):
 *   - every file is encrypted (AES-256, js/discovery-core.js); the recipient opens "Open Discovery.html"
 *     in Chrome or Edge and types the password: nothing is installed;
 *   - PDFs are turned into page images, Word and Excel files into read-only pages, so the viewer
 *     shows and prints them but has nothing to download; video and audio play in it;
 *   - Bates numbers: one per page (PDFs), one per other file, printed on every page shown or printed;
 *     the originals are not changed, and the index lists each original's SHA-256;
 *   - a portable VLC on the SSD (CaseVault-Data\discovery-kit\VLC) is copied along when there;
 *   - the case keeps a log of every production and its index PDF (cases/<id>/discovery/).
 */
'use strict';

(function (root) {
  let ui = null;
  const LOG = 'discovery-log.json';
  const KIT = ['discovery-kit', 'VLC'];
  const DPI = 200;
  const MAX_SIDE = 2800;

  async function readLog(c) {
    let log = null;
    try { log = await Vault.readCaseJSON(c.id, LOG); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    return log && Array.isArray(log.productions) ? log : { schema: 1, productions: [] };
  }
  /** The next Bates number for this prefix in this case. */
  const nextStart = (log, prefix) => log.productions.filter((p) => p.prefix === prefix).reduce((n, p) => Math.max(n, (p.batesLast || 0) + 1), 1);

  async function vlcKit() {
    let dir = Vault.root;
    for (const part of KIT) { dir = dir ? await FS.getDir(dir, part).catch(() => null) : null; }
    if (!dir) return null;
    let files = 0; let bytes = 0;
    const walk = async (d) => { for (const e of await FS.list(d)) { if (e.kind === 'directory') await walk(e.handle); else { files += 1; bytes += e.handle.meta ? e.handle.meta.size : (await e.handle.getFile()).size; } } };
    await walk(dir);
    return files ? { dir, files, bytes } : null;
  }

  /* ---------- turning files into what the viewer shows ---------- */

  async function pdfPages(file, onPage) {
    const lib = await CVExtract.loadPdfjs();
    const task = CVExtract.openPdf(lib, new Uint8Array(await file.arrayBuffer()));
    const doc = await task.promise;
    const out = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(DPI / 72, MAX_SIDE / Math.max(base.width, base.height));
        const vp = page.getViewport({ scale });
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        out.push({ blob: await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85)), w: cv.width, h: cv.height });
        page.cleanup();
        onPage(n, doc.numPages);
      }
    } finally { await task.destroy(); }
    return out;
  }
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  async function docHtml(file) {
    const buf = await file.arrayBuffer();
    const xml = await CVExtract.unzipEntry(buf, 'word/document.xml');
    const numbering = await CVExtract.unzipEntry(buf, 'word/numbering.xml').catch(() => '');
    const blocks = CVDocxView.parse(xml, numbering || '');
    const box = document.createElement('div');
    box.append(CVDocxView.render(blocks));
    return box.innerHTML;
  }
  async function sheetHtml(file, name) {
    const XLSX = await CVSheets.load();
    const ext = CVDiscovery.extOf(name);
    const wb = ext === 'csv' || ext === 'tsv' ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    return wb.SheetNames.map((s) => `<h3>${escHtml(s)}</h3>${XLSX.utils.sheet_to_html(wb.Sheets[s], { header: '', footer: '' })}`).join('');
  }

  /* ---------- the export ---------- */

  /**
   * Write the package. opts: { password, prefix, start, producedTo, allowSave, vlc, dest (a folder
   * handle), paths }. progress(text, fraction). -> the log entry.
   */
  async function exportPackage(c, opts, progress) {
    const D = CVDiscovery;
    const today = Vault.localDay();
    const prefix = D.cleanPrefix(opts.prefix);
    const files = await Vault.listFiles(c.id);
    const picked = opts.paths.map((p) => files.find((f) => f.name === p)).filter(Boolean);
    if (!picked.length) throw new Error('Pick at least one file.');
    const total = picked.reduce((n, f) => n + (f.size || 0), 0) || 1;
    let done = 0;
    const step = (text) => progress(text, Math.min(0.99, done / total));

    // 1. What each file becomes, and its page count (for the Bates numbers).
    const prepared = [];
    for (const f of picked) {
      const file = await Vault.readFile(c.id, f.name);
      const kind = D.kindOf(f.base);
      const it = { path: f.name, name: f.base, folder: f.folder || '', kind, size: file.size, file };
      step(`Preparing ${f.base}…`);
      try {
        if (kind === 'pdf') { it.pageBlobs = await pdfPages(file, (n, of) => step(`Preparing ${f.base}: page ${n} of ${of}…`)); it.pages = it.pageBlobs.length; }
        else if (kind === 'doc') it.htmlText = await docHtml(file);
        else if (kind === 'sheet') it.htmlText = await sheetHtml(file, f.base);
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        // Can't be turned into pages (a damaged or protected file): it goes as a file to save.
        it.kind = 'other';
        it.note = `Could not be shown in the viewer (${err.message || 'unreadable'}).`;
      }
      prepared.push(it);
    }
    const items = D.allocate(prepared, opts.start);
    const last = items[items.length - 1].batesLast;

    // 2. The package folder and its key.
    const draft = { produced: today, prefix, batesFirst: items[0].batesFirst, batesLast: last };
    const folder = await FS.uniqueName(opts.dest, D.folderName(draft));
    const pkg = await FS.getDir(opts.dest, folder, true);
    const data = await FS.getDir(pkg, 'data', true);
    const openPart = async (name) => (await data.getFileHandle(name, { create: true })).createWritable();
    progress('Making the key from the password…', 0.01);
    const k = await D.newKey(opts.password);
    const store = (id, blob) => D.encryptBlob(k.key, id, blob, openPart);
    const recOf = (r, extra = {}) => ({ id: r.id, size: r.size, nonce: r.nonce, chunks: r.chunks, parts: r.parts, ...extra });

    // 3. Encrypt: page images and read-only pages for documents, the file itself for the rest.
    const manifestItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const id = `f${String(i + 1).padStart(4, '0')}`;
      const out = { id, name: it.name, folder: it.folder, kind: it.kind, size: it.size, pages: it.pages || 1, batesFirst: it.batesFirst, batesLast: it.batesLast };
      if (it.note) out.note = it.note;
      step(`Encrypting ${it.name}…`);
      if (it.pageBlobs) {
        out.pageImages = [];
        for (let p = 0; p < it.pageBlobs.length; p++) out.pageImages.push(recOf(await store(`${id}p${p + 1}`, it.pageBlobs[p].blob), { w: it.pageBlobs[p].w, h: it.pageBlobs[p].h }));
        out.sha256 = await hashBlob(it.file);
      } else if (it.htmlText != null) {
        out.html = recOf(await store(`${id}h`, new Blob([it.htmlText], { type: 'text/html' })));
        out.sha256 = await hashBlob(it.file);
      } else {
        const r = await D.encryptBlob(k.key, id, it.file, openPart, (b) => progress(`Encrypting ${it.name}…`, Math.min(0.99, (done + b) / total)));
        out.file = recOf(r);
        out.sha256 = r.sha256;
      }
      done += it.size || 0;
      manifestItems.push(out);
    }

    // 4. The index: a PDF for the case's records, and its pages in the package.
    const profile = (Vault.data.settings && Vault.data.settings.affiant) || {};
    const manifest = {
      title: `Discovery ${D.batesRange(prefix, items[0].batesFirst, last)}`,
      produced: today, producedTo: String(opts.producedTo || '').trim(), producedBy: [profile.name, profile.agency].filter(Boolean).join(', '),
      caseLabel: [c.number ? `Case ${c.number}` : '', c.subject || c.title || ''].filter(Boolean).join(' · '),
      prefix, batesFirst: items[0].batesFirst, batesLast: last, allowSave: !!opts.allowSave, vlc: false, items: manifestItems,
    };
    step('Making the index…');
    const indexPdf = CVDraftPdf.build(D.indexMarkdown(manifest), { title: 'Discovery Index', caseLabel: manifest.caseLabel });
    const indexPages = await pdfPages(new Blob([indexPdf], { type: 'application/pdf' }), () => {});
    manifest.index = { kind: 'pdf', pages: indexPages.length, pageImages: [] };
    for (let p = 0; p < indexPages.length; p++) manifest.index.pageImages.push(recOf(await store(`index${p + 1}`, indexPages[p].blob), { w: indexPages[p].w, h: indexPages[p].h }));

    // 5. VLC, if it's on the SSD.
    if (opts.vlc) {
      const kit = await vlcKit();
      if (kit) {
        step('Copying VLC…');
        await copyTree(kit.dir, await FS.getDir(pkg, 'VLC Player', true));
        manifest.vlc = true;
      }
    }

    // 6. The viewer page with the sealed manifest in it, and the read-me.
    step('Writing the viewer…');
    const header = await D.headerFor(k, manifest);
    const [tpl, core] = await Promise.all([fetchText('discovery/viewer.html'), fetchText('js/discovery-core.js')]);
    const html = tpl.replace('/*@@CORE@@*/', () => core.replace(/<\/script/gi, '<\\/script'))
      .replace('@@HEADER@@', () => JSON.stringify(header).replace(/</g, '\\u003c'));
    await FS.writeData(pkg, 'Open Discovery.html', new Blob([html], { type: 'text/html' }));
    await FS.writeText(pkg, 'README - Start Here.txt', readme(manifest));

    // 7. The case's record of it.
    const indexName = await Vault.saveDiscoveryFile(c.id, `Discovery Index ${today} ${D.bates(prefix, items[0].batesFirst)}.pdf`, new Blob([indexPdf], { type: 'application/pdf' }));
    const entry = {
      id: `${today}-${D.bates(prefix, items[0].batesFirst)}`, produced: today, producedAt: new Date().toISOString(), producedTo: manifest.producedTo,
      prefix, batesFirst: items[0].batesFirst, batesLast: last, folder, destination: opts.destLabel || '', vlc: manifest.vlc, allowSave: manifest.allowSave, index: indexName,
      items: manifestItems.map((it, i) => ({ path: items[i].path, batesFirst: it.batesFirst, batesLast: it.batesLast, pages: it.pages, size: it.size, sha256: it.sha256 })),
    };
    const log = await readLog(c);
    log.productions.push(entry);
    await Vault.writeCaseJSON(c.id, LOG, log);
    progress('Done.', 1);
    return entry;
  }

  async function hashBlob(blob) {
    const sha = new CVDiscovery.Sha256();
    for (let i = 0; i < blob.size; i += CVDiscovery.CHUNK) sha.update(new Uint8Array(await blob.slice(i, i + CVDiscovery.CHUNK).arrayBuffer()));
    if (!blob.size) sha.update(new Uint8Array(0));
    return sha.hex();
  }
  async function copyTree(src, dst) {
    for (const e of await FS.list(src)) {
      if (e.kind === 'directory') await copyTree(e.handle, await FS.getDir(dst, e.name, true));
      else await FS.writeData(dst, e.name, await FS.getFile(src, e.name));
    }
  }
  async function fetchText(path) {
    const r = await fetch(new URL(path, document.baseURI).href);
    if (!r.ok) throw new Error(`Could not read ${path}.`);
    return r.text();
  }
  function readme(m) {
    return [
      'DISCOVERY PACKAGE',
      '',
      `Produced ${m.produced}. Bates ${CVDiscovery.batesRange(m.prefix, m.batesFirst, m.batesLast)}.`,
      '',
      'To open it:',
      '1. Open "Open Discovery.html" with Google Chrome or Microsoft Edge (right-click, Open with).',
      '2. Type the password you were given separately.',
      '3. When asked, choose this folder (the one with the "data" folder in it) and allow the browser to view its files.',
      '',
      'The files are encrypted and open in the browser window only: the documents can be viewed and printed,',
      'video and audio play there. Every page shows its Bates number. Print Index lists every item and the',
      'SHA-256 fingerprint of each original file.',
      m.vlc ? '\nThe "VLC Player" folder holds the free VLC media player (vlc.exe), for recordings the browser can\'t play.\nVLC is free software (GNU GPL); its license is in that folder.' : '',
      '',
    ].join('\r\n');
  }

  /* ---------- the screen ---------- */

  async function open(c) {
    const { h, openDialog, toast, Save, icon } = ui;
    await Save.flushAll();
    const D = CVDiscovery;
    const [files, log, kit] = await Promise.all([Vault.listFiles(c.id), readLog(c), vlcKit().catch(() => null)]);
    const settings = Vault.data.settings || {};
    let prefix = D.cleanPrefix(settings.discoveryPrefix || 'DISC');
    const picked = [];
    const canPick = typeof window.showDirectoryPicker === 'function';

    await openDialog((close) => {
      const search = h('input', { type: 'search', placeholder: 'Search the case files', 'aria-label': 'Search the case files' });
      const left = h('div', { class: 'disc-list', role: 'list' });
      const right = h('div', { class: 'disc-list disc-picked', role: 'list' });
      const totals = h('span', { class: 'muted small' });
      const prefixIn = h('input', { maxlength: 20, value: prefix, autocomplete: 'off', 'aria-label': 'Bates prefix' });
      const startIn = h('input', { type: 'number', min: 1, value: nextStart(log, prefix), 'aria-label': 'Bates start number' });
      const toIn = h('input', { maxlength: 200, autocomplete: 'off', placeholder: 'ASA, AUSA or defense counsel', 'aria-label': 'Produced to' });
      const pw = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password' });
      const pw2 = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password again' });
      const allow = h('input', { type: 'checkbox', checked: true });
      const vlc = h('input', { type: 'checkbox', checked: !!kit, disabled: !kit });
      const dest = h('select', { 'aria-label': 'Where to' },
        canPick ? h('option', { value: 'pick' }, 'A USB drive or folder…') : null,
        h('option', { value: 'ssd', title: 'CaseVault-Data\\exports on the SSD; burn it to a DVD from there' }, 'The SSD, for a DVD'));
      const err = h('p', { class: 'error-text small', role: 'alert' });
      const bar = h('div', { class: 'disc-progress', hidden: true }, h('div', { class: 'disc-progress-fill' }), h('span', { class: 'small' }));
      const go = h('button', { class: 'btn primary', type: 'submit' }, 'Create Discovery Package');
      for (const el of [pw, pw2]) el.addEventListener('input', () => { err.textContent = ''; });
      prefixIn.addEventListener('change', () => { prefix = D.cleanPrefix(prefixIn.value); prefixIn.value = prefix; startIn.value = nextStart(log, prefix); });

      const row = (f, on, extra) => h('div', { class: `disc-row${on ? ' on' : ''}`, role: 'listitem' },
        h('span', { class: 'disc-kind' }, D.KIND_LABEL[D.kindOf(f.base)] || 'File'),
        h('span', { class: 'disc-name', title: f.name }, f.base, h('span', { class: 'muted small block' }, f.folder || 'Unsorted')),
        h('span', { class: 'disc-size muted small' }, D.fmtSize(f.size)), extra);
      const draw = () => {
        const q = search.value.trim().toLowerCase();
        const shown = files.filter((f) => !q || f.name.toLowerCase().includes(q));
        left.replaceChildren(...(shown.length ? shown.map((f) => {
          const on = picked.includes(f.name);
          const r = row(f, on, h('span', { class: 'disc-act' }, on ? 'Added' : 'Add ›'));
          r.tabIndex = 0;
          const add = () => { if (!picked.includes(f.name)) { picked.push(f.name); draw(); } };
          r.addEventListener('click', add);
          r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); } });
          return r;
        }) : [h('p', { class: 'muted small disc-empty' }, files.length ? 'No files match.' : 'This case has no files yet.')]));
        right.replaceChildren(...(picked.length ? picked.map((p, i) => {
          const f = files.find((x) => x.name === p);
          return row(f, false, h('span', { class: 'disc-btns' },
            h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0, onclick: () => { picked.splice(i - 1, 0, picked.splice(i, 1)[0]); draw(); } }, icon('arrow-up'), h('span', { class: 'sr-only' }, 'Move up')),
            h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === picked.length - 1, onclick: () => { picked.splice(i + 1, 0, picked.splice(i, 1)[0]); draw(); } }, icon('arrow-down'), h('span', { class: 'sr-only' }, 'Move down')),
            h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Take off the list', onclick: () => { picked.splice(i, 1); draw(); } }, icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove'))));
        }) : [h('p', { class: 'muted small disc-empty' }, 'Click files on the left to add them here, in the order they are produced.')]));
        const bytes = picked.reduce((n, p) => n + ((files.find((x) => x.name === p) || {}).size || 0), 0);
        totals.textContent = picked.length ? `${picked.length} file${picked.length === 1 ? '' : 's'} · ${D.fmtSize(bytes)}${bytes > 4.38 * 1024 ** 3 ? ' · more than one DVD holds' : ''}` : '';
      };
      search.addEventListener('input', draw);
      draw();

      const history = log.productions.length ? h('details', { class: 'disc-history' },
        h('summary', {}, `Earlier productions (${log.productions.length})`),
        h('ul', { class: 'plain-list' }, [...log.productions].reverse().map((p) => h('li', { class: 'disc-hist-row' },
          h('span', {}, `${p.produced} · ${D.batesRange(p.prefix, p.batesFirst, p.batesLast)}${p.producedTo ? ` · to ${p.producedTo}` : ''} · ${p.items.length} file${p.items.length === 1 ? '' : 's'}`),
          p.index ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
            const f = await Vault.readDiscoveryFile(c.id, p.index).catch(() => null);
            if (!f) { toast('That index is no longer in the case folder.', 'error'); return; }
            close(false);
            const viewer = CVPdfViewer.create(new Uint8Array(await f.arrayBuffer()), { h, icon, title: 'Discovery Index', fileName: p.index });
            await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', {}, `Discovery Index ${D.batesRange(p.prefix, p.batesFirst, p.batesLast)}`), viewer,
              h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
            viewer.destroy();
          } }, 'Index') : null)))) : null;

      const form = h('form', { class: 'disc', onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (!picked.length) { err.textContent = 'Add at least one file to the list on the right.'; return; }
        if (pw.value.length < 8) { err.textContent = 'Use a password of at least 8 characters.'; pw.focus(); return; }
        if (pw.value !== pw2.value) { err.textContent = 'The two passwords are not the same.'; pw2.focus(); return; }
        let dir = null; let destLabel = '';
        try {
          if (dest.value === 'pick') { dir = await window.showDirectoryPicker({ id: 'cv-discovery', mode: 'readwrite' }); destLabel = `Folder "${dir.name}"`; }
          else { dir = await FS.getDir(Vault.root, 'exports', true); destLabel = 'CaseVault-Data\\exports'; }
        } catch (ex) { if (ex && ex.name === 'AbortError') return; err.textContent = ex.message; return; }
        go.disabled = true; bar.hidden = false;
        const setBar = (text, f) => { bar.firstChild.style.width = `${Math.round(f * 100)}%`; bar.lastChild.textContent = text; };
        try {
          const entry = await exportPackage(c, { password: pw.value, prefix, start: Number(startIn.value) || 1, producedTo: toIn.value, allowSave: allow.checked, vlc: vlc.checked, dest: dir, destLabel, paths: [...picked] }, setBar);
          pw.value = ''; pw2.value = '';
          await Vault.updateSettings({ discoveryPrefix: prefix }).catch(() => {});
          close(true);
          await ui.openDialog((done) => h('div', { class: 'disc-done' },
            h('h2', {}, 'Discovery package ready'),
            h('p', {}, `${entry.items.length} file${entry.items.length === 1 ? '' : 's'}, Bates ${D.batesRange(entry.prefix, entry.batesFirst, entry.batesLast)}, in "${entry.folder}" (${entry.destination}).`),
            h('p', { class: 'muted small' }, 'Give the password to the recipient separately (by phone, not in the same envelope or email). CaseVault does not keep it. The index PDF and the list of what was produced are kept with the case (Files → Discovery → Earlier productions).'),
            dest.value === 'ssd' ? h('p', { class: 'muted small' }, 'For a DVD: put a blank disc in, open CaseVault-Data\\exports in File Explorer, select the package folder and choose Burn to disc (Share → Burn to disc). One DVD holds about 4.3 GB.') : null,
            h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done(true) }, 'OK'))));
        } catch (ex) {
          if (FS.isDisconnectError(ex)) { close(false); ui.onDriveLost(); return; }
          console.error(ex);
          err.textContent = `Could not make the package: ${ex.message}`;
          go.disabled = false;
        }
      } },
      h('h2', {}, 'Discovery'),
      h('p', { class: 'muted small' }, 'Pick the files to produce. CaseVault writes a password-protected package: it opens in Chrome or Edge with the password, shows and prints every page with its Bates number, plays video and audio, and has nothing to download. The files in the case are not changed.'),
      h('div', { class: 'disc-panes' },
        h('section', { class: 'disc-pane' }, h('div', { class: 'disc-pane-head' }, h('strong', {}, 'Case Files'), search), left),
        h('section', { class: 'disc-pane' }, h('div', { class: 'disc-pane-head' }, h('strong', {}, 'To Produce'), totals, h('div', { class: 'spacer' }),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { picked.splice(0); draw(); } }, 'Clear')), right)),
      h('div', { class: 'form-grid disc-opts' },
        ui.field('Produced To', toIn),
        ui.field('Bates Prefix', prefixIn, '', 'Each page gets PREFIX-000001 and on. The next number continues from the last production with this prefix.'),
        ui.field('Bates Start Number', startIn),
        ui.field('Where To', dest),
        ui.field('Password', pw, '', 'At least 8 characters. CaseVault doesn\'t keep it: write it down for the recipient.'),
        ui.field('Password Again', pw2),
        h('label', { class: 'check-row span-2' }, allow, h('span', {}, 'Allow saving a copy of video, audio and other files the viewer can\'t show (for VLC)')),
        h('label', { class: 'check-row span-2', title: kit ? `${kit.files} files, ${D.fmtSize(kit.bytes)}` : '' }, vlc, h('span', {}, kit ? 'Copy the VLC player along (from CaseVault-Data\\discovery-kit\\VLC)' : 'Copy the VLC player along: put a portable VLC in CaseVault-Data\\discovery-kit\\VLC first'))),
      err, bar,
      history,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'), go));
      return form;
    });
  }

  function init(kit) { ui = kit; }
  root.CVDiscoveryUI = { init, open, exportPackage, readLog, nextStart, vlcKit };
})(this);
