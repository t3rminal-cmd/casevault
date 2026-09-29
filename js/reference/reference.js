/* CaseVault — reference logic: the narcotics value calculator and chart, code search, and the
 * text the AI gets from the reference material.
 * Plain logic, no DOM: the tests run it under Node. The data is in ref-data.js.
 */
'use strict';

(function (root) {
  const R = typeof module !== 'undefined' && module.exports ? require('./ref-data.js') : root.CVRefData;

  /* ---------- narcotics values ---------- */

  const UNIT_ORDER = ['gram', 'pill', 'ounce', 'pound', 'kilogram', 'mL'];
  const unitLabel = (u) => (u === 'mL' ? 'mL' : u.charAt(0).toUpperCase() + u.slice(1));
  const priceUnits = (drug) => { const d = R.NARCOTIC_DATA[drug] || {}; return UNIT_ORDER.filter((u) => typeof d[u] === 'number'); };
  // A pound price that is just the gram price x 454 is an estimate, not a bulk price.
  const isEstimate = (d, unit) => unit === 'pound' && d.gram && d.pound && Math.abs(d.pound / d.gram - 453.6) < 2;
  const needsVerify = (d, unit) => !!(d.verify && d.verify.includes(unit));
  const money = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /** Street value of an amount: { ok, value, text, line } or { ok: false, error }. */
  function streetValue(drug, amount, unit) {
    const d = R.NARCOTIC_DATA[drug];
    const n = Number(amount);
    if (!d) return { ok: false, error: 'Choose a drug.' };
    if (!(n > 0)) return { ok: false, error: 'Enter an amount greater than 0.' };
    const price = d[unit];
    if (typeof price !== 'number') return { ok: false, error: `No ${unit} price for ${drug}. Try: ${priceUnits(drug).join(', ')}.` };
    const value = Math.round(price * n * 100) / 100;
    const notes = [isEstimate(d, unit) && 'estimate: gram price × 454', needsVerify(d, unit) && 'price needs verification'].filter(Boolean);
    const qty = `${n} ${unit === 'mL' ? 'mL' : unit}${n === 1 || unit === 'mL' ? '' : 's'}`;
    return {
      ok: true, value, estimate: isEstimate(d, unit), verify: needsVerify(d, unit),
      text: `${money(value)}${notes.length ? ` (${notes.join('; ')})` : ''}`,
      // One line to paste into a report.
      line: `${drug}, ${qty}: approximate street value ${money(value)} (${R.NARCOTIC_SOURCE}, ${money(price)} per ${unit}${notes.length ? `; ${notes.join('; ')}` : ''}).`,
    };
  }

  /** The value chart: [{ category, units, rows: [{ drug, cells: { unit: { price, estimate, verify } } }] }]. */
  function valueChart() {
    return R.NARCOTIC_CATEGORIES.map((category) => {
      const drugs = Object.keys(R.NARCOTIC_DATA).filter((k) => R.NARCOTIC_DATA[k].cat === category);
      const units = UNIT_ORDER.filter((u) => drugs.some((k) => typeof R.NARCOTIC_DATA[k][u] === 'number'));
      return {
        category, units,
        rows: drugs.map((drug) => {
          const d = R.NARCOTIC_DATA[drug];
          return { drug, cells: Object.fromEntries(units.filter((u) => typeof d[u] === 'number').map((u) => [u, { price: d[u], estimate: isEstimate(d, u), verify: needsVerify(d, u) }])) };
        }),
      };
    });
  }

  /* ---------- codes ---------- */

  /** Search a code list ([{ key, title, codes: [[code, desc]] }]) by code or words; cat 'all' or a key. */
  function searchCodes(list, q = '', cat = 'all') {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter((g) => cat === 'all' || g.key === cat).map((g) => ({
      ...g,
      codes: g.codes.filter(([code, desc]) => words.every((w) => code.toLowerCase().startsWith(w) || `${desc} ${g.title}`.toLowerCase().includes(w))),
    })).filter((g) => g.codes.length);
  }

  /* ---------- for the AI ---------- */

  /** The value chart as compact text, for Draft with AI. */
  function narcoticsText() {
    const rows = [`Narcotics street values (${R.NARCOTIC_SOURCE}), per unit. Estimates and prices to verify are marked.`];
    for (const g of valueChart()) {
      for (const r of g.rows) {
        rows.push(`- ${r.drug}: ${Object.entries(r.cells).map(([u, c]) => `${money(c.price)}/${u}${c.estimate ? ' (estimate)' : ''}${c.verify ? ' (verify)' : ''}`).join(', ')}`);
      }
    }
    return rows.join('\n');
  }

  const codesText = (title, list) => [title, ...list.map((g) => `${g.title}: ${g.codes.map(([c, d]) => `${c} ${d}`).join('; ')}`)].join('\n');

  const api = {
    UNIT_ORDER, unitLabel, priceUnits, isEstimate, money, streetValue, valueChart,
    searchCodes, narcoticsText,
    locationCodesText: () => codesText('Incident location codes:', R.LOCATION_CODES),
    ucrText: () => codesText('Commonly used UCR codes:', R.UCR_CODES),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReference = api;
})(this);
