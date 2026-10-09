/* CaseVault — the Supplementary Report as a PDF (Reports → Report Fields → Print / PDF, Save PDF
 * to case files, Email for E-Sign).
 *
 * v1.43: laid out like a narcotics division supplementary report form, in Times: the title and
 * the R.D. Number box, a ruled grid with small labels (offense, occurrence, victims,
 * offenders, assignment), Update Information tick boxes, Status and How Cleared with a round mark
 * under each choice, the event / incident / raid / R.D. numbers, the officer's report as
 * "LABEL:" lines (lists one entry a line), the summary of investigation, and the signature table.
 * Pages without the signature table end with "Preparer" and "Approval" initial boxes. The header
 * shows the agency from Vault → My Profile; no agency's name, seal or form number is built in.
 *
 * The signature boxes are real PDF signature fields, so Adobe Acrobat / Reader (Fill & Sign,
 * Request e-signatures) and other e-sign services offer "click to sign" there.
 *
 * A small PDF writer of its own (Helvetica or Times, which every PDF reader has built in; lines,
 * boxes, circles and wrapped text), with no library and nothing fetched: it runs offline and
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

  // Times-Roman and Times-Bold (v1.43, for the Supplementary Report).
  const T_REG = [250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541];
  const T_BOLD = [250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500, 930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778, 611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500, 333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500, 556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520];

  function width(text, size, bold = false, face = 'helvetica') {
    const t = face === 'times' ? (bold ? T_BOLD : T_REG) : (bold ? W_BOLD : W_REG);
    let w = 0;
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      w += c >= 32 && c <= 126 ? t[c - 32] : WIN[ch] ? WIN[ch][1] : 500;
    }
    return (w * size) / 1000;
  }

  const widthOf = (s, z, b, f) => width(s, z, b, f);
  /** Lines no wider than `max` points; long words are broken. Keeps the text's own line breaks. */
  function wrap(text, size, max, bold = false, face = 'helvetica') {
    const width = (s, z, b) => widthOf(s, z, b, face);
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

  function layout(data, { agency = '', title = F().titleFor(data), caseLabel = '', printed = '', photos: photosIn = [], lh = null } = {}) {
    const RF = F();
    const d = RF.normalize(data);
    const val = (k) => RF.shown(k, d[k]);
    const on = (id) => !RF.isHidden(d, id); // parts ticked off as "doesn't apply" are left out
    const tw = (s, size, bold = false) => width(s, size, bold, 'times');
    const twrap = (s, size, max, bold = false) => wrap(s, size, max, bold, 'times');
    const labelOf = (k) => (RF.FIELDS.find(([key]) => key === k) || [k, k])[1];
    const pages = [];
    const BOTTOM = M + 44; // room for the initial boxes and the footer
    let ops = null; let y = 0; let sigs = null;

    const text = (x, yy, s, size = 10, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(s)} Tj ET`); };
    const center = (x, w, yy, s, size, bold) => text(x + (w - tw(s, size, bold)) / 2, yy, s, size, bold);
    const line = (x1, y1, x2, y2, w = 0.6) => ops.push(`${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    const rect = (x, yy, w, h, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const fill = (x, yy, w, h, gray = 0.9) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
    const circle = (cx, cy, r, filled) => {
      const k = 0.5523 * r;
      ops.push(`0.6 w ${(cx + r).toFixed(2)} ${cy.toFixed(2)} m ${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c ${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c ${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c ${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c ${filled ? 'B' : 'S'}`);
    };
    const tick = (x, yy, on2) => { rect(x, yy, 7, 7, 0.5); if (on2) { line(x + 1.3, yy + 1.3, x + 5.7, yy + 5.7, 0.8); line(x + 1.3, yy + 5.7, x + 5.7, yy + 1.3, 0.8); } };

    // The numbers line, at the top of every page after the first (as on the form's second page).
    const numbersLine = () => [['EVENT NUMBER', d.eventNumber], ['INCIDENT NUMBER', d.incidentNumber], ['RAID NUMBER', d.raidNumber], ['R.D. NUMBER', d.rdNumber]];
    // The four numbers across the page: each label, then its value; the space left over is shared
    // out, and a long value gets a smaller size rather than running into the next label.
    const numbersRow = (yy, shaded) => {
      const parts = numbersLine().map(([l, v]) => ({ l: `${l}:`, v: v || '', lw: tw(`${l}:`, 8.5, true) }));
      const need = parts.map((p) => p.lw + 6 + Math.max(tw(p.v, 9.5), 30) + 10);
      const spare = Math.max(0, INNER - need.reduce((a, b) => a + b, 0)) / parts.length;
      let x = M;
      parts.forEach((p, i) => {
        const room = need[i] + spare - p.lw - 16;
        const size = Math.max(6.5, Math.min(9.5, (9.5 * room) / Math.max(1, tw(p.v, 9.5))));
        text(x + 1, yy, p.l, 8.5, true);
        if (shaded) fill(x + p.lw + 5, yy - 3, room + 4, 13, 0.93);
        text(x + p.lw + 7, yy + 0.5, p.v, size);
        x += need[i] + spare;
      });
    };
    const newPage = () => {
      ops = []; sigs = [];
      pages.push({ ops, sigs, imgs: [], signed: false });
      y = PAGE_H - M;
      if (pages.length === 1) {
        // v1.85: the department letterhead across the top, when there is one.
        if (lh) { y -= letterhead(ops, lh, M, y, INNER, 'times'); if (lh.logo) pages[0].imgs.push(lh.logo.index); }
        // Title on the left, the agency under it; the R.D. Number in a box on the right (v1.48).
        text(M, y - 14, title, 14, true);
        if (agency && !(lh && lh.header)) text(M, y - 25, agency.toUpperCase(), 7.5, true);
        const bw = (INNER / 8) * 2;
        fill(PAGE_W - M - bw, y - 10.5, bw, 10.5, 0.9);
        rect(PAGE_W - M - bw, y - 30, bw, 30, 0.9);
        text(PAGE_W - M - bw + 3, y - 8, 'R.D. Number', 7);
        if (on('numbers') && d.rdNumber) text(PAGE_W - M - bw + 6, y - 23, d.rdNumber, 11, true);
        y -= 36;
      } else {
        numbersRow(y - 10, false);
        y -= 16;
        line(M, y, PAGE_W - M, y, 0.8);
        y -= 8;
      }
    };
    const ensure = (h) => { if (y - h < BOTTOM) newPage(); };

    // A band with a section title (Exhibit Attachments).
    const band = (label) => {
      ensure(30);
      fill(M, y - 13, INNER, 13, 0.88);
      rect(M, y - 13, INNER, 13);
      text(M + 4, y - 9.6, label.toUpperCase(), 8, true);
      y -= 13;
    };

    // A ruled row of the grid: each cell has its small label, a dashed rule, then the value.
    const grid = (cells, minH = 27) => {
      const total = cells.reduce((n, c) => n + (c.w || 1), 0);
      const sizes = cells.map((c) => ((c.w || 1) / total) * INNER);
      const lines = cells.map((c, i) => twrap(c.value || '', 10, sizes[i] - 8));
      // v1.45: every label on one line (a long one in smaller type), so the boxes in a row line up.
      const labSize = cells.map((c, i) => { let z = 7.5; while (z > 5.5 && tw(c.label || '', z) > sizes[i] - 4) z -= 0.25; return z; });
      const labs = cells.map((c) => [c.label || '']);
      const lh = 11;
      const h = Math.max(minH, lh + 4 + Math.max(...lines.map((l) => l.length)) * 11.5);
      ensure(h);
      let x = M;
      cells.forEach((c, i) => {
        // v1.50: the label sits on a light grey band across the top of the box and the value is on
        // white under it (v1.44 to v1.49 shaded the value instead).
        fill(x, y - lh - 1, sizes[i], lh + 1, 0.9);
        rect(x, y - h, sizes[i], h, 0.6);
        labs[i].forEach((l, j) => text(x + 2, y - 7.5 - j * 8, l, labSize[i]));
        lines[i].forEach((l, j) => text(x + 4, y - lh - 10 - j * 11.5, l, 10));
        x += sizes[i];
      });
      y -= h;
    };
    const g = (k, w = 1, label) => ({ label: label || labelOf(k), value: val(k), w });

    // "LABEL:  value" lines of the officer's report; the value wraps on the right, over a light rule.
    const LW = (INNER / 8) * 3; // v1.45: the label column is three grid columns wide
    const VW = INNER - LW - 8; // v1.81: the value column's width
    const labelled = (label, value) => {
      // A value is text, or a list of entries; an entry { head, tail } has its name in bold on a
      // line of its own and the details under it, with a little space between entries (v1.44).
      const vals = Array.isArray(value) ? value : [value || ''];
      const rows = [];
      vals.forEach((v, n) => {
        if (n && !(v && v.noGap)) rows.push({ gap: 4 });
        // v1.81: rows laid out in columns: { rows: [[{ t, x, w, bold }, …], …] } (x and w are
        // fractions of the value column); each cell wraps in its own width.
        if (v && Array.isArray(v.rows)) {
          for (const cells of v.rows) {
            if (cells.gap) { rows.push({ gap: cells.gap }); continue; }
            const laid = cells.filter((c) => c && String(c.t || '').trim()).map((c) => ({ ...c, lines: twrap(String(c.t), c.size || 10, Math.max(20, (c.w || 1) * VW - 6), !!c.bold) }));
            if (!laid.length) continue;
            const n2 = Math.max(...laid.map((c) => c.lines.length));
            for (let j = 0; j < n2; j++) rows.push({ cells: laid.map((c) => ({ t: c.lines[j] || '', x: c.x || 0, bold: !!c.bold, size: c.size || 10 })) });
          }
          return;
        }
        if (v && typeof v === 'object') {
          for (const l of twrap(v.head || '', 10, INNER - LW - 8, true)) rows.push({ t: l, bold: true });
          for (const l of twrap(v.tail || '', 10, INNER - LW - 18)) rows.push({ t: l, indent: 8 });
        } else for (const l of twrap(v, 10, INNER - LW - 8)) rows.push({ t: l });
      });
      const labels = label ? twrap(`${label.toUpperCase()}:`, 8.5, LW - 14) : []; // v1.81: '' continues the block above
      const bodyH = rows.reduce((n, r) => n + (r.gap || 12), 0);
      const h = Math.max(17, 5 + Math.max(bodyH, labels.length * 10));
      ensure(h);
      fill(M + LW, y - h + 2, INNER - LW, h - 3, 0.93);
      labels.forEach((l, j) => text(M + 2, y - 11 - j * 10, l, 8.5));
      let yy = y - 11;
      for (const r of rows) {
        if (r.gap) { yy -= r.gap; continue; }
        if (r.cells) { for (const c of r.cells) text(M + LW + 4 + c.x * VW, yy, c.t, c.size, c.bold); yy -= 12; continue; }
        text(M + LW + 4 + (r.indent || 0), yy, r.t, 10, !!r.bold); yy -= 12;
      }
      y -= h;
    };
    // A group of lines ends with a little space, so the report reads in blocks.
    const groupGap = () => { y -= 5; };
    const items = (key) => d[key].filter(RF.filled).map((it) => {
      // A bill on one line: "$20 - Serial AA00000001A - Not Recovered".
      if (key === 'funds') return RF.itemLine('funds', it); // v1.54: "$20 x 3 - Serial Numbers …"
      const line = RF.itemLine(key, it);
      // People: the name on its own line in bold, the details under it.
      if (['offendersList', 'victimsList', 'notArrested', 'personnel'].includes(key) && it.name) {
        const tail = line.startsWith(it.name) ? line.slice(it.name.length).replace(/^,\s*/, '') : line;
        return { head: it.name, tail };
      }
      return line;
    });

    // v1.81: the report's own layouts (offender sheet, personnel table, charges, exhibits), in columns.
    const kindIn = (list, k) => ((RF.LISTS[list].fields.find(([key]) => key === k) || [])[2]);
    const vt = (list, it, k) => RF.valueText(list, it, k, kindIn(list, k));
    const col = (t, x, w, bold = false) => ({ t, x, w, bold });
    const lv = (label, v) => (v ? `${label}: ${v}` : '');
    const today0 = new Date().toISOString().slice(0, 10);
    const offenderBlock = (o) => {
      const f = (k) => vt('offendersList', o, k);
      const lab = (k, l) => RF.labelFor(o, k, l);
      const age = f('age') || (o.dob && RF.ageOn ? String(RF.ageOn(o.dob, /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : today0) || '') : '');
      const aka = (Array.isArray(o.socials) ? o.socials : []).map((x) => String((x && x.name) || '').trim()).filter(Boolean).join(', ');
      const hair = [f('hair'), f('hairStyle')];
      const rows = [
        o.custody ? [col(o.custody, 0, 1, true)] : null,
        [col(lv('Name', f('name')), 0, 0.55), col(lv('A.K.A', aka), 0.56, 0.44)],
        [col([f('gender'), f('race'), age ? (o.unknown ? `Age Range: ${age}` : `${age} years`) : ''].filter(Boolean).join(' | '), 0, 1)],
        [col(lv(lab('height', 'Height'), f('height')), 0, 0.4), col(lv(lab('weight', 'Weight'), f('weight')), 0.42, 0.58)],
        [col(lv('DOB', f('dob')), 0, 0.4), col(lv('Eyes', f('eyes')), 0.42, 0.24), col(lv(hair[0] && hair[1] ? 'Hair|Style' : hair[1] ? 'Hair Style' : 'Hair', hair.filter(Boolean).join('|')), 0.66, 0.34)],
        [col(lv('Complexion', f('complexion')), 0, 0.4), col(lv('Tattoos|Scars', f('marks')), 0.42, 0.58)],
        [col(lv('Gender Identity', f('identity')), 0, 0.4), col(lv('Relation', f('relation')), 0.42, 0.24), col(lv('Veteran', f('veteran')), 0.66, 0.34)],
        [col(lv('Wearing', f('clothing')), 0, 1)],
        [col(lv('Residence', f('address')), 0, 1)],
        [col(lv('Phone', f('phones')), 0, 1)],
        [col(lv('IR', f('irNumber')), 0, 0.4), col(lv('CB', f('cbNumber')), 0.42, 0.58)],
        [col(lv('FBI', f('fbiNumber')), 0, 0.4), col(lv('IDOC', f('idocNumber')), 0.42, 0.58)],
        // v1.82: No Vehicle; v1.94: one line per offender vehicle (year make model, color, plate, VIN, owner, Impounded / Towed / DNA).
        ...(o.noVehicle ? [] : (Array.isArray(o.vehicles) ? o.vehicles : []).map(RF.vehicleLine).filter(Boolean).map((t, j, all) => [col(lv(all.length > 1 ? `Vehicle ${j + 1}` : 'Vehicle', t), 0, 1)])),
      ].filter(Boolean);
      return { rows };
    };
    const personnelBlock = (list) => {
      const C = [[0, 0.45], [0.47, 0.14], [0.62, 0.14], [0.77, 0.23]];
      const row = (vals, bold) => vals.map((v, i) => col(v, C[i][0], C[i][1], bold));
      return { rows: [row(['Name:', 'Star:', 'Unit:', 'Role:'], true), ...list.map((p) => row([p.name, p.star, p.unit, p.role].map((x) => String(x || '').trim()), false))] };
    };
    const chargeBlock = (c) => ({ rows: [[col(String(c.statute || '').trim(), 0, 1)], [col(String(c.description || '').trim(), 0, 1)]] });
    // v1.86: money with a dollar sign ("100" -> "$100"); a whole-dollar bill as "$20.00".
    const money = (v) => { const t = String(v || '').trim(); return /^\d/.test(t) ? `$${t}` : t; };
    const bill = (v) => { const t = String(v || '').trim(); return /^\$\d+$/.test(t) ? `${t}.00` : t; };
    // A State of Illinois victim, its Relation Code (024, v1.93) and the officer on one line; any other victim, the name in bold
    // and the details under it.
    const victimBlock = (v, line) => (RF.isStateVictim('victimsList', v)
      ? { rows: [[col(String(v.name || '').trim(), 0, 0.21), col(lv('Relation Code', String(v.relation || '').trim()), 0.23, 0.27), col(lv('Officer Name', String(v.officer || '').trim()), 0.52, 0.48)]] }
      : line);
    // A narcotic: the type, the amount, then Street Value and Purchase Price under each other.
    const narcoticBlock = (n) => {
      const value = money(n.value); const price = money(n.price);
      return { rows: [
        [col(String(n.drug || '').trim(), 0, 0.34), col(vt('narcotics', n, 'amount'), 0.35, 0.22), col(value ? `Street Value - ${value}` : '', 0.58, 0.42)],
        price ? [col(`Purchase Price - ${price}`, 0.58, 0.42)] : [],
      ] };
    };
    // Pre-Recorded Funds as a table: QTY (two digits), Denomination, then each serial number on
    // its own line; Recovered or Not Recovered once at the end.
    const fundsBlock = () => {
      const gs = d.funds.filter(RF.filled);
      if (!gs.length) return null;
      const C = [[0, 0.16], [0.18, 0.3], [0.5, 0.5]];
      const row = (vals, bold) => vals.map((v, i) => col(v, C[i][0], C[i][1], bold));
      const rows = [row(['QTY', 'Denomination', gs.some((g) => g.denomination === 'Electronic Funds') ? 'Serial / Reference Number' : 'Serial Number'], true)];
      for (const g of gs) {
        const serials = (g.serials || []).map((x) => String(x || '').trim()).filter(Boolean);
        const n = String(g.quantity || '').trim() || (serials.length ? String(serials.length) : '');
        rows.push(row([/^\d$/.test(n) ? `0${n}` : n, bill(g.denomination), serials[0] || '']));
        for (const x of serials.slice(1)) rows.push(row(['', '', x]));
      }
      if (d.fundsRecovered) rows.push(row(['', d.fundsRecovered, '']));
      return { rows };
    };
    const exhibitBlock = (head, inv, type, desc) => ({ rows: [[col(head, 0, 0.46, true), col('Description', 0.48, 0.52, true)], [col(inv, 0, 0.21), col(type, 0.22, 0.25), col(desc || '—', 0.48, 0.52)]] });
    const exhibits = () => {
      const out = d.evidence.map((e) => {
        const drug = e.type === 'Narcotics' ? [e.drug, e.weight].filter(Boolean).join(', ') : '';
        const desc = [String(e.description || '').trim(), drug && !String(e.description || '').toLowerCase().includes(String(e.drug || '').toLowerCase()) ? drug : ''].filter(Boolean).join(' - ');
        return exhibitBlock(`Exhibit ${e.number}`, e.inventory || '', e.type || '', desc);
      });
      for (const x of d.extraExhibits || []) {
        const kind = x.kind === 'texts' ? 'Text Messages' : 'Photograph';
        if (!x.photos.length) out.push(exhibitBlock(`Exhibit ${x.number}`, '', kind, [x.title, x.description].filter(Boolean).join('. ')));
        x.photos.forEach((_, j) => out.push(exhibitBlock(`Exhibit ${RF.photoLabel(x.number, j)}`, '', kind, String((x.photoLabels || [])[j] || '').trim() || [x.title, x.description].filter(Boolean).join('. '))));
      }
      return out;
    };
    // A block per entry, so a long list carries over to the next page; the label shows on the first.
    const blocks = (label, list) => list.forEach((b, i) => { if (i) y -= 3; labelled(i ? '' : label, [b]); });

    newPage();

    // ---- the grid (v1.45: every row on the same eight columns, so the lines run straight down)
    if (on('offense')) {
      grid([g('offense', 4), g('ucr', 2), g('activity', 2)]);
      grid([g('address', 4), g('locationType', 2), g('locationCode', 2)]);
      grid([g('date', 2), g('time', 2), g('beatOccurrence', 2, 'Beat of Occurrence'), g('beatAssigned', 2)]);
    }
    // ---- victims, offenders and the assignment
    const people = on('people'); const assign = on('assignment');
    if (people || assign) {
      const vs = d.victimsList.filter(RF.filled); const os = d.offendersList.filter(RF.filled);
      const one = (list) => (list.length === 1 ? list[0].name || '' : list.length ? 'See below' : '');
      const P1 = (k, w, label) => (people ? g(k, w, label) : { label: label || labelOf(k), value: '', w });
      const A1 = (k, w, label) => (assign ? g(k, w, label) : { label: label || labelOf(k), value: '', w });
      grid([P1('victims', 1, 'Victims'), { label: "Victim's Name", value: people ? one(vs) : '', w: 3 }, { label: 'Relation', value: people && vs[0] ? vs[0].relation || '' : '', w: 1 }, P1('methodCode', 1), A1('method', 1), A1('unit', 1, 'Unit')]);
      grid([P1('offenders', 1, 'Offenders'), { label: "Offender's Name", value: people ? one(os) : '', w: 3 }, { label: 'Relation', value: people && os[0] ? os[0].relation || '' : '', w: 1 }, P1('arrested', 1, 'Num Arrested'), A1('arrestUnit', 1), A1('safeMethod', 1)]);
      grid([A1('residence', 4, 'If Residence, Where'), A1('adults', 1), A1('juveniles', 1), A1('fire', 1), A1('gang', 1, 'Gang Related')]);
    }
    // ---- update information, status, how cleared
    if (on('update')) {
      ensure(16 + 2 * 15 + 34);
      fill(M, y - 14, INNER, 14, 0.9);
      rect(M, y - 14, INNER, 14, 0.6);
      center(M, INNER, y - 10, 'Update Information    *See Narrative For Updated Information', 8.5, true);
      y -= 14;
      const upd = [['victimVerified', 'offenderVerified', 'propertyVerified', 'circumstancesVerified'], ['victimUpdated', 'offenderUpdated', 'propertyUpdated', 'circumstancesUpdated']];
      for (const row of upd) {
        row.forEach((k, i) => {
          const x = M + (INNER / 4) * i;
          rect(x, y - 15, INNER / 4, 15, 0.6);
          text(x + 3, y - 10.5, labelOf(k), 9);
          tick(x + INNER / 4 - 12, y - 11.5, !!d[k]);
        });
        y -= 15;
      }
      const opts = (k) => RF.FIELDS.find(([key]) => key === k)[3].filter(Boolean);
      const split = INNER / 2; // v1.45: Status and How Cleared take half each
      const halves = [[M, split, 'Status', 'status'], [M + split, INNER - split, 'How Cleared', 'cleared']];
      rect(M, y - 34, split, 34, 0.6); rect(M + split, y - 34, INNER - split, 34, 0.6);
      for (const [x, w, head, k] of halves) {
        fill(x, y - 13, w, 13, 0.9);
        rect(x, y - 13, w, 13, 0.6);
        center(x, w, y - 9.5, head, 8.5, true);
        const list = opts(k); const cw = w / list.length;
        list.forEach((o, i) => {
          const lab = RF.shortCode(o).replace(/ - /, '-'); // v1.48: the form's short codes
          center(x + i * cw, cw, y - 20, lab, 7.5);
          tick(x + i * cw + cw / 2 - 3.5, y - 31.5, d[k] === o); // v1.81: a square with an X, like Update Information
        });
      }
      y -= 34;
    }
    // ---- event, incident, raid and R.D. numbers
    if (on('numbers')) {
      // v1.45: the four numbers as boxes on the grid, like every other row.
      // v1.48: the R.D. Number is in the box at the top; the other three share the row.
      grid([{ label: 'Event Number', value: d.eventNumber }, { label: 'Incident Number', value: d.incidentNumber }, { label: 'Raid Number', value: d.raidNumber }]);
    }
    // ---- officer's report
    if (on('report')) {
      ensure(40);
      y -= 4;
      rect(M, y - 16, INNER, 16, 0.6);
      text(M + 4, y - 11.5, d.activity ? `Officer's Report - ${d.activity}` : "Officer's Report", 10, true);
      y -= 20;
      const by = `This is an Officer's Report by Beat Assigned: ${on('offense') ? val('beatAssigned') : ''}`;
      text(M + 2, y - 9, by.trim(), 9.5);
      y -= 16;
      const done = new Set(['courtDate']);
      const line1 = (k) => { done.add(k); if (RF.isHidden(d, k)) return; if (k === 'courtBranch') { const c = RF.courtLine(d, (kk) => val(kk)); if (c) labelled(c[0], c[1]); return; } labelled(RF.lineLabel ? RF.lineLabel(d, k) : labelOf(k), val(k)); };
      const list1 = (key, label) => { done.add(key); if (RF.isHidden(d, key)) return; labelled(label || RF.LISTS[key].title, items(key)); };
      // In the form's order: the operation, the people, the charges and the court, the warrant…
      // v1.44: in blocks with a little space between them: who; the court and the warrant; who else
      // was there; the evidence and the money; the record numbers; vehicles and notifications.
      line1('operation');
      // v1.81: an offender sheet each: custody, name and A.K.A., description, residence, numbers, vehicle.
      done.add('offendersList');
      if (people && !RF.isHidden(d, 'offendersList')) d.offendersList.filter(RF.filled).forEach((o) => { labelled('Offender', [offenderBlock(o)]); y -= 3; });
      list1('gangs', 'Gang Affiliation(s)');
      done.add('charges');
      if (!RF.isHidden(d, 'charges')) { const cs = d.charges.filter(RF.filled); if (cs.length) labelled('Charges', cs.map(chargeBlock)); }
      groupGap();
      ['within1000', 'courtBranch', 'searchWarrant', 'subpoenaGJ', 'asa', 'ausa', 'judge'].forEach(line1);
      groupGap();
      list1('notArrested', 'Person(s) Present Not Arrested');
      done.add('personnel');
      if (!RF.isHidden(d, 'personnel')) { const ps = d.personnel.filter(RF.filled); if (ps.length) labelled('Police Personnel', [personnelBlock(ps)]); }
      // v1.86: "Victim: State of Illinois   Officer Name: …" on one line.
      done.add('victimsList');
      if (people && !RF.isHidden(d, 'victimsList')) {
        const vs = d.victimsList.filter(RF.filled);
        const lines = items('victimsList');
        if (vs.length) labelled(vs.length === 1 ? 'Victim' : 'Victim(s)', vs.map((v, i) => victimBlock(v, lines[i])));
      }
      groupGap();
      // v1.108: a note ("See DEA 6 for further information") reads first, then the exhibits.
      if (on('evidence')) {
        const ex = exhibits(); const note = String(d.evidenceNote || '').trim();
        if (note) labelled('Evidence Inventoried', note);
        if (ex.length) { if (note) y -= 3; blocks(note ? '' : 'Evidence Inventoried', ex); } else if (!note) labelled('Evidence Inventoried', '');
      }
      // v1.86: narcotics in columns, and Pre-Recorded Funds as a QTY / Denomination / Serial table.
      done.add('narcotics');
      if (!RF.isHidden(d, 'narcotics')) { const ns = d.narcotics.filter(RF.filled); if (ns.length) labelled('Narcotics Recovered (Total Weight & Value)', ns.map(narcoticBlock)); }
      line1('buyFunds');
      done.add('funds');
      if (!RF.isHidden(d, 'funds')) { const fb = fundsBlock(); if (fb) labelled('Pre-Recorded Funds', [fb]); }
      ['fundSheet', 'evidenceOfficer'].forEach(line1);
      groupGap();
      ['proofResidence', 'cbNumber'].forEach(line1); // v1.86: the IR Number is in the offender's info
      groupGap();
      list1('notifications', 'Notifications');
      // Anything else of the report part, so nothing entered is left out.
      for (const [k, label, kind] of RF.SECTIONS.find((s2) => s2.id === 'report').fields) {
        if (done.has(k)) continue;
        if (kind === 'list') list1(k, label); else line1(k);
      }
      for (const key of RF.SECTIONS.find((s2) => s2.id === 'report').lists) if (!done.has(key)) list1(key);
      y -= 4;
    }

    // ---- summary of investigation
    if (on('summary')) {
      ensure(60);
      text(M + 2, y - 11, 'SUMMARY OF INVESTIGATION:', 8.5);
      y -= 15;
      const summary = twrap(plain(d.narrative) || '', 10.5, INNER - 14);
      let top = y;
      const closeBox = () => { if (top > y) rect(M, y - 5, INNER, top - y + 5, 0.6); };
      y -= 4;
      for (const l of (summary.length ? summary : [''])) {
        if (y - 13 < BOTTOM) { closeBox(); newPage(); top = y; y -= 4; }
        text(M + 7, y - 10.5, l, 10.5);
        y -= 13;
      }
      closeBox();
      y -= 14;
    }

    // ---- the signature table (kept together on one page), three columns, heavy outline
    if (on('approval')) {
      const rowH = 30; const tH = rowH * 3;
      ensure(tH + 24);
      const top = y; const cw = INNER / 3;
      const cellT = (x, yy, w, label, value, sign) => {
        fill(x, yy - 10.5, w, 10.5, 0.9); // v1.50: the label on a grey band, like the grid
        rect(x, yy - rowH, w, rowH, 0.6);
        text(x + 3, yy - 8, label, 7);
        if (value) text(x + 4, yy - 22, value, 10);
        if (sign) sigs.push({ name: sign, rect: [x + 2, yy - rowH + 2, x + w - 2, yy - 10] });
      };
      const pair = (x, yy, a, b, split = 0.68) => { cellT(x, yy, cw * split, a[0], a[1], a[2]); cellT(x + cw * split, yy, cw * (1 - split), b[0], b[1], b[2]); };
      // v1.54: no Extra Copies box; the reporting officer's column is name, then a tall signature box.
      pair(M, y, ['PRINT (REPORTING OFFICER)', val('reportingOfficer')], ['STAR', val('reportingStar')]);
      pair(M + cw, y, ['DATE SUBMITTED', val('dateSubmitted')], ['TIME', val('timeSubmitted')]);
      pair(M + 2 * cw, y, ['SUPERVISOR APPROVAL', val('supervisor')], ['STAR', val('supervisorStar')]);
      y -= rowH;
      { const rH = rowH * 2; fill(M, y - 10.5, cw, 10.5, 0.9); rect(M, y - rH, cw, rH, 0.6); text(M + 3, y - 8, 'SIGNATURE', 7); sigs.push({ name: 'ReportingOfficerSignature', rect: [M + 2, y - rH + 2, M + cw - 2, y - 10] }); }
      // v1.86: with no secondary officer, the middle column under Date Submitted is left empty.
      const second = !RF.isHidden(d, 'secondOfficer');
      if (second) pair(M + cw, y, ['SECONDARY REPORTING OFFICER', val('secondOfficer')], ['STAR', val('secondStar')]);
      cellT(M + 2 * cw, y, cw, 'SIGNATURE', '', 'SupervisorSignature');
      y -= rowH;
      if (second) {
        cellT(M + cw, y, cw, 'SIGNATURE', '', 'SecondOfficerSignature');
        // The secondary officer's date and time, small, in the corner of the signature box.
        if (val('secondDate')) text(M + 2 * cw - 4 - tw(val('secondDate'), 7), y - 8, val('secondDate'), 7);
        if (val('secondTime')) text(M + 2 * cw - 4 - tw(val('secondTime'), 7), y - 26, val('secondTime'), 7);
      }
      pair(M + 2 * cw, y, ['DATE APPROVED', val('dateApproved')], ['TIME', val('timeApproved')]);
      y -= rowH;
      rect(M, y, INNER, top - y, 1.6);
      line(M + cw, y, M + cw, top, 1.6); line(M + 2 * cw, y, M + 2 * cw, top, 1.6);
      text(M + 2 * cw + 4, y - 10, 'SIGNATURES IN BLUE INK OR ELECTRONIC SIGNATURE', 7);
      y -= 16;
      pages[pages.length - 1].signed = true;
    }

    // ---- Exhibit Attachments: the exhibit photos, two to a portrait page, each as large as fits,
    // with its exhibit line under it.
    const photos = on('evidence') ? (photosIn || []) : [];
    for (let i = 0; i < photos.length; i += 2) {
      newPage();
      pages[pages.length - 1].signed = true; // a photo page has no initial boxes
      band('Exhibit Attachments');
      y -= 6;
      const slotH = (y - (M + 18)) / 2;
      photos.slice(i, i + 2).forEach((ph, j) => {
        const top = y - j * slotH;
        const cap = twrap(ph.caption || '', 9.5, INNER - 8).slice(0, 3);
        const capH = cap.length * 11 + 8;
        const boxH = slotH - capH - 10;
        const k = Math.min((INNER - 12) / ph.w, (boxH - 12) / ph.h);
        const w = ph.w * k; const hgt = ph.h * k;
        rect(M, top - boxH, INNER, boxH);
        const x = M + (INNER - w) / 2; const yy = top - boxH + (boxH - hgt) / 2;
        ops.push(`q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${x.toFixed(2)} ${yy.toFixed(2)} cm /Im${ph.index} Do Q`);
        pages[pages.length - 1].imgs.push(ph.index);
        cap.forEach((l, n) => text(M + 4, top - boxH - 12 - n * 11, l, 9.5)); // v1.47: not bold
      });
    }

    // Initial boxes at the foot of every page without the signature table, and the footer.
    pages.forEach((p, i) => {
      const add = (s2) => p.ops.push(s2);
      if (!p.signed) {
        const bx = M + 24; const bw = (INNER - 48) / 2; const by = M + 4;
        for (const [n, l] of [[0, 'PREPARER - SIGN OR INITIAL'], [1, 'APPROVAL - SIGN OR INITIAL']]) {
          add(`0.9 w ${(bx + n * bw).toFixed(2)} ${by.toFixed(2)} ${bw.toFixed(2)} 24 re S`);
          add(`BT /F1 7 Tf ${(bx + n * bw + 3).toFixed(2)} ${(by + 16).toFixed(2)} Td ${pdfString(l)} Tj ET`);
        }
      }
      const pg = `Page ${i + 1} of ${pages.length}`;
      add(`BT /F1 8 Tf ${(PAGE_W / 2 - width(pg, 8, false, 'times') / 2).toFixed(2)} ${(M - 12).toFixed(2)} Td ${pdfString(pg)} Tj ET`);
      if (caseLabel) add(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 12).toFixed(2)} Td ${pdfString(caseLabel)} Tj ET`);
      if (printed) { const pr = `Printed ${printed}`; add(`BT /F1 7.5 Tf ${(PAGE_W - M - width(pr, 7.5, false, 'times')).toFixed(2)} ${(M - 12).toFixed(2)} Td ${pdfString(pr)} Tj ET`); }
    });
    return pages;
  }

  /* ---------------- v1.85: the letterhead ---------------- */

  /** The department logo (top left) and the department header to its right, across the top of the
   * first page. lh: { header, logo: { index, w, h } | null }. Pushes onto ops; returns the height
   * used (0 when there is no letterhead). */
  function letterhead(ops, lh, x, yTop, innerW, face = 'helvetica') {
    const lines = String((lh && lh.header) || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
    const logo = lh && lh.logo;
    if (!lines.length && !logo) return 0;
    const S = 52;
    let tx = x;
    if (logo) {
      const k = Math.min((S - 4) / logo.w, (S - 4) / logo.h);
      const w = logo.w * k; const hh = logo.h * k;
      ops.push(`q ${w.toFixed(2)} 0 0 ${hh.toFixed(2)} ${(x + (S - w) / 2).toFixed(2)} ${(yTop - S + (S - hh) / 2).toFixed(2)} cm /Im${logo.index} Do Q`);
      tx = x + S + 10;
    }
    const sizes = lines.map((_, i) => (i === 0 ? 13 : 9));
    const lead = sizes.map((z) => z + 3);
    const total = lead.reduce((a, b) => a + b, 0);
    let ty = yTop - (S - total) / 2 - sizes[0];
    const room = innerW - (tx - x);
    lines.forEach((l, i) => {
      let z = sizes[i];
      while (z > 6 && width(l, z, i === 0, face) > room) z -= 0.5;
      ops.push(`BT /${i === 0 ? 'F2' : 'F1'} ${z} Tf ${tx.toFixed(2)} ${ty.toFixed(2)} Td ${pdfString(l)} Tj ET`);
      ty -= lead[i];
    });
    ops.push(`0.8 w ${x.toFixed(2)} ${(yTop - S - 5).toFixed(2)} m ${(x + innerW).toFixed(2)} ${(yTop - S - 5).toFixed(2)} l S`);
    return S + 11;
  }

  /** Adds the letterhead's logo to a photo list; -> the lh object for letterhead(). */
  function withLogo(letterheadIn, photos) {
    if (!letterheadIn) return null;
    const lh = { header: letterheadIn.header || '', logo: null };
    if (letterheadIn.logo && letterheadIn.logo.jpeg) {
      const p = { ...letterheadIn.logo, index: photos.length };
      photos.push(p);
      lh.logo = p;
    }
    return lh.header || lh.logo ? lh : null;
  }

  /* ---------------- the PDF file ---------------- */

  /** -> Uint8Array: the report as a PDF. opts: { agency, title, caseLabel, printed } */
  function build(data, opts = {}) {
    // Photos (JPEG bytes) become image objects; the layout refers to them as /Im0, /Im1…
    // With Evidence left out, no photos go in the file at all.
    const evidenceOff = Array.isArray(data && data.hidden) && data.hidden.includes('evidence');
    const photos = evidenceOff ? [] : (opts.photos || []).map((p, index) => ({ ...p, index }));
    const all = [...photos];
    const lh = withLogo(opts.letterhead, all);
    return assemble(layout(data, { ...opts, photos, lh }), { photos: all, title: opts.title || F().titleFor(data), face: 'times' });
  }

  /**
   * v1.68: a Text Message report: screenshots of text-message correspondence, portrait, two side by
   * side on each page, each with its exhibit caption under it. photos: [{ jpeg, w, h, caption }].
   * opts: { heading, title, caseLabel, description }
   */
  function textsReport(photosIn, { heading = 'Text Message Correspondence', title = 'Text Messages', caseLabel = '', description = '' } = {}) {
    const photos = (photosIn || []).map((p, index) => ({ ...p, index }));
    const pages = [];
    const t = (ops, x, y, s, size, bold = false) => ops.push(`BT /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(s)} Tj ET`);
    const per = 2;
    const count = Math.max(1, Math.ceil(photos.length / per));
    for (let p = 0; p < count; p++) {
      const ops = []; const imgs = [];
      let y = PAGE_H - M;
      ops.push(`0.88 g ${M} ${(y - 15).toFixed(2)} ${INNER} 15 re f 0 g`);
      ops.push(`0.8 w ${M} ${(y - 15).toFixed(2)} ${INNER} 15 re S`);
      t(ops, M + 4, y - 11, heading.toUpperCase(), 9, true);
      y -= 15;
      if (p === 0 && description) {
        const lines = wrap(description, 9.5, INNER - 8, false, 'times').slice(0, 4);
        lines.forEach((l, n) => t(ops, M + 4, y - 13 - n * 11.5, l, 9.5));
        y -= 8 + lines.length * 11.5;
      }
      y -= 8;
      const gap = 14;
      const colW = (INNER - gap) / per;
      photos.slice(p * per, p * per + per).forEach((ph, j) => {
        const x0 = M + j * (colW + gap);
        const cap = wrap(ph.caption || '', 8.5, colW - 6, false, 'times').slice(0, 4);
        const boxH = y - (M + 18) - (cap.length * 10 + 10);
        const k = Math.min((colW - 10) / ph.w, (boxH - 10) / ph.h);
        const w = ph.w * k; const hgt = ph.h * k;
        ops.push(`0.8 w ${x0.toFixed(2)} ${(y - boxH).toFixed(2)} ${colW.toFixed(2)} ${boxH.toFixed(2)} re S`);
        ops.push(`q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${(x0 + (colW - w) / 2).toFixed(2)} ${(y - boxH + (boxH - hgt) / 2).toFixed(2)} cm /Im${ph.index} Do Q`);
        imgs.push(ph.index);
        cap.forEach((l, n) => t(ops, x0 + 3, y - boxH - 11 - n * 10, l, 8.5));
      });
      if (!photos.length) t(ops, M + 4, y - 14, 'No screenshots added.', 9.5);
      pages.push({ ops, sigs: [], imgs, signed: true });
    }
    pages.forEach((pg, i) => {
      const s = `Page ${i + 1} of ${pages.length}`;
      t(pg.ops, PAGE_W / 2 - width(s, 8, false, 'times') / 2, M - 12, s, 8);
      if (caseLabel) t(pg.ops, M, M - 12, caseLabel, 7.5);
    });
    return assemble(pages, { photos, title, face: 'times' });
  }

  /** Pages ([{ ops, sigs, imgs }]) and their photos -> the PDF file's bytes. Shared with the
   * Arrest Report (js/arrest-pdf.js). */
  function assemble(pages, { photos = [], title = 'Report', face = 'helvetica' } = {}) {
    const objs = []; // index = object number - 1
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null); const pagesObj = add(null);
    const [reg, bold] = face === 'times' ? ['Times-Roman', 'Times-Bold'] : ['Helvetica', 'Helvetica-Bold'];
    const f1 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${reg} /Encoding /WinAnsiEncoding >>`);
    const f2 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${bold} /Encoding /WinAnsiEncoding >>`);
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
    const info = add(`<< /Title ${pdfString(title)} /Creator (CaseVault) /Producer (CaseVault) >>`);

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

  const api = { build, layout, assemble, textsReport, wrap, width, pdfString, plain, letterhead, withLogo, PAGE_W, PAGE_H, M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReportPdf = api;
})(this);
