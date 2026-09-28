/* CaseVault drafts — the local AI calls: inline suggestions and "Draft with AI".
 *
 * Everything goes to the Ollama engine on this computer (127.0.0.1:11434) found by the checker's
 * engine detection (js/checker/ai.js). The page's Content-Security-Policy blocks every other
 * address, so nothing typed in a draft can leave the machine.
 */
'use strict';

(function (root) {
  const T = typeof module !== 'undefined' && module.exports ? require('../checker/nlp.js') : root.CVText;
  const AI = typeof module !== 'undefined' && module.exports ? require('../checker/ai.js') : root.CVAI;
  const D = typeof module !== 'undefined' && module.exports ? require('./draft-core.js') : root.CVDraft;
  const KEEP_ALIVE = AI.KEEP_ALIVE; // keep the model loaded between requests (10 minutes)

  /** Smallest installed chat model (fast enough for suggestions while typing). */
  function fastModel(detected) {
    if (!detected || detected.status !== 'connected') return null;
    if (detected.profiles && detected.profiles.light) return detected.profiles.light;
    const sized = detected.chat.filter((m) => m.size != null && m.size >= 0.5).sort((a, b) => a.size - b.size);
    return (sized[0] || detected.chat[0] || {}).name || null;
  }

  /**
   * Context size for a model: that of the profile it belongs to. Every request to one model uses
   * the same num_ctx, because Ollama reloads the model whenever it changes.
   */
  function numCtxForModel(detected, model) {
    const profiles = (detected && detected.profiles) || {};
    const key = Object.keys(profiles).find((k) => profiles[k] === model);
    return AI.numCtxFor(key);
  }

  /** "Small" models (under 5B parameters) are fine for suggestions but weak for whole drafts. */
  function isSmallModel(detected, model) {
    const m = ((detected && detected.chat) || []).find((x) => x.name === model);
    return !!(m && m.size != null && m.size < 5);
  }

  /* ---------------- inline suggestions ---------------- */

  const SUGGEST_SYSTEM = [
    'You are the autocomplete in a text editor for case documents.',
    'Continue the user\'s text with the next few words, at most ONE sentence.',
    'Only use facts that appear in the case context or the text. If a fact is unknown, stop before it.',
    'Output only the continuation text: no quotes, no explanations, no repetition of the text.',
  ].join(' ');

  function suggestPrompt(before, caseInfo) {
    const ctx = caseInfo ? [caseInfo.title && `Case: ${caseInfo.title}`, caseInfo.number && `Number: ${caseInfo.number}`, caseInfo.client && `Client: ${caseInfo.client}`].filter(Boolean).join('\n') : '';
    return `${ctx ? `CASE CONTEXT\n${ctx}\n\n` : ''}TEXT SO FAR (continue it)\n${String(before).slice(-1500)}`;
  }

  async function suggest({ base, model, before, caseInfo, signal, fetchImpl, numCtx = AI.DEFAULT_CTX }) {
    fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
    const res = await fetchImpl(`${base}/api/generate`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: SUGGEST_SYSTEM,
        prompt: suggestPrompt(before, caseInfo),
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { num_predict: 40, temperature: 0.2, top_p: 0.9, stop: ['\n\n'], num_ctx: numCtx },
      }),
    });
    if (!res.ok) throw new Error(`AI engine: ${res.status}`);
    return (await res.json()).response || '';
  }

  /* ---------------- Draft with AI ---------------- */

  const DRAFT_RULES = [
    'You write draft documents for a case file.',
    'Use ONLY facts that appear in the CASE MATERIAL below. Never invent names, dates, times, places, numbers, badge numbers, courts, charges or quotes.',
    'Wherever a needed fact is missing or uncertain, write a placeholder in exactly this form: [CONFIRM: what is needed]. For example [CONFIRM: affiant badge number] or [CONFIRM: court name].',
    'When you state a fact from a report, keep its wording and numbers exactly as in the material.',
    'Write in Markdown: # headings, short paragraphs, numbered paragraphs where the document type expects them.',
    'Output only the document itself, with no introduction or closing remarks.',
  ].join('\n');

  function clip(s, n) {
    s = String(s || '').trim();
    return s.length > n ? `${s.slice(0, n)} …[shortened]` : s;
  }

  const notesChars = (numCtx) => (numCtx >= 8192 ? 4000 : 2000);

  /**
   * Build the chat messages for a first draft. All inputs are plain data (easy to test):
   * { type, template, instructions, caseObj, timeline, notes, passages: [{ docName, page, sheet, row, text }] }
   */
  function draftMessages({ type = 'other', template = '', instructions = '', caseObj = {}, timeline = { events: [] }, notes = '', passages = [], numCtx = 8192 }) {
    const t = D.DOC_TYPES[type] || D.DOC_TYPES.other;
    const c = caseObj || {};
    const d = c.dates || {};
    const facts = [
      `Title: ${c.title || '(none)'}`, `Case number: ${c.number || '(none)'}`, `Client: ${c.client || '(none)'}`,
      `Status: ${c.status || '(none)'}`, `Opened: ${d.opened || '(none)'}`, c.tags && c.tags.length ? `Tags: ${c.tags.join(', ')}` : null,
    ].filter(Boolean).join('\n');
    const events = (timeline.events || []).map((e) => `- ${e.date}${e.time ? ` ${e.time}` : ''} [${e.kind === 'deadline' ? 'deadline' : 'event'}${e.done ? ', done' : ''}] ${e.title}${e.note ? ` (${e.note.replace(/\s+/g, ' ')})` : ''}`).join('\n');
    // Room for the case material: the context window, less the answer (~1/3 of it), the rules,
    // the template and the other material. Passages (best first) are dropped when they don't fit.
    const reserve = Math.round(numCtx / 3);
    const fixed = AI.tokensOf(DRAFT_RULES) + AI.tokensOf(template) + AI.tokensOf(instructions) + AI.tokensOf(facts) + AI.tokensOf(events)
      + AI.tokensOf(clip(notes, notesChars(numCtx))) + 200;
    let budget = Math.max(1200, Math.floor((numCtx - reserve - fixed) * 3.5));
    const docs = [];
    for (const p of passages) {
      const where = p.sheet != null ? `${p.sheet} row ${p.row}` : p.page ? `page ${p.page}` : '';
      const block = `[${p.docName}${where ? `, ${where}` : ''}]\n${p.text}`;
      if (block.length > budget) break;
      budget -= block.length;
      docs.push(block);
    }
    const material = [
      `## Case details\n${facts}`,
      `## Timeline\n${events || '(no timeline entries)'}`,
      `## Notes\n${clip(notes, notesChars(numCtx)) || '(no notes)'}`,
      `## Passages from attached documents\n${docs.join('\n\n') || '(no documents)'}`,
    ].join('\n\n');
    const task = [
      `Write a first draft of: ${t.label}.`,
      t.guide,
      template ? `Follow this template's structure and wording. Replace every [CONFIRM: ...] you can fill from the material with the fact; leave the rest as [CONFIRM: ...]:\n\n${template}` : '',
      instructions ? `Extra instructions from the user: ${instructions}` : '',
    ].filter(Boolean).join('\n\n');
    return [
      { role: 'system', content: DRAFT_RULES },
      { role: 'user', content: `CASE MATERIAL\n\n${material}\n\n---\n\nTASK\n\n${task}` },
    ];
  }

  /** Pick the most relevant passages for the draft (BM25, plus embeddings when available). */
  async function relevantPassages({ docs, query, engine, k = 14, fetchImpl }) {
    const passages = docs.flatMap((d) => AI.passagesOf(d));
    if (!passages.length) return [];
    const picked = T.createIndex(passages).search(query, k);
    if (engine && engine.embed && engine.base) {
      try {
        const post = async (input) => {
          const res = await (fetchImpl || globalThis.fetch)(`${engine.base}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: engine.embed, input, keep_alive: KEEP_ALIVE }) });
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()).embeddings;
        };
        const [qv] = await post([query]);
        const vecs = [];
        for (let i = 0; i < passages.length; i += 32) vecs.push(...await post(passages.slice(i, i + 32).map((p) => p.text)));
        const cos = (a, b) => { let x = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { x += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return x / (Math.sqrt(na * nb) || 1); };
        const sem = passages.map((p, i) => ({ p, s: cos(qv, vecs[i]) })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.p);
        for (const p of sem) if (!picked.some((q) => q.doc === p.doc && q.paragraph === p.paragraph && q.start === p.start)) picked.push(p);
      } catch { /* keyword search alone is fine */ }
    }
    // Keep document order so the model reads each report in sequence.
    return picked.slice(0, k * 2).sort((a, b) => a.doc - b.doc || a.paragraph - b.paragraph || a.start - b.start);
  }

  /** Stream a chat completion; onText(chunk) receives the text as it arrives. Returns the full text. */
  async function streamChat({ base, model, messages, onText, signal, fetchImpl, numCtx = AI.DEFAULT_CTX }) {
    fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
    const res = await fetchImpl(`${base}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, keep_alive: KEEP_ALIVE, options: { temperature: 0.2, num_ctx: numCtx } }),
    });
    if (!res.ok || !res.body) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
      throw new Error(`AI engine: ${msg}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = '';
    const handle = (line) => {
      if (!line.trim()) return;
      const obj = JSON.parse(line);
      if (obj.error) throw new Error(`AI engine: ${obj.error}`);
      const piece = obj.message && obj.message.content;
      if (piece) { full += piece; onText(piece); }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
    }
    handle(buf);
    return full;
  }

  const api = { KEEP_ALIVE, fastModel, numCtxForModel, isSmallModel, suggest, suggestPrompt, draftMessages, relevantPassages, streamChat, DRAFT_RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVCopilot = api;
})(this);
