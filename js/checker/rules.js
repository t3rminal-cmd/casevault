/* CaseVault checker — Layer 1: rule-based, deterministic fact comparison.
 *
 * Extracts hard facts from every sentence (dates, times, names, case/report numbers, addresses,
 * plates, phone numbers, money amounts, counts), normalizes them, and compares them across the
 * affidavit and the reports, and across the reports themselves.
 *
 * Input documents: { id, name, role: 'affidavit' | 'report', paragraphs: [{ index, page, text }] }
 * Output flags:    see makeFlag() below.
 * Pure functions (no DOM), so they run under Node for the unit tests.
 */
'use strict';

(function (root) {
  const T = typeof module !== 'undefined' && module.exports ? require('./nlp.js') : root.CVText;

  /* ------------------------------------------------------------------ */
  /* Extraction                                                          */
  /* ------------------------------------------------------------------ */

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const MONTH_RE = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';
  const NUMBER_WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, dozen: 12, single: 1, both: 2, several: null,
  };
  const pad2 = (n) => String(n).padStart(2, '0');

  const TYPE_LABEL = {
    date: 'Date', time: 'Time', name: 'Name', number: 'Case/report number', address: 'Address',
    plate: 'Licence plate', phone: 'Phone number', money: 'Amount', count: 'Count', weight: 'Weight',
    total: 'Total', buy: 'Buy',
  };

  // Collects facts while remembering which characters are already used, so e.g. the digits of
  // a date are not also read as a count.
  function collector(sentence) {
    const facts = [];
    const used = new Uint8Array(sentence.length);
    return {
      facts,
      free(start, end) { for (let i = start; i < end; i++) if (used[i]) return false; return true; },
      add(type, value, start, end, extra = {}) {
        if (!this.free(start, end)) return false;
        used.fill(1, start, end);
        facts.push({ type, value, display: sentence.slice(start, end).trim(), start, end, ...extra });
        return true;
      },
    };
  }

  function each(re, s, fn) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) { fn(m); if (m[0] === '') re.lastIndex++; }
  }

  function year4(y) {
    if (!y) return null;
    const n = Number(y);
    return y.length === 2 ? (n < 70 ? 2000 + n : 1900 + n) : n;
  }

  function dateValue(y, m, d) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y ? String(y) : 'XXXX'}-${pad2(m)}-${pad2(d)}`; // XXXX = year not stated
  }

  function extractDates(s, c) {
    each(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, s, (m) => {
      const v = dateValue(Number(m[1]), Number(m[2]), Number(m[3]));
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
    each(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, s, (m) => {
      let mo = Number(m[1]);
      let d = Number(m[2]);
      if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // clearly day-first
      const v = dateValue(year4(m[3]), mo, d);
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
    each(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'g'), s, (m) => {
      const v = dateValue(year4(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
    each(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${MONTH_RE}\\.?,?(?:\\s+(\\d{4}))?\\b`, 'g'), s, (m) => {
      const v = dateValue(year4(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
  }

  function timeValue(h, min) {
    if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
    return `${pad2(h)}:${pad2(min)}`;
  }
  const to24 = (h, ap) => (ap === 'a' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12));

  function extractTimes(s, c) {
    each(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s?m\b\.?/gi, s, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 12) return;
      const v = timeValue(to24(h, m[3].toLowerCase()), Number(m[2]));
      if (v) c.add('time', v, m.index, m.index + m[0].length);
    });
    each(/\b(\d{1,2})\s*([ap])\.?\s?m\b\.?/gi, s, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 12) return;
      c.add('time', timeValue(to24(h, m[2].toLowerCase()), 0), m.index, m.index + m[0].length);
    });
    each(/\b([01]?\d|2[0-3])([0-5]\d)\s*(?:hours|hrs|hr)\b\.?/gi, s, (m) => {
      c.add('time', timeValue(Number(m[1]), Number(m[2])), m.index, m.index + m[0].length);
    });
    each(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/g, s, (m) => {
      c.add('time', timeValue(Number(m[1]), Number(m[2])), m.index, m.index + m[0].length);
    });
    each(/\b(noon|midnight)\b/gi, s, (m) => {
      c.add('time', m[1].toLowerCase() === 'noon' ? '12:00' : '00:00', m.index, m.index + m[0].length);
    });
  }

  function extractPhones(s, c) {
    each(/(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g, s, (m) => {
      c.add('phone', m[1] + m[2] + m[3], m.index, m.index + m[0].length);
    });
  }

  function extractMoney(s, c) {
    const cents = (whole, frac) => String(Math.round(Number(whole.replace(/,/g, '')) * 100 + Number((frac || '0').padEnd(2, '0'))));
    each(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\b/g, s, (m) => c.add('money', cents(m[1], m[2]), m.index, m.index + m[0].length));
    each(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars|USD)\b/gi, s, (m) => c.add('money', cents(m[1], m[2]), m.index, m.index + m[0].length));
  }

  const NUMBER_LABELS = 'case|report|incident|file|docket|citation|cad|event|complaint|warrant|arrest|booking|item|evidence|property|offense|offence|tracking|receipt|serial|badge|vin';
  function extractNumbers(s, c) {
    const re = new RegExp(`\\b(${NUMBER_LABELS})(?:\\s+(?:number|no\\.?|num\\.?|nr\\.?)|\\s*#)?\\s*[:#=]?\\s*(?:#\\s*)?([A-Z0-9][A-Z0-9-]*\\d[A-Z0-9-]*)`, 'gi');
    each(re, s, (m) => {
      const value = m[2].toUpperCase().replace(/-+$/, '');
      if (value.replace(/-/g, '').length < 4) return;
      const at = m.index + m[0].length - m[2].length;
      c.add('number', value, at, at + m[2].length, { key: m[1].toLowerCase() });
    });
    each(/(?:\bNo\.|#)\s*([A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*)/g, s, (m) => {
      const value = m[1].toUpperCase().replace(/-+$/, '');
      if (value.replace(/-/g, '').length < 4) return;
      const at = m.index + m[0].length - m[1].length;
      c.add('number', value, at, at + m[1].length, { key: 'number' });
    });
  }

  // v1.162: the address is read into one canonical form (nlp.js normalizeAddress), so "1420 N. Fifth
  // Avenue, Apt. #3-B" and "1420 North 5th Ave #3B" are the same address. key = the street alone.
  function extractAddresses(s, c) {
    const re = /\b(\d{1,6})\s+((?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?\s+)?(?:[A-Z0-9][A-Za-z0-9'.]*\s+){1,3}?)(Street|Str|St|Avenue|Ave|Av|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Highway|Hwy|Parkway|Pkwy|Terrace|Ter|Circle|Cir|Trail|Trl|Square|Sq|Alley|Aly|Expressway|Expy|Freeway|Fwy)\b\.?(?:,?\s*(?:Apt|Apartment|Unit|Suite|Ste|Room|Rm|#)\.?\s*#?\s*([A-Z0-9-]+))?/gi;
    each(re, s, (m) => {
      const value = T.normalizeAddress(m[0]);
      const key = value.replace(/^\d+\s+/, '').replace(/\s+#\S+$/, '');
      c.add('address', value, m.index, m.index + m[0].length, { key });
    });
  }

  // v1.162: weights, in grams, so "1 oz" and "28.35 grams" are the same amount.
  const GRAMS = { kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000, g: 1, gm: 1, gms: 1, gram: 1, grams: 1,
    mg: 0.001, mgs: 0.001, milligram: 0.001, milligrams: 0.001, oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
    lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };
  const gramsText = (g) => String(Math.round(g * 100) / 100);
  function extractWeights(s, c) {
    each(/(?<![\w.$])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)\s*(kilograms?|kilos?|kgs?|grams?|gms?|g|milligrams?|mgs?|ounces?|oz|pounds?|lbs?)\b\.?/gi, s, (m) => {
      const per = GRAMS[m[2].toLowerCase()];
      if (!per) return;
      const n = Number(m[1].replace(/,/g, ''));
      if (!Number.isFinite(n)) return;
      c.add('weight', gramsText(n * per), m.index, m.index + m[0].replace(/\.$/, '').trimEnd().length, { per });
    });
  }

  function extractPlates(s, c) {
    // Keyword is case-insensitive; the plate itself must be written in capitals (avoids ordinary words).
    each(/\b(?:licen[cs]e\s+plate|plate|tag|registration|reg\.|LP|lic\.)(?:\s+(?:number|no\.?|#))?/gi, s, (m) => {
      const from = m.index + m[0].length;
      const r = /^\s*(?:[:#=]\s*|reading\s+|of\s+|bearing\s+)?["']?([A-Z0-9]{1,4}(?:[ -]?[A-Z0-9]{1,5}){0,2})\b/.exec(s.slice(from));
      if (!r) return;
      let raw = r[1];
      let value = raw.replace(/[\s-]/g, '');
      if (value.length > 8 && raw.includes(' ')) { raw = raw.slice(0, raw.lastIndexOf(' ')); value = raw.replace(/[\s-]/g, ''); }
      if (value.length < 5 || value.length > 8 || !/\d/.test(value) || !/[A-Z]/.test(value)) return;
      const at = from + r[0].indexOf(raw);
      c.add('plate', value, at, at + raw.length);
    });
  }

  const COUNT_NOUN_EXCLUDE = new Set(['year', 'month', 'week', 'am', 'pm', 'hour', 'minute', 'second', 'percent']);
  function extractCounts(s, c) {
    const re = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|dozen|single|both)\s+((?:[a-z][a-z-]*\s+){0,2}?)([a-z]+s|men|women|people|children|feet|teeth|police)\b/gi;
    each(re, s, (m) => {
      const between = m[2].trim().split(/\s+/).filter(Boolean);
      if (between.some((w) => /^(of|the|a|an|and|or|to|in|on|at|by|for|with|from|who|that|which|was|were|is|are|had|has|have|times)$/i.test(w))) return;
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
      if (n == null) return;
      const noun = m[3].toLowerCase().replace(/(ies)$/, 'y').replace(/(ses|xes|ches|shes)$/, (x) => x.slice(0, -2)).replace(/s$/, '');
      if (COUNT_NOUN_EXCLUDE.has(noun)) return;
      c.add('count', String(n), m.index, m.index + m[0].length, { key: noun });
    });
  }

  const TITLES = 'Officer|Ofc\\.?|Sergeant|Sgt\\.?|Detective|Det\\.?|Deputy|Dep\\.?|Trooper|Tpr\\.?|Agent|Special Agent|SA|Lieutenant|Lt\\.?|Captain|Capt\\.?|Corporal|Cpl\\.?|Inspector|Chief|Mr\\.?|Mrs\\.?|Ms\\.?|Miss|Dr\\.?|Judge|Witness|Suspect|Victim|Defendant|Complainant|Affiant';
  const NOT_NAMES = new Set((
    'I The A An On In At Of And Or But If When While After Before During Upon This That These Those There Then He She They It We You ' +
    'His Her Their My Our Your Its Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July ' +
    'August September October November December Police Department Sheriff Office County City State Court District Street Avenue Road ' +
    'Boulevard Drive Lane Highway Report Case Incident Affidavit Warrant Exhibit Section Page Unit Apartment Suite North South East West ' +
    'Your Honor United States America Probable Cause Narrative Summary Supplement Officer Detective Sergeant Deputy Trooper Agent ' +
    'Suspect Victim Witness Defendant Vehicle Plate License Registration Evidence Property Item Number No Dispatch Dispatcher ' +
    'Emergency Room Hospital Medical Center Station Headquarters Mr Mrs Ms Dr Miss Lieutenant Captain Corporal Inspector Chief ' +
    'Sworn Subscribed Notary Public Signed Date Time Location Address Phone Statement Interview Body Camera Footage CAD'
  ).split(/\s+/));

  function titleCase(w) { return w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w; }

  function extractNames(s, c) {
    // All-caps names are common in reports (DIAZ, MARIA). Compare them case-insensitively.
    const titled = new RegExp(`\\b(?:${TITLES})\\s+((?:[A-Z][A-Za-z'-]+\\.?\\s+){0,2}[A-Z][A-Za-z'-]+)`, 'g');
    const add = (text, at) => {
      // v1.162: each word keeps the other words of its full name (group), so the checker can tell
      // "Mary Poez" / "Mary Poes" (one person) from "John Doe" / "Joan Roe" (two people).
      const words = [...text.matchAll(/[A-Za-z'-]{3,}/g)].map((t) => ({ t, word: t[0].replace(/'s$/i, '') })).filter((x) => !NOT_NAMES.has(titleCase(x.word)));
      const group = words.map((x) => x.word.toLowerCase());
      for (const { t, word } of words) {
        const start = at + t.index;
        c.facts.push({ type: 'name', value: word.toLowerCase(), display: titleCase(word), start, end: start + t[0].length, group });
      }
    };
    each(titled, s, (m) => add(m[1], m.index + m[0].length - m[1].length));
    // Two or three capitalised words in a row, not at the start of the sentence.
    each(/(?<=\S\s+)((?:[A-Z][a-z'-]+|[A-Z]{3,})(?:\s+[A-Z]\.)?(?:\s+(?:[A-Z][a-z'-]+|[A-Z]{3,})){1,2})\b/g, s, (m) => {
      const words = m[1].split(/\s+/).filter((w) => !/^[A-Z]\.$/.test(w));
      if (words.some((w) => NOT_NAMES.has(titleCase(w)))) return;
      add(m[1], m.index);
    });
  }

  /** All facts in one sentence. */
  function extractFacts(sentence) {
    const c = collector(sentence);
    extractDates(sentence, c);
    extractPhones(sentence, c);
    extractTimes(sentence, c);
    extractMoney(sentence, c);
    extractWeights(sentence, c);
    extractNumbers(sentence, c);
    extractAddresses(sentence, c);
    extractPlates(sentence, c);
    extractCounts(sentence, c);
    extractNames(sentence, c);
    // De-duplicate names found by both name patterns.
    const seen = new Set();
    return c.facts.filter((f) => {
      if (f.type !== 'name') return true;
      const k = `${f.value}@${f.start}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Split documents into sentences, each with its facts and its location. */
  // Spreadsheet rows carry their sheet and row number as the location; XFA form fields their path.
  const cellOf = (p) => (p.sheet != null ? { sheet: p.sheet, row: p.row } : p.field != null ? { field: p.field } : {});

  function analyze(docs) {
    return docs.map((doc, d) => {
      const sents = [];
      for (const para of doc.paragraphs) {
        for (const s of T.sentences(para.text)) {
          const sent = { doc: d, paragraph: para.index, page: para.page ?? null, ...cellOf(para), text: s.text, start: s.start, end: s.end, facts: extractFacts(s.text) };
          // v1.162: a stated total ("a total of $1,100") is compared with totals only, never with a
          // single amount elsewhere; whether it adds up is checked by totalsCheck().
          for (const type of ['money', 'weight']) { const t = statedTotal(sent, type); if (t) t.total = true; }
          sents.push(sent);
        }
      }
      return { ...doc, sentences: sents };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Comparison                                                          */
  /* ------------------------------------------------------------------ */

  const YEAR_PREFIX = /^(?:19|20)\d{2}-/;
  function sameValue(type, a, b) {
    // "00123" and "2026-00123" are the same case number (CaseVault names files <year>-<case no.>).
    if (type === 'number' && YEAR_PREFIX.test(a) !== YEAR_PREFIX.test(b)) return a.replace(YEAR_PREFIX, '') === b.replace(YEAR_PREFIX, '');
    if (type === 'weight') {
      // Rounding when a unit is converted (1 oz = 28.35 g) is not a difference: within 1%.
      const x = Number(a); const y = Number(b);
      return Math.abs(x - y) <= Math.max(0.01 * Math.max(x, y), 0.05);
    }
    if (type === 'date') {
      // A date without a year matches the same month and day in any year.
      if (a.startsWith('XXXX') || b.startsWith('XXXX')) return a.slice(5) === b.slice(5);
    }
    return a === b;
  }

  function display(f) {
    if (f.type === 'time') return `${f.display} (${f.value})`;
    return f.display;
  }

  function location(docs, sent) {
    return {
      doc: docs[sent.doc].name,
      docIndex: sent.doc,
      page: sent.page,
      ...cellOf(sent),
      paragraph: sent.paragraph,
      text: sent.text,
      start: sent.start,
      end: sent.end,
    };
  }

  let seq = 0;
  // v1.162: every flag has a confidence (how sure the checker is), apart from its severity (how
  // serious it would be): High, Medium or Low.
  function makeFlag(docs, { severity, confidence = 'Medium', type, title, detail, statement, source, statementFact, sourceFact, sourceLabel }) {
    const st = location(docs, statement);
    if (statementFact) st.highlight = [statementFact.start, statementFact.end];
    let src = null;
    if (source) {
      src = location(docs, source);
      if (sourceFact) src.highlight = [sourceFact.start, sourceFact.end];
    }
    return {
      id: `r${Date.now().toString(36)}${(seq++).toString(36)}`,
      layer: 'rules',
      severity,
      confidence,
      type,
      title,
      detail,
      statement: st,
      source: src,
      ...(sourceLabel ? { sourceLabel } : {}),
      status: 'open',
      note: '',
    };
  }

  const TYPO_TYPES = new Set(['number', 'plate', 'phone']);

  /**
   * Compare documents. docs[i].role is 'affidavit' or 'report'.
   * ignore: text whose facts are never reported as "not found in the reports" — the author's own
   * details and today's date, which a template puts into every draft (signature block, "Prepared …").
   * Returns flags sorted by severity, then by document order.
   */
  /*
   * v1.162 options:
   *  aliases: groups of words that are one person (nlp.js parseAliases of the case's Known Aliases):
   *           a pair inside one group is never flagged as a spelling difference.
   *  buys:    the case's Timeline buys [{ date, suspect, drug, qty, unit, paid }] (the Buy Summary):
   *           each buy and the totals are checked against what the documents say.
   */
  function compare(inputDocs, { ignore = [], aliases = [], buys = [] } = {}) {
    const docs = analyze(inputDocs);
    const ignored = new Set(ignore.flatMap((t) => T.sentences(String(t || '')).flatMap((s) => extractFacts(s.text)))
      .map((f) => `${f.type}|${f.value}`));
    const flags = [];
    const keys = new Set();
    const push = (flag, key) => { if (!keys.has(key)) { keys.add(key); flags.push(flag); } };

    const affidavits = docs.map((d, i) => (d.role === 'affidavit' ? i : -1)).filter((i) => i >= 0);
    const reports = docs.map((d, i) => (d.role === 'report' ? i : -1)).filter((i) => i >= 0);

    // Checks: every affidavit against all reports; every report against the reports after it.
    const plans = [
      ...affidavits.map((a) => ({ from: a, against: reports, affidavit: true })),
      ...reports.map((r, k) => ({ from: r, against: reports.slice(k + 1), affidavit: false })),
    ];

    for (const plan of plans) {
      if (!plan.against.length) continue;
      const otherSents = plan.against.flatMap((d) => docs[d].sentences);
      // For "is it supported anywhere?" a report is checked against ALL other reports.
      const supportSents = plan.affidavit ? otherSents
        : reports.filter((r) => r !== plan.from).flatMap((d) => docs[d].sentences);

      for (const sent of docs[plan.from].sentences) {
        for (const f of sent.facts) {
          if (f.type === 'name') continue;
          const supported = supportSents.some((o) => o.facts.some((g) => g.type === f.type && sameValue(f.type, f.value, g.value)
            && (f.type !== 'count' || g.key === f.key)));
          if (supported) continue;

          // Find the most similar sentence that states the same kind of fact differently.
          let best = null;
          for (const o of otherSents) {
            // v1.162: a value that matches another fact of the same sentence is that fact's match, not a
            // conflicting one ("$200, $300 and $500" against a report's "$200": only $200 is matched).
            const cands = o.facts.filter((g) => g.type === f.type && (f.type !== 'count' || g.key === f.key) && !!g.total === !!f.total
              && !sent.facts.some((x) => x !== f && x.type === f.type && sameValue(f.type, x.value, g.value))
              && (f.type !== 'number' || g.key === f.key || g.key === 'number' || f.key === 'number'));
            if (!cands.length) continue;
            for (const g of cands) {
              let score = T.similarity(sent.text, o.text);
              if (TYPO_TYPES.has(f.type)) {
                const dist = T.levenshtein(f.value, g.value);
                if (dist > 2 || dist === 0) continue;
                score = Math.max(score, 1 - dist / 10); // a near-identical number is a likely typo, wherever it is
              } else if (f.type === 'address') {
                if (g.key === f.key) score = Math.max(score, 0.9); // same street, different number or unit
              }
              if (!best || score > best.score) best = { o, g, score };
            }
          }

          const label = TYPE_LABEL[f.type];
          if (best && best.score >= 0.3) {
            const a = f.value;
            const b = best.g.value;
            // Confidence: a near-identical number (one character off) or a closely matching statement
            // is High; a looser match is Medium (the two sentences may be about different events).
            const typo = TYPO_TYPES.has(f.type) ? T.levenshtein(a, b) : 0;
            const confidence = typo === 1 || best.score >= 0.6 ? 'High' : 'Medium';
            push(makeFlag(docs, {
              severity: 'High',
              confidence,
              type: f.type,
              title: `${label} mismatch: "${display(f)}" vs "${display(best.g)}"`,
              detail: `${docs[plan.from].name} says ${display(f)}; ${docs[best.o.doc].name} says ${display(best.g)} in a matching statement.`,
              statement: sent, statementFact: f, source: best.o, sourceFact: best.g,
            }), `m|${f.type}|${[`${sent.doc}:${sent.start}:${sent.paragraph}:${a}`, `${best.o.doc}:${best.o.start}:${best.o.paragraph}:${b}`].sort().join('|')}`);
          } else if (plan.affidavit && !ignored.has(`${f.type}|${f.value}`)) {
            push(makeFlag(docs, {
              severity: 'Low',
              confidence: 'Low',
              type: f.type,
              title: `${label} not found in the reports: "${display(f)}"`,
              detail: `No report mentions ${display(f)}.`,
              statement: sent, statementFact: f, source: null,
            }), `u|${f.type}|${sent.doc}:${sent.paragraph}:${sent.start}:${f.value}`);
          }
        }
      }
    }

    // Names: the same person spelled differently (Poez / Poes, Katherine / Catherine).
    const occurrences = new Map(); // value -> [{ sent, fact }]
    for (const d of docs) {
      for (const sent of d.sentences) {
        for (const f of sent.facts) {
          if (f.type !== 'name') continue;
          if (!occurrences.has(f.value)) occurrences.set(f.value, []);
          occurrences.get(f.value).push({ sent, fact: f });
        }
      }
    }
    const names = [...occurrences.keys()];
    const aliasGroups = aliases.map((g) => new Set(g));
    const sameAlias = (a, b) => aliasGroups.some((g) => g.has(a) && g.has(b));
    // The other words of a name's full names (Mary for Poez in "Mary Poez").
    const partners = (list, self) => {
      const out = new Set();
      for (const o of list) for (const w of o.fact.group || []) if (w !== self) out.add(w);
      return out;
    };
    const related = (p, q) => p === q || T.sameFirstName(p, q) || sameAlias(p, q) || isNameVariant(p, q) || isTransposition(p, q);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i];
        const b = names[j];
        if (!isNameVariant(a, b)) continue;
        // v1.162: nicknames (Rick / Rich, both Richard) and the case's Known Aliases are the same name.
        if (T.sameFirstName(a, b) || sameAlias(a, b)) continue;
        // Context: when both spellings come with the rest of a name, the other parts decide.
        // Same or related (Mary Poez / Mary Poes): one person spelled two ways, High confidence.
        // Clearly different (Jon Doe / Joan Roe): two people, not a spelling difference.
        // No other part on one side: Medium confidence.
        const pa = partners(occurrences.get(a), a);
        const pb = partners(occurrences.get(b), b);
        let confidence = 'Medium';
        if (pa.size && pb.size) {
          if (![...pa].some((p) => [...pb].some((q) => related(p, q)))) continue;
          confidence = 'High';
        }
        // Show the affidavit's spelling as the statement and, when there is one, a report's
        // spelling as the source (the affidavit may use both spellings itself).
        const inRole = (list, role) => list.find((o) => docs[o.sent.doc].role === role);
        const la = occurrences.get(a);
        const lb = occurrences.get(b);
        let st;
        let src;
        if (inRole(la, 'affidavit') && inRole(lb, 'report') && !inRole(la, 'report')) [st, src] = [inRole(la, 'affidavit'), inRole(lb, 'report')];
        else if (inRole(lb, 'affidavit') && inRole(la, 'report') && !inRole(lb, 'report')) [st, src] = [inRole(lb, 'affidavit'), inRole(la, 'report')];
        else {
          const oa = pickOccurrence(docs, la);
          const ob = pickOccurrence(docs, lb);
          [st, src] = docs[ob.sent.doc].role === 'affidavit' && docs[oa.sent.doc].role !== 'affidavit' ? [ob, oa] : [oa, ob];
        }
        push(makeFlag(docs, {
          severity: 'High',
          confidence,
          type: 'name',
          title: `Name spelled differently: "${st.fact.display}" vs "${src.fact.display}"`,
          detail: `"${st.fact.display}" (${docs[st.sent.doc].name}) and "${src.fact.display}" (${docs[src.sent.doc].name}) look like the same name spelled two ways.`,
          statement: st.sent, statementFact: st.fact, source: src.sent, sourceFact: src.fact,
        }), `n|${[a, b].sort().join('|')}`);
      }
    }

    totalsCheck(docs, push);
    if (buys && buys.length) buysCheck(docs, buys, push);

    const rank = { High: 0, Medium: 1, Low: 2 };
    return flags.sort((x, y) => rank[x.severity] - rank[y.severity]
      || x.statement.docIndex - y.statement.docIndex || x.statement.paragraph - y.statement.paragraph || x.statement.start - y.statement.start);
  }

  /* ------------------------------------------------------------------ */
  /* v1.162: totals                                                      */
  /* ------------------------------------------------------------------ */

  const TOTAL_RE = /\b(?:total(?:ing|ed|s|ling|led)?|in all|altogether|combined|aggregate|sum of)\b/i;
  const EACH_RE = /^\s*(?:each|apiece|a piece|per\b|an? (?:gram|ounce|pound|kilo|unit|pill))/i;
  const BUY_RE = /\b(?:buys?|bought|purchas\w*|paid|pays?|sold|sells?|sale|exchanged|controlled|transaction)\b/i;
  const dollars = (cents) => { const n = Number(cents) / 100; return `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`; };
  // A weight in the unit the document used for its total (grams shown as written, e.g. "1.5 oz").
  const inUnit = (grams, f) => { const n = Math.round((grams / (f.per || 1)) * 100) / 100; return `${n} ${f.display.replace(/^[\d.,\s]+/, '').replace(/\.$/, '')}`; };
  const showSum = (type, v, f) => (type === 'money' ? dollars(v) : inUnit(v, f));
  const sumOf = (type, list) => (type === 'money' ? list.reduce((t, g) => t + Number(g.value), 0) : Math.round(list.reduce((t, g) => t + Number(g.value), 0) * 100) / 100);
  const agrees = (type, a, b) => (type === 'money' ? Number(a) === Number(b) : sameValue('weight', String(a), String(b)));

  /** The total a sentence states ("for a total of $1,100", "$1,100 in all"), nearest its keyword. */
  function statedTotal(sent, type) {
    const k = TOTAL_RE.exec(sent.text);
    if (!k) return null;
    const list = sent.facts.filter((f) => f.type === type);
    if (!list.length) return null;
    // "a total of $500": the amount after the word, when it follows closely; otherwise the nearest
    // one before it ("$1,100 in all").
    const after = list.filter((f) => f.start >= k.index && f.start - (k.index + k[0].length) <= 20);
    if (after.length) return after[0];
    const before = list.filter((f) => f.end <= k.index);
    return before.length ? before[before.length - 1] : list[0];
  }

  /**
   * A stated total against the amounts or weights listed with it: in the same sentence (High
   * confidence), or else in the sentences before it in the same paragraph (Medium). An amount said
   * to be "each" or "per gram" makes the sum unclear, so that paragraph is not checked.
   */
  function totalsCheck(docs, push) {
    for (const d of docs) {
      const paras = new Map();
      for (const sent of d.sentences) { if (!paras.has(sent.paragraph)) paras.set(sent.paragraph, []); paras.get(sent.paragraph).push(sent); }
      for (const list of paras.values()) {
        for (let i = 0; i < list.length; i++) {
          const sent = list[i];
          for (const type of ['money', 'weight']) {
            const total = statedTotal(sent, type);
            if (!total) continue;
            const each = (x) => list.some((s2) => s2.facts.some((f) => f.type === type && EACH_RE.test(s2.text.slice(f.end))));
            if (each()) continue;
            let parts = sent.facts.filter((f) => f.type === type && f !== total);
            let confidence = 'High';
            let from = sent;
            if (parts.length < 2) {
              if (parts.length) continue; // one other amount: a price, not a list
              const before = list.slice(0, i).filter((s2) => !TOTAL_RE.test(s2.text));
              parts = before.flatMap((s2) => s2.facts.filter((f) => f.type === type));
              if (parts.length < 2) continue;
              confidence = 'Medium';
              from = before.find((s2) => s2.facts.some((f) => f.type === type));
            }
            const sum = sumOf(type, parts);
            if (agrees(type, sum, total.value)) continue;
            const label = type === 'money' ? 'Total' : 'Total weight';
            const list2 = parts.map((g) => g.display).join(' + ');
            push(makeFlag(docs, {
              severity: 'High',
              confidence,
              type: 'total',
              title: `${label} doesn't add up: "${total.display}" but the ${type === 'money' ? 'amounts' : 'weights'} listed add up to ${showSum(type, sum, total)}`,
              detail: `${d.name}: ${list2} = ${showSum(type, sum, total)}, not ${total.display}.${confidence === 'Medium' ? ' (The amounts are in the sentences before the total; check that they all belong to it.)' : ''}`,
              statement: sent, statementFact: total, source: from === sent ? null : from, sourceFact: from === sent ? null : parts[0],
            }), `t|${type}|${sent.doc}:${sent.paragraph}:${sent.start}`);
          }
        }
      }
    }
  }

  /** v1.162: a buy's weight in grams, when its unit is a weight (not pills or units). */
  function buyGrams(b) {
    const per = GRAMS[String(b.unit || '').toLowerCase()];
    const n = Number(String(b.qty == null ? '' : b.qty).replace(/[,\s]/g, ''));
    return per && Number.isFinite(n) && n > 0 ? n * per : null;
  }
  const buyCents = (b) => { const n = Number(String(b.paid == null ? '' : b.paid).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

  /**
   * The Timeline's buys (its Buy Summary) against the documents:
   *  - a sentence about a buy on a buy's date that gives a different amount paid or weight;
   *  - a stated total paid or total weight in a sentence about buys that matches neither all the
   *    buys together nor any one suspect's buys.
   * The source of these flags is the Timeline (sourceLabel), not a document.
   */
  function buysCheck(docs, buys, push) {
    const SRC = 'Timeline Buy Summary';
    const all = docs.flatMap((d) => d.sentences);
    for (const b of buys) {
      if (!b || !b.date) continue;
      const cents = buyCents(b);
      const grams = buyGrams(b);
      const when = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
      if (!when) continue;
      const who = b.suspect ? ` from ${b.suspect}` : '';
      for (const sent of all) {
        if (!BUY_RE.test(sent.text) || TOTAL_RE.test(sent.text)) continue;
        if (!sent.facts.some((f) => f.type === 'date' && sameValue('date', f.value, when))) continue;
        const money = sent.facts.filter((f) => f.type === 'money');
        if (cents && money.length && !money.some((f) => Number(f.value) === cents)) {
          push(makeFlag(docs, {
            severity: 'High', confidence: money.length === 1 ? 'High' : 'Medium', type: 'buy',
            title: `Buy on ${when}: "${money[0].display}" but the Timeline says ${dollars(cents)} was paid`,
            detail: `The Timeline's buy${who} on ${when} (${b.drug || 'buy'}) was ${dollars(cents)}; ${docs[sent.doc].name} says ${money.map((f) => f.display).join(', ')}.`,
            statement: sent, statementFact: money[0], source: null, sourceLabel: SRC,
          }), `b|m|${sent.doc}:${sent.start}|${when}|${cents}`);
        }
        const weights = sent.facts.filter((f) => f.type === 'weight');
        if (grams && weights.length && !weights.some((f) => sameValue('weight', f.value, gramsText(grams)))) {
          push(makeFlag(docs, {
            severity: 'High', confidence: weights.length === 1 ? 'High' : 'Medium', type: 'buy',
            title: `Buy on ${when}: "${weights[0].display}" but the Timeline says ${b.qty} ${b.unit}`,
            detail: `The Timeline's buy${who} on ${when} (${b.drug || 'buy'}) was ${b.qty} ${b.unit}; ${docs[sent.doc].name} says ${weights.map((f) => f.display).join(', ')}.`,
            statement: sent, statementFact: weights[0], source: null, sourceLabel: SRC,
          }), `b|w|${sent.doc}:${sent.start}|${when}|${b.qty}${b.unit}`);
        }
      }
    }

    // Totals: all buys, and each suspect's buys.
    const groups = new Map([['', buys]]);
    for (const b of buys) { const k = String(b.suspect || '').trim().toLowerCase(); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); } }
    const totals = { money: [], weight: [] };
    for (const list of groups.values()) {
      const c = list.map(buyCents).filter((x) => x != null);
      if (c.length) totals.money.push(c.reduce((t, x) => t + x, 0));
      const g = list.map(buyGrams).filter((x) => x != null);
      if (g.length) totals.weight.push(Math.round(g.reduce((t, x) => t + x, 0) * 100) / 100);
    }
    const grand = { money: totals.money[0], weight: totals.weight[0] };
    for (const sent of all) {
      if (!BUY_RE.test(sent.text)) continue;
      for (const type of ['money', 'weight']) {
        const total = statedTotal(sent, type);
        if (!total || grand[type] == null) continue;
        // A total of the amounts listed in the same sentence is a sum of its own (totalsCheck).
        if (sent.facts.filter((f) => f.type === type && f !== total).length >= 2) continue;
        if (totals[type].some((v) => agrees(type, v, total.value))) continue;
        const n = buys.filter((b) => (type === 'money' ? buyCents(b) : buyGrams(b)) != null).length;
        push(makeFlag(docs, {
          severity: 'Medium', confidence: 'Medium', type: 'buy',
          title: `${type === 'money' ? 'Total paid' : 'Total weight'} "${total.display}" doesn't match the Timeline's Buy Summary (${showSum(type, grand[type], total)})`,
          detail: `The Timeline has ${n} buy${n === 1 ? '' : 's'} adding up to ${showSum(type, grand[type], total)}${groups.size > 2 ? ', and no one suspect\'s buys add up to ' + total.display : ''}. ${docs[sent.doc].name} says ${total.display}.`,
          statement: sent, statementFact: total, source: null, sourceLabel: SRC,
        }), `b|t|${type}|${sent.doc}:${sent.start}`);
      }
    }
  }

  function pickOccurrence(docs, list) {
    return list.find((o) => docs[o.sent.doc].role === 'affidavit') || list[0];
  }

  // One pair of neighbouring letters swapped: the most common typing slip (Sampel / Sample).
  function isTransposition(a, b) {
    if (a.length !== b.length) return false;
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }

  const COMMON_WORDS = new Set(['were', 'where', 'there', 'their', 'then', 'than', 'that', 'this', 'with', 'from', 'said', 'side', 'time', 'item', 'items']);
  function isNameVariant(a, b) {
    if (a === b || a.length < 4 || b.length < 4) return false;
    if (COMMON_WORDS.has(a) || COMMON_WORDS.has(b)) return false;
    if (a.replace(/s$/, '') === b.replace(/s$/, '')) return false;
    if (isTransposition(a, b) && a[0] === b[0] && a.length >= 5) return true;
    const dist = T.levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    const sameSound = T.soundex(a).slice(1) === T.soundex(b).slice(1);
    if (dist === 1 && maxLen >= 4) return a[0] === b[0] || (sameSound && maxLen >= 6);
    if (dist === 2 && maxLen >= 7) return a[0] === b[0] && T.soundex(a) === T.soundex(b);
    // Different first letter but same sound (Katherine / Catherine, Kristopher / Christopher).
    if (dist <= 2 && maxLen >= 6 && T.soundex(a).slice(1) === T.soundex(b).slice(1) && a.slice(-3) === b.slice(-3)) return true;
    return false;
  }

  const api = { extractFacts, analyze, compare, isNameVariant, TYPE_LABEL, buyGrams };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVRules = api;
})(this);
