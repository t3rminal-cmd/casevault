/* CaseVault — the Arrest Report as a PDF (Arrest details tab → Print / PDF, Save PDF to Case,
 * Email for E-Sign). v1.30.
 *
 * v1.43: laid out like a records-system arrest report: ARREST REPORT and the agency on the
 * left, the CB / IR / YD / RD / Event numbers stacked on the right, an ARREST REPORTING band, then
 * framed sections each named on a grey tab down the left: Offender (description in a column, the
 * photo on the right), Incident, Charges, Recovered Narcotics, Warrant, Non-Offender(s), Arrestee
 * Vehicle, Properties, Incident Narrative, Court Info and Bond Info side by side, and Reporting
 * Personnel with signature fields. "Label: value" text rather than boxes. One report per
 * arrestee, each starting on a new page; later pages repeat the CB number and the name. The
 * header shows the agency from Vault → My Profile; no agency's name, seal or form number is built
 * in.
 *
 * Uses the PDF writer of js/report-pdf.js (Helvetica, lines, boxes, images); no library, nothing
 * fetched, and it runs under Node for the tests.
 */
'use strict';

(function (root) {
  const P = () => (typeof module !== 'undefined' && module.exports ? require('./report-pdf.js') : root.CVReportPdf);
  const K = () => (typeof module !== 'undefined' && module.exports ? require('./closing.js') : root.CVClosing);

  const clean = (s) => String(s == null ? '' : s).trim();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The long date, as everywhere in CaseVault (v1.32): "September 30, 2026".
  const US = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso)); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[3]}, ${m[1]}` : clean(iso); };
  // v1.44: military time without the colon (1435), as on the form.
  const MIL = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(clean(t)); return m ? `${m[1].padStart(2, '0')}${m[2]}` : clean(t); };
  const when = (d, t) => [US(d), MIL(t)].filter(Boolean).join(' ');

  /** The arrestee's name as on a report: LAST, First Middle. */
  function reportName(a) {
    const last = clean(a.lastName).toUpperCase();
    const rest = [clean(a.firstName), clean(a.middleName)].filter(Boolean).join(' ');
    return [last, rest].filter(Boolean).join(', ');
  }

  /**
   * -> pages for CVReportPdf.assemble. arrest: arrest.json; opts: { agency, caseLabel, printed,
   * caseNumber, photos: { [arresteeIndex]: { jpeg, w, h, index } } }
   */
  function layout(arrest, { agency = '', caseLabel = '', printed = '', caseNumber = '', photos = {}, lh = null } = {}) {
    const { wrap, width, pdfString, PAGE_W, PAGE_H } = P();
    const C = K();
    const L = 24; const INNER = PAGE_W - 2 * L; // the report uses nearly the whole width, like the form
    const TAB = 20; const CX = L + TAB + 5; const CW = INNER - TAB - 10;
    const TOP = PAGE_H - 22; const BOTTOM = 46;
    const people = C.normalizeArrest(arrest).arrestees;
    const pages = [];
    let ops = null; let y = 0; let sigs = null; let who = null; let seg = null;

    const text = (x, yy, s, size = 9, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(s)} Tj ET`); };
    const vtext = (x, yy, s, size, bold = true) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 0 1 -1 0 ${x.toFixed(2)} ${yy.toFixed(2)} Tm ${pdfString(s)} Tj ET`);
    const line = (x1, y1, x2, y2, w = 0.6) => ops.push(`${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    const rect = (x, yy, w, h, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const fill = (x, yy, w, h, gray = 0.9) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
    const center = (x, w, yy, s, size, bold) => text(x + (w - width(s, size, bold)) / 2, yy, s, size, bold);

    // "Label: value": the label in bold, the value after it (wrapping under itself). -> height used.
    const kv = (x, yy, label, value, { max = 200, size = 9, vbold = false } = {}) => {
      const lab = label ? `${label} ` : '';
      const lw = width(lab, size, true);
      text(x, yy, lab, size, true);
      const lines = wrap(clean(value), size, Math.max(30, max - lw), vbold);
      lines.forEach((l, j) => text(x + lw, yy - j * (size + 2), l, size, vbold));
      return Math.max(1, lines.length) * (size + 2);
    };

    // v1.45: values in light grey boxes, every label of a list the same width so the boxes line up.
    const BOX = 0.92;
    const kvList = (x, yy, rows, w, size = 9) => {
      const lw = Math.max(...rows.map(([l]) => width(`${l} `, size, true)));
      const vw = Math.max(30, w - lw - 2);
      for (const [l, v] of rows) {
        const lines = wrap(clean(v), size, vw - 8);
        const n = Math.max(1, lines.length);
        const h = n * (size + 3.5);
        fill(x + lw, yy - h + size + 0.5, vw, h - 1, BOX);
        text(x, yy, l, size, true);
        lines.forEach((t, j) => text(x + lw + 4, yy - j * (size + 3.5), t, size));
        yy -= h + 2.5;
      }
      return yy;
    };
    // A table in grey rows: cols [[label, from, share]] of the content width.
    const tableRows = (cols, rows, boldCol = -1) => {
      cols.forEach(([l, f]) => text(CX + CW * f + 2, y - 9, l, 8.5, true));
      y -= 13;
      for (const r of rows) {
        const cells = r.map((v, i) => wrap(v || '', 9, CW * cols[i][2] - 8));
        const h = Math.max(1, ...cells.map((c) => c.length)) * 11.5 + 4;
        ensure(h + 2);
        cols.forEach(([, f, sh]) => fill(CX + CW * f + 1, y - h, CW * sh - 2, h, BOX));
        cells.forEach((ls, i) => ls.forEach((t, j) => text(CX + CW * cols[i][1] + 4, y - 11 - j * 11.5, t, 9, i === boldCol)));
        y -= h + 3;
      }
    };
    // Text on a grey ground that runs on over pages.
    const greyText = (lines, size, lead) => {
      for (const t of lines) { ensure(lead + 1); fill(CX, y - lead, CW, lead, BOX); text(CX + 6, y - lead + 3.5, t, size); y -= lead; }
      y -= 3;
    };
    const band = (label) => { fill(L, y - 13, INNER, 13, 0.8); rect(L, y - 13, INNER, 13, 0.6); center(L, INNER, y - 9.8, label, 9, true); y -= 13; };

    const newPage = () => {
      ops = []; sigs = [];
      pages.push({ ops, sigs, imgs: [] });
      y = TOP;
      const first = !who || pages.length === who.firstPage + 1;
      const cb = who ? clean(who.bookingNumber) : '';
      if (first) {
        // v1.85: the department letterhead across the top of each arrestee's first page.
        if (lh) { y -= P().letterhead(ops, lh, L, y, INNER, 'helvetica'); if (lh.logo) pages[pages.length - 1].imgs.push(lh.logo.index); }
        // The agency and ARREST REPORT on the left, the approval in the middle, the numbers on the right.
        if (agency && !(lh && lh.header)) text(L, y - 9, agency.toUpperCase(), 10, true);
        text(L, y - 25, 'ARREST REPORT', 17, true);
        if (caseLabel) text(L, y - 35, caseLabel, 7);
        if (who && clean(who.supervisor) && clean(who.approvalDate)) center(L + INNER * 0.35, INNER * 0.3, y - 12, 'FINAL APPROVAL', 12, true);
        const nums = [['CB #:', cb], ['IR #:', clean(who && who.irNumber)], ['YD #:', clean(who && who.ydNumber)], ['RD #:', clean(who && who.rdNumber) || clean(caseNumber)], ['EVENT #:', clean(who && who.eventNumber)]];
        const lx = PAGE_W - L - 120;
        nums.forEach(([l, v], i) => {
          const yy = y - 8 - i * 10;
          text(lx - width(l, 8.5, true), yy, l, 8.5, true);
          if (i === 0) rect(lx + 3, yy - 2.5, 117, 11, 1);
          text(lx + 6, yy, v, 8.5, i === 0);
        });
        y -= 54;
      } else {
        text(L, y - 12, `${agency ? `${agency} - ` : ''}ARREST Report`, 10.5, true);
        const lx = PAGE_W - L - 120;
        text(lx - width('CB #:', 8.5, true), y - 8, 'CB #:', 8.5, true);
        rect(lx + 3, y - 10.5, 117, 11, 1);
        text(lx + 6, y - 8, cb, 8.5, true);
        if (who && reportName(who)) text(lx + 3, y - 20, reportName(who), 9.5, true);
        y -= 26;
      }
      band('ARREST REPORTING');
      y -= 2;
    };

    // A section: a frame with its name on a grey tab down the left, read from bottom to top. A long
    // section (the narrative) carries on over pages, the tab repeated on each.
    const closeSeg = (bottom) => {
      if (!seg) return;
      const h = seg.top - bottom;
      rect(L, bottom, INNER, h, 1.1);
      fill(L + 1, bottom + 1, TAB, h - 2, 0.8);
      line(L + TAB + 1, bottom, L + TAB + 1, seg.top, 0.8);
      // The name in one line, or two when it doesn't fit (RECOVERED / NARCOTICS).
      let size = 9;
      let rows = [seg.label];
      if (width(seg.label, size, true) > h - 8 && seg.label.includes(' ')) { const i = seg.label.indexOf(' '); rows = [seg.label.slice(0, i), seg.label.slice(i + 1)]; size = 8.5; }
      while (size > 5.5 && Math.max(...rows.map((r) => width(r, size, true))) > h - 6) size -= 0.5;
      rows.forEach((r, j) => {
        const off = rows.length === 2 ? (j === 0 ? -size * 0.55 : size * 0.6) : 0;
        vtext(L + 1 + TAB / 2 + size * 0.35 + off, bottom + (h - width(r, size, true)) / 2, r, size);
      });
    };
    const startSeg = (label, minH = 0) => { ensure(Math.max(minH, 24)); seg = { label, top: y }; y -= 4; };
    const endSeg = (minH = 0) => { const bottom = Math.min(y - 4, seg.top - minH); closeSeg(bottom); y = bottom - 4; seg = null; };
    const ensure = (h) => {
      if (y - h >= BOTTOM) return;
      const open = seg;
      if (open) closeSeg(y - 2);
      newPage();
      if (open) { seg = { label: open.label, top: y }; y -= 4; }
    };
    const subBand = (s, right = '') => { fill(L + TAB + 2, y - 12, INNER - TAB - 3, 12, 0.85); text(CX, y - 9, s, 9, true); if (right) text(CX + 321, y - 9, right, 9, true); y -= 14; };
    const big = (s) => { text(CX + 14, y - 14, s, 9.5, true); y -= 22; };

    const yn = (s) => clean(s) || '';
    const typeCode = (s) => ({ Felony: 'F', Misdemeanor: 'M' }[clean(s)] || clean(s));

    people.forEach((a, n) => {
      who = { ...a, firstPage: pages.length };
      newPage();
      const age = C.ageOn(a.dob, a.date);

      // ---- offender: who, then the description in a column, the photo on the right
      startSeg('OFFENDER', 130);
      const top = y;
      const c1 = CX; const c1w = CW * 0.5; const c2 = CX + c1w + 8; const c2w = CW * 0.26; const c3 = c2 + c2w + 6; const c3w = CX + CW - c3;
      let ly = y - 9;
      text(c1, ly, 'Name:', 9, true); text(c1 + width('Name: ', 9, true), ly, reportName(a), 11, true); ly -= 16;
      ly = kvList(c1, ly, [['Res:', a.address], ['Beat:', a.beatResidence], ['DOB:', US(a.dob)], ['Age:', age ? `${age} years` : ''], ['POB:', a.pob], ['DLN:', a.idNumber], ['Phone:', a.phone], ['Armed With:', a.armedWith]], c1w);
      // The description, one item a line, in one grey column.
      const desc = [a.sex, a.race, a.height, a.weight, a.eyes && `${clean(a.eyes)} Eyes`, a.hair && `${clean(a.hair)} Hair`, a.hairStyle && `${clean(a.hairStyle)} Hair Style`, a.complexion && `${clean(a.complexion)} Complexion`].map(clean).filter(Boolean);
      const dl = desc.flatMap((d) => wrap(d, 9, c2w - 8));
      let ry = top - 9;
      if (dl.length) { fill(c2, ry - (dl.length - 1) * 12.5 - 3.5, c2w, dl.length * 12.5 + 1, BOX); for (const l of dl) { text(c2 + 4, ry, l, 9); ry -= 12.5; } }
      const ph = photos[n];
      const blockH = Math.max(ph ? 140 : 118, top - Math.min(ly, ry) + 6);
      line(c2 - 5, top + 4, c2 - 5, top - blockH, 0.6);
      if (ph) {
        const bh = blockH - 6;
        const k = Math.min((c3w - 4) / ph.w, bh / ph.h);
        const w = ph.w * k; const hgt = ph.h * k;
        ops.push(`q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${(c3 + (c3w - w)).toFixed(2)} ${(top - hgt).toFixed(2)} cm /Im${ph.index} Do Q`);
        pages[pages.length - 1].imgs.push(ph.index);
      }
      y = top - blockH;
      endSeg();

      // ---- incident: two columns of the same width
      startSeg('INCIDENT', 70);
      const it = y; const half = (CW - 12) / 2; const r0 = CX + half + 12;
      const iy = kvList(CX, y - 9, [['Arrest Date:', when(a.date, a.time)], ['Location:', a.location], ['Beat:', a.beat], ['Holding Facility:', a.facility], ['Type of Arrest:', a.type], ['Miranda:', [clean(a.miranda), MIL(a.mirandaTime)].filter(Boolean).join(', ')]], half);
      const jy = kvList(r0, y - 9, [['Total No Arrested:', a.totalArrested], ['Co-Arrests:', a.coArrests], ['Assoc Cases:', a.assocCases], ['Resisted Arrest?', yn(a.resisted)], ['Declared CMA Incident?', yn(a.cma)], ['TRR Completed?', yn(a.trr)], ['DCFS Ward?', yn(a.dcfsWard)], ['Dependent Children?', yn(a.dependentChildren)]], half);
      line(r0 - 6, it + 4, r0 - 6, Math.min(iy, jy) - 2, 0.6);
      y = Math.min(iy, jy);
      endSeg(66);

      // ---- charges: one grey row per charge, the same columns each time
      startSeg('CHARGES', 70);
      const ccols = [['#', 0, 0.05], ['Offense As Cited', 0.05, 0.22], ['Charge', 0.27, 0.38], ['Class', 0.65, 0.08], ['Type', 0.73, 0.08], ['Victim', 0.81, 0.19]];
      const charges = a.charges.filter((c) => clean(c.statute) || clean(c.description));
      if (!charges.length) big('NO CHARGES ENTERED');
      else {
        tableRows(ccols, charges.map((c, i) => [String(i + 1), clean(c.statute), clean(c.description).toUpperCase() + (Number(c.counts) > 1 ? ` (${Number(c.counts)} COUNTS)` : ''), clean(c.degree), typeCode(c.level), clean(c.victim)]), 1);
      }
      endSeg(66);

      // ---- recovered narcotics
      startSeg('RECOVERED NARCOTICS', 56);
      const narcotics = a.narcotics.filter(C.itemFilled);
      if (!narcotics.length) { y -= 6; big('NO NARCOTICS RECOVERED'); }
      else tableRows([['Narcotic', 0, 0.26], ['Amount', 0.26, 0.16], ['Inventory #', 0.42, 0.16], ['Description', 0.58, 0.42]],
        narcotics.map((x) => [clean(x.drug), [clean(x.amount), clean(x.unit)].filter(Boolean).join(' '), clean(x.inventory), clean(x.description)]));
      endSeg(56);

      // ---- warrant
      startSeg('WARRANT', 44);
      const warrants = a.warrants.filter(C.itemFilled);
      if (!warrants.length) { y -= 4; big('NO WARRANT IDENTIFIED'); }
      else tableRows([['Warrant #', 0, 0.2], ['Type', 0.2, 0.2], ['Issued By', 0.4, 0.22], ['Date Issued', 0.62, 0.16], ['Offense', 0.78, 0.22]],
        warrants.map((x) => [clean(x.number), clean(x.kind), clean(x.issuedBy), US(x.issued), clean(x.offense)]));
      endSeg(44);
      // The CB number on a tab at the right edge, as on the form.
      if (pages.length === who.firstPage + 1 && cb(a)) {
        const tx = PAGE_W - L + 4; const tb = 150; const th = 150;
        fill(tx, tb, 14, th, 0.8); rect(tx, tb, 14, th, 0.6);
        vtext(tx + 10, tb + (th - width(`CB #: ${cb(a)}`, 8, true)) / 2, `CB #: ${cb(a)}`, 8);
      }

      // ---- victim and complainant (non-offenders): three columns of lists
      const others = a.nonOffenders.filter(C.itemFilled);
      startSeg('NON-OFFENDER(S)', 60);
      subBand('VICTIM AND COMPLAINANT');
      if (!others.length) big('NONE');
      others.forEach((p, i) => {
        ensure(70);
        const t0 = y; const w1 = (CW - 24) * 0.42; const w2 = (CW - 24) * 0.3; const w3 = (CW - 24) * 0.28;
        const x2 = CX + w1 + 12; const x3 = x2 + w2 + 12;
        text(CX, y - 9, 'Name:', 9, true);
        text(CX + width('Name: ', 9, true), y - 9, `${clean(p.name).toUpperCase()}${clean(p.role) ? `  (${clean(p.role)})` : ''}`, 9.5, true);
        const yy0 = y - 25;
        const py = kvList(CX, yy0, [['Res:', p.address], ['Phone:', p.phone], ['Beat:', p.beat], ...(clean(p.employer) ? [['Empl:', p.employer], ['Empl Beat:', p.employerBeat]] : [])], w1);
        const qy = kvList(x2, yy0, [['Sex:', p.sex], ['Race:', p.race], ['DOB:', US(p.dob)], ['Age:', C.ageOn(p.dob, a.date)]], w2);
        const zy = kvList(x3, yy0, [['Injured?', yn(p.injured)], ['Deceased?', yn(p.deceased)], ['Hospitalized?', yn(p.hospitalized)], ['Treated / Released?', yn(p.treated)]], w3);
        let ey = Math.min(py, qy, zy);
        if (clean(p.comments)) ey = kvList(CX, ey, [['Comments:', p.comments]], CW);
        line(x2 - 6, t0 - 14, x2 - 6, ey + 4, 0.4); line(x3 - 6, t0 - 14, x3 - 6, ey + 4, 0.4);
        y = ey - 2;
        if (i < others.length - 1) { line(CX, y + 2, CX + CW, y + 2, 0.4); y -= 2; }
      });
      endSeg(60);

      // ---- arrestee vehicle: two columns of the same width
      startSeg('ARRESTEE VEHICLE', 56);
      if (C.VEHICLE_FIELDS.some((f) => clean(a[f.key]))) {
        const vt = y; const vh = (CW - 12) / 2; const vx2 = CX + vh + 12;
        const vy1 = kvList(CX, y - 9, [['Vehicle:', [a.vehYear, a.vehMake, a.vehModel, a.vehStyle].map(clean).filter(Boolean).join(' - ')], ['Color:', a.vehColor], ['Impounded:', yn(a.impounded)], ['Disposition:', a.vehDisposition]], vh);
        const vy2 = kvList(vx2, y - 9, [['VIN #:', a.vin], ['Plate:', [clean(a.plate), clean(a.plateState)].filter(Boolean).join('  ')], ['Pound #:', a.poundNumber], ['Inv #:', a.vehInventory]], vh);
        line(vx2 - 6, vt - 4, vx2 - 6, Math.min(vy1, vy2) + 2, 0.4);
        y = Math.min(vy1, vy2);
      } else { y -= 4; big('NO VEHICLE'); }
      endSeg(56);

      // ---- properties
      startSeg('PROPERTIES', 56);
      text(CX, y - 9, 'Confiscated Properties :', 9.5, true); y -= 12;
      for (const l of wrap('All confiscated properties are recorded with their inventory numbers; the inventory number retrieves the records of evidence and recovered property.', 7.5, CW, true)) { text(CX, y - 7, l, 7.5, true); y -= 9; }
      y -= 4;
      if (clean(a.property)) greyText(wrap(clean(a.property), 9, CW - 12), 9, 11.5); else big('NO PROPERTIES RECORDED');
      endSeg(56);

      // ---- incident narrative, carried over pages, on a grey ground
      startSeg('INCIDENT NARRATIVE', 80);
      for (const l of wrap('(The facts for probable cause to arrest AND to substantiate the charges include, but are not limited to, the following)', 8, CW, true)) { text(CX, y - 8, l, 8, true); y -= 10; }
      y -= 3;
      greyText(clean(a.narrative) ? wrap(P().plain(a.narrative), 9.5, CW - 12) : [''], 9.5, 12);
      endSeg(80);

      // ---- court info and bond info, side by side, the same width
      ensure(100);
      const ct = y; const hw = (INNER - 4) / 2; const iw = hw - TAB - 12;
      const cy = kvList(CX, ct - 13, [['Desired Court Date:', US(a.desiredCourtDate)], ['Branch:', a.courtBranch], ['Court Sgt Handle?', yn(a.courtSgt)], ['Initial Court Date:', US(a.initialCourtDate)], ['Branch:', a.initialBranch], ['Docket #:', a.docket]], iw);
      const by = kvList(L + hw + 4 + TAB + 5, ct - 13, [['Bond Date:', when(a.bondDate, a.bondTime)], ['Type:', a.bondType], ['Receipt #:', a.bondReceipt], ['Amount:', a.bond]], iw);
      const cb2 = Math.min(cy, by, ct - 84) - 2;
      for (const [x0, label] of [[L, 'COURT INFO'], [L + hw + 4, 'BOND INFO']]) {
        rect(x0, cb2, hw, ct - cb2, 1.1); fill(x0 + 1, cb2 + 1, TAB, ct - cb2 - 2, 0.8); line(x0 + TAB + 1, cb2, x0 + TAB + 1, ct, 0.8);
        vtext(x0 + 1 + TAB / 2 + 3, cb2 + (ct - cb2 - width(label, 9, true)) / 2, label, 9);
      }
      y = cb2 - 4;

      // ---- reporting personnel (kept together)
      const sigName = (s) => `${s}${people.length > 1 ? `_${n + 1}` : ''}`;
      ensure(150);
      startSeg('REPORTING PERSONNEL', 140);
      y += 2;
      subBand('ATTESTING OFFICER:');
      for (const l of wrap('I hereby declare and affirm, under penalty of perjury, that the facts stated herein are accurate to the best of my knowledge, information and/or belief.', 7.5, CW - 10, true)) { text(CX, y - 7, l, 7.5, true); y -= 9; }
      y -= 6;
      const person = (label, star, name, right, sign) => {
        text(CX, y - 10, label, 9, true);
        // v1.45: star, name and date in grey boxes on the same columns for every officer.
        fill(CX + 138, y - 14, 42, 14, BOX); fill(CX + 183, y - 14, 132, 14, BOX); fill(CX + 318, y - 14, 110, 14, BOX);
        text(CX + 141, y - 10, clean(star) ? `#${clean(star)}` : '', 9);
        wrap(clean(name).toUpperCase(), 9, 126).slice(0, 1).forEach((l) => text(CX + 186, y - 10, l, 9));
        if (right) text(CX + 321, y - 10, right, 9);
        // The signature field on the right, clear of the date and time.
        if (sign) { const sx = CX + CW - 100; rect(sx, y - 18, 100, 18, 0.5); text(sx + 2, y - 5, 'SIGNATURE', 5.5); sigs.push({ name: sign, rect: [sx + 1, y - 17, sx + 99, y - 7] }); }
        y -= sign ? 22 : 14;
      };
      person('Attesting Officer:', a.attestingStar, a.attestingOfficer, when(a.attestingDate, a.attestingTime), sigName('AttestingOfficerSignature'));
      subBand('ARRESTING OFFICER(S):', 'Beat');
      person('1st Arresting Officer:', a.arrestingStar, a.arrestingOfficer, clean(a.arrestingBeat));
      // v1.54: "2nd" like the 1st (the long label ran into the star box), and room before the supervisor.
      person('2nd Arresting Officer:', a.secondStar, a.secondOfficer, clean(a.secondBeat));
      if (clean(a.assistingOfficers)) y = kvList(CX, y - 10, [['Assisting Officers:', a.assistingOfficers]], CW - 112) + 4;
      y -= 8;
      subBand('APPROVING SUPERVISOR:');
      person('Approval of Probable Cause :', a.supervisorStar, a.supervisor, when(a.approvalDate, a.approvalTime), sigName('SupervisorSignature'));
      endSeg(130);
    });
    function cb(a) { return clean(a.bookingNumber); }

    // Footer: the case on the left, the page in the middle, when it was printed on the right.
    pages.forEach((p, i) => {
      const pg = `Page ${i + 1} of ${pages.length}`;
      p.ops.push(`BT /F1 8.5 Tf ${(PAGE_W / 2 - width(pg, 8.5) / 2).toFixed(2)} 26 Td ${pdfString(pg)} Tj ET`);
      if (caseLabel) p.ops.push(`BT /F2 8 Tf ${L.toFixed(2)} 26 Td ${pdfString(caseLabel)} Tj ET`);
      if (printed) p.ops.push(`BT /F1 8.5 Tf ${(PAGE_W - L - width(printed, 8.5)).toFixed(2)} 26 Td ${pdfString(printed)} Tj ET`);
    });
    return pages;
  }

  /** -> Uint8Array. opts: { agency, caseLabel, printed, caseNumber, photos: { [i]: { jpeg, w, h } } } */
  function build(arrest, opts = {}) {
    const list = [];
    const photos = {};
    for (const [i, p] of Object.entries(opts.photos || {})) { if (p && p.jpeg) { photos[i] = { ...p, index: list.length }; list.push(photos[i]); } }
    const lh = P().withLogo(opts.letterhead, list);
    return P().assemble(layout(arrest, { ...opts, photos, lh }), { photos: list, title: 'Arrest Report' });
  }

  const api = { build, layout, reportName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVArrestPdf = api;
})(this);
