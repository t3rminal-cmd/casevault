/* CaseVault — Case Facts beside a draft (v1.170).
 *
 * In the side panel of a draft (under "To confirm"):
 *  - the facts to write it from: the Timeline's buys, the evidence list (exhibits and inventory
 *    numbers) and, for a Buy or Surveillance narrative, the facts of its paired report (dates,
 *    times, amounts, weights, plates, inventory numbers). Click one to put it in the draft.
 *  - a check while you write: a moment after you stop typing, the draft is compared with the
 *    case's documents, the Timeline and the evidence list (the rules of the Checks tab, nothing
 *    leaves the PC). What doesn't match is listed, and underlined in the formatted view; "Use …"
 *    puts the documents' value into the draft.
 *
 * applyFix() and factsOf() are plain functions, so the tests run them under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const Rules = () => (isNode ? require('../checker/rules.js') : root.CVRules);
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  /** The facts of a report's text worth writing down, each kind once, in order: [{ type, label, text }] */
  function factsOf(paragraphs) {
    const R = Rules();
    const out = [];
    const seen = new Set();
    const KEEP = { date: 'Date', time: 'Time', money: 'Amount', weight: 'Weight', plate: 'Plate', inventory: 'Inventory', address: 'Address' };
    for (const p of paragraphs || []) {
      for (const f of R.extractFacts(p.text || '')) {
        if (!KEEP[f.type] || seen.has(`${f.type}|${f.value}`)) continue;
        seen.add(`${f.type}|${f.value}`);
        out.push({ type: f.type, label: KEEP[f.type], text: f.type === 'inventory' ? `Inventory #${f.value}` : clean(f.display) });
      }
    }
    const order = Object.keys(KEEP);
    return out.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  }

  /**
   * Puts fix.to in place of fix.from in the draft's Markdown, at the occurrence in the flagged
   * sentence: the only one, or the one with most of the sentence's words around it.
   * -> the new Markdown, or null when fix.from isn't in the draft.
   */
  function applyFix(md, sentence, fix) {
    const text = String(md || '');
    const from = String((fix && fix.from) || '');
    if (!from || !fix.to) return null;
    const at = [];
    for (let i = text.indexOf(from); i >= 0; i = text.indexOf(from, i + from.length)) at.push(i);
    if (!at.length) return null;
    const words = (t) => new Set(clean(t).toLowerCase().replace(/[*_~`#>]/g, '').split(/[^a-z0-9$#]+/).filter((w) => w.length > 2));
    const want = words(sentence);
    // Each occurrence's own sentence (between full stops or line breaks), scored by the flagged sentence's words in it.
    const score = (i) => {
      const a = Math.max(text.lastIndexOf('\n', i), ...['. ', '! ', '? '].map((p) => text.lastIndexOf(p, i)));
      const ends = ['\n', '. ', '! ', '? '].map((p) => text.indexOf(p, i + from.length)).filter((x) => x >= 0);
      const own = words(text.slice(a + 1, ends.length ? Math.min(...ends) : text.length));
      return [...want].filter((w) => own.has(w)).length / Math.max(1, own.size);
    };
    const best = at.length === 1 ? at[0] : at.reduce((a, b) => (score(b) > score(a) ? b : a));
    return text.slice(0, best) + fix.to + text.slice(best + from.length);
  }

  /**
   * v1.171: the start of a Buy or Surveillance narrative from a Timeline buy: what the Timeline and
   * the evidence list know is filled in, the rest is a [CONFIRM: …] to fill. No AI.
   * buy: a Timeline buy event { date, time, suspect, drug, qty, unit, paid, note };
   * kind: 'buy' | 'surveillance'; evidence: the Draft tab's exhibits [{ number, inventory, drug, type, weight }].
   */
  function buySkeleton(buy, { kind = 'buy', evidence = [], title = '' } = {}) {
    const b = buy || {};
    const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.date || ''));
    const day = m ? `${M[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : '[CONFIRM: date]';
    const t = /^(\d{1,2}):(\d{2})$/.exec(String(b.time || ''));
    const time = t ? `${((Number(t[1]) + 11) % 12) + 1}:${t[2]} ${Number(t[1]) < 12 ? 'AM' : 'PM'}` : '[CONFIRM: time]';
    const who = clean(b.suspect) || '[CONFIRM: suspect]';
    const drug = clean(b.drug);
    const amount = clean(b.qty) ? `${clean(b.qty)} ${b.unit || 'g'}${b.unit === 'g' || !b.unit ? 'rams' : ''}`.replace(/\b(\d+(?:\.\d+)?) grams$/, (x, n) => (Number(n) === 1 ? `${n} gram` : x)) : '';
    const paid = clean(b.paid) ? `$${Number(String(b.paid).replace(/[$,]/g, '')).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '';
    // The exhibits of this drug (or all of them when none names it) with their inventory numbers.
    const ex = (evidence || []).filter((e) => clean(e.inventory));
    const same = drug ? ex.filter((e) => new RegExp(drug.split(/\s+/)[0], 'i').test(`${e.drug || ''} ${e.description || ''}`)) : [];
    const inv = (same.length ? same : ex).map((e) => `Inventory #${clean(e.inventory)}`);
    const invText = inv.length ? inv.join(' and ') : 'Inventory #[CONFIRM: inventory number]';
    const what = [amount, drug ? `of suspect ${drug.toLowerCase()}` : 'of suspect narcotics'].filter(Boolean).join(' ');
    const head = [`# ${title || (kind === 'surveillance' ? 'Surveillance Report' : 'Buy Report')}`, '',
      `**Date:** ${day} · **Time:** ${time} · **Suspect:** ${who}${drug ? ` · **Narcotic:** ${drug}` : ''}${paid ? ` · **Paid:** ${paid}` : ''}`, ''];
    const lines = kind === 'surveillance' ? [
      `1. On ${day}, at approximately ${t ? time : '[CONFIRM: time surveillance was set up]'}, surveillance was set up at [CONFIRM: surveillance position] near [CONFIRM: location of the buy].`,
      `2. At approximately ${time}, surveillance observed the undercover officer (UC) meet ${who} at [CONFIRM: location].`,
      '3. [CONFIRM: what surveillance saw, in order: arrivals, vehicles (make, colour, plate), the hand-off, departures and directions of travel.]',
      `4. After the buy, the UC turned over ${what}, which was inventoried under ${invText}.`,
      '5. [CONFIRM: when surveillance ended, and the debriefing.]',
    ] : [
      `1. On ${day}, at approximately ${time}, the undercover officer (UC) met ${who} at [CONFIRM: location].`,
      `2. The UC purchased ${what} from ${who}${paid ? ` for ${paid} in pre-recorded funds` : ' for [CONFIRM: amount] in pre-recorded funds'}.`,
      '3. [CONFIRM: what happened, in order: the conversation, the hand-off, and how the UC and the suspect left.]',
      `4. The narcotics were inventoried under ${invText}.`,
      '5. [CONFIRM: field test result, and who took the narcotics to the evidence room.]',
    ];
    return [...head, ...lines, ''].join('\n');
  }

  /** Browser: the panel for one draft. -> { el } */
  function attach({ c, slug, meta, ta, rich, ui }) {
    const { h, icon: I } = ui;
    const R = Rules();
    const status = h('p', { class: 'facts-status muted small', role: 'status' }, 'Reading the case\'s documents…');
    const misList = h('ul', { class: 'facts-mismatch' });
    const lists = h('div', { class: 'facts-lists' });
    const refreshBtn = h('button', { class: 'icon-btn', type: 'button', title: 'Read the case\'s documents, Timeline and evidence list again' }, I('arrow-repeat'), h('span', { class: 'sr-only' }, 'Refresh'));
    const el = h('section', { class: 'facts-panel', 'aria-label': 'Case Facts' },
      h('div', { class: 'facts-head' }, h('h3', {}, 'Case Facts'), refreshBtn),
      h('p', { class: 'muted small explain' }, 'Click a fact to put it in the draft. The draft is checked against them as you write.'),
      status, misList, lists);
    let ctx = null;
    let lastText = null;
    let current = [];

    const insert = (text) => {
      if (ta.readOnly) return;
      if (rich && rich.active()) { rich.insertMarkdown(text); return; }
      const a = ta.selectionStart ?? ta.value.length; const b = ta.selectionEnd ?? a;
      ta.setRangeText(text, a, b, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
    };
    const chip = (text, title) => h('button', { class: 'fact-chip', type: 'button', title: title || `Put "${text}" in the draft`, disabled: ta.readOnly, onclick: () => insert(text) }, text);
    const group = (title, items, open = true) => (items.length ? h('details', { class: 'facts-group', open }, h('summary', {}, title, h('span', { class: 'muted small' }, ` ${items.length}`)), h('div', { class: 'facts-items' }, ...items)) : null);

    async function load() {
      status.textContent = 'Reading the case\'s documents…';
      const caseNow = await Vault.getCase(c.id).catch(() => c);
      const kinds = (caseNow.checkPairs && caseNow.checkPairs.kinds) || {};
      let buys = [];
      try { buys = ((await Vault.getTimeline(c.id)).events || []).filter((e) => e.kind === 'buy'); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      let evidence = [];
      try { evidence = ((await Vault.readCaseJSON(c.id, 'report-fields.json')) || {}).evidence || []; } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      const skip = new Set(meta.exports || []);
      const files = (await Vault.listFiles(c.id)).filter((f) => CVExtract.kindOf(f.name) && CVExtract.kindOf(f.name) !== 'image' && !skip.has(f.name));
      const docs = [];
      const until = Date.now() + 20000;
      for (const f of files) {
        if (Date.now() > until) break;
        try { const d = await CVChecks.documentText(c, f.name, () => {}); if (d.paragraphs.length) docs.push({ name: f.name, role: 'report', paragraphs: d.paragraphs }); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      }
      // The paired report: of the other kind (Buy ↔ Surveillance), with the same number in its name when there are several.
      const kindOf = (name) => (kinds[name] === 'other' ? '' : kinds[name] || R.kindFromName(name));
      const mine = R.kindFromName(meta.title || slug);
      const want = mine === 'buy' ? 'surveillance' : mine === 'surveillance' ? 'buy' : '';
      const num = (n) => { const m = /(?:^|\D)(\d{1,2})(?!\d)/.exec(String(n).split('/').pop()); return m ? m[1] : null; };
      const cands = want ? docs.filter((d) => kindOf(d.name) === want) : [];
      const partner = cands.find((d) => num(d.name) && num(d.name) === num(meta.title || slug)) || (cands.length === 1 ? cands[0] : null);
      ctx = { caseNow, kinds, buys, evidence, docs, partner };
      lists.replaceChildren(...[
        group('Timeline Buys', buys.map((b) => chip([b.date, b.time, b.suspect, b.qty ? `${b.qty} ${b.unit || 'g'}` : '', b.drug, b.paid ? `$${String(b.paid).replace(/^\$/, '')}` : ''].filter(Boolean).join(' · ')))),
        group('Evidence', evidence.filter((e) => e.inventory || e.description).map((e) => chip(`Exhibit ${e.number}${e.inventory ? `, Inventory #${e.inventory}` : ''}${e.drug || e.description ? `: ${[e.drug, e.weight, e.description].filter(Boolean).join(', ')}` : ''}`))),
        partner ? group(`From ${partner.name.split('/').pop()}`, factsOf(partner.paragraphs).map((x) => chip(x.text, `${x.label} in ${partner.name}: put it in the draft`))) : null,
      ].filter(Boolean));
      lastText = null;
      run();
    }

    function run() {
      if (!ctx || !ta.isConnected) return;
      const text = ta.value;
      if (text === lastText) return;
      lastText = text;
      const draftDoc = { name: 'This draft', role: 'affidavit', paragraphs: CVExtract.paragraphsFromText(CVDraft.stripMarkdown(text), null) };
      const all = [draftDoc, ...ctx.docs].map((d, i) => ({ id: i, ...d }));
      const buys = ctx.buys.map((e) => ({ date: e.date, suspect: e.suspect || '', drug: e.drug || '', qty: e.qty, unit: e.unit || 'g', paid: e.paid }));
      const flags = !text.trim() || (!ctx.docs.length && !buys.length && !ctx.evidence.length) ? [] : R.compare(all, {
        ignore: CVChecks.ownDetails ? CVChecks.ownDetails() : [], aliases: CVText.parseAliases(CVChecks.caseAliasText ? CVChecks.caseAliasText(ctx.caseNow) : ctx.caseNow.checkAliases || ''), buys,
        evidence: ctx.evidence.map((e) => ({ number: e.number, inventory: String(e.inventory || '').trim(), description: e.description || '' })),
        kinds: ctx.kinds, pairs: R.pairReports(all, ctx.caseNow.checkPairs || {}),
      });
      current = flags.filter((f) => f.severity === 'High' && f.confidence !== 'Low' && f.statement && f.statement.docIndex === 0);
      const n = ctx.docs.length;
      status.textContent = !n && !buys.length && !ctx.evidence.length ? 'No documents, buys or exhibits to check against yet.'
        : current.length ? `${current.length} thing${current.length === 1 ? '' : 's'} in the draft ${current.length === 1 ? 'doesn\'t' : 'don\'t'} match.`
          : `Checked against ${n} document${n === 1 ? '' : 's'}${buys.length ? ', the Timeline' : ''}${ctx.evidence.length ? ', the evidence list' : ''}: everything checked matches.`;
      status.classList.toggle('bad', current.length > 0);
      misList.replaceChildren(...current.slice(0, 12).map((f) => h('li', {},
        h('strong', {}, f.title),
        h('span', { class: 'muted small block' }, f.detail),
        f.fix && !ta.readOnly ? h('button', { class: 'btn small fact-fix', type: 'button', title: `Puts ${f.fix.to} in the draft in place of ${f.fix.from}`, onclick: () => {
          const next = applyFix(ta.value, f.statement.text, f.fix);
          if (next == null) { ui.toast(`"${f.fix.from}" isn't in the draft as written; change it by hand.`, 'info'); return; }
          ta.value = next;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ui.toast(`Changed ${f.fix.from} to ${f.fix.to}.`, 'success');
        } }, `Use ${f.fix.to}`) : null)));
      paint();
    }

    // The mismatches underlined in the formatted view (the browser's text highlights: the text
    // itself isn't changed). Drawn again when the view is.
    const HL = root.CSS && root.CSS.highlights && typeof root.Highlight === 'function';
    function paint() {
      if (!HL) return;
      if (!ta.isConnected) { root.CSS.highlights.delete('cv-mismatch'); return; }
      const box = rich && rich.el;
      const values = [...new Set(current.map((f) => (f.fix && f.fix.from) || (f.statement.highlight ? f.statement.text.slice(f.statement.highlight[0], f.statement.highlight[1]) : '')).filter((v) => v && v.length >= 2))];
      const ranges = [];
      if (box && values.length) {
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (const v of values) {
            for (let i = n.nodeValue.indexOf(v); i >= 0; i = n.nodeValue.indexOf(v, i + v.length)) {
              const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + v.length); ranges.push(r);
            }
          }
        }
      }
      if (ranges.length) root.CSS.highlights.set('cv-mismatch', new root.Highlight(...ranges));
      else root.CSS.highlights.delete('cv-mismatch');
    }

    let timer = null;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 1200); });
    if (rich && rich.el && root.MutationObserver) {
      let pt = null;
      new root.MutationObserver(() => { clearTimeout(pt); pt = setTimeout(paint, 250); }).observe(rich.el, { childList: true, subtree: true, characterData: true });
    }
    refreshBtn.addEventListener('click', () => load().catch((err) => { status.textContent = `Could not read the documents: ${err.message}`; }));
    load().catch((err) => { if (FS.isDisconnectError(err)) { ui.onDriveLost(); return; } status.textContent = `Could not read the documents: ${err.message}`; });
    return { el, run: () => { lastText = null; run(); } };
  }

  const api = { factsOf, applyFix, buySkeleton, attach };
  if (isNode) module.exports = api;
  else root.CVDraftFacts = api;
})(this);
