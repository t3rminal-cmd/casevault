/* CaseVault — the Arrest Report as a PDF (Arrest details tab → Print / PDF, Save PDF to Case,
 * Email for E-Sign). v1.30.
 *
 * Laid out like an arrest report, in the same style as the Supplementary Report PDF (grey title
 * bands, boxed fields with small labels, page numbers): the report numbers across the top, then
 * Offender (with the arrestee's photo), Incident, Charges, Recovered Narcotics, Warrant, Victim
 * and Complainant, Arrestee Vehicle, Properties, Incident Narrative, Court and Bond, and Reporting
 * Personnel with signature fields. One report per arrestee, each starting on a new page. The
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
    const { wrap, width, pdfString, PAGE_W, PAGE_H, M } = P();
    const C = K();
    const INNER = PAGE_W - 2 * M;
    const people = C.normalizeArrest(arrest).arrestees;
    const pages = [];
    let ops = null; let y = 0; let sigs = null; let who = null;

    const text = (x, yy, s, size = 9, bold = false) => { if (s !== '' && s != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(s)} Tj ET`); };
    const line = (x1, y1, x2, y2, w = 0.6) => ops.push(`${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    const rect = (x, yy, w, h, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const fill = (x, yy, w, h, gray = 0.9) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);

    const newPage = () => {
      ops = []; sigs = [];
      pages.push({ ops, sigs, imgs: [] });
      y = PAGE_H - M;
      const title = 'ARREST REPORT';
      text(M, y - 10, agency || '', 9, true);
      text(PAGE_W / 2 - width(title, 13, true) / 2, y - 12, title, 13, true);
      const cb = who && clean(who.bookingNumber) ? `CB # ${clean(who.bookingNumber)}` : '';
      if (cb) text(PAGE_W - M - width(cb, 9, true), y - 10, cb, 9, true);
      // From the second page of a report on, the arrestee's name under the CB number.
      if (who && pages.length > who.firstPage + 1 && reportName(who)) text(PAGE_W - M - width(reportName(who), 8), y - 19, reportName(who), 8);
      y -= 22;
      line(M, y, PAGE_W - M, y, 1.2);
      y -= 6;
    };
    const ensure = (h) => { if (y - h < M + 18) newPage(); };

    const band = (label) => {
      ensure(40);
      fill(M, y - 13, INNER, 13, 0.88);
      rect(M, y - 13, INNER, 13);
      text(M + 4, y - 9.6, label.toUpperCase(), 8, true);
      y -= 13;
    };

    // A row of labelled boxes (widths are shares of the row, within x .. x + w). Returns its height.
    const boxes = (cells, { minH = 24, x0 = M, w0 = INNER, keep = false } = {}) => {
      const total = cells.reduce((n, c) => n + (c.w || 1), 0);
      const sizes = cells.map((c) => ((c.w || 1) / total) * w0);
      const lines = cells.map((c, i) => wrap(c.value || '', 9, sizes[i] - 8));
      const h = Math.max(minH, 13 + Math.max(...lines.map((l) => l.length)) * 10.5);
      if (!keep) ensure(h);
      let x = x0;
      cells.forEach((c, i) => {
        rect(x, y - h, sizes[i], h);
        text(x + 3, y - 7.5, String(c.label || '').toUpperCase(), 6, false);
        lines[i].forEach((l, j) => text(x + 4, y - 17.5 - j * 10.5, l, 9, c.bold));
        if (c.sign) sigs.push({ name: c.sign, rect: [x + 2, y - h + 1, x + sizes[i] - 2, y - 9] });
        x += sizes[i];
      });
      y -= h;
      return h;
    };
    const v = (a, key, label, w = 1) => {
      const f = [...C.ARRESTEE_FIELDS, ...C.ARREST_FIELDS].find((x) => x.key === key);
      return { label: label || (f ? f.label : key), value: f && f.type === 'date' ? US(a[key]) : clean(a[key]), w };
    };
    // A line in capitals across the section, for "No narcotics recovered" and the like.
    const note = (s) => { ensure(18); rect(M, y - 18, INNER, 18); text(M + 8, y - 12.5, s.toUpperCase(), 8.5, true); y -= 18; };

    // A table: head row, then one row per item; rows break across pages with the head repeated.
    const table = (cols, rows) => {
      const total = cols.reduce((n, c) => n + c.w, 0);
      const ws = cols.map((c) => (c.w / total) * INNER);
      const head = () => {
        ensure(14);
        let x = M;
        cols.forEach((c, i) => { fill(x, y - 13, ws[i], 13, 0.95); rect(x, y - 13, ws[i], 13); text(x + 3, y - 9.3, c.label.toUpperCase(), 6.5, true); x += ws[i]; });
        y -= 13;
      };
      head();
      for (const r of rows) {
        const cells = r.map((s, i) => wrap(s || '', 9, ws[i] - 6));
        const h = Math.max(15, 5 + Math.max(...cells.map((l) => l.length)) * 11);
        if (y - h < M + 18) { newPage(); head(); }
        let x = M;
        cells.forEach((ls, i) => { rect(x, y - h, ws[i], h); ls.forEach((l, j) => text(x + 3, y - 10.5 - j * 11, l, 9)); x += ws[i]; });
        y -= h;
      }
    };

    // A long text in a box that runs on over pages.
    const textBlock = (s, { intro = '' } = {}) => {
      const lines = wrap(s || '', 10, INNER - 12);
      let top = y;
      const closeBox = () => { if (top > y) rect(M, y - 4, INNER, top - y + 4); };
      y -= 2;
      if (intro) { for (const l of wrap(intro, 7.5, INNER - 12, true)) { ensure(12); text(M + 6, y - 9, l, 7.5, true); y -= 10; } y -= 2; }
      for (const l of (lines.length && clean(s) ? lines : [''])) {
        if (y - 13 < M + 18) { closeBox(); newPage(); top = y; y -= 4; }
        text(M + 6, y - 10, l, 10);
        y -= 13;
      }
      closeBox();
      y -= 8;
    };

    people.forEach((a, n) => {
      who = { ...a, firstPage: pages.length };
      newPage();
      const age = C.ageOn(a.dob, a.date);

      // ---- report numbers
      boxes([v(a, 'bookingNumber', 'CB #'), v(a, 'irNumber'), v(a, 'ydNumber'), { ...v(a, 'rdNumber'), value: clean(a.rdNumber) || clean(caseNumber) }, v(a, 'eventNumber')]);
      if (people.length > 1) boxes([{ label: 'Arrestee', value: `${n + 1} of ${people.length}`, w: 1 }, { label: 'Case', value: caseLabel, w: 4 }], { minH: 22 });
      else if (caseLabel) boxes([{ label: 'Case', value: caseLabel }], { minH: 22 });
      y -= 6;

      // ---- offender, with the photo on the right
      band('Offender');
      const ph = photos[n];
      const leftW = ph ? INNER * 0.76 : INNER;
      const rows = [
        [{ label: 'Name', value: reportName(a), w: 2.4, bold: true }, v(a, 'beatResidence', 'Beat', 0.6)],
        [{ ...v(a, 'address', 'Residence'), w: 3 }],
        [v(a, 'dob', 'Date of birth'), { label: 'Age', value: age ? `${age} years` : '', w: 0.7 }, v(a, 'pob', 'Place of birth', 1.3)],
        [v(a, 'idNumber', 'DLN', 1.4), v(a, 'armedWith', 'Armed with', 1.6)],
        [v(a, 'sex'), v(a, 'race'), v(a, 'height'), v(a, 'weight')],
        [v(a, 'eyes'), v(a, 'hair'), v(a, 'hairStyle'), v(a, 'complexion')],
      ];
      // Measure first so the whole block (and the photo beside it) stays on one page.
      const measure = (cells) => { const total = cells.reduce((s, c) => s + (c.w || 1), 0); return Math.max(24, 13 + Math.max(...cells.map((c) => wrap(c.value || '', 9, ((c.w || 1) / total) * leftW - 8).length)) * 10.5); };
      const blockH = rows.reduce((s, r) => s + measure(r), 0);
      ensure(blockH);
      const top = y;
      for (const r of rows) boxes(r, { x0: M, w0: leftW, keep: true });
      if (ph) {
        const bx = M + leftW; const bw = INNER - leftW; const bh = top - y;
        rect(bx, y, bw, bh);
        const k = Math.min((bw - 8) / ph.w, (bh - 8) / ph.h);
        const w = ph.w * k; const hgt = ph.h * k;
        ops.push(`q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${(bx + (bw - w) / 2).toFixed(2)} ${(y + (bh - hgt) / 2).toFixed(2)} cm /Im${ph.index} Do Q`);
        pages[pages.length - 1].imgs.push(ph.index);
      }
      y -= 6;

      // ---- incident
      band('Incident');
      boxes([v(a, 'date', 'Arrest date'), v(a, 'time', 'Arrest time', 0.7), v(a, 'beat', 'Beat', 0.6), v(a, 'type', 'Type of arrest', 1.2)]);
      boxes([{ ...v(a, 'location'), w: 2 }, v(a, 'facility', 'Holding facility', 1.4)]);
      boxes([v(a, 'resisted'), v(a, 'cma'), v(a, 'trr'), { label: 'Miranda', value: [clean(a.miranda), clean(a.mirandaTime)].filter(Boolean).join(', '), w: 1.4 }]);
      boxes([v(a, 'totalArrested'), v(a, 'coArrests'), v(a, 'assocCases'), v(a, 'dcfsWard'), v(a, 'dependentChildren')]);
      y -= 6;

      // ---- charges
      band('Charges');
      const charges = a.charges.filter((c) => clean(c.statute) || clean(c.description));
      if (charges.length) {
        table([{ label: '#', w: 0.35 }, { label: 'Offense as cited', w: 1.7 }, { label: 'Charge', w: 3 }, { label: 'Class', w: 0.6 }, { label: 'Type', w: 1 }, { label: 'Counts', w: 0.55 }, { label: 'Victim', w: 1.2 }],
          charges.map((c, i) => [String(i + 1), clean(c.statute), clean(c.description), clean(c.degree), clean(c.level), clean(c.counts), clean(c.victim)]));
      } else note('No charges entered');
      y -= 6;

      // ---- recovered narcotics
      band('Recovered Narcotics');
      const narcotics = a.narcotics.filter(C.itemFilled);
      if (narcotics.length) {
        table([{ label: 'Narcotic', w: 1.6 }, { label: 'Amount', w: 0.9 }, { label: 'Inventory #', w: 1.1 }, { label: 'Description', w: 3 }],
          narcotics.map((x) => [clean(x.drug), [clean(x.amount), clean(x.unit)].filter(Boolean).join(' '), clean(x.inventory), clean(x.description)]));
      } else note('No narcotics recovered');
      y -= 6;

      // ---- warrant
      band('Warrant');
      const warrants = a.warrants.filter(C.itemFilled);
      if (warrants.length) {
        table([{ label: 'Warrant #', w: 1.3 }, { label: 'Type', w: 1.2 }, { label: 'Issued by', w: 1.5 }, { label: 'Date issued', w: 0.9 }, { label: 'Offense', w: 2.4 }],
          warrants.map((x) => [clean(x.number), clean(x.kind), clean(x.issuedBy), US(x.issued), clean(x.offense)]));
      } else note('No warrant identified');
      y -= 6;

      // ---- victim and complainant (non-offenders)
      band('Victim and Complainant');
      const others = a.nonOffenders.filter(C.itemFilled);
      if (!others.length) note('None');
      others.forEach((p, i) => {
        ensure(24 * 4);
        boxes([{ label: `${i + 1}. ${clean(p.role) || 'Person'}`, value: clean(p.name), w: 2.4, bold: true }, { label: 'Sex', value: clean(p.sex) }, { label: 'Race / ethnicity', value: clean(p.race) }, { label: 'Date of birth', value: US(p.dob) }, { label: 'Age', value: C.ageOn(p.dob, a.date), w: 0.5 }]);
        boxes([{ label: 'Residence', value: clean(p.address), w: 2.4 }, { label: 'Beat', value: clean(p.beat), w: 0.6 }, { label: 'Phone', value: clean(p.phone), w: 1.1 }]);
        if (clean(p.employer) || clean(p.employerBeat)) boxes([{ label: 'Employer address', value: clean(p.employer), w: 3.5 }, { label: 'Beat', value: clean(p.employerBeat), w: 0.6 }]);
        boxes([{ label: 'Injured?', value: clean(p.injured) }, { label: 'Deceased?', value: clean(p.deceased) }, { label: 'Hospitalized?', value: clean(p.hospitalized) }, { label: 'Treated and released?', value: clean(p.treated) }]);
        if (clean(p.comments)) boxes([{ label: 'Comments', value: clean(p.comments) }]);
        y -= 3;
      });
      y -= 3;

      // ---- arrestee vehicle
      band('Arrestee Vehicle');
      if (C.VEHICLE_FIELDS.some((f) => clean(a[f.key]))) {
        boxes([{ label: 'Vehicle', value: [a.vehYear, a.vehMake, a.vehModel, a.vehStyle].map(clean).filter(Boolean).join(' - '), w: 2.6 }, v(a, 'vehColor', 'Color', 1.2), v(a, 'impounded', 'Vehicle impounded?', 0.9)]);
        boxes([v(a, 'vin', 'VIN', 1.8), v(a, 'plate', 'Licence plate', 1.1), v(a, 'plateState', 'State', 0.5), v(a, 'poundNumber', 'Pound #'), v(a, 'vehInventory', 'Inv #')]);
        if (clean(a.vehDisposition)) boxes([v(a, 'vehDisposition', 'Disposition')]);
      } else note('No vehicle');
      y -= 6;

      // ---- properties
      band('Properties');
      if (clean(a.property)) textBlock(a.property, { intro: 'Confiscated properties (inventory numbers and description):' });
      else { note('No properties recorded'); y -= 6; }

      // ---- incident narrative
      band('Incident Narrative');
      textBlock(P().plain(a.narrative), { intro: 'The facts for probable cause to arrest and to support the charges include, but are not limited to, the following:' });

      // ---- court and bond
      ensure(24 * 3 + 30);
      band('Court and Bond');
      boxes([v(a, 'desiredCourtDate', 'Desired court date'), v(a, 'courtBranch', 'Branch', 2.2), v(a, 'courtSgt', 'Court sgt handle?', 0.9)]);
      boxes([v(a, 'initialCourtDate', 'Initial court date'), v(a, 'initialBranch', 'Branch', 2.2), v(a, 'docket', 'Docket #', 0.9)]);
      boxes([{ label: 'Bond date', value: when(a.bondDate, a.bondTime) }, v(a, 'bondType', 'Type', 1.3), v(a, 'bondReceipt', 'Receipt #'), v(a, 'bond', 'Amount')]);
      y -= 6;

      // ---- reporting personnel (kept together)
      ensure(13 + 30 + 36 * 2 + 24 * 3 + 10);
      band('Reporting Personnel');
      const decl = wrap('I declare and affirm, under penalty of perjury, that the facts stated in this report are accurate to the best of my knowledge, information and belief.', 7.5, INNER - 12, true);
      rect(M, y - (decl.length * 9.5 + 6), INNER, decl.length * 9.5 + 6);
      decl.forEach((l, j) => text(M + 6, y - 10 - j * 9.5, l, 7.5, true));
      y -= decl.length * 9.5 + 6;
      const sigName = (s) => `${s}${people.length > 1 ? `_${n + 1}` : ''}`;
      boxes([v(a, 'attestingOfficer', 'Attesting officer', 2), v(a, 'attestingStar', 'Star #', 0.7), { label: 'Date and time', value: when(a.attestingDate, a.attestingTime), w: 1.1 }, { label: 'Signature', value: '', w: 2, sign: sigName('AttestingOfficerSignature') }], { minH: 36 });
      boxes([v(a, 'arrestingOfficer', '1st arresting officer', 2), v(a, 'arrestingStar', 'Star #', 0.7), v(a, 'arrestingBeat', 'Beat', 0.7), { label: '', value: '', w: 2.4 }]);
      boxes([v(a, 'secondOfficer', 'Second arresting officer', 2), v(a, 'secondStar', 'Star #', 0.7), v(a, 'secondBeat', 'Beat', 0.7), { ...v(a, 'assistingOfficers', 'Assisting officers'), w: 2.4 }]);
      boxes([v(a, 'supervisor', 'Approving supervisor - probable cause', 2), v(a, 'supervisorStar', 'Star #', 0.7), { label: 'Date and time', value: when(a.approvalDate, a.approvalTime), w: 1.1 }, { label: 'Signature', value: '', w: 2, sign: sigName('SupervisorSignature') }], { minH: 36 });
    });

    // Footer with page numbers.
    pages.forEach((p, i) => {
      const f = `${caseLabel ? `${caseLabel}  ·  ` : ''}${printed ? `Printed ${printed}  ·  ` : ''}Page ${i + 1} of ${pages.length}`;
      p.ops.push(`BT /F1 7.5 Tf ${(PAGE_W - M - width(f, 7.5)).toFixed(2)} ${(M - 12).toFixed(2)} Td ${pdfString(f)} Tj ET`);
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
