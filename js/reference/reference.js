/* CaseVault — reference logic: the value calculator, picking a complaint form, the SFST score,
 * the DUI flow path, code search, and the text the AI gets from the reference material.
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

  /* ---------- complaint forms ---------- */

  /** Every complaint form, flat: { id, drugKey, drug, act, kind, cite, range, cls, file, grams, name }. */
  function complaintList() {
    const out = [];
    for (const g of R.COMPLAINTS.groups) {
      for (const s of g.subs) {
        for (const f of s.forms) {
          out.push({ id: f.file, drugKey: g.key, drug: g.drug, act: g.act, kind: s.kind, cite: f.cite, range: f.range, cls: f.cls, file: f.file, grams: f.grams,
            name: `${s.kind === 'possession' ? 'Possession' : 'Delivery'}: ${g.drug}, ${f.range} (${f.cite})` });
        }
      }
    }
    for (const [label, file] of R.COMPLAINTS.other) out.push({ id: file, drugKey: 'other', drug: 'Other', act: '', kind: 'other', cite: '', range: '', cls: '', file, grams: null, name: label });
    return out;
  }

  const baseName = (p) => String(p || '').split(/[\\/]/).pop();
  /** The form a file name belongs to (for import), or null. */
  const complaintByFileName = (name) => complaintList().find((c) => baseName(c.file).toLowerCase() === baseName(name).toLowerCase()) || null;

  /** Which drug a description names: cocaine, heroin, fentanyl, methamphetamine, cannabis, synthetic, or ''. */
  function drugKeyOf(text) {
    const s = String(text || '').toLowerCase();
    if (/fentanyl|carfentanil/.test(s)) return 'fentanyl';
    if (/heroin/.test(s)) return 'heroin';
    if (/cocaine|crack/.test(s)) return 'cocaine';
    if (/meth(amphetamine)?\b|\bice\b|crystal/.test(s)) return 'methamphetamine';
    if (/cannabis|marijuana|\bthc\b|weed/.test(s)) return 'cannabis';
    if (/synthetic|k2|spice|bath salt/.test(s)) return 'synthetic';
    return '';
  }

  /** Grams from text like "12.4 g", "3 grams", "1 kg", "2 oz", "1 lb". */
  function gramsOf(text) {
    const m = /(\d+(?:[.,]\d+)?)\s*(kg|kilograms?|kilos?|g|grams?|gr|oz|ounces?|lbs?|pounds?)\b/i.exec(String(text || ''));
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    const u = m[2].toLowerCase();
    if (/^k/.test(u)) return n * 1000;
    if (/^(oz|ounce)/.test(u)) return n * 28.3495;
    if (/^(lb|pound)/.test(u)) return n * 453.592;
    return n;
  }

  /** Forms for a drug, weight and kind ('possession' or 'delivery'; empty for both). */
  function findComplaints({ drugKey = '', grams = null, kind = '' } = {}) {
    return complaintList().filter((c) => c.kind !== 'other'
      && (!drugKey || c.drugKey === drugKey)
      && (!kind || c.kind === kind)
      && (grams == null || !c.grams || (grams >= c.grams[0] && (c.grams[1] == null || grams < c.grams[1]))));
  }

  const normCite = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/^720ilcs/, '');

  /**
   * Suggest complaint forms from the arrest charges: a charge whose statute names the form's
   * citation (with the drug in the charge), or one naming a drug, a weight and possession/delivery.
   */
  function suggestComplaints(charges) {
    const out = [];
    const add = (c) => { if (!out.some((x) => x.id === c.id)) out.push(c); };
    for (const ch of charges || []) {
      const text = `${ch.statute || ''} ${ch.description || ''}`;
      const drugKey = drugKeyOf(text);
      const statute = normCite(ch.statute);
      const byCite = complaintList().filter((c) => c.cite && statute.includes(normCite(c.cite)) && (!drugKey || c.drugKey === drugKey));
      if (byCite.length === 1) { add(byCite[0]); continue; }
      const kind = /deliver|manufactur|intent|pwid|sale|sell/i.test(text) ? 'delivery' : /possess/i.test(text) ? 'possession' : '';
      const grams = gramsOf(text);
      if (drugKey) findComplaints({ drugKey, grams, kind }).filter((c) => !byCite.length || byCite.includes(c)).slice(0, grams == null ? 2 : 1).forEach(add);
    }
    return out;
  }

  /* ---------- SFST ---------- */

  /** state: { hgn: { clues: { 'i-left': true, … } }, … } -> [{ key, title, clues, max, decision, over, text }] */
  function sfstScores(state = {}) {
    return R.SFST.map((t) => {
      const st = state[t.key] || {};
      const clues = Object.entries(st.clues || {}).filter(([, v]) => v).length;
      const n = Math.min(clues, t.max);
      const over = n >= t.decision;
      return { key: t.key, title: t.title, clues: n, max: t.max, decision: t.decision, over, cantPerform: !!st.cantPerform,
        text: st.cantPerform ? 'Could not perform the test.' : `${n} of ${t.max} clues; decision point ${t.decision}: ${over ? 'at or above the decision point' : 'below the decision point'}.` };
    });
  }

  const tick = (on) => (on ? '[x]' : '[ ]');

  /** The filled-in SFST as Markdown (for a case's notes or a draft). */
  function sfstMarkdown(state = {}, header = {}) {
    const lines = ['# Standardized Field Sobriety Test', ''];
    for (const [k, label] of [['officer', 'Officer'], ['star', 'Star #'], ['date', 'Date'], ['caseNo', 'RD / Case #']]) if (header[k]) lines.push(`- **${label}:** ${header[k]}`);
    const scores = sfstScores(state);
    for (const t of R.SFST) {
      const st = state[t.key] || {};
      const s = scores.find((x) => x.key === t.key);
      lines.push('', `## ${t.title}`, '');
      if (t.sidedClues) {
        for (const [i, clue] of t.clues.entries()) lines.push(`- ${clue}: left ${tick(st.clues && st.clues[`${i}-left`])}, right ${tick(st.clues && st.clues[`${i}-right`])}`);
        if (t.extra) lines.push(`- ${t.extra.label}: ${st.extra || 'not recorded'}`);
      } else {
        for (const [i, clue] of t.clues.entries()) lines.push(`- ${tick(st.clues && st.clues[i])} ${clue}`);
      }
      if (st.cantPerform) lines.push(`- ${tick(true)} ${t.cantPerform}`);
      lines.push('', `**Score:** ${s.text}`);
    }
    const alt = state.alternate || {};
    const altRows = R.SFST_ALTERNATE.filter((a) => alt[a]).map((a) => `- ${a}: ${alt[a]}`);
    if (altRows.length || state.pbt) lines.push('', '## Phase IV: Alternate tests', '', ...altRows, ...(state.pbt ? [`- PBT result: ${state.pbt}`] : []));
    return `${lines.join('\n')}\n`;
  }

  /* ---------- DUI flow ---------- */

  /** The phases this stop went through, following each choice: ['p1', 'p2', …] (and 'end-…'). */
  function duiPath(state = {}) {
    const path = [];
    let key = R.DUI_FLOW[0].key;
    const guard = new Set();
    while (key && !guard.has(key)) {
      guard.add(key);
      path.push(key);
      const phase = R.DUI_FLOW.find((p) => p.key === key);
      if (!phase) break;
      let next = null;
      for (const f of phase.fields || []) {
        if (f.next && state[f.key]) { next = f.next[state[f.key]] || null; break; }
        if (f.next && !state[f.key]) { next = undefined; break; } // not answered yet: stop here
      }
      if (next === undefined) break;
      if (next === null) { const i = R.DUI_FLOW.indexOf(phase); next = R.DUI_FLOW[i + 1] ? R.DUI_FLOW[i + 1].key : null; }
      key = next;
    }
    return path;
  }

  function duiMarkdown(state = {}, header = {}) {
    const lines = ['# DUI flow chart', ''];
    for (const [k, label] of [['officer', 'Officer'], ['star', 'Star #'], ['date', 'Date'], ['caseNo', 'RD / Case #']]) if (header[k]) lines.push(`- **${label}:** ${header[k]}`);
    for (const key of duiPath(state)) {
      if (R.DUI_ENDS[key]) { lines.push('', `**${R.DUI_ENDS[key]}**`); continue; }
      const p = R.DUI_FLOW.find((x) => x.key === key);
      const rows = (p.fields || []).filter((f) => state[f.key]).map((f) => `- ${f.label}: ${state[f.key]}`);
      const checks = (p.checklist || []).map((c, i) => `- ${tick(state[`${p.key}-check-${i}`])} ${c}`);
      lines.push('', `## ${p.title}`, '', ...(rows.length ? rows : ['- (nothing recorded)']), ...checks);
    }
    return `${lines.join('\n')}\n`;
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
    complaintList, complaintByFileName, drugKeyOf, gramsOf, findComplaints, suggestComplaints,
    sfstScores, sfstMarkdown, duiPath, duiMarkdown, searchCodes, narcoticsText,
    locationCodesText: () => codesText('Incident location codes:', R.LOCATION_CODES),
    ucrText: () => codesText('Commonly used UCR codes:', R.UCR_CODES),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReference = api;
})(this);
