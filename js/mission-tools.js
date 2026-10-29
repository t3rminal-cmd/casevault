/* CaseVault — tools for a case or a whole Mission (v1.173), plain logic (the tests run it under Node):
 *
 *   icsCalendar(events, opts)   deadlines and court dates as a calendar file (.ics) for Outlook
 *   smartPaste(text)            a Timeline event's fields read from pasted CAD / RMS text
 *   packetMarkdown(cases, opts) the prosecutor packet: buys, totals per suspect, evidence, lab, custody
 *   labelNumbers(text)          the inventory numbers an evidence label's photo shows (OCR text)
 *   sharedInventory(cases)      an inventory number on the evidence lists of two case numbers
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const Rules = () => (isNode ? require('./checker/rules.js') : root.CVRules);
  const Health = () => (isNode ? require('./case-health.js') : root.CVHealth);
  const Custody = () => (isNode ? require('./custody.js') : root.CVCustody);
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------- calendar ---------------- */

  const icsText = (s) => clean(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
  // Lines longer than 75 octets are folded (RFC 5545).
  const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ` ${s.slice(74)}`; } out.push(s); return out.join('\r\n'); };
  /**
   * The case's deadlines and court dates (not done ones) as an iCalendar file. A date with a time is
   * at that local time (an hour long); without one it is an all-day entry. Each has a reminder the
   * day before. events: Timeline events (with caseNumber for a Mission); opts: { name, now }.
   */
  function icsCalendar(events, { name = 'CaseVault', now = new Date() } = {}) {
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CaseVault//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(name)}`];
    const list = (events || []).filter((e) => ['deadline', 'court'].includes(e.kind) && !e.done && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')));
    for (const e of list) {
      const d = e.date.replace(/-/g, '');
      const t = /^(\d{1,2}):(\d{2})$/.exec(String(e.time || ''));
      const what = `${e.kind === 'court' ? 'Court' : 'Deadline'}: ${clean(e.title) || (e.kind === 'court' ? 'Court date' : 'Deadline')}${e.caseNumber ? ` (${e.caseNumber})` : ''}`;
      lines.push('BEGIN:VEVENT', `UID:${clean(e.id) || `${d}-${Math.random().toString(36).slice(2)}`}@casevault.local`, `DTSTAMP:${stamp}`);
      if (t) {
        const h = Number(t[1]); const m = Number(t[2]);
        lines.push(`DTSTART:${d}T${pad(h)}${pad(m)}00`, `DTEND:${d}T${pad((h + 1) % 24)}${pad(m)}00`);
      } else {
        const next = new Date(`${e.date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`);
      }
      lines.push(`SUMMARY:${icsText(what)}`);
      if (clean(e.note)) lines.push(`DESCRIPTION:${icsText(e.note)}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(what)}`, 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.map(fold).join('\r\n')}\r\n`;
  }

  /* ---------------- smart paste ---------------- */

  const BUY_WORDS = /\b(?:buy|bought|purchas\w*|sold|controlled\s+(?:buy|purchase)|undercover|UC\b|narcotics?\s+transaction)/i;
  const ARREST_WORDS = /\b(?:arrest\w*|taken\s+into\s+custody|in\s+custody|handcuffed)\b/i;
  const COURT_WORDS = /\b(?:court|hearing|arraignment|trial|preliminary\s+exam|bond\s+court)\b/i;
  const DRUG_NAME = { cocaine: 'Cocaine', heroin: 'Heroin', fentanyl: 'Fentanyl', methamphetamine: 'Methamphetamine', cannabis: 'Cannabis', mdma: 'MDMA', oxycodone: 'Oxycodone', pcp: 'PCP' };
  /**
   * The fields of a Timeline event, from text pasted from CAD, RMS or a report: the first date and
   * time, the kind (a buy, an arrest, a court date, else an event), a title (the first sentence),
   * for a buy the drug, amount and money paid, and the plate, address and inventory numbers found.
   * The whole text goes in the note. -> { date, time, kind, title, note, drug, qty, unit, paid, found: [text] }
   */
  function smartPaste(text) {
    const R = Rules();
    const t = String(text || '').replace(/\r\n?/g, '\n').trim();
    const facts = R.extractFacts(t.replace(/\n+/g, ' '));
    const first = (type) => facts.find((f) => f.type === type);
    const date = first('date');
    const time = first('time');
    const kind = BUY_WORDS.test(t) ? 'buy' : ARREST_WORDS.test(t) ? 'arrest' : COURT_WORDS.test(t) ? 'court' : 'event';
    // The title: the first real sentence, not a record number line ("CAD 26-123456", "RD JA123456").
    const parts = t.split(/(?<=[.!?])\s+|\n/).map(clean).filter((x) => x.length > 3);
    const sentence = (parts.find((x) => x.length >= 15 && !/^(?:CAD|RD|CB|IR|Event|Incident|Case|Report)\b[\s#:]*[\w-]*\d[\w-]*\.?$/i.test(x)) || parts[0] || '').replace(/[.!?]+$/, '');
    const out = { date: date && !date.value.startsWith('XXXX') ? date.value : '', time: time ? time.value : '', kind, title: sentence.slice(0, 120), note: t.slice(0, 4000), drug: '', qty: '', unit: 'g', paid: '', found: [] };
    if (date) out.found.push(`Date: ${date.display}`);
    if (time) out.found.push(`Time: ${time.display}`);
    if (kind === 'buy') {
      const drug = [...Health().drugsIn(t)][0];
      if (drug) { out.drug = DRUG_NAME[drug] || drug; out.found.push(`Narcotic: ${out.drug}`); }
      const money = facts.find((f) => f.type === 'money' && !f.total);
      if (money) { out.paid = String(Number(money.value) / 100); out.found.push(`Paid: ${money.display}`); }
      const w = facts.find((f) => f.type === 'weight' && !f.total);
      if (w) {
        const m = /^([\d.,]+)\s*([a-z]+)/i.exec(w.display);
        const unit = m ? m[2].toLowerCase() : '';
        const u = /^(kilo|kg)/.test(unit) ? 'kg' : /^(ounce|oz)/.test(unit) ? 'oz' : /^(pound|lb)/.test(unit) ? 'lb' : 'g';
        out.qty = m ? m[1].replace(/,/g, '') : ''; out.unit = u;
        out.found.push(`Amount: ${w.display}`);
      }
    }
    for (const f of facts.filter((x) => ['plate', 'address', 'inventory'].includes(x.type))) out.found.push(`${{ plate: 'Plate', address: 'Address', inventory: 'Inventory' }[f.type]}: ${f.type === 'inventory' ? `#${f.value}` : f.display}`);
    return out;
  }

  /* ---------------- prosecutor packet ---------------- */

  const money = (v) => { const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
  const dollars = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const esc = (s) => clean(s).replace(/\|/g, '/');
  /**
   * The prosecutor packet as Markdown (made into a PDF by the app): the buys and the totals per
   * suspect, the evidence with inventory numbers and lab status, and each exhibit's chain of custody.
   * cases: [{ number, subject, events, evidence, labReports: [file names] }]; opts: { title, label, made }.
   */
  function packetMarkdown(cases, { title = 'Prosecutor Packet', label = '', made = '' } = {}) {
    const out = [`# ${title}`, ''];
    if (label || made) out.push(`**${[label, made ? `Made ${made}` : ''].filter(Boolean).join(' · ')}**`, '');
    const many = cases.length > 1;
    // 1. The buys, then the totals per suspect.
    const buys = cases.flatMap((c) => (c.events || []).filter((e) => e.kind === 'buy').map((e) => ({ ...e, caseNumber: c.number })))
      .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
    out.push('## Buy Summary', '');
    if (!buys.length) out.push('No buys on the Timeline.', '');
    else {
      out.push(`| Buy | Date |${many ? ' Case |' : ''} Suspect | Narcotic | Amount | Paid |`, `|---|---|${many ? '---|' : ''}---|---|---|---|`);
      buys.forEach((b, i) => out.push(`| ${i + 1} | ${esc(b.date)}${b.time ? ` ${esc(b.time)}` : ''} |${many ? ` ${esc(b.caseNumber)} |` : ''} ${esc(b.suspect) || '—'} | ${esc(b.drug) || '—'} | ${clean(b.qty) ? `${esc(b.qty)} ${esc(b.unit || 'g')}` : '—'} | ${money(b.paid) != null ? dollars(money(b.paid)) : '—'} |`));
      out.push('');
      const per = new Map();
      for (const b of buys) {
        const k = clean(b.suspect) || 'Suspect not given';
        const x = per.get(k) || { n: 0, paid: 0, grams: 0, drugs: new Set() };
        x.n += 1; x.paid += money(b.paid) || 0; if (clean(b.drug)) x.drugs.add(clean(b.drug));
        const g = Rules().buyGrams ? Rules().buyGrams(b) : null; if (g) x.grams += g;
        per.set(k, x);
      }
      out.push('### Totals per Suspect', '', '| Suspect | Buys | Narcotics | Total Weight | Total Paid |', '|---|---|---|---|---|');
      for (const [k, x] of per) out.push(`| ${esc(k)} | ${x.n} | ${esc([...x.drugs].join(', ')) || '—'} | ${x.grams ? `${Math.round(x.grams * 100) / 100} g` : '—'} | ${dollars(x.paid)} |`);
      const all = [...per.values()].reduce((t, x) => t + x.paid, 0);
      out.push(`| **All** | **${buys.length}** | | | **${dollars(all)}** |`, '');
    }
    // 2. The evidence, with where each one is and its lab status.
    const ex = cases.flatMap((c) => (c.evidence || []).filter((e) => clean(e.inventory) || clean(e.description) || clean(e.drug)).map((e) => ({ ...e, caseNumber: c.number })));
    out.push('## Evidence', '');
    if (!ex.length) out.push('No exhibits on the evidence list.', '');
    else {
      out.push(`| Exhibit |${many ? ' Case |' : ''} Inventory # | Item | Weight | Lab | Now |`, `|---|${many ? '---|' : ''}---|---|---|---|---|`);
      for (const e of ex) {
        const log = Custody().normalize(e.custody);
        const back = log.filter((x) => x.action === 'Returned from Lab').pop();
        const sent = log.filter((x) => x.action === 'Sent to Lab').pop();
        const lab = back ? `Results back ${back.date}` : sent ? `Sent ${sent.date}, not back` : /narcotic/i.test(clean(e.type)) ? 'Not sent' : '—';
        const st = Custody().status(e.custody);
        out.push(`| ${esc(e.number)} |${many ? ` ${esc(e.caseNumber)} |` : ''} ${esc(e.inventory) || '—'} | ${esc([e.type === 'Narcotics' && e.drug ? e.drug : e.type, e.description].filter(Boolean).join(', ')) || '—'} | ${esc(e.weight) || '—'} | ${esc(lab)} | ${st.last ? esc(`${st.last.action} ${st.last.date}`) : '—'} |`);
      }
      out.push('');
    }
    const labs = cases.flatMap((c) => (c.labReports || []).map((f) => `${many ? `${c.number}: ` : ''}${f}`));
    if (labs.length) out.push('### Lab Reports Attached', '', ...labs.map((f) => `- ${esc(f)}`), '');
    // 3. Each exhibit's chain of custody.
    out.push('## Chain of Custody', '');
    const logged = ex.filter((e) => Custody().normalize(e.custody).length);
    if (!logged.length) out.push('No custody entries yet.', '');
    for (const e of logged) {
      out.push(`### Exhibit ${esc(e.number)}${clean(e.inventory) ? `, Inventory #${esc(e.inventory)}` : ''}${many ? ` (${esc(e.caseNumber)})` : ''}`, '', '| Date / Time | Action | Released By | Received By | Purpose |', '|---|---|---|---|---|');
      for (const x of Custody().normalize(e.custody)) out.push(`| ${esc(x.date)}${x.time ? ` ${esc(x.time)}` : ''} | ${esc(x.action)} | ${esc(x.from) || '—'} | ${esc(x.to) || '—'} | ${esc(x.purpose) || '—'} |`);
      const gaps = Health().custodyGaps(e).filter((g) => g.severity !== 'Low');
      if (gaps.length) out.push('', ...gaps.map((g) => `- **Gap:** ${g.text.replace(/^Exhibit [^:]+: /, '')}`));
      out.push('');
    }
    return out.join('\n');
  }

  /* ---------------- evidence labels ---------------- */

  /** The inventory numbers an evidence label's photo shows: "Inventory #12345678", "INV 12345678",
   * or a lone 7 to 10 digit number on its own line. -> [digits] */
  function labelNumbers(text) {
    const t = String(text || '');
    const out = new Set();
    for (const f of Rules().extractFacts(t.replace(/\n+/g, ' '))) if (f.type === 'inventory') out.add(f.value);
    for (const m of t.matchAll(/(?:^|\n)\s*#?\s*(\d{7,10})\s*(?=\n|$)/g)) out.add(m[1]);
    return [...out];
  }
  /** One exhibit's photo read: matches its inventory number, shows another, or shows none. */
  function labelVerdict(inventory, numbers) {
    const want = clean(inventory).replace(/\D/g, '');
    if (!numbers.length) return { state: 'none' };
    if (want && numbers.includes(want)) return { state: 'match', number: want };
    const near = want ? numbers.find((n) => levenshtein(n, want) <= 2) : null;
    return { state: want ? 'differs' : 'unlisted', number: near || numbers[0], near: !!near };
  }
  function levenshtein(a, b) {
    const m = a.length; const n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  /** v1.173: the same inventory number on the evidence lists of two case numbers of a Mission. -> [{ inventory, cases: [number] }] */
  function sharedInventory(cases) {
    const seen = new Map();
    for (const c of cases || []) for (const e of c.evidence || []) {
      const v = clean(e.inventory).replace(/\D/g, '');
      if (!v) continue;
      if (!seen.has(v)) seen.set(v, new Set());
      seen.get(v).add(c.number || '?');
    }
    return [...seen].filter(([, s]) => s.size > 1).map(([inventory, s]) => ({ inventory, cases: [...s] }));
  }

  const api = { icsCalendar, smartPaste, packetMarkdown, labelNumbers, labelVerdict, sharedInventory };
  if (isNode) module.exports = api;
  else root.CVMissionTools = api;
})(this);
