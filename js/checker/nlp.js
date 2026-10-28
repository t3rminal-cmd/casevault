/* CaseVault checker — text utilities shared by the rule-based and AI layers.
 * Pure functions (no DOM), so they also run under Node for the unit tests.
 */
'use strict';

(function (root) {
  // Titles and abbreviations that end in a period but do not end a sentence.
  const ABBREV = new Set([
    'mr', 'mrs', 'ms', 'dr', 'st', 'sr', 'jr', 'no', 'nos', 'ofc', 'off', 'sgt', 'det', 'lt', 'capt', 'cpl', 'dep', 'insp',
    'supt', 'cmdr', 'col', 'gen', 'gov', 'hon', 'rev', 'prof', 'atty', 'esq', 'approx', 'apt', 'ave', 'blvd', 'rd', 'ln',
    'ct', 'hwy', 'pkwy', 'vs', 'v', 'etc', 'inc', 'co', 'corp', 'ltd', 'dept', 'div', 'est', 'fig', 'jan', 'feb', 'mar',
    'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs',
    'fri', 'sat', 'sun', 'a.m', 'p.m', 'e.g', 'i.e', 'u.s', 'u.s.a', 'lic', 'reg', 'ext', 'tel', 'ph', 'mt', 'ft', 'mi',
  ]);

  /** Canonical form used for verbatim matching: typographic quotes/dashes/ligatures, whitespace, soft hyphens. */
  function normalize(s) {
    return String(s || '')
      .normalize('NFKC')
      .replace(/­/g, '')                       // soft hyphen
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')        // words hyphenated across a line break
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Split text into sentences, keeping character offsets into the original string.
   * Returns [{ text, start, end }].
   */
  function sentences(text) {
    const out = [];
    const s = String(text || '');
    let start = 0;
    const re = /[.!?]+["')\]]*(\s+|$)|\n\s*\n/g;
    let m;
    while ((m = re.exec(s))) {
      const endPunct = m.index + m[0].trimEnd().length;
      if (m[0][0] === '.') {
        // Look at the word before the period: an abbreviation, an initial, or a decimal is not a sentence end.
        const before = s.slice(start, m.index);
        const word = (before.match(/([A-Za-z]+(?:\.[A-Za-z]+)*)$/) || [])[1] || '';
        const next = s.slice(m.index + m[0].length, m.index + m[0].length + 1);
        if (word && (ABBREV.has(word.toLowerCase()) || /^[A-Z]$/.test(word))) continue;
        if (/\d$/.test(before) && /^\d/.test(next)) continue;
        if (next && /[a-z]/.test(next)) continue; // "approx. two" / lower-case continuation
      }
      const piece = s.slice(start, endPunct);
      if (piece.trim()) {
        const lead = piece.length - piece.trimStart().length;
        out.push({ text: piece.trim(), start: start + lead, end: start + lead + piece.trim().length });
      }
      start = m.index + m[0].length;
    }
    const rest = s.slice(start);
    if (rest.trim()) {
      const lead = rest.length - rest.trimStart().length;
      out.push({ text: rest.trim(), start: start + lead, end: start + lead + rest.trim().length });
    }
    return out;
  }

  const STOP = new Set(('a an the and or but if then than that this these those there their they them he she it its his her ' +
    'him we us our you your i me my of to in on at by for with from into onto upon over under about after before during ' +
    'while as is was were be been being am are has have had do does did not no nor so such very can could would should ' +
    'will shall may might must also which who whom whose what when where why how all any each both few more most other ' +
    'some own same only just said stated states approximately further furthermore affiant undersigned hereby herein ' +
    'thereafter therein respectively').split(/\s+/));

  function tokens(s) {
    return normalize(s).toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
  }

  /** Content words, lightly stemmed, for similarity and retrieval. */
  function terms(s) {
    return tokens(s)
      .filter((t) => !STOP.has(t) && (t.length > 1 || /\d/.test(t)))
      .map(stem);
  }

  function stem(t) {
    if (/\d/.test(t) || t.length <= 3) return t;
    return t.replace(/(ing|edly|ed|ly|es|s)$/, '') || t;
  }

  /** Similarity of two sentences' content words (0..1), weighted towards the shorter one. */
  function similarity(a, b) {
    const A = new Set(terms(a));
    const B = new Set(terms(b));
    if (!A.size || !B.size) return 0;
    let shared = 0;
    for (const t of A) if (B.has(t)) shared++;
    return shared / Math.min(A.size, B.size) * 0.6 + shared / (A.size + B.size - shared) * 0.4;
  }

  /** BM25 index over passages, for finding the report passages relevant to a statement. */
  function createIndex(passages) {
    const docs = passages.map((p) => terms(p.text));
    const df = new Map();
    for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
    const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length);
    const N = docs.length;
    return {
      search(query, k = 5) {
        const q = [...new Set(terms(query))];
        const scored = docs.map((d, i) => {
          const tf = new Map();
          for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
          let score = 0;
          for (const t of q) {
            const f = tf.get(t);
            if (!f) continue;
            const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
            score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.length / (avg || 1)));
          }
          return { i, score };
        });
        return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
          .map((x) => ({ ...passages[x.i], score: x.score }));
      },
    };
  }

  /**
   * Find `quote` inside `text`, ignoring differences in whitespace and typographic quotes/dashes.
   * Returns { start, end } offsets into the ORIGINAL text, or null. This is the anti-hallucination check.
   */
  function findVerbatim(text, quote) {
    const q = normalize(quote).replace(/^["']+|["'.,;:]+$/g, '').trim();
    if (q.length < 8) return null;
    // Build the normalized text with a map back to original offsets.
    const src = String(text || '');
    let norm = '';
    const map = [];
    let lastSpace = true;
    for (let i = 0; i < src.length; i++) {
      let ch = src[i].normalize('NFKC');
      if (ch === '­') continue;
      if (/[‘’‚‛′]/.test(ch)) ch = "'";
      else if (/[“”„‟″]/.test(ch)) ch = '"';
      else if (/[‐-―−]/.test(ch)) ch = '-';
      if (/\s/.test(ch)) {
        if (lastSpace) continue;
        ch = ' ';
        lastSpace = true;
      } else {
        lastSpace = false;
      }
      for (const c of ch) { norm += c; map.push(i); }
    }
    const at = norm.indexOf(q);
    if (at < 0) return null;
    return { start: map[at], end: map[at + q.length - 1] + 1 };
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  /** American Soundex, for catching names that sound alike but are spelled differently. */
  function soundex(word) {
    const w = String(word).toUpperCase().replace(/[^A-Z]/g, '');
    if (!w) return '';
    const codes = { B: 1, F: 1, P: 1, V: 1, C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2, D: 3, T: 3, L: 4, M: 5, N: 5, R: 6 };
    let out = w[0];
    let last = codes[w[0]] || 0;
    for (let i = 1; i < w.length && out.length < 4; i++) {
      const c = codes[w[i]] || 0;
      if (c && c !== last) out += c;
      if (w[i] !== 'H' && w[i] !== 'W') last = c;
    }
    return out.padEnd(4, '0');
  }


  /* ---------------- v1.162: names ---------------- */

  // Common first names and their nicknames. Each line is one group: any two names in a group are
  // the same first name (Bill / William), so they are never flagged as a spelling difference.
  // A nickname can sit in more than one group (Alex: Alexander and Alexandra).
  const NICKNAME_GROUPS = [
    'william bill billy will willy liam', 'robert bob bobby rob robbie bert', 'richard rick ricky rich richie dick',
    'james jim jimmy jamie', 'john jack johnny jon', 'jonathan jon jonny john', 'joseph joe joey', 'michael mike mikey mick',
    'thomas tom tommy', 'charles charlie chuck chas', 'christopher chris kris topher', 'daniel dan danny', 'anthony tony',
    'edward ed eddie ted ned', 'samuel sam sammy', 'alexander alex al xander', 'andrew andy drew', 'benjamin ben benny',
    'nicholas nick nicky', 'matthew matt matty', 'steven steve stevie', 'stephen steve stevie', 'timothy tim timmy',
    'gregory greg', 'jeffrey jeff', 'kenneth ken kenny', 'lawrence larry', 'raymond ray', 'ronald ron ronnie',
    'donald don donnie', 'gerald gerry jerry', 'harold hal harry', 'henry hank harry', 'francis frank fran',
    'zachary zach zack', 'nathaniel nate nathan', 'joshua josh', 'jacob jake', 'david dave davey', 'douglas doug',
    'frederick fred freddy', 'peter pete', 'phillip phil', 'philip phil', 'walter walt wally', 'eugene gene',
    'leonard leo len lenny', 'vincent vince vinny', 'patrick pat paddy', 'terrence terry', 'albert al bert',
    'francisco frank paco pancho', 'jose pepe', 'antonio tony tono', 'enrique kike quique', 'ignacio nacho',
    'alejandro alex ale', 'roberto beto', 'alberto beto', 'eduardo lalo', 'guillermo memo', 'jesus chuy',
    'manuel manny manolo', 'rafael rafa', 'ricardo ricky', 'guadalupe lupe', 'gustavo gus', 'fernando fer nando',
    'elizabeth liz lizzy beth betty eliza libby', 'katherine kate katie kathy kat', 'catherine cathy cat kate katie',
    'margaret maggie meg peggy marge', 'jennifer jen jenny', 'patricia pat patty trish tricia', 'susan sue suzy',
    'deborah debbie deb', 'rebecca becky', 'victoria vicky tori', 'theresa terry tess', 'teresa terry tess',
    'dorothy dot dottie', 'abigail abby', 'samantha sam sammie', 'alexandra alex lexi sandra', 'isabella bella izzy',
    'olivia liv', 'christina chris tina', 'kimberly kim', 'jessica jess jessie', 'cynthia cindy', 'barbara barb babs',
    'pamela pam', 'stephanie steph', 'jacqueline jackie', 'josephine jo josie', 'josefina pepa', 'maria mari',
  ];
  const NICK = new Map(); // name -> Set of group indexes
  NICKNAME_GROUPS.forEach((g, i) => { for (const n of g.split(' ')) { if (!NICK.has(n)) NICK.set(n, new Set()); NICK.get(n).add(i); } });

  /** True when two first names are the same name or nicknames of one name (Bill / William). */
  function sameFirstName(a, b) {
    a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase();
    if (a === b) return true;
    const A = NICK.get(a); const B = NICK.get(b);
    if (!A || !B) return false;
    for (const i of A) if (B.has(i)) return true;
    return false;
  }

  /**
   * Known aliases of a case: one person per line, names separated by commas, slashes, ";", " aka "
   * or " a/k/a ". Returns groups of lower-case words that belong to the same person, so the checker
   * never flags "Rick" vs "Ricky" or "Poe" vs a moniker as a spelling difference.
   * "Ricky Poe, Rick Poe, Little R" -> [['ricky', 'poe', 'rick', 'little']] (2+ letters per word).
   */
  function parseAliases(text) {
    return String(text || '').split(/\n+/).map((line) => line.split(/\s*(?:,|;|\/|\ba\/?k\/?a\b|\baka\b)\s*/i)
      .flatMap((n) => normalize(n).toLowerCase().match(/[a-z][a-z'-]+/g) || [])
      .map((w) => w.replace(/'s$/, '')))
      .map((words) => [...new Set(words)])
      .filter((words) => words.length > 1);
  }

  /* ---------------- v1.162: addresses ---------------- */

  // Street suffixes and designators in their short form, so "Street" and "St." read the same.
  const STREET_SUFFIX = {
    street: 'st', st: 'st', str: 'st', avenue: 'ave', ave: 'ave', av: 'ave', road: 'rd', rd: 'rd', boulevard: 'blvd', blvd: 'blvd',
    drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct', way: 'way', wy: 'way', place: 'pl', pl: 'pl', highway: 'hwy',
    hwy: 'hwy', parkway: 'pkwy', pkwy: 'pkwy', terrace: 'ter', ter: 'ter', circle: 'cir', cir: 'cir', trail: 'trl', trl: 'trl',
    square: 'sq', sq: 'sq', alley: 'aly', aly: 'aly', expressway: 'expy', expy: 'expy', freeway: 'fwy', fwy: 'fwy',
  };
  const DIRECTION = { north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw', n: 'n', s: 's', e: 'e', w: 'w', ne: 'ne', nw: 'nw', se: 'se', sw: 'sw' };
  const ORDINAL = {
    first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th',
    tenth: '10th', eleventh: '11th', twelfth: '12th', thirteenth: '13th', fourteenth: '14th', fifteenth: '15th', sixteenth: '16th',
    seventeenth: '17th', eighteenth: '18th', nineteenth: '19th', twentieth: '20th',
  };
  const WORD = { mount: 'mt', mt: 'mt', fort: 'ft', ft: 'ft' };
  const UNIT_WORDS = /^(apt|apartment|unit|suite|ste|no|number|rm|room|fl|floor|#)$/;

  /**
   * One canonical form of a street address, so formatting never makes a difference:
   * "1420 N. Fifth Avenue, Apt. #3-B" and "1420 North 5th Ave #3B" both give "1420 n 5th ave #3b".
   * Abbreviations (Street/St, Avenue/Ave, North/N, Fifth/5th, Mount/Mt), commas, periods and the
   * unit word (Apt, Apartment, Unit, Suite, #) are all evened out. Returns '' for empty input.
   */
  function normalizeAddress(s) {
    const words = normalize(s).toLowerCase().replace(/[.,]/g, ' ').replace(/#/g, ' # ').split(/\s+/).filter(Boolean);
    const out = [];
    let unit = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (UNIT_WORDS.test(w) && i > 0) {
        // The unit: the rest, without its word, "#" or hyphens ("Apt. #3-B" -> "3b").
        const rest = words.slice(i + 1).filter((x) => !UNIT_WORDS.test(x)).join('').replace(/-/g, '');
        if (rest) unit = rest;
        break;
      }
      out.push(STREET_SUFFIX[w] && out.length > 1 ? STREET_SUFFIX[w] : DIRECTION[w] && (out.length === 1 || i === words.length - 1) ? DIRECTION[w] : ORDINAL[w] || WORD[w] || w);
    }
    return `${out.join(' ')}${unit ? ` #${unit}` : ''}`.trim();
  }

  const api = { sameFirstName, parseAliases, normalizeAddress, STREET_SUFFIX, normalize, sentences, tokens, terms, similarity, createIndex, findVerbatim, levenshtein, soundex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVText = api;
})(this);
