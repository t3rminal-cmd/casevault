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

  function layout(data, { agency = '', title = F().titleFor(data), caseLabel = '', printed = '', photos: photosIn = [] } = {}) {
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
        // Title on the left, the agency under it; the R.D. Number in a box on the right (v1.48).
        text(M, y - 14, title, 14, true);
        if (agency) text(M, y - 25, agency.toUpperCase(), 7.5, true);
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
    const labelled = (label, value) => {
      // A value is text, or a list of entries; an entry { head, tail } has its name in bold on a
      // line of its own and the details under it, with a little space between entries (v1.44).
      const vals = Array.isArray(value) ? value : [value || ''];
      const rows = [];
      vals.forEach((v, n) => {
        if (n) rows.push({ gap: 4 });
        if (v && typeof v === 'object') {
          for (const l of twrap(v.head || '', 10, INNER - LW - 8, true)) rows.push({ t: l, bold: true });
          for (const l of twrap(v.tail || '', 10, INNER - LW - 18)) rows.push({ t: l, indent: 8 });
        } else for (const l of twrap(v, 10, INNER - LW - 8)) rows.push({ t: l });
      });
      const labels = twrap(`${label.toUpperCase()}:`, 8.5, LW - 14);
      const bodyH = rows.reduce((n, r) => n + (r.gap || 12), 0);
      const h = Math.max(17, 5 + Math.max(bodyH, labels.length * 10));
      ensure(h);
      fill(M + LW, y - h + 2, INNER - LW, h - 3, 0.93);
      labels.forEach((l, j) => text(M + 2, y - 11 - j * 10, l, 8.5));
      let yy = y - 11;
      for (const r of rows) { if (r.gap) { yy -= r.gap; continue; } text(M + LW + 4 + (r.indent || 0), yy, r.t, 10, !!r.bold); yy -= 12; }
      y -= h;
    };
    // A group of lines ends with a little space, so the report reads in blocks.
    const groupGap = () => { y -= 5; };
    const items = (key) => d[key].filter(RF.filled).map((it) => {
      // A bill on one line: "$20 - Serial AA00000001A - Not Recovered".
      if (key === 'funds') return [it.denomination, it.serial ? `Serial ${it.serial}` : '', it.recovered].filter(Boolean).join(' - ');
      const line = RF.itemLine(key, it);
      // People: the name on its own line in bold, the details under it.
      if (['offendersList', 'victimsList', 'notArrested', 'personnel'].includes(key) && it.name) {
        const tail = line.startsWith(it.name) ? line.slice(it.name.length).replace(/^,\s*/, '') : line;
        return { head: it.name, tail };
      }
      return line;
    });

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
          circle(x + i * cw + cw / 2, y - 28, 3, d[k] === o);
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
      const line1 = (k) => { done.add(k); if (RF.isHidden(d, k)) return; if (k === 'courtBranch') { const c = RF.courtLine(d, (kk) => val(kk)); if (c) labelled(c[0], c[1]); return; } labelled(labelOf(k), val(k)); };
      const list1 = (key, label) => { done.add(key); if (RF.isHidden(d, key)) return; labelled(label || RF.LISTS[key].title, items(key)); };
      // In the form's order: the operation, the people, the charges and the court, the warrant…
      // v1.44: in blocks with a little space between them: who; the court and the warrant; who else
      // was there; the evidence and the money; the record numbers; vehicles and notifications.
      line1('operation');
      if (people) list1('offendersList', 'Offender(s)');
      list1('gangs', 'Gang Affiliation(s)');
      list1('charges', 'Charge(s)');
      groupGap();
      ['within1000', 'courtBranch', 'searchWarrant', 'subpoenaGJ', 'asa', 'ausa', 'judge'].forEach(line1);
      groupGap();
      list1('notArrested', 'Person(s) Present Not Arrested');
      list1('personnel', 'Police Personnel on Scene');
      if (people) list1('victimsList', 'Victim(s)');
      groupGap();
      if (on('evidence')) labelled('Evidence Inventoried', d.evidence.map((e) => RF.exhibitLine(e)));
      list1('narcotics', 'Narcotics Recovered (Total Weight & Street Value)');
      line1('buyFunds');
      list1('funds', 'Pre-Recorded Funds');
      ['fundSheet', 'evidenceOfficer'].forEach(line1);
      groupGap();
      ['proofResidence', 'irNumber', 'cbNumber'].forEach(line1);
      groupGap();
      list1('vehicles', 'Vehicle(s) Impounded / Towed');
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
      pair(M + cw, y, ['DATE SUBMITTED', val('dateSubmitted')], ['TIME', val('timeSubmitted')]);
      cellT(M, y, cw, "EXTRA COPIES REQ'D", val('extraCopies'));
      pair(M + 2 * cw, y, ['SUPERVISOR APPROVAL', val('supervisor')], ['STAR', val('supervisorStar')]);
      y -= rowH;
      pair(M, y, ['PRINT (REPORTING OFFICER)', val('reportingOfficer')], ['STAR', val('reportingStar')]);
      pair(M + cw, y, ['SECONDARY REPORTING OFFICER', val('secondOfficer')], ['STAR', val('secondStar')]);
      cellT(M + 2 * cw, y, cw, 'SIGNATURE', '', 'SupervisorSignature');
      y -= rowH;
      cellT(M, y, cw, 'SIGNATURE', '', 'ReportingOfficerSignature');
      cellT(M + cw, y, cw, 'SIGNATURE', '', 'SecondOfficerSignature');
      // The secondary officer's date and time, small, in the corner of the signature box.
      if (val('secondDate')) text(M + 2 * cw - 4 - tw(val('secondDate'), 7), y - 8, val('secondDate'), 7);
      if (val('secondTime')) text(M + 2 * cw - 4 - tw(val('secondTime'), 7), y - 26, val('secondTime'), 7);
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

  /* ---------------- the PDF file ---------------- */

  /** -> Uint8Array: the report as a PDF. opts: { agency, title, caseLabel, printed } */
  function build(data, opts = {}) {
    // Photos (JPEG bytes) become image objects; the layout refers to them as /Im0, /Im1…
    // With Evidence left out, no photos go in the file at all.
    const evidenceOff = Array.isArray(data && data.hidden) && data.hidden.includes('evidence');
    const photos = evidenceOff ? [] : (opts.photos || []).map((p, index) => ({ ...p, index }));
    return assemble(layout(data, { ...opts, photos }), { photos, title: opts.title || F().titleFor(data), face: 'times' });
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

  const api = { build, layout, assemble, wrap, width, pdfString, plain, PAGE_W, PAGE_H, M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReportPdf = api;
})(this);
