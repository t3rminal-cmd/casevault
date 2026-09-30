/* CaseVault — the arithmetic half of Reports → Review: do the totals in a report add up?
 *
 * Finds money ($1,250.00) and weights (28.5 g, 1.2 kg) and every line that states a total
 * ("Total $4,300", "totaling $4,300", a table's Total row). The amounts of the same kind listed
 * before it — in the same sentence, or else in the same paragraph, list or table — should add up to
 * it. The AI half of Review (js/drafts/copilot.js reviewMessages) checks names, dates and the rest.
 *
 * Plain logic with no DOM, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const MONEY = /\$\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/g;
  const WEIGHT = /(\d+(?:,\d{3})*(?:\.\d+)?)\s?(kilograms?|kgs?|grams?|g|ounces?|oz|pounds?|lbs?)\b/gi;
  const TOTAL = /\b(total(?:s|ed|ing)?|sum|aggregate|in all|combined)\b/i;
  const GRAMS = { g: 1, gram: 1, grams: 1, kg: 1000, kgs: 1000, kilogram: 1000, kilograms: 1000, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };

  const num = (s) => Number(String(s).replace(/,/g, ''));
  const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const grams = (n) => `${Math.round(n * 100) / 100} g`;

  /** Every amount in a piece of text: [{ kind: 'money'|'weight', value, raw, index }]. value is dollars or grams. */
  function amounts(text) {
    const out = [];
    const s = String(text || '');
    let m;
    MONEY.lastIndex = 0;
    while ((m = MONEY.exec(s))) out.push({ kind: 'money', value: num(m[1]), raw: m[0], index: m.index });
    WEIGHT.lastIndex = 0;
    while ((m = WEIGHT.exec(s))) out.push({ kind: 'weight', value: num(m[1]) * (GRAMS[m[2].toLowerCase()] || 1), raw: m[0], index: m.index });
    return out.sort((a, b) => a.index - b.index);
  }

  /**
   * { issues: [{ line, kind, stated, computed, items, text }], money: total of all money amounts,
   *   count }. line is 1-based. A total with fewer than two amounts before it isn't checked.
   */
  function check(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const issues = [];
    let block = [];      // this paragraph/list/table's amounts so far (not totals)
    let all = [];
    lines.forEach((line, i) => {
      if (!line.trim() || /^#{1,6}\s/.test(line) || /^\s*\|?\s*:?-{3,}/.test(line)) { if (!line.trim() || /^#/.test(line)) block = []; return; }
      const found = amounts(line);
      all = all.concat(found.filter((a) => a.kind === 'money'));
      const t = TOTAL.exec(line);
      if (t && found.length) {
        // The stated total: the first amount after the word "total", else the last on the line.
        for (const kind of ['money', 'weight']) {
          const same = found.filter((a) => a.kind === kind);
          if (!same.length) continue;
          const stated = same.find((a) => a.index > t.index) || same[same.length - 1];
          // Amounts before it in the same sentence, else earlier lines of the block.
          const before = same.filter((a) => a.index < stated.index && a !== stated);
          const items = before.length >= 2 ? before : block.filter((a) => a.kind === kind);
          if (items.length >= 2) {
            const sum = items.reduce((n, a) => n + a.value, 0);
            if (Math.abs(sum - stated.value) > (kind === 'money' ? 0.005 : 0.01)) {
              issues.push({ line: i + 1, kind, stated: stated.value, computed: sum, items: items.map((a) => a.raw), text: line.trim() });
            }
          }
        }
        return; // a total line isn't an item of a later total
      }
      block = block.concat(found);
    });
    return { issues, money: all.reduce((n, a) => n + a.value, 0), count: all.length };
  }

  /** The findings as plain lines, for the Review window and for the AI. */
  function describe(result) {
    if (!result.issues.length) return result.count ? `The totals add up. ${result.count} money amount${result.count === 1 ? '' : 's'} in the report.` : 'No totals to check.';
    return result.issues.map((x) => {
      const f = x.kind === 'money' ? money : grams;
      return `Line ${x.line}: says ${f(x.stated)}, but ${x.items.join(' + ')} = ${f(x.computed)} (off by ${f(Math.abs(x.stated - x.computed))}). "${x.text.slice(0, 120)}"`;
    }).join('\n');
  }

  const api = { amounts, check, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReview = api;
})(this);
