/* CaseVault checker — reading text out of attached documents.
 *
 * PDF (pdf.js; scanned pages go through OCR), DOCX (built-in unzip, no library), plain text,
 * and images (Tesseract OCR). Every library is loaded from vendor/ on this site; nothing is
 * fetched from the internet (the Content-Security-Policy would block it anyway).
 *
 * Result: { name, kind, pageCount, paragraphs: [{ index, page, text }], ocrPages: [n], warnings: [] }
 */
'use strict';

(function (root) {
  const url = (path) => new URL(path, document.baseURI).href;
  const OCR_MIN_CHARS = 25; // a PDF page with less text than this is treated as a scanned image

  const KINDS = {
    pdf: 'pdf',
    docx: 'docx',
    txt: 'text', md: 'text', text: 'text', csv: 'text', log: 'text', rtf: null,
    png: 'image', jpg: 'image', jpeg: 'image', bmp: 'image', webp: 'image', gif: 'image', tif: null, tiff: null,
  };

  function kindOf(name) {
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    return KINDS[ext] || null;
  }

  function supportMessage(name) {
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (ext === 'doc') return 'Old .doc files can\'t be read. Open it in Word and save it as .docx or PDF.';
    if (ext === 'tif' || ext === 'tiff') return 'TIFF images can\'t be read. Save it as PDF, PNG or JPG.';
    return 'This file type can\'t be checked. PDF, DOCX, TXT and images (PNG/JPG) are supported.';
  }

  /* ---------------- paragraphs ---------------- */

  function paragraphsFromText(text, page = null, startIndex = 0) {
    const clean = String(text || '').replace(/\r\n?/g, '\n');
    let blocks = clean.split(/\n\s*\n/);
    // Text with no blank lines at all: treat each line as a paragraph.
    if (blocks.length < 2 && clean.split('\n').length > 3) blocks = clean.split('\n');
    return blocks
      .map((b) => b.replace(/(\w)-\n(\w)/g, '$1$2').replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim())
      .filter((b) => b.length > 1)
      .map((text2, i) => ({ index: startIndex + i, page, text: text2 }));
  }

  /* ---------------- PDF ---------------- */

  let pdfjsPromise = null;
  function loadPdfjs() {
    if (location.protocol === 'file:') {
      return Promise.reject(new Error('Reading PDFs needs the installed app or the helper (http://127.0.0.1:8517). The copy opened straight from the SSD (file://) can\'t load the PDF reader.'));
    }
    if (!pdfjsPromise) {
      pdfjsPromise = import(url('vendor/pdfjs/pdf.min.mjs')).then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = url('vendor/pdfjs/pdf.worker.min.mjs');
        return lib;
      });
      pdfjsPromise.catch(() => { pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }

  // Rebuild lines and paragraphs from pdf.js text items using their positions.
  function pageParagraphs(items, page, startIndex) {
    const lines = [];
    let line = null;
    for (const it of items) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform[5];
      const h = Math.abs(it.transform[3]) || it.height || 10;
      if (!line || Math.abs(y - line.y) > h * 0.5) {
        line = { y, h, text: '' };
        lines.push(line);
      }
      line.text += it.str;
      if (it.hasEOL) line = null;
    }
    const paras = [];
    let cur = [];
    let prev = null;
    const flush = () => {
      const text = cur.reduce((acc, l) => (acc.endsWith('-') && /^[a-z]/.test(l) ? acc.slice(0, -1) + l : (acc ? `${acc} ${l}` : l)), '')
        .replace(/\s+/g, ' ').trim();
      if (text.length > 1) paras.push({ index: startIndex + paras.length, page, text });
      cur = [];
    };
    for (const l of lines) {
      const t = l.text.trim();
      if (!t) { if (cur.length) flush(); prev = null; continue; }
      if (prev && (prev.y - l.y) > Math.max(prev.h, l.h) * 1.7) flush();
      cur.push(t);
      prev = l;
    }
    if (cur.length) flush();
    return paras;
  }

  async function extractPdf(file, progress) {
    const lib = await loadPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = lib.getDocument({
      data,
      wasmUrl: url('vendor/pdfjs/wasm/'),
      cMapUrl: url('vendor/pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: url('vendor/pdfjs/standard_fonts/'),
      iccUrl: url('vendor/pdfjs/iccs/'),
      isEvalSupported: false,
      enableXfa: false,
    });
    const pdf = await task.promise;
    const out = { pageCount: pdf.numPages, paragraphs: [], ocrPages: [], warnings: [] };
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        progress?.(`page ${p} of ${pdf.numPages}`);
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        let paras = pageParagraphs(tc.items, p, out.paragraphs.length);
        const chars = paras.reduce((n, x) => n + x.text.length, 0);
        if (chars < OCR_MIN_CHARS) {
          progress?.(`page ${p} of ${pdf.numPages} (scanned, reading with OCR)`);
          const viewport = page.getViewport({ scale: 2.2 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
          const text = await ocr(canvas, (pct) => progress?.(`page ${p} of ${pdf.numPages} (OCR ${pct}%)`));
          paras = paragraphsFromText(text, p, out.paragraphs.length);
          out.ocrPages.push(p);
          canvas.width = canvas.height = 0;
        }
        out.paragraphs.push(...paras);
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
    if (out.ocrPages.length) out.warnings.push(`OCR was used on page${out.ocrPages.length === 1 ? '' : 's'} ${out.ocrPages.join(', ')}. OCR can misread characters; check those flags against the original.`);
    return out;
  }

  /* ---------------- DOCX (zip + XML, no library) ---------------- */

  async function unzipEntry(buf, wanted) {
    const dv = new DataView(buf);
    // End of central directory record: search backwards for its signature.
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This .docx file is damaged (not a valid zip).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      if (name === wanted) {
        const lNameLen = dv.getUint16(localOff + 26, true);
        const lExtraLen = dv.getUint16(localOff + 28, true);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const bytes = new Uint8Array(buf, start, csize);
        if (method === 0) return dec.decode(bytes);
        if (method !== 8) throw new Error('This .docx uses an unsupported compression method.');
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).text();
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  }

  async function extractDocx(file) {
    const xml = await unzipEntry(await file.arrayBuffer(), 'word/document.xml');
    if (!xml) throw new Error('This .docx file has no document body.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const paragraphs = [];
    let page = 1;
    for (const p of body ? body.getElementsByTagNameNS(W, 'p') : []) {
      let text = '';
      let breaksAfter = 0;
      const walk = (node) => {
        for (const n of node.childNodes) {
          if (n.nodeType !== 1) continue;
          if (n.namespaceURI === W) {
            if (n.localName === 't') text += n.textContent;
            else if (n.localName === 'tab') text += '\t';
            else if (n.localName === 'br' || n.localName === 'cr') {
              if (n.getAttributeNS(W, 'type') === 'page') breaksAfter++;
              else text += ' ';
            } else if (n.localName === 'lastRenderedPageBreak') {
              if (text.trim()) breaksAfter++; else page++;
            } else if (n.localName !== 'p') walk(n); // nested paragraphs (text boxes) are visited on their own
          }
        }
      };
      walk(p);
      const clean = text.replace(/\s+/g, ' ').trim();
      if (clean) paragraphs.push({ index: paragraphs.length, page, text: clean });
      page += breaksAfter;
    }
    return { pageCount: page, paragraphs, ocrPages: [], warnings: [] };
  }

  /* ---------------- OCR ---------------- */

  let tesseractLoad = null;
  let ocrWorker = null;
  let ocrProgress = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(s);
    });
  }

  async function getOcrWorker() {
    if (location.protocol === 'file:') {
      throw new Error('OCR needs the installed app or the helper (http://127.0.0.1:8517). The copy opened straight from the SSD (file://) can\'t run it.');
    }
    if (!tesseractLoad) tesseractLoad = loadScript(url('vendor/tesseract/tesseract.min.js'));
    await tesseractLoad;
    if (!ocrWorker) {
      ocrWorker = root.Tesseract.createWorker('eng', 1, {
        workerPath: url('vendor/tesseract/worker.min.js'),
        corePath: url('vendor/tesseract/core'),
        langPath: url('vendor/tesseract/lang'),
        workerBlobURL: false, // load the worker from this site (the page's security policy forbids blob: workers)
        gzip: true,
        cacheMethod: 'none', // never store anything in browser storage
        logger: (m) => { if (m.status === 'recognizing text' && ocrProgress) ocrProgress(Math.round(m.progress * 100)); },
      });
      ocrWorker.catch(() => { ocrWorker = null; });
    }
    return ocrWorker;
  }

  async function ocr(image, onPct) {
    const worker = await getOcrWorker();
    ocrProgress = onPct;
    try {
      const { data } = await worker.recognize(image);
      return data.text || '';
    } finally {
      ocrProgress = null;
    }
  }

  async function extractImage(file, progress) {
    const text = await ocr(file, (pct) => progress?.(`OCR ${pct}%`));
    return {
      pageCount: 1,
      paragraphs: paragraphsFromText(text, 1),
      ocrPages: [1],
      warnings: ['This is a photo or scan read with OCR. OCR can misread characters; check its flags against the original.'],
    };
  }

  /* ---------------- entry point ---------------- */

  async function extract(file, name, progress) {
    const kind = kindOf(name);
    if (!kind) throw new Error(supportMessage(name));
    let result;
    if (kind === 'pdf') result = await extractPdf(file, progress);
    else if (kind === 'docx') result = await extractDocx(file);
    else if (kind === 'image') result = await extractImage(file, progress);
    else result = { pageCount: 1, paragraphs: paragraphsFromText(await file.text(), null), ocrPages: [], warnings: [] };
    if (!result.paragraphs.length) result.warnings.push('No readable text was found in this document.');
    return { name, kind, ...result };
  }

  async function shutdown() {
    if (ocrWorker) { try { (await ocrWorker).terminate(); } catch { /* ignore */ } ocrWorker = null; }
  }

  root.CVExtract = { extract, kindOf, supportMessage, paragraphsFromText, shutdown };
})(this);
