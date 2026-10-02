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
  const US = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso)); return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : clean(iso); };
  const when = (d, t) => [US(d), clean(t)].filter(Boolean).join(' ');

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
  function layout(arrest, { agency = '', caseLabel = '', printed = '', caseNumber = '', photos = {} } = {}) {
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

    const band = (label) => { fill(L, y - 13, INNER, 13, 0.8); rect(L, y - 13, INNER, 13, 0.6); center(L, INNER, y - 9.8, label, 9, true); y -= 13; };

    const newPage = () => {
      ops = []; sigs = [];
      pages.push({ ops, sigs, imgs: [] });
      y = TOP;
      const first = !who || pages.length === who.firstPage + 1;
      const cb = who ? clean(who.bookingNumber) : '';
      if (first) {
        // The agency and ARREST REPORT on the left, the approval in the middle, the numbers on the right.
        if (agency) text(L, y - 9, agency.toUpperCase(), 10, true);
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
    const subBand = (s, right = '') => { fill(L + TAB + 2, y - 12, INNER - TAB - 3, 12, 0.85); text(CX, y - 9, s, 9, true); if (right) text(PAGE_W - L - 70, y - 9, right, 9, true); y -= 14; };
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
      const c1 = CX; const c1w = CW * 0.5; const c2 = CX + c1w + 6; const c2w = CW * 0.27; const c3 = c2 + c2w + 4; const c3w = CX + CW - c3;
      let ly = y - 9;
      text(c1, ly, 'Name:', 9, true); text(c1 + width('Name: ', 9, true), ly, reportName(a), 11, true); ly -= 14;
      if (clean(a.beatResidence)) kv(c1 + c1w - 62, ly, 'Beat:', a.beatResidence, { max: 62 });
      ly -= kv(c1, ly, 'Res:', a.address, { max: c1w - 66 }) + 3;
      for (const [l, v] of [['DOB:', US(a.dob)], ['AGE:', age ? `${age} years` : ''], ['POB:', a.pob], ['DLN:', a.idNumber], ['PHONE:', a.phone], ['ARMED WITH:', a.armedWith]]) {
        if (!clean(v) && !['DOB:', 'AGE:', 'POB:', 'DLN:', 'ARMED WITH:'].includes(l)) continue;
        ly -= kv(c1, ly, l, v, { max: c1w }) + 1;
      }
      // The description, one item a line, as on the form.
      const desc = [a.sex, a.race, a.height, a.weight, a.eyes && `${clean(a.eyes)} Eyes`, a.hair && `${clean(a.hair)} Hair`, a.hairStyle && `${clean(a.hairStyle)} Hair Style`, a.complexion && `${clean(a.complexion)} Complexion`].map(clean).filter(Boolean);
      let ry = y - 9;
      for (const d of desc) { for (const l of wrap(d, 9, c2w - 4)) { text(c2, ry, l, 9); ry -= 11; } }
      const ph = photos[n];
      const blockH = Math.max(ph ? 140 : 118, top - Math.min(ly, ry) + 6);
      line(c2 - 4, top + 4, c2 - 4, top - blockH, 0.6);
      if (ph) {
        const bh = blockH - 6;
        const k = Math.min((c3w - 4) / ph.w, bh / ph.h);
        const w = ph.w * k; const hgt = ph.h * k;
        ops.push(`q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${(c3 + (c3w - w)).toFixed(2)} ${(top - hgt).toFixed(2)} cm /Im${ph.index} Do Q`);
        pages[pages.length - 1].imgs.push(ph.index);
      }
      y = top - blockH;
      endSeg();

      // ---- incident
      startSeg('INCIDENT', 70);
      const it = y; const half = CW * 0.56; const r0 = CX + half + 6;
      let iy = y - 9;
      kv(CX + half - 105, iy, 'TRR Completed?', yn(a.trr), { max: 105 });
      kv(CX, iy, 'Arrest Date:', when(a.date, a.time), { max: half - 110 }); iy -= 12;
      if (clean(a.beat)) kv(CX + half - 60, iy, 'Beat:', a.beat, { max: 60 });
      iy -= kv(CX, iy, 'Location:', a.location, { max: half - 64 }) + 1;
      for (const [l, v] of [['Holding Facility:', a.facility], ['Type of Arrest:', a.type], ['Resisted Arrest?', yn(a.resisted)], ['Declared CMA Incident?', yn(a.cma)], ['Miranda:', [clean(a.miranda), clean(a.mirandaTime)].filter(Boolean).join(', ')]]) iy -= kv(CX, iy, l, v, { max: half }) + 1;
      let jy = y - 9;
      const rw = CX + CW - r0;
      kv(r0, jy, 'Total No Arrested:', a.totalArrested, { max: rw * 0.4 });
      text(r0 + rw * 0.42, jy, 'Co-Arrests', 9, true); text(r0 + rw * 0.72, jy, 'Assoc Cases', 9, true); jy -= 11;
      const co = wrap(clean(a.coArrests), 8.5, rw * 0.29); const as = wrap(clean(a.assocCases), 8.5, rw * 0.27);
      co.forEach((l, j) => text(r0 + rw * 0.42, jy - j * 10, l, 8.5)); as.forEach((l, j) => text(r0 + rw * 0.72, jy - j * 10, l, 8.5));
      jy -= Math.max(co.length, as.length, 0) * 10 + 2;
      jy -= kv(r0 + rw * 0.42, jy, 'DCFS Ward ?', yn(a.dcfsWard), { max: rw * 0.58 }) + 2;
      jy -= kv(r0, jy, 'Dependent Children?', yn(a.dependentChildren), { max: rw }) + 1;
      line(r0 - 4, it + 4, r0 - 4, Math.min(iy, jy) - 2, 0.6);
      y = Math.min(iy, jy);
      endSeg(66);

      // ---- charges
      startSeg('CHARGES', 70);
      const vx = CX + CW * 0.74;
      text(vx, y - 9, 'Victim', 9, true);
      y -= 14;
      const charges = a.charges.filter((c) => clean(c.statute) || clean(c.description));
      if (!charges.length) big('NO CHARGES ENTERED');
      charges.forEach((c, i) => {
        const desc = wrap(clean(c.description).toUpperCase(), 9, vx - CX - 125);
        const vic = wrap(clean(c.victim), 9, CX + CW - vx);
        ensure(14 + desc.length * 11 + 12);
        text(CX, y - 9, String(i + 1), 9.5, true);
        text(CX + 30, y - 9, 'Offense As Cited', 9);
        text(CX + 115, y - 9, clean(c.statute), 9.5, true);
        vic.forEach((l, j) => text(vx, y - 9 - j * 11, l, 9));
        y -= 20;
        desc.forEach((l) => { text(CX + 115, y + 9 - 9, l, 9); y -= 11; });
        const cls = [clean(c.degree) && `Class ${clean(c.degree)}`, clean(c.level) && `Type ${typeCode(c.level)}`, Number(c.counts) > 1 ? `Counts ${Number(c.counts)}` : ''].filter(Boolean).join(' - ');
        if (cls) { text(CX + 115, y, cls, 9); y -= 11; }
        y -= 6;
      });
      endSeg(66);

      // ---- recovered narcotics
      startSeg('RECOVERED NARCOTICS', 56);
      const narcotics = a.narcotics.filter(C.itemFilled);
      if (!narcotics.length) { y -= 6; big('NO NARCOTICS RECOVERED'); }
      else {
        const cols = [['Narcotic', 0], ['Amount', 0.26], ['Inventory #', 0.42], ['Description', 0.58]];
        cols.forEach(([l, f]) => text(CX + CW * f, y - 9, l, 9, true));
        y -= 13;
        for (const x of narcotics) {
          const vals = [clean(x.drug), [clean(x.amount), clean(x.unit)].filter(Boolean).join(' '), clean(x.inventory), clean(x.description)];
          const desc = wrap(vals[3], 9, CW * 0.42);
          ensure(desc.length * 11 + 4);
          vals.slice(0, 3).forEach((v2, i) => text(CX + CW * cols[i][1], y - 9, v2, 9));
          desc.forEach((l, j) => text(CX + CW * 0.58, y - 9 - j * 11, l, 9));
          y -= Math.max(1, desc.length) * 11 + 2;
        }
      }
      endSeg(56);

      // ---- warrant
      startSeg('WARRANT', 44);
      const warrants = a.warrants.filter(C.itemFilled);
      if (!warrants.length) { y -= 4; big('NO WARRANT IDENTIFIED'); }
      else {
        const cols = [['Warrant #', 0], ['Type', 0.2], ['Issued By', 0.4], ['Date Issued', 0.62], ['Offense', 0.78]];
        cols.forEach(([l, f]) => text(CX + CW * f, y - 9, l, 9, true));
        y -= 13;
        for (const x of warrants) {
          const vals = [clean(x.number), clean(x.kind), clean(x.issuedBy), US(x.issued), clean(x.offense)];
          const ws = [0.2, 0.2, 0.22, 0.16, 0.22];
          const cells = vals.map((v2, i) => wrap(v2, 9, CW * ws[i] - 6));
          const h = Math.max(...cells.map((c) => c.length)) * 11 + 2;
          ensure(h);
          cells.forEach((ls, i) => ls.forEach((l, j) => text(CX + CW * cols[i][1], y - 9 - j * 11, l, 9)));
          y -= h;
        }
      }
      endSeg(44);
      // The CB number on a tab at the right edge, as on the form.
      if (pages.length === who.firstPage + 1 && cb(a)) {
        const tx = PAGE_W - L + 4; const tb = 150; const th = 150;
        fill(tx, tb, 14, th, 0.8); rect(tx, tb, 14, th, 0.6);
        vtext(tx + 10, tb + (th - width(`CB #: ${cb(a)}`, 8, true)) / 2, `CB #: ${cb(a)}`, 8);
      }

      // ---- victim and complainant (non-offenders)
      const others = a.nonOffenders.filter(C.itemFilled);
      startSeg('NON-OFFENDER(S)', 60);
      subBand('VICTIM AND COMPLAINANT');
      if (!others.length) big('NONE');
      others.forEach((p, i) => {
        ensure(60);
        const t0 = y; const w1 = CW * 0.5; const x2 = CX + w1 + 6; const x3 = CX + CW * 0.76;
        let py = y - 9;
        text(CX, py, 'Name:', 9, true);
        text(CX + width('Name: ', 9, true), py, `${clean(p.name).toUpperCase()}${clean(p.role) ? `  (${clean(p.role)})` : ''}`, 9.5, true); py -= 12;
        if (clean(p.beat)) kv(CX + w1 - 58, py, 'Beat:', p.beat, { max: 58 });
        py -= kv(CX + 4, py, 'Res:', [clean(p.address), clean(p.phone)].filter(Boolean).join('\n'), { max: w1 - 64 }) + 1;
        if (clean(p.employer)) { if (clean(p.employerBeat)) kv(CX + w1 - 58, py, 'Beat:', p.employerBeat, { max: 58 }); py -= kv(CX + 4, py, 'Empl:', p.employer, { max: w1 - 64 }) + 1; }
        let qy = y - 9;
        for (const v2 of [clean(p.sex), clean(p.race)]) { if (v2) { text(x2, qy, v2, 9); qy -= 11; } }
        qy -= kv(x2, qy, 'DOB:', US(p.dob), { max: x3 - x2 - 4 }) + 1;
        qy -= kv(x2, qy, 'Age:', C.ageOn(p.dob, a.date), { max: x3 - x2 - 4 }) + 1;
        qy -= kv(x2, qy, 'Comments:', p.comments, { max: x3 - x2 - 6 }) + 1;
        let zy = y - 9;
        kv(x3, zy, 'Injured?', yn(p.injured), { max: 60 }); kv(x3 + 64, zy, 'Deceased?', yn(p.deceased), { max: 70 }); zy -= 18;
        kv(x3, zy, 'Hospitalized?', yn(p.hospitalized), { max: 130 }); zy -= 18;
        kv(x3, zy, 'Treated and Released?', yn(p.treated), { max: 130 }); zy -= 12;
        line(x2 - 4, t0 + 2, x2 - 4, Math.min(py, qy, zy) + 4, 0.4);
        y = Math.min(py, qy, zy) - 2;
        if (i < others.length - 1) { line(CX, y + 2, CX + CW, y + 2, 0.4); y -= 2; }
      });
      endSeg(60);

      // ---- arrestee vehicle
      startSeg('ARRESTEE VEHICLE', 56);
      if (C.VEHICLE_FIELDS.some((f) => clean(a[f.key]))) {
        let vy = y - 9;
        text(CX + 4, vy, 'Vehicle:', 9, true); kv(CX + CW * 0.28, vy, 'VEHICLE IMPOUNDED:', yn(a.impounded), { max: CW * 0.4 }); vy -= 12;
        text(CX + 4, vy, [a.vehYear, a.vehMake, a.vehModel, a.vehStyle].map(clean).filter(Boolean).join(' - '), 9);
        kv(CX + CW * 0.56, vy, 'VIN#:', a.vin, { max: CW * 0.26 }); kv(CX + CW * 0.83, vy, 'Lic#:', [clean(a.plate), clean(a.plateState)].filter(Boolean).join('  '), { max: CW * 0.17 }); vy -= 12;
        kv(CX + 4, vy, 'Color:', a.vehColor, { max: CW * 0.5 }); kv(CX + CW * 0.83, vy, 'Inv#:', a.vehInventory, { max: CW * 0.17 }); vy -= 12;
        kv(CX + 4, vy, 'Pound#:', a.poundNumber, { max: CW * 0.5 }); vy -= 12;
        vy -= kv(CX + 4, vy, 'Disposition:', a.vehDisposition, { max: CW - 8 });
        y = vy;
      } else { y -= 4; big('NO VEHICLE'); }
      endSeg(56);

      // ---- properties
      startSeg('PROPERTIES', 56);
      text(CX, y - 9, 'Confiscated Properties :', 9.5, true); y -= 12;
      for (const l of wrap('All confiscated properties are recorded with their inventory numbers; the inventory number retrieves the records of evidence and recovered property.', 7.5, CW, true)) { text(CX, y - 7, l, 7.5, true); y -= 9; }
      y -= 4;
      if (clean(a.property)) { for (const l of wrap(clean(a.property), 9, CW - 10)) { ensure(12); text(CX + 6, y - 9, l, 9); y -= 11; } } else big('NO PROPERTIES RECORDED');
      endSeg(56);

      // ---- incident narrative, carried over pages
      startSeg('INCIDENT NARRATIVE', 80);
      for (const l of wrap('(The facts for probable cause to arrest AND to substantiate the charges include, but are not limited to, the following)', 8, CW, true)) { text(CX, y - 8, l, 8, true); y -= 10; }
      y -= 2;
      const narr = wrap(P().plain(a.narrative), 9.5, CW - 4);
      for (const l of (clean(a.narrative) ? narr : [''])) { ensure(12); text(CX, y - 9, l, 9.5); y -= 11.5; }
      endSeg(80);

      // ---- court info and bond info, side by side
      ensure(92);
      const ct = y; const hw = (INNER - 4) / 2;
      const courtRows = [['Desired Court Date:', US(a.desiredCourtDate)], ['Branch:', a.courtBranch], ['Court Sgt Handle?', yn(a.courtSgt)], ['Initial Court Date:', US(a.initialCourtDate)], ['Branch:', a.initialBranch], ['Docket #:', a.docket]];
      const bondRows = [['Bond Date:', when(a.bondDate, a.bondTime)], ['Type:', a.bondType], ['Receipt #:', a.bondReceipt], ['Amount:', a.bond]];
      let cy = ct - 13; for (const [l, v2] of courtRows) cy -= kv(CX, cy, l, v2, { max: hw - TAB - 12 }) + 1;
      let by = ct - 13; for (const [l, v2] of bondRows) by -= kv(L + hw + 4 + TAB + 5, by, l, v2, { max: hw - TAB - 12 }) + 1;
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
        text(CX + 140, y - 10, clean(star) ? `#${clean(star)}` : '', 9);
        wrap(clean(name).toUpperCase(), 9, 128).slice(0, 2).forEach((l, j) => text(CX + 185, y - 10 - j * 10, l, 9));
        if (right) text(CX + 318, y - 10, right, 9);
        // The signature field on the right, clear of the date and time.
        if (sign) { const sx = CX + CW - 105; rect(sx, y - 18, 105, 18, 0.5); text(sx + 2, y - 5, 'SIGNATURE', 5.5); sigs.push({ name: sign, rect: [sx + 1, y - 17, sx + 104, y - 7] }); }
        y -= sign ? 22 : 14;
      };
      person('Attesting Officer:', a.attestingStar, a.attestingOfficer, when(a.attestingDate, a.attestingTime), sigName('AttestingOfficerSignature'));
      subBand('ARRESTING OFFICER(S):', 'Beat');
      person('1st Arresting Officer:', a.arrestingStar, a.arrestingOfficer, '');
      text(PAGE_W - L - 70, y + 4, clean(a.arrestingBeat), 9);
      person('Arresting Officer - Second:', a.secondStar, a.secondOfficer, '');
      text(PAGE_W - L - 70, y + 4, clean(a.secondBeat), 9);
      if (clean(a.assistingOfficers)) { y -= kv(CX, y - 10, 'Assisting Officers:', a.assistingOfficers, { max: CW }) - 2; y -= 6; }
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
    return P().assemble(layout(arrest, { ...opts, photos }), { photos: list, title: 'Arrest Report' });
  }

  const api = { build, layout, reportName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVArrestPdf = api;
})(this);
