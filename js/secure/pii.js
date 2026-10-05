/* CaseVault — PII scanner and redactor.
 *
 * Runs entirely on this computer. It finds personal and case-identifying details with patterns and
 * with the names CaseVault already knows (the case's client, number and title, "My details", and
 * the watch list in Settings), then either reports them (department mail is checked before it is
 * handed to Outlook) or swaps them for placeholders, e.g. "[NAME_1]", "[PHONE_2]" (redact()), and
 * rehydrate() can put the real values back.
 *
 * Detection is a safety net, not a guarantee: names in particular can be missed.
 *
 * Plain logic with no DOM, so the tests run it under Node.
 */
'use strict';

(function (root) {
  // type -> label, placeholder tag, and how serious it is. "locked" types are always redacted.
  const TYPES = {
    ssn: { label: 'Social Security number', tag: 'SSN', level: 'critical', locked: true },
    card: { label: 'Payment card number', tag: 'CARD', level: 'critical', locked: true },
    bank: { label: 'Bank account / routing number', tag: 'ACCOUNT', level: 'critical', locked: true },
    dob: { label: 'Date of birth', tag: 'DOB', level: 'critical', locked: true },
    dl: { label: "Driver's licence / ID number", tag: 'ID', level: 'critical', locked: true },
    passport: { label: 'Passport number', tag: 'PASSPORT', level: 'critical', locked: true },
    known: { label: 'Known name or case detail', tag: 'NAME', level: 'high', locked: true },
    casenum: { label: 'Case / report number', tag: 'CASENO', level: 'high', locked: true },
    phone: { label: 'Phone number', tag: 'PHONE', level: 'high', locked: true },
    email: { label: 'Email address', tag: 'EMAIL', level: 'high', locked: true },
    address: { label: 'Street address', tag: 'ADDRESS', level: 'high', locked: true },
    plate: { label: 'Licence plate', tag: 'PLATE', level: 'high', locked: true },
    vin: { label: 'Vehicle identification number', tag: 'VIN', level: 'high', locked: true },
    ip: { label: 'IP address', tag: 'IP', level: 'medium', locked: true },
    person: { label: 'Possible person name', tag: 'NAME', level: 'medium', locked: false },
  };
  const LEVEL_ORDER = { critical: 0, high: 1, medium: 2 };

  // Titles that are usually followed by a person's name in police writing.
  const TITLES = 'Mr|Mrs|Ms|Miss|Mx|Dr|Det|Detective|Officer|Ofc|Off|Sgt|Sergeant|Lt|Lieutenant|Capt|Captain|Cpl|Corporal|Agent|SA|TFO|Deputy|Dep|Trooper|Tpr|Inv|Investigator|Chief|Judge|Hon|Attorney|Atty|Suspect|Victim|Witness|Defendant|Subject|Complainant|Informant|CI|CS|Juvenile|Arrestee|Driver|Passenger|Owner|Mother|Father|Brother|Sister';
  const NAME_WORD = "[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?";
  const NAME_WORD_CAPS = "[A-Z]{2,}(?:[-'][A-Z]{2,})?";

  // Capitalised words that are not names, so "Police Department" or "Main Street" aren't flagged.
  const NOT_NAMES = new Set(('The A An And Or Of In On At To For From By With Without Into Onto Over Under About After Before During ' +
    'January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday ' +
    'Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec Mon Tue Wed Thu Fri Sat Sun ' +
    'Police Department Sheriff Sheriffs Office County City State Court District Circuit Superior Federal United States America Americas ' +
    'Street St Avenue Ave Road Rd Boulevard Blvd Drive Dr Lane Ln Court Ct Place Pl Highway Hwy Parkway Pkwy Circle Way Terrace Trail North South East West ' +
    'Report Case Arrest Supplementary Supplemental Affidavit Warrant Search Probable Cause Narrative Summary Evidence Exhibit Drug Task Force Unit Division Bureau ' +
    'Investigation Investigations Operations Operation Plan Subpoena Response Information Vehicle Subject Recording Recordings Maps Other Email Deconfliction ' +
    'Honda Toyota Ford Chevrolet Chevy Nissan Dodge Jeep Hyundai Kia Tesla Bmw Mercedes Benz Volkswagen Subaru Mazda Lexus Acura Buick Cadillac Chrysler Gmc Ram Audi ' +
    'I We He She They It You My Our His Her Their This That These Those Then There Here When Where While Upon Also Mr Mrs Ms Dr ' +
    'Section Page Item Items Count Counts Total Amount Date Time Location Address Phone Number Name Names Type Status Notes Note Draft Confirm ' +
    'Lab Laboratory Narcotics Cocaine Heroin Fentanyl Methamphetamine Marijuana Cannabis Crack Pills Cash Currency Firearm Handgun Rifle ' +
    'Monday Morning Afternoon Evening Night Today Yesterday Tomorrow Upon Based Further Therefore However Additionally According Respectfully Sworn Subscribed Notary Public ' +
    'Google Microsoft Apple Samsung Facebook Instagram Snapchat Whatsapp Telegram Signal Verizon Tmobile Sprint Att Cricket Metro Commonwealth ' +
    TITLES.split('|').join(' ')).split(/\s+/).map((w) => w.toLowerCase()));

  // Letter groups that look like a plate's letters but are something else ("ISO 9001", "FY2026").
  const PLATE_NOT = new Set(['ISO', 'FY', 'COVID', 'NO', 'REF', 'ID', 'SSN', 'DL', 'DOB', 'CR', 'IR', 'RMS', 'OCA', 'CAD', 'SOP', 'PDF', 'MP', 'LES', 'IP', 'EXT', 'APT', 'STE', 'RM', 'PM', 'AM', 'HR', 'HRS', 'MG', 'KG', 'LB', 'LBS', 'MM', 'CM', 'KM', 'MPH', 'USD', 'SKU', 'TAB', 'ITEM', 'PAGE', 'CASE', 'FORM', 'RULE', 'CODE', 'ROOM']);

  const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
  const STREET_TYPES = 'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Terrace|Ter|Way|Circle|Cir|Highway|Hwy|Parkway|Pkwy|Trail|Trl|Square|Sq|Loop|Pike|Row|Run|Alley|Aly|Crossing|Xing|Point|Pt|Ridge|Rdg|Plaza|Plz';

  function luhn(digits) {
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Each rule: a global regex, the capture group holding the sensitive value (0 = whole match),
  // and an optional check that the value really is one.
  const RULES = [
    { type: 'ssn', re: /\b(?!000|666|9\d\d)\d{3}[-. ](?!00)\d{2}[-. ](?!0000)\d{4}\b/g },
    { type: 'ssn', re: /\b(?:SSN|SSAN|S\.S\.N\.?|social security(?: number| no\.?| #)?)\s*[:#]?\s*((?!000|666|9\d\d)\d{3}[-.]?\d{2}[-.]?\d{4})\b/gi, group: 1 },
    { type: 'card', re: /\b(?:\d[ -]?){12,18}\d\b/g, ok: (v) => { const d = v.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && /^[3-6]/.test(d) && luhn(d); } },
    { type: 'bank', re: /\b(?:acct|account|a\/c|routing|aba|iban)(?:\s*(?:no\.?|number|#))?\s*[:#]?\s*([A-Z]{2}\d{2}[A-Z0-9]{8,30}|\d[\d-]{5,20}\d)\b/gi, group: 1 },
    { type: 'dob', re: /\b(?:DOB|D\.O\.B\.?|date of birth|born(?: on)?|birth ?date)\s*[:#]?\s*((?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})|(?:\d{4}-\d{2}-\d{2})|(?:[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4})|(?:\d{1,2} [A-Z][a-z]{2,8} \d{4}))/gi, group: 1 },
    { type: 'dl', re: /\b(?:DL|D\/L|OLN|driver'?s? licen[cs]e|operator'?s? licen[cs]e|licen[cs]e (?:no|number|#)|state ID|ID card|ID (?:no|number|#))\.?\s*(?:no\.?|number|#)?\s*[:#]?\s*(?:(?:of|from|in)\s+)?(?:(?:[A-Z]{2})\s+)?([A-Z0-9][A-Z0-9-]{4,17})\b/gi, group: 1, ok: (v) => /\d/.test(v) },
    { type: 'passport', re: /\bpassport(?:\s*(?:no\.?|number|#))?\s*[:#]?\s*([A-Z0-9]{6,9})\b/gi, group: 1, ok: (v) => /\d/.test(v) },
    { type: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    { type: 'phone', re: /(?<![\d-])(?:\+?1[-. ]?)?\(?\b[2-9]\d{2}\)?[-. ]?[2-9]\d{2}[-. ]\d{4}\b(?:\s*(?:x|ext\.?)\s*\d{1,5})?/g },
    { type: 'phone', re: /\b(?:phone|tel|cell|mobile|ph|telephone|number)\s*[:#]?\s*(\(?[2-9]\d{2}\)?\s?[2-9]\d{6})\b/gi, group: 1 },
    // A local number without the area code ("555-0142").
    { type: 'phone', re: /(?<![\w.-])[2-9]\d{2}[-.]\d{4}(?![\w-]|\.\d)/g },
    { type: 'vin', re: /\b[A-HJ-NPR-Z0-9]{17}\b/g, ok: (v) => /\d/.test(v) && /[A-Z]/.test(v) && (v.match(/\d/g) || []).length >= 5 },
    { type: 'plate', re: /\b(?:plate|tag|license plate|licence plate|LP|LPN|registration|reg\.?)\s*(?:no\.?|number|#)?\s*[:#]?\s*(?:(?:[A-Z]{2}|[A-Z][a-z]+)\s+)?(?:(?:tag|plate)\s+)?([A-Z0-9]{2,4}[- ]?[A-Z0-9]{2,5})\b/g, group: 1, ok: (v) => /\d/.test(v) && /^[A-Z0-9 -]+$/.test(v) },
    // A plate on its own, without the word "plate" before it: "TST-1284", "ABC1234", "7ABC123".
    { type: 'plate', re: /(?<![\w-])(?:[A-Z]{2,4}-?\d{3,4}|\d{3}-?[A-Z]{3}|\d[A-Z]{3}\d{3})(?![\w-])/g, ok: (v) => !PLATE_NOT.has(v.replace(/[-\d]/g, '')) },
    { type: 'address', re: new RegExp(`\\b\\d{1,6}(?:-?[A-Z])?\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Z0-9][A-Za-z0-9'.-]*\\s+){0,4}(?:${STREET_TYPES})\\b\\.?(?:,?\\s+(?:Apt|Apartment|Unit|Ste|Suite|#|Lot|Rm|Room)\\.?\\s*#?\\s*[A-Z0-9-]+)?(?:,\\s*[A-Z][A-Za-z .'-]+,?\\s+(?:${US_STATES})\\b(?:\\s+\\d{5}(?:-\\d{4})?)?)?`, 'g') },
    { type: 'address', re: /\b(?:P\.?\s?O\.?\s?Box|Post Office Box)\s+\d+\b/gi },
    { type: 'ip', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, ok: (v) => !/^(?:127\.|0\.)/.test(v) },
    { type: 'casenum', re: /\b(?:case|report|incident|file|cad|event|complaint|warrant|docket|citation|arrest|booking|IR|CR|RMS|OCA)\s*(?:no\.?|number|num|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,24})\b/gi, group: 1, ok: (v) => /\d/.test(v) },
    { type: 'casenum', re: /\b(?:19|20)\d{2}-[A-Z]{0,4}\d{3,10}\b/g },
    // Names after a title ("Det. John Smith", "suspect Maria Lopez", "Victim DOE, Jane").
    { type: 'person', re: new RegExp(`\\b(?:${TITLES})\\.?\\s+((?:${NAME_WORD}|${NAME_WORD_CAPS})(?:,?\\s+(?:[A-Z]\\.\\s*)?(?:${NAME_WORD}|${NAME_WORD_CAPS})){0,2})`, 'g'), group: 1, ok: (v) => !v.split(/[\s,]+/).every((w) => NOT_NAMES.has(w.replace(/\.$/, '').toLowerCase())) },
    // "SMITH, John" — the usual way reports write a person's name.
    { type: 'person', re: new RegExp(`\\b(${NAME_WORD_CAPS},\\s*${NAME_WORD}(?:\\s+[A-Z]\\.?|\\s+${NAME_WORD})?)`, 'g'), group: 1, ok: (v) => !NOT_NAMES.has(v.split(',')[0].toLowerCase()) },
    // Two or three capitalised words in a row ("John Smith", "Maria de la Cruz" is partly caught).
    { type: 'person', re: new RegExp(`\\b(${NAME_WORD}(?:\\s+[A-Z]\\.)?\\s+${NAME_WORD}(?:\\s+${NAME_WORD})?)\\b`, 'g'), group: 1, ok: (v, text, at) => {
      const words = v.split(/\s+/).map((w) => w.replace(/\.$/, '').toLowerCase());
      if (words.some((w) => NOT_NAMES.has(w))) return false;
      // Two capitalised words at the start of a sentence are often not a name ("Officers Arrived").
      const before = text.slice(Math.max(0, at - 2), at);
      return !/(^|[.!?:]\s)$/.test(before) || words.length > 2;
    } },
  ];

  /**
   * Scan text. known: extra terms to find (names, case numbers, addresses the app already knows),
   * as strings or { value, type }. Returns findings sorted by position, without overlaps:
   * [{ type, label, level, locked, value, index, length }].
   */
  function scan(text, { known = [] } = {}) {
    const s = String(text || '');
    const found = [];
    const add = (type, index, value) => {
      if (!value || !value.trim()) return;
      const t = TYPES[type];
      found.push({ type, label: t.label, level: t.level, locked: t.locked, value, index, length: value.length });
    };

    // Known terms first: exact, case-insensitive, whole-word.
    const terms = [];
    for (const k of known) {
      const value = typeof k === 'string' ? k : k && k.value;
      const type = (k && k.type && TYPES[k.type]) ? k.type : 'known';
      const v = String(value || '').trim();
      if (v.length < 3) continue;
      terms.push({ v, type });
      // A known "First Last" is also caught as "LAST, First" and as the surname on its own.
      const parts = v.split(/\s+/);
      if (type === 'known' && parts.length >= 2 && /^[A-Za-z'-]+$/.test(parts[parts.length - 1])) {
        const last = parts[parts.length - 1];
        terms.push({ v: `${last}, ${parts[0]}`, type });
        if (last.length >= 4 && !NOT_NAMES.has(last.toLowerCase())) terms.push({ v: last, type });
      }
    }
    for (const { v, type } of terms) {
      const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(v).replace(/\s+/g, '\\s+')}(?![A-Za-z0-9])`, 'gi');
      let m;
      while ((m = re.exec(s))) add(type, m.index, m[0]);
    }

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(s))) {
        const g = rule.group || 0;
        const value = m[g];
        if (value == null) continue;
        const index = g ? m.index + m[0].lastIndexOf(value) : m.index;
        if (rule.ok && !rule.ok(value, s, index)) continue;
        add(rule.type, index, value);
        if (m[0].length === 0) rule.re.lastIndex++;
      }
    }

    // Resolve overlaps by MERGING: overlapping findings become one finding that covers all of them,
    // so nothing between them can leak. (Keeping only one used to leave the rest of a match in the
    // open: a known surname inside an address hid the surname and sent the street.) The merged
    // finding takes the type of the widest one; on a tie known terms, then more serious types, win.
    found.sort((a, b) => (a.type === 'known' ? 0 : 1) - (b.type === 'known' ? 0 : 1)
      || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.length - a.length || a.index - b.index);
    let kept = [];
    for (const f of found) {
      const end = f.index + f.length;
      const hit = kept.filter((k) => f.index < k.index + k.length && end > k.index);
      if (!hit.length) { kept.push(f); continue; }
      const group = [...hit, f];
      const start = Math.min(...group.map((g) => g.index));
      const stop = Math.max(...group.map((g) => g.index + g.length));
      const widest = group.reduce((w, g) => (g.length > w.length ? g : w), group[0]);
      const t = TYPES[widest.type];
      const levels = group.map((g) => LEVEL_ORDER[g.level]);
      const level = Object.keys(LEVEL_ORDER).find((l) => LEVEL_ORDER[l] === Math.min(...levels));
      const merged = { type: widest.type, label: t.label, level, locked: group.some((g) => g.locked), value: s.slice(start, stop), index: start, length: stop - start };
      kept = kept.filter((k) => !hit.includes(k));
      kept.push(merged);
    }
    return kept.sort((a, b) => a.index - b.index);
  }

  /** Counts per type: { phone: 2, person: 1 } */
  function summarize(findings) {
    const out = {};
    for (const f of findings) out[f.type] = (out[f.type] || 0) + 1;
    return out;
  }

  const hasCritical = (findings) => findings.some((f) => f.level === 'critical');

  /**
   * Replace findings with placeholders. The same value always gets the same placeholder, and a
   * map passed in is reused, so a conversation stays consistent across several messages.
   * skip: indexes (into findings) the user chose to leave as they are (never a locked type).
   * Returns { text, map, replaced }  where map = { '[NAME_1]': 'John Smith', ... }.
   */
  function redact(text, findings, { map = {}, skip = new Set() } = {}) {
    const s = String(text || '');
    const byValue = new Map(Object.entries(map).map(([ph, v]) => [norm(v), ph]));
    const counters = {};
    for (const ph of Object.keys(map)) {
      const m = /^\[([A-Z]+)_(\d+)\]$/.exec(ph);
      if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, Number(m[2]));
    }
    let out = '';
    let at = 0;
    let replaced = 0;
    findings.forEach((f, i) => {
      if (skip.has(i) && !f.locked) return;
      if (f.index < at) return;
      const key = norm(f.value);
      let ph = byValue.get(key);
      if (!ph) {
        const tag = TYPES[f.type].tag;
        counters[tag] = (counters[tag] || 0) + 1;
        ph = `[${tag}_${counters[tag]}]`;
        byValue.set(key, ph);
        map[ph] = f.value;
      }
      out += s.slice(at, f.index) + ph;
      at = f.index + f.length;
      replaced++;
    });
    out += s.slice(at);
    return { text: out, map, replaced };
  }

  function norm(v) {
    return String(v).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 @.]/g, '').trim();
  }

  /** Put the real values back into text that uses the placeholders (done only on this computer). */
  function rehydrate(text, map) {
    return String(text || '').replace(/\[([A-Z]+)_(\d+)\]/g, (ph) => (Object.prototype.hasOwnProperty.call(map, ph) ? map[ph] : ph));
  }

  /** A short excerpt around a finding, for the review screen: { before, value, after }. */
  function context(text, f, width = 32) {
    const s = String(text || '');
    const a = Math.max(0, f.index - width);
    const b = Math.min(s.length, f.index + f.length + width);
    return { before: (a > 0 ? '…' : '') + s.slice(a, f.index), value: s.slice(f.index, f.index + f.length), after: s.slice(f.index + f.length, b) + (b < s.length ? '…' : '') };
  }

  /** The terms CaseVault already knows for a case, for scan({ known }). */
  function knownTerms({ caseObj = null, affiant = null, watchlist = [], caseIndex = [] } = {}) {
    const out = [];
    const push = (value, type = 'known') => { if (value && String(value).trim().length >= 3) out.push({ value: String(value).trim(), type }); };
    if (caseObj) {
      push(caseObj.client);
      for (const p of caseObj.people || []) push(p); // arrestees (js/closing.js)
      push(caseObj.number, 'casenum');
      push(caseObj.fileNumber, 'casenum');
      if (caseObj.id && /\d/.test(caseObj.id)) push(caseObj.id, 'casenum');
      // Contacts on the Details tab (case officer, prosecutor, others).
      const k = caseObj.contacts || {};
      for (const p of [k.officer, k.prosecutor, ...(Array.isArray(k.others) ? k.others : [])]) {
        if (!p) continue;
        push(p.name); push(p.phone, 'phone'); push(p.email, 'email');
      }
      push(caseObj.agencyNumber, 'casenum');
      for (const p of Array.isArray(caseObj.suspects) ? caseObj.suspects : []) { if (p) { push(p.name); push(p.residence, 'address'); } }
    }
    for (const c of caseIndex || []) { push(c.number, 'casenum'); push(c.fileNumber, 'casenum'); push(c.agencyNumber, 'casenum'); push(c.client); }
    if (affiant) { push(affiant.name); push(affiant.phone, 'phone'); push(affiant.email, 'email'); push(affiant.address, 'address'); }
    for (const w of watchlist || []) push(w);
    // Longest first, so "Maria Lopez-Diaz" is matched before "Maria".
    const seen = new Set();
    return out.filter((x) => { const k = `${x.type}:${x.value.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.value.length - a.value.length);
  }

  const api = { TYPES, scan, summarize, hasCritical, redact, rehydrate, context, knownTerms, luhn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVPii = api;
})(this);
