/* CaseVault — the discovery receipt (v1.55). A printable PDF that goes with a production: who
 * turned it over and to whom, what it holds (each item with its Bates numbers and fingerprint), an
 * acknowledgment that the items received are accurate and complete, and lines for the wet
 * signatures of the recipient, the officer and a witness, with the date and time of receipt.
 * No agency seal or form number; the agency comes from My Profile.
 *
 *   CVDiscoveryReceipt.build(entry, { caseLabel, officer, agency, sizeText }) -> Uint8Array (PDF)
 * Plain logic over js/report-pdf.js's PDF writer, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const R = () => root.CVReportPdf || (typeof require === 'function' ? require('./report-pdf.js') : null);

  const ACK = 'I acknowledge that I received the discovery materials listed on this receipt. I have reviewed the list, and the items I received are accurate and complete as listed: each item carries the Bates numbers shown, and its SHA-256 fingerprint identifies the original file. I understand that the password needed to open the package was, or will be, given to me separately from the storage medium. My signature confirms receipt only; it does not waive any right, objection or privilege.';

  /** Pages for the receipt. */
  function layout(entry, opts = {}) {
    const P = R();
    const W = P.PAGE_W; const H = P.PAGE_H; const M = 54; const IN = W - 2 * M;
    const pages = []; let ops; let y;
    const esc = P.pdfString;
    const tw = (s, size, bold) => P.width(s, size, bold, 'helvetica');
    const wrap = (s, size, max, bold) => P.wrap(s, size, max, bold, 'helvetica');
    const text = (x, yy, s, size = 10, bold = false) => { if (s) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${esc(s)} Tj ET`); };
    const line = (x1, y1, x2, y2, w = 0.6) => ops.push(`${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    const rect = (x, yy, w, h, lw = 0.6) => ops.push(`${lw} w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const fill = (x, yy, w, h, g = 0.9) => ops.push(`${g} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
    const newPage = () => { ops = []; pages.push({ ops, sigs: [], imgs: [], signed: true }); y = H - M; };
    const ensure = (h) => { if (y - h < M + 30) { newPage(); text(M, y - 10, `Discovery Receipt (continued) · ${opts.caseLabel || ''}`, 9, true); y -= 24; } };

    newPage();
    text(M, y - 18, 'DISCOVERY RECEIPT', 18, true);
    if (opts.agency) text(M, y - 32, String(opts.agency).toUpperCase(), 8.5, true);
    const range = entry.batesFirst === entry.batesLast ? bates(entry.prefix, entry.batesFirst) : `${bates(entry.prefix, entry.batesFirst)} to ${bates(entry.prefix, entry.batesLast)}`;
    text(W - M - tw(range, 10, true), y - 18, range, 10, true);
    y -= 46;

    // The production, in label/value boxes (labels on a grey band, values on white).
    const box = (x, w, label, value, h = 30) => {
      fill(x, y - 11, w, 11); rect(x, y - h, w, h);
      text(x + 4, y - 8.5, label, 7, true);
      wrap(value || '', 10, w - 8).slice(0, Math.max(1, Math.floor((h - 19) / 11))).forEach((l, i) => text(x + 4, y - 22 - i * 11, l, 10));
    };
    // A row is as tall as its longest value (up to three lines), so nothing is cut off.
    const row = (cells) => {
      const tot = cells.reduce((n, c) => n + (c.w || 1), 0);
      const lines = Math.min(3, Math.max(1, ...cells.map((c) => wrap(c.value || '', 10, (IN * (c.w || 1)) / tot - 8).length)));
      const h = 19 + lines * 11;
      ensure(h); let x = M;
      for (const c of cells) { const w = (IN * (c.w || 1)) / tot; box(x, w, c.label, c.value, h); x += w; }
      y -= h;
    };
    row([{ label: 'CASE', value: opts.caseLabel || '', w: 2 }, { label: 'DATE PRODUCED', value: entry.produced || '' }, { label: 'BATES RANGE', value: range, w: 1.4 }]);
    row([{ label: 'PACKAGE', value: entry.folder || '', w: 2 }, { label: 'ITEMS', value: `${(entry.items || []).length} file${(entry.items || []).length === 1 ? '' : 's'}${opts.sizeText ? `, ${opts.sizeText}` : ''}` }, { label: 'STORAGE MEDIUM', value: opts.medium || '', w: 1.4 }]);
    row([{ label: 'TURNED OVER BY (OFFICER)', value: [opts.officer, opts.officerTitle].filter(Boolean).join(', '), w: 2 }, { label: 'TURNED OVER TO', value: entry.producedTo || '', w: 2.4 }]);
    // Date and time of receipt: filled in by hand at the hand-off.
    ensure(34);
    box(M, IN / 2, 'DATE OF RECEIPT', '', 34); box(M + IN / 2, IN / 2, 'TIME OF RECEIPT', '', 34);
    y -= 44;

    // The items.
    ensure(40);
    text(M, y - 10, 'ITEMS PRODUCED', 9, true); y -= 16;
    const cols = [[0, 22, '#'], [22, 116, 'BATES'], [138, 196, 'FILE'], [334, 34, 'PAGES'], [368, IN - 368, 'SHA-256 FINGERPRINT']];
    const head = () => { fill(M, y - 12, IN, 12, 0.88); rect(M, y - 12, IN, 12); for (const [x, , l] of cols) text(M + x + 3, y - 9, l, 6.5, true); y -= 12; };
    head();
    (entry.items || []).forEach((it, i) => {
      const name = wrap(String(it.path || '').split('/').pop(), 7.5, cols[2][1] - 6).slice(0, 3);
      const sha = String(it.sha256 || '');
      const shaLines = sha ? [sha.slice(0, 32), sha.slice(32)] : [''];
      const h = Math.max(name.length, shaLines.length) * 9 + 5;
      if (y - h < M + 30) { ensure(1000); head(); }
      if (i % 2) fill(M, y - h, IN, h, 0.96);
      rect(M, y - h, IN, h, 0.3);
      const b = it.batesFirst === it.batesLast ? bates(entry.prefix, it.batesFirst) : `${bates(entry.prefix, it.batesFirst)}-${String(it.batesLast).padStart(6, '0')}`;
      text(M + 3, y - 9, String(i + 1), 7.5);
      text(M + cols[1][0] + 3, y - 9, b, 7.5);
      name.forEach((l, j) => text(M + cols[2][0] + 3, y - 9 - j * 9, l, 7.5));
      text(M + cols[3][0] + 3, y - 9, String(it.pages || 1), 7.5);
      shaLines.forEach((l, j) => ops.push(`BT /F3 6.5 Tf ${(M + cols[4][0] + 3).toFixed(2)} ${(y - 9 - j * 9).toFixed(2)} Td ${esc(l)} Tj ET`));
      y -= h;
    });
    y -= 14;

    // The acknowledgment and the signatures (kept together).
    const ack = wrap(ACK, 9.5, IN - 16);
    ensure(ack.length * 12.5 + 40 + 3 * 62);
    text(M, y - 10, 'ACKNOWLEDGMENT OF RECEIPT', 9, true); y -= 16;
    rect(M, y - ack.length * 12.5 - 10, IN, ack.length * 12.5 + 10);
    ack.forEach((l, i) => text(M + 8, y - 14 - i * 12.5, l, 9.5));
    y -= ack.length * 12.5 + 22;
    const sigBlock = (title, printed) => {
      text(M, y - 9, title, 8.5, true);
      const c = [[0, IN * 0.46, 'SIGNATURE'], [IN * 0.49, IN * 0.31, 'PRINTED NAME'], [IN * 0.83, IN * 0.17, 'DATE / TIME']];
      for (const [x, w, l] of c) { line(M + x, y - 38, M + x + w, y - 38, 0.8); text(M + x, y - 47, l, 6.5); }
      if (printed) text(M + c[1][0] + 2, y - 34, printed, 10);
      y -= 62;
    };
    sigBlock('RECEIVED BY (RECIPIENT)', entry.producedTo || '');
    sigBlock('TURNED OVER BY (OFFICER)', opts.officer || '');
    sigBlock('WITNESS', '');
    text(M, y + 6, 'Sign in ink. Keep the signed original with the case; give a copy to the recipient.', 7.5);

    pages.forEach((p, i) => {
      const pg = `Page ${i + 1} of ${pages.length}`;
      p.ops.push(`BT /F1 8 Tf ${(W / 2 - tw(pg, 8) / 2).toFixed(2)} ${(M - 26).toFixed(2)} Td ${esc(pg)} Tj ET`);
      if (opts.caseLabel) p.ops.push(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 26).toFixed(2)} Td ${esc(opts.caseLabel)} Tj ET`);
      if (opts.printed) { const pr = `Printed ${opts.printed}`; p.ops.push(`BT /F1 7.5 Tf ${(W - M - tw(pr, 7.5)).toFixed(2)} ${(M - 26).toFixed(2)} Td ${esc(pr)} Tj ET`); }
    });
    return pages;
  }
  const bates = (prefix, n) => `${prefix}-${String(n).padStart(6, '0')}`;

  /** The receipt as PDF bytes. A third font (Courier) is added for the fingerprints. */
  function build(entry, opts = {}) {
    const P = R();
    const bytes = P.assemble(layout(entry, opts), { title: 'Discovery Receipt', face: 'helvetica' });
    // assemble writes /F1 and /F2; give the pages /F3 (Courier) too.
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return addCourier(s);
  }
  /** Adds a Courier font object as /F3 to every page's resources and rebuilds the xref. */
  function addCourier(pdf) {
    const objs = [];
    const re = /(\d+) 0 obj\n([\s\S]*?)\nendobj\n/g;
    let m;
    while ((m = re.exec(pdf))) objs[Number(m[1]) - 1] = m[2];
    const fontNum = objs.length + 1;
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    for (let i = 0; i < objs.length; i++) if (/\/Type \/Page\b/.test(objs[i]) && !/\/Type \/Pages/.test(objs[i])) objs[i] = objs[i].replace(/\/Font << ([^>]*)>>/, (all, inner) => `/Font << ${inner}/F3 ${fontNum} 0 R >>`);
    const tm = /trailer\n<< \/Size \d+ \/Root (\d+) 0 R \/Info (\d+) 0 R >>/.exec(pdf);
    let out = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
    const offs = [];
    objs.forEach((body, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${tm[1]} 0 R /Info ${tm[2]} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  const api = { ACK, layout, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVDiscoveryReceipt = api;
})(this);
