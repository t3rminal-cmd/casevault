/* CaseVault — the Supplementary Report as a PDF (Reports → Report Fields → Print / PDF, Save PDF
 * to case files, Email for E-Sign).
 *
 * Laid out like a narcotics supplementary report: case numbers across the top, boxed fields for
 * the offense, victims and offenders and the assignment, tick boxes for update information,
 * status and how cleared, the officer's report lines, the evidence inventoried, the summary of
 * investigation, and the signature and approval block. The header shows the agency from
 * Vault → My Profile; no agency's name, seal or form number is built in.
 *
 * The signature boxes are real PDF signature fields, so Adobe Acrobat / Reader (Fill & Sign,
 * Request e-signatures) and other e-sign services offer "click to sign" there.
 *
 * A small PDF writer of its own (Helvetica and Helvetica-Bold, which every PDF reader has built
 * in; lines, boxes and wrapped text), with no library and nothing fetched: it runs offline and
 * under Node for the tests.
 */
'use strict';

(function (root) {
  const F = () => (typeof module !== 'undefined' && module.exports ? require('./report-fields.js') : root.CVReportFields);

  /* ---------------- text measuring (Adobe's Helvetica metrics, 1/1000 em) ---------------- */

  const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  // Characters outside plain ASCII that WinAnsi has (quotes, dashes, bullet…), and their widths.
  const WIN = { '‘': [0x91, 222], '’': [0x92, 222], '“': [0x93, 333], '”': [0x94, 333], '•': [0x95, 350], '–': [0x96, 556], '—': [0x97, 1000], '…': [0x85, 1000], '·': [0xb7, 278], ' ': [0x20, 278], 'é': [0xe9, 556], 'ñ': [0xf1, 556], '°': [0xb0, 400], '½': [0xbd, 834] };

  function width(text, size, bold = false) {
    const t = bold ? W_BOLD : W_REG;
    let w = 0;
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      w += c >= 32 && c <= 126 ? t[c - 32] : WIN[ch] ? WIN[ch][1] : 556;
    }
    return (w * size) / 1000;
  }

  /** Lines no wider than `max` points; long words are broken. Keeps the text's own line breaks. */
  function wrap(text, size, max, bold = false) {
    const out = [];
    for (const para of String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n')) {
      const indent = /^\t+/.exec(para);
      let line = indent ? '    '.repeat(indent[0].length) : '';
      const words = para.replace(/^\t+/, '').split(/ +/);
      for (let w of words) {
        const trial = line && !/^ +$/.test(line) ? `${line} ${w}` : line + w;
        if (width(trial, size, bold) <= max) { line = trial; continue; }
        if (line.trim()) out.push(line);
        line = '';
        while (width(w, size, bold) > max) { // a word longer than the line
          let k = w.length;
          while (k > 1 && width(w.slice(0, k), size, bold) > max) k -= 1;
          out.push(w.slice(0, k));
          w = w.slice(k);
        }
        line = w;
      }
      out.push(line);
    }
    return out;
  }

  // A PDF string: WinAnsi bytes, with ( ) \ escaped.
  function pdfString(text) {
    let s = '';
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c <= 126) s += ch === '(' || ch === ')' || ch === '\\' ? `\\${ch}` : ch;
      else if (WIN[ch]) s += `\\${WIN[ch][0].toString(8).padStart(3, '0')}`;
      else if (c >= 0xa0 && c <= 0xff) s += `\\${c.toString(8).padStart(3, '0')}`;
      else s += '?';
    }
    return `(${s})`;
  }

  // Markdown marks off, for printing the summary (the Word export keeps them as formatting).
  const plain = (s) => String(s || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\+\+([^+]+)\+\+/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+/gm, '• ');

  /* ---------------- the page layout ---------------- */

  const PAGE_W = 612; const PAGE_H = 792; // US Letter
  const M = 36; // margin
  const INNER = PAGE_W - 2 * M;

  function layout(data, { agency = '', title = 'Supplementary Report', caseLabel = '', printed = '', photos: photosIn = [] } = {}) {
    const RF = F();
    const d = RF.normalize(data);
    const val = (k) => RF.shown(k, d[k]);
    const pages = [];
    let ops = null; let y = 0; let sigs = null;
    const newPage = () => {
      ops = []; sigs = [];
      pages.push({ ops, sigs, imgs: [] });
      y = PAGE_H - M;
      // Header on every page.
      text(M, y - 10, agency || '', 9, true);
      text(PAGE_W / 2 - width(title.toUpperCase(), 13, true) / 2, y - 12, title.toUpperCase(), 13, true);
      if (d.rdNumber) text(PAGE_W - M - width(`R.D. ${d.rdNumber}`, 9, true), y - 10, `R.D. ${d.rdNumber}`, 9, true);
      y -= 20;
      line(M, y, PAGE_W - M, y, 1.2);
      y -= 6;
    };
    const text = (x, yy, s, size = 9, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(s)} Tj ET`); };
    const line = (x1, y1, x2, y2, w = 0.6) => ops.push(`${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    const rect = (x, yy, w, h, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const fill = (x, yy, w, h, gray = 0.9) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
    const ensure = (h) => { if (y - h < M + 18) newPage(); };

    // A band with a section title.
    const band = (label) => {
      ensure(30);
      fill(M, y - 13, INNER, 13, 0.88);
      rect(M, y - 13, INNER, 13);
      text(M + 4, y - 9.6, label.toUpperCase(), 8, true);
      y -= 13;
    };

    // A row of labelled boxes; widths are fractions of the row. The value wraps inside its box.
    const boxes = (cells, minH = 24) => {
      const total = cells.reduce((n, c) => n + (c.w || 1), 0);
      const sizes = cells.map((c) => ((c.w || 1) / total) * INNER);
      const lines = cells.map((c, i) => wrap(c.value || '', 9, sizes[i] - 8));
      const h = Math.max(minH, 13 + Math.max(...lines.map((l) => l.length)) * 10.5);
      ensure(h);
      let x = M;
      cells.forEach((c, i) => {
        rect(x, y - h, sizes[i], h);
        text(x + 3, y - 7.5, String(c.label).toUpperCase(), 6, false);
        lines[i].forEach((l, j) => text(x + 4, y - 17.5 - j * 10.5, l, 9, false));
        if (c.sign) sigs.push({ name: c.sign, rect: [x + 2, y - h + 1, x + sizes[i] - 2, y - 9] });
        x += sizes[i];
      });
      y -= h;
    };
    const cell = (k, w = 1, label) => ({ label: label || RF.FIELDS.find(([key]) => key === k)[1], value: val(k), w });

    // Tick boxes in a row.
    const ticks = (items, perRow) => {
      const cw = INNER / perRow;
      for (let i = 0; i < items.length; i += perRow) {
        ensure(15);
        rect(M, y - 15, INNER, 15);
        items.slice(i, i + perRow).forEach((it, j) => {
          const x = M + j * cw + 5;
          rect(x, y - 11.5, 8, 8);
          if (it.on) { line(x + 1.5, y - 10, x + 6.5, y - 5); line(x + 1.5, y - 5, x + 6.5, y - 10); }
          text(x + 12, y - 10.3, it.label, 8);
        });
        y -= 15;
      }
    };

    // "LABEL:  value" lines, the value wrapping on the right.
    const labelled = (label, value) => {
      const lw = 190;
      const lines = wrap(value || '', 9, INNER - lw - 8);
      const labels = wrap(`${label.toUpperCase()}:`, 7.5, lw - 12, true);
      const h = Math.max(15, 5 + Math.max(lines.length * 11, labels.length * 9.5));
      ensure(h);
      labels.forEach((l, j) => text(M + 3, y - 10.5 - j * 9.5, l, 7.5, true));
      lines.forEach((l, j) => text(M + lw, y - 10.5 - j * 11, l, 9));
      line(M + lw - 3, y - h + 1, PAGE_W - M, y - h + 1, 0.4);
      y -= h;
    };

    newPage();
    const on = (id) => !RF.isHidden(d, id); // parts ticked off as "doesn't apply" are left out

    // A list (victims, charges, vehicles…): one numbered block of boxes per entry, two fields a row
    // (a wide field takes the whole row), so every box lines up.
    const listBlock = (key) => {
      const L = RF.LISTS[key];
      const items = d[key].filter(RF.filled);
      if (!items.length) return;
      ensure(40);
      text(M + 2, y - 10, L.title.toUpperCase(), 7.5, true);
      y -= 13;
      items.forEach((it, i) => {
        // A narcotic's unit goes with its amount, so its four boxes fill one row (v1.25).
        const cellsOf = L.fields.filter(([k]) => !(key === 'narcotics' && k === 'unit')).map(([k, label, kind]) => (
          { label: `${L.item} ${i + 1} - ${RF.labelFor(it, k, label)}`, value: RF.valueText(key, it, k, kind), wide: kind === 'wide' }));
        const row = [];
        // Short rows are filled out with empty boxes so the four columns always line up.
        const flush = () => { if (row.length) { while (row.length < 4) row.push({ label: '', value: '' }); boxes(row.splice(0).map((c) => ({ ...c, w: 1 }))); } };
        for (const c of cellsOf) {
          if (c.wide) { flush(); boxes([{ ...c, w: 1 }]); continue; }
          row.push(c);
          if (row.length === 4) flush();
        }
        flush();
        y -= 3;
      });
    };

    // ---- case numbers
    if (on('numbers')) {
      boxes([cell('caseNumber', 1.3), cell('eventNumber'), cell('incidentNumber'), cell('raidNumber'), cell('rdNumber')]);
      boxes([{ label: 'Case', value: caseLabel, w: 2.6 }, cell('activity', 1.4)]);
      y -= 6;
    }

    // ---- offense
    if (on('offense')) {
      band('Offense');
      boxes([cell('offense', 3.3), cell('ucr', 1.4)]);
      boxes([cell('address', 2.4), cell('locationType', 1.5), cell('locationCode', 1.1)]);
      boxes([cell('reclass', 3.3), cell('revisedUcr', 1.4)]);
      boxes([cell('date'), cell('time'), cell('beatOccurrence'), cell('beatAssigned')]);
      y -= 6;
    }

    // ---- victims and offenders
    if (on('people')) {
      band('Victims and Offenders');
      boxes([cell('victims'), cell('offenders'), cell('arrested'), cell('methodCode')]);
      y -= 4;
      listBlock('victimsList');
      listBlock('offendersList');
      y -= 4;
    }

    // ---- assignment
    if (on('assignment')) {
      band('Assignment');
      boxes([cell('method', 1.2), cell('unit', 0.9), cell('safeMethod', 1), cell('residence', 1.8)]);
      boxes([cell('arrestUnit', 1.2), cell('adults', 0.8), cell('juveniles', 0.8), cell('fire', 0.7), cell('gang', 0.9)]);
      y -= 6;
    }

    // ---- update information, status, how cleared
    if (on('update')) {
      band('Update Information');
      ticks(['victimVerified', 'offenderVerified', 'propertyVerified', 'circumstancesVerified', 'victimUpdated', 'offenderUpdated', 'propertyUpdated', 'circumstancesUpdated']
        .map((k) => ({ label: RF.FIELDS.find(([key]) => key === k)[1], on: !!d[k] })), 4);
      const opt = (k) => RF.FIELDS.find(([key]) => key === k)[3].filter(Boolean);
      band('Status');
      ticks(opt('status').map((o) => ({ label: o, on: d.status === o })), 8);
      band('How Cleared');
      ticks(opt('cleared').map((o) => ({ label: o, on: d.cleared === o })), 5);
      y -= 6;
    }

    // ---- officer's report
    if (on('report')) {
      band(`Officer's Report${d.activity ? ` - ${d.activity}` : ''}`);
      const report = RF.SECTIONS.find((s) => s.id === 'report').fields;
      for (const [k, label, kind] of report) {
        if (kind === 'list') {
          if (on('evidence')) labelled('Evidence Inventoried', d.evidence.length ? d.evidence.map((e) => `Exhibit ${e.number}${e.inventory ? ` - Inv. ${e.inventory}` : ''}`).join(', ') : '');
          if (d[k].some(RF.filled)) { y -= 4; listBlock(k); }
          continue;
        }
        if (k === 'courtDate' || RF.isHidden(d, k)) continue;
        labelled(label, k === 'courtBranch' ? [val('courtBranch'), val('courtDate')].filter(Boolean).join(', ') : val(k));
      }
      y -= 6;
      for (const key of RF.SECTIONS.find((s) => s.id === 'report').lists) listBlock(key);
      y -= 4;
    }

    // ---- evidence inventoried
    if (on('evidence')) {
      band('Evidence Inventoried');
      const cols = [['Exhibit', 46], ['Inventory No.', 76], ['Type', 88], ['Narcotic Type', 88], ['Weight', 52]];
      const descW = INNER - cols.reduce((n, [, w]) => n + w, 0);
      const head = () => {
        ensure(14);
        let x = M;
        for (const [l, w] of [...cols, ['Description', descW]]) { fill(x, y - 13, w, 13, 0.95); rect(x, y - 13, w, 13); text(x + 3, y - 9.3, l.toUpperCase(), 6.5, true); x += w; }
        y -= 13;
      };
      head();
      if (!d.evidence.length) { rect(M, y - 15, INNER, 15); text(M + 4, y - 10.5, 'None.', 9); y -= 15; }
      for (const e of d.evidence) {
        const vals = [String(e.number), e.inventory, e.type, e.type === 'Narcotics' ? e.drug : '', e.type === 'Narcotics' ? e.weight : ''];
        const desc = wrap(`${e.description}${e.photos && e.photos.length ? `${e.description ? ' ' : ''}[Photo${e.photos.length === 1 ? '' : 's'} ${e.photos.map((_, j) => RF.photoLabel(e.number, j)).join(', ')} attached]` : ''}`, 9, descW - 8);
        const small = vals.map((v, i) => wrap(v, 9, cols[i][1] - 6));
        const h = Math.max(15, 5 + Math.max(desc.length, ...small.map((l) => l.length)) * 11);
        if (y - h < M + 18) { newPage(); head(); }
        let x = M;
        small.forEach((ls, i) => { rect(x, y - h, cols[i][1], h); ls.forEach((l, j) => text(x + 3, y - 10.5 - j * 11, l, 9)); x += cols[i][1]; });
        rect(x, y - h, descW, h);
        desc.forEach((l, j) => text(x + 4, y - 10.5 - j * 11, l, 9));
        y -= h;
      }
      y -= 8;
    }

    // ---- summary of investigation
    if (on('summary')) {
      band('Summary of Investigation');
      const summary = wrap(plain(d.narrative) || '', 10, INNER - 12);
      let top = y;
      const closeBox = () => { if (top > y) rect(M, y - 4, INNER, top - y + 4); };
      y -= 4;
      for (const l of (summary.length ? summary : [''])) {
        if (y - 13 < M + 18) { closeBox(); newPage(); top = y; y -= 4; }
        text(M + 6, y - 10, l, 10);
        y -= 13;
      }
      closeBox();
      y -= 12;
    }

    // ---- submission and approval (kept together on one page)
    if (on('approval')) {
      ensure(4 * 38 + 30);
      band('Submission and Approval');
      // One row per officer, the same columns each time: name, star, date, time, signature.
      const officer = (name, star, date, time, label, sign) => boxes([cell(name, 2, label), cell(star, 0.7, 'Star'), cell(date, 1, 'Date'), cell(time, 0.7, 'Time'), { label: 'Signature', value: '', w: 2.2, sign }], 36);
      officer('reportingOfficer', 'reportingStar', 'dateSubmitted', 'timeSubmitted', 'Reporting Officer - Print', 'ReportingOfficerSignature');
      officer('secondOfficer', 'secondStar', 'secondDate', 'secondTime', 'Secondary Reporting Officer', 'SecondOfficerSignature');
      officer('supervisor', 'supervisorStar', 'dateApproved', 'timeApproved', 'Supervisor Approval', 'SupervisorSignature');
      boxes([cell('extraCopies', 2.7, 'Extra Copies Required'), { label: 'Note', value: 'Sign in blue ink or with an electronic signature.', w: 3.9 }]);
    }

    // ---- Exhibit Attachments: the exhibit photos, two to a portrait page, each as large as fits,
    // with its exhibit line under it.
    const photos = on('evidence') ? (photosIn || []) : [];
    for (let i = 0; i < photos.length; i += 2) {
      newPage();
      band('Exhibit Attachments');
      y -= 6;
      const slotH = (y - (M + 18)) / 2;
      photos.slice(i, i + 2).forEach((ph, j) => {
        const top = y - j * slotH;
        const cap = wrap(ph.caption || '', 9, INNER - 8).slice(0, 3);
        const capH = cap.length * 11 + 8;
        const boxH = slotH - capH - 10;
        const k = Math.min((INNER - 12) / ph.w, (boxH - 12) / ph.h);
        const w = ph.w * k; const hgt = ph.h * k;
        rect(M, top - boxH, INNER, boxH);
        const x = M + (INNER - w) / 2; const yy = top - boxH + (boxH - hgt) / 2;
        ops.push(`q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${x.toFixed(2)} ${yy.toFixed(2)} cm /Im${ph.index} Do Q`);
        pages[pages.length - 1].imgs.push(ph.index);
        cap.forEach((l, n) => text(M + 4, top - boxH - 12 - n * 11, l, 9, n === 0));
      });
    }

    // Footer with page numbers.
    pages.forEach((p, i) => {
      const f = `${caseLabel ? `${caseLabel}  ·  ` : ''}${printed ? `Printed ${printed}  ·  ` : ''}Page ${i + 1} of ${pages.length}`;
      p.ops.push(`BT /F1 7.5 Tf ${(PAGE_W - M - width(f, 7.5)).toFixed(2)} ${(M - 12).toFixed(2)} Td ${pdfString(f)} Tj ET`);
    });
    return pages;
  }

  /* ---------------- the PDF file ---------------- */

  /** -> Uint8Array: the report as a PDF. opts: { agency, title, caseLabel, printed } */
  function build(data, opts = {}) {
    // Photos (JPEG bytes) become image objects; the layout refers to them as /Im0, /Im1…
    // With Evidence left out, no photos go in the file at all.
    const evidenceOff = Array.isArray(data && data.hidden) && data.hidden.includes('evidence');
    const photos = evidenceOff ? [] : (opts.photos || []).map((p, index) => ({ ...p, index }));
    const pages = layout(data, { ...opts, photos });
    const objs = []; // index = object number - 1
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null); const pagesObj = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgObj = photos.map((p) => {
      let bin = '';
      for (let i = 0; i < p.jpeg.length; i += 0x8000) bin += String.fromCharCode.apply(null, p.jpeg.subarray(i, i + 0x8000));
      return add(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n${bin}\nendstream`);
    });
    const kids = []; const fields = [];
    for (const p of pages) {
      const content = p.ops.join('\n');
      const cs = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const pageNum = objs.length + 1 + p.sigs.length;
      const annots = p.sigs.map((s) => add(`<< /Type /Annot /Subtype /Widget /FT /Sig /T ${pdfString(s.name)} /TU ${pdfString('Sign here')} /F 4 /Rect [${s.rect.map((n) => n.toFixed(2)).join(' ')}] /P ${pageNum} 0 R >>`));
      fields.push(...annots);
      const pg = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${p.imgs.length ? ` /XObject << ${p.imgs.map((n) => `/Im${n} ${imgObj[n]} 0 R`).join(' ')} >>` : ''} >> /Contents ${cs} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`);
      kids.push(pg);
    }
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R${fields.length ? ` /AcroForm << /Fields [${fields.map((a) => `${a} 0 R`).join(' ')}] /SigFlags 1 >>` : ''} >>`;
    const info = add(`<< /Title ${pdfString(opts.title || 'Supplementary Report')} /Creator (CaseVault) /Producer (CaseVault) >>`);

    let out = '%PDF-1.7\n%âãÏÓ\n';
    const offsets = [];
    objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  const api = { build, layout, wrap, width, pdfString, plain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReportPdf = api;
})(this);
