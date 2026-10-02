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
    // v1.50: the files can come from any case (this one, its Operation's, or another): each pick is
    // { caseId, path }; a plain path is a file of this case.
    const lists = new Map();
    const filesOf = async (id) => { if (!lists.has(id)) lists.set(id, await Vault.listFiles(id)); return lists.get(id); };
    const picked = [];
    for (const x of opts.paths) {
      const pick = typeof x === 'string' ? { caseId: c.id, path: x } : x;
      const f = (await filesOf(pick.caseId)).find((y) => y.name === pick.path);
      if (f) picked.push({ ...f, caseId: pick.caseId });
    }
    if (!picked.length) throw new Error('Pick at least one file.');
    const total = picked.reduce((n, f) => n + (f.size || 0), 0) || 1;
    let done = 0;
    const step = (text) => progress(text, Math.min(0.99, done / total));

    // 1. What each file becomes, and its page count (for the Bates numbers).
    const prepared = [];
    for (const f of picked) {
      const file = await Vault.readFile(f.caseId, f.name);
      const kind = D.kindOf(f.base);
      const from = f.caseId === c.id ? null : Vault.data.cases.find((x) => x.id === f.caseId);
      const it = { path: f.name, caseId: f.caseId, caseNumber: from ? from.number || '' : '', name: f.base, folder: from ? [from.number, f.folder].filter(Boolean).join(' / ') : f.folder || '', kind, size: file.size, file };
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
      items: manifestItems.map((it, i) => ({ path: items[i].path, ...(items[i].caseId !== c.id ? { caseId: items[i].caseId, caseNumber: items[i].caseNumber } : {}), batesFirst: it.batesFirst, batesLast: it.batesLast, pages: it.pages, size: it.size, sha256: it.sha256 })),
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
    // v1.50: files from this case, its Operation, any Operation or any case. Listed files are
    // cached by case; a pick is "caseId|path".
    const active = (Vault.data.cases || []).filter((x) => !(Vault.isArchived && Vault.isArchived(x.id)) && x.status !== 'Archived');
    const caseNum = (id) => { const x = (Vault.data.cases || []).find((y) => y.id === id); return x ? x.number || 'No number' : ''; };
    const byCase = new Map([[c.id, files]]);
    const loadCase = async (id) => { if (!byCase.has(id)) byCase.set(id, await Vault.listFiles(id).catch(() => [])); return byCase.get(id); };
    const ops = Vault.listOperations ? Vault.listOperations() : [];
    const opName = (op) => (root.CVOperation ? CVOperation.opLabel(op) : op.name);
    const myOp = c.operationId && Vault.getOperation ? Vault.getOperation(c.operationId) : null;
    const casesFor = (src) => (src === 'all' ? active.map((x) => x.id) : src.startsWith('op:') ? active.filter((x) => x.operationId === src.slice(3)).map((x) => x.id) : [src.slice(5)]);
    const keyOf = (id, path) => `${id}|${path}`;
    const fileOf = (key) => { const i = key.indexOf('|'); const id = key.slice(0, i); return { caseId: id, f: (byCase.get(id) || []).find((x) => x.name === key.slice(i + 1)) }; };
    const settings = Vault.data.settings || {};
    let prefix = D.cleanPrefix(settings.discoveryPrefix || 'DISC');
    const picked = [];
    const canPick = typeof window.showDirectoryPicker === 'function';

    await openDialog((close) => {
      const search = h('input', { type: 'search', placeholder: 'Search by file, case number or subject', 'aria-label': 'Search the files' });
      const byNum = (a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true });
      const source = h('select', { 'aria-label': 'Files from' },
        h('option', { value: `case:${c.id}` }, `This case: ${c.number || 'No number'}`),
        myOp ? h('option', { value: `op:${myOp.id}` }, `This Operation: ${opName(myOp)}`) : null,
        h('option', { value: 'all' }, 'All cases'),
        ops.filter((o) => !myOp || o.id !== myOp.id).length ? h('optgroup', { label: 'Operations' }, ops.filter((o) => !myOp || o.id !== myOp.id).map((o) => h('option', { value: `op:${o.id}` }, opName(o)))) : null,
        active.length > 1 ? h('optgroup', { label: 'Cases' }, active.filter((x) => x.id !== c.id).sort(byNum).map((x) => h('option', { value: `case:${x.id}` }, [x.number || 'No number', x.subject].filter(Boolean).join(' · ')))) : null);
      let shownCases = [c.id];
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

      const row = (f, caseId, on, extra) => h('div', { class: `disc-row${on ? ' on' : ''}`, role: 'listitem' },
        h('span', { class: 'disc-kind' }, D.KIND_LABEL[D.kindOf(f.base)] || 'File'),
        h('span', { class: 'disc-name', title: f.name }, f.base, h('span', { class: 'muted small block' }, [caseId !== c.id ? `Case ${caseNum(caseId)}` : '', f.folder || 'Unsorted'].filter(Boolean).join(' · '))),
        h('span', { class: 'disc-size muted small' }, D.fmtSize(f.size)), extra);
      const pickedBytes = () => picked.reduce((n, k) => n + ((fileOf(k).f || {}).size || 0), 0);
      const draw = () => {
        const q = search.value.trim().toLowerCase();
        const all = [];
        for (const id of shownCases) {
          const x = (Vault.data.cases || []).find((y) => y.id === id) || {};
          const caseText = `${x.number || ''} ${x.subject || ''} ${x.title || ''}`.toLowerCase();
          for (const f of byCase.get(id) || []) if (!q || f.name.toLowerCase().includes(q) || caseText.includes(q)) all.push({ f, caseId: id });
        }
        left.replaceChildren(...(all.length ? all.map(({ f, caseId }) => {
          const key = keyOf(caseId, f.name);
          const on = picked.includes(key);
          const r = row(f, caseId, on, h('span', { class: 'disc-act' }, on ? 'Added' : 'Add ›'));
          r.tabIndex = 0;
          const add = () => { if (!picked.includes(key)) { picked.push(key); draw(); } };
          r.addEventListener('click', add);
          r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); } });
          return r;
        }) : [h('p', { class: 'muted small disc-empty' }, shownCases.some((id) => (byCase.get(id) || []).length) ? 'No files match.' : 'No files here yet.')]));
        right.replaceChildren(...(picked.length ? picked.map((k, i) => {
          const { f, caseId } = fileOf(k);
          return row(f, caseId, false, h('span', { class: 'disc-btns' },
            h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0, onclick: () => { picked.splice(i - 1, 0, picked.splice(i, 1)[0]); draw(); } }, icon('arrow-up'), h('span', { class: 'sr-only' }, 'Move up')),
            h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === picked.length - 1, onclick: () => { picked.splice(i + 1, 0, picked.splice(i, 1)[0]); draw(); } }, icon('arrow-down'), h('span', { class: 'sr-only' }, 'Move down')),
            h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Take off the list', onclick: () => { picked.splice(i, 1); draw(); } }, icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove'))));
        }) : [h('p', { class: 'muted small disc-empty' }, 'Click files on the left to add them here, in the order they are produced.')]));
        const bytes = pickedBytes();
        totals.textContent = picked.length ? `${picked.length} file${picked.length === 1 ? '' : 's'} · ${D.fmtSize(bytes)}${bytes > 4.38 * 1024 ** 3 ? ' · more than one DVD holds' : ''}` : '';
      };
      source.addEventListener('change', async () => {
        const want = casesFor(source.value);
        left.replaceChildren(h('p', { class: 'muted small disc-empty' }, 'Reading the files…'));
        for (const id of want) await loadCase(id);
        shownCases = want;
        draw();
      });
      // v1.50: before anything is written, a box lists every file going in and the total size.
      const confirmList = (destText) => new Promise((resolve) => {
        const bytes = pickedBytes();
        const extra = vlc.checked && kit ? kit.bytes : 0;
        const box = h('dialog', { class: 'dialog disc-confirm', 'aria-label': 'Files to copy' });
        const done = (v) => { box.close(); box.remove(); resolve(v); };
        box.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
        box.append(h('h2', {}, 'Ready to Copy'),
          h('p', { class: 'small' }, `${picked.length} file${picked.length === 1 ? '' : 's'} go to ${destText}, encrypted, in the order below.`),
          h('div', { class: 'disc-confirm-list' }, h('table', { class: 'data-table' },
            h('thead', {}, h('tr', {}, ['#', 'File', 'Case', 'Size'].map((t) => h('th', {}, t)))),
            h('tbody', {}, picked.map((k, i) => { const { f, caseId } = fileOf(k); return h('tr', {}, h('td', {}, String(i + 1)), h('td', { class: 'disc-name' }, f.base), h('td', { class: 'nowrap' }, caseNum(caseId)), h('td', { class: 'nowrap disc-size' }, D.fmtSize(f.size))); })),
            h('tfoot', {},
              extra ? h('tr', {}, h('td', {}), h('td', {}, 'VLC Player'), h('td', {}), h('td', { class: 'nowrap disc-size' }, D.fmtSize(extra))) : null,
              h('tr', { class: 'disc-total' }, h('td', {}), h('td', {}, 'Total'), h('td', {}), h('td', { class: 'nowrap disc-size' }, D.fmtSize(bytes + extra)))))),
          h('p', { class: 'muted small' }, `About ${D.fmtSize(bytes + extra)} on the drive; PDFs become page images, so the package can be somewhat larger or smaller.${bytes + extra > 4.38 * 1024 ** 3 ? ' That is more than one DVD (about 4.3 GB) holds: use a USB drive, or split the files over two productions.' : ''}`),
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Back'),
            h('button', { class: 'btn primary', type: 'button', onclick: () => done(true) }, 'Copy Now')));
        form.append(box);
        box.showModal();
        box.querySelector('.btn.primary').focus();
      });
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
        if (!(await confirmList(dest.value === 'pick' ? 'the USB drive or folder you pick next' : 'CaseVault-Data\\exports on the SSD'))) return;
        let dir = null; let destLabel = '';
        try {
          if (dest.value === 'pick') { dir = await window.showDirectoryPicker({ id: 'cv-discovery', mode: 'readwrite' }); destLabel = `Folder "${dir.name}"`; }
          else { dir = await FS.getDir(Vault.root, 'exports', true); destLabel = 'CaseVault-Data\\exports'; }
        } catch (ex) { if (ex && ex.name === 'AbortError') return; err.textContent = ex.message; return; }
        go.disabled = true; bar.hidden = false;
        const setBar = (text, f) => { bar.firstChild.style.width = `${Math.round(f * 100)}%`; bar.lastChild.textContent = text; };
        try {
          const entry = await exportPackage(c, { password: pw.value, prefix, start: Number(startIn.value) || 1, producedTo: toIn.value, allowSave: allow.checked, vlc: vlc.checked, dest: dir, destLabel, paths: picked.map((k) => { const { caseId, f } = fileOf(k); return { caseId, path: f.name }; }) }, setBar);
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
        h('section', { class: 'disc-pane' }, h('div', { class: 'disc-pane-head' }, h('strong', {}, 'Files'), source, search), left),
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
