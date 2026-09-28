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

  const api = { normalize, sentences, tokens, terms, similarity, createIndex, findVerbatim, levenshtein, soundex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVText = api;
})(this);
