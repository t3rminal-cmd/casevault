/* CaseVault checker — Layer 2: AI semantic review with a local Ollama engine.
 *
 * For each statement in the affidavit, the most relevant report passages are retrieved (BM25,
 * plus embeddings when an embedding model is installed) and the model classifies the statement
 * as Supported, Contradicted, or Not found, quoting the exact source sentence. Any answer whose
 * quote cannot be found verbatim in the report text is discarded (anti-hallucination check).
 *
 * Privacy: the only network address ever used is Ollama on this computer (127.0.0.1:11434).
 * The page's Content-Security-Policy blocks every other address.
 */
'use strict';

(function (root) {
  const T = typeof module !== 'undefined' && module.exports ? require('./nlp.js') : root.CVText;
  const BASES = ['http://127.0.0.1:11434']; // Start-CaseVault.bat binds Ollama to 127.0.0.1 only

  // Profiles by model size (billions of parameters). The app shows only profiles with a model installed.
  // numCtx is the context window asked of Ollama: a larger one costs GPU memory, and on a 6 GB card
  // the Quick model only stays fully on the GPU at 4096.
  const PROFILES = {
    quick: { label: 'Quick', hint: '~7–8B, fits in 6 GB of GPU memory', numCtx: 4096, min: 5.5, max: 9.5, prefer: ['qwen2.5:7b', 'llama3.1:8b', 'qwen3:8b', 'mistral:7b'] },
    thorough: { label: 'Thorough', hint: '~12–14B, split between GPU and RAM', numCtx: 8192, min: 9.5, max: 16, prefer: ['qwen2.5:14b', 'gemma3:12b', 'qwen3:14b', 'phi4:14b'] },
    light: { label: 'Light', hint: '~3–4B, runs on the CPU', numCtx: 4096, min: 1, max: 5.5, prefer: ['qwen2.5:3b', 'llama3.2:3b', 'phi4-mini', 'gemma3:4b'] },
  };
  const PROFILE_ORDER = ['quick', 'light', 'thorough']; // what "Auto" picks first
  const KEEP_ALIVE = '10m'; // keep the model loaded between requests, then free the GPU
  const DEFAULT_CTX = 4096;
  const numCtxFor = (profile) => (PROFILES[profile] && PROFILES[profile].numCtx) || DEFAULT_CTX;

  // Rough token count for English text (Ollama doesn't expose a tokenizer): ~3.5 characters a token.
  const tokensOf = (s) => Math.ceil(String(s || '').length / 3.5);

  function sizeB(m) {
    const ps = m.details && m.details.parameter_size;
    const parse = (s) => {
      const x = /([\d.]+)\s*([BM])/i.exec(s || '');
      return x ? Number(x[1]) / (x[2].toUpperCase() === 'M' ? 1000 : 1) : null;
    };
    return parse(ps) ?? parse((/:(\d+(?:\.\d+)?[bm])\b/i.exec(m.name) || [])[1]);
  }

  function isEmbedModel(m) {
    const fam = `${(m.details && m.details.family) || ''} ${((m.details && m.details.families) || []).join(' ')}`;
    return /embed|bge|minilm|e5-|gte-|arctic-embed/i.test(m.name) || /\bbert\b|nomic-bert/i.test(fam);
  }

  async function fetchJson(fetchImpl, url, opts = {}, timeoutMs = 0) {
    const ctrl = new AbortController();
    const outer = opts.signal;
    const onAbort = () => ctrl.abort();
    if (outer) outer.addEventListener('abort', onAbort);
    const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(url, { ...opts, signal: ctrl.signal, headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
        throw new Error(`AI engine: ${msg}`);
      }
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
      if (outer) outer.removeEventListener('abort', onAbort);
    }
  }

  /** Is Ollama running, and which models can be used? */
  async function detect({ fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 2000 } = {}) {
    for (const base of BASES) {
      try {
        const data = await fetchJson(fetchImpl, `${base}/api/tags`, { method: 'GET' }, timeoutMs);
        const models = (data.models || []).map((m) => ({ name: m.name || m.model, size: sizeB(m), embed: isEmbedModel(m), details: m.details || {} }));
        const chat = models.filter((m) => !m.embed);
        const profiles = {};
        for (const [key, p] of Object.entries(PROFILES)) {
          const fits = chat.filter((m) => m.size != null && m.size >= p.min && m.size < p.max);
          const preferred = p.prefer.map((n) => fits.find((m) => m.name === n || m.name === `${n}:latest` || m.name.startsWith(`${n}-`))).find(Boolean);
          profiles[key] = (preferred || fits.sort((a, b) => b.size - a.size)[0] || {}).name || null;
        }
        const embed = (models.find((m) => m.embed && /nomic-embed-text/.test(m.name)) || models.find((m) => m.embed) || {}).name || null;
        return { status: 'connected', base, models, chat, embed, profiles };
      } catch { /* try the next address */ }
    }
    return { status: 'offline', base: null, models: [], chat: [], embed: null, profiles: {} };
  }

  /**
   * Resolve the user's setting ('auto', 'quick', 'thorough', 'light', 'rules-only') to a model.
   * autoOrder: the order "Auto" tries profiles in on this PC (see js/ai/hardware.js).
   */
  function choose(detected, setting, autoOrder = PROFILE_ORDER) {
    if (setting === 'rules-only' || !detected || detected.status !== 'connected') return null;
    const order = setting && setting !== 'auto' ? [setting, ...autoOrder] : autoOrder;
    for (const key of order) {
      if (detected.profiles[key]) return { profile: key, model: detected.profiles[key], requested: setting, fallback: setting !== 'auto' && key !== setting };
    }
    // A model we couldn't size: still usable.
    if (detected.chat.length) return { profile: 'custom', model: detected.chat[0].name, requested: setting, fallback: setting !== 'auto' };
    return null;
  }

  /* ---------------- statements and passages ---------------- */

  const BOILERPLATE = /\b(sworn|subscribed|notary|my commission|under penalty of perjury|affiant further sayeth|signature|signed this)\b/i;

  // Spreadsheet rows carry their sheet and row number as the location; XFA form fields their path.
  const cellOf = (p) => (p.sheet != null ? { sheet: p.sheet, row: p.row } : p.field != null ? { field: p.field } : {});

  function statementsOf(doc, limit = 250) {
    const out = [];
    for (const para of doc.paragraphs) {
      for (const s of T.sentences(para.text)) {
        const words = s.text.split(/\s+/).length;
        if (words < 6 || T.terms(s.text).length < 3) continue;
        if (s.text === s.text.toUpperCase() && words < 15) continue; // headings
        if (BOILERPLATE.test(s.text)) continue;
        out.push({ doc: doc.docIndex, paragraph: para.index, page: para.page ?? null, ...cellOf(para), text: s.text, start: s.start, end: s.end });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  // Paragraph chunks of at most ~3 sentences / 700 characters, with offsets into the paragraph.
  function passagesOf(doc) {
    const out = [];
    for (const para of doc.paragraphs) {
      const sents = T.sentences(para.text);
      if (!sents.length) continue;
      let group = [];
      const flush = () => {
        if (!group.length) return;
        const start = group[0].start;
        const end = group[group.length - 1].end;
        out.push({ doc: doc.docIndex, docName: doc.name, paragraph: para.index, page: para.page ?? null, ...cellOf(para), start, end, text: para.text.slice(start, end), paraText: para.text });
        group = [];
      };
      for (const s of sents) {
        const len = group.length ? s.end - group[0].start : s.text.length;
        if (group.length && (group.length >= 3 || len > 700)) flush();
        group.push(s);
      }
      flush();
    }
    return out;
  }

  function cosine(a, b) {
    let dot = 0; let na = 0; let nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na * nb) || 1);
  }

  /* ---------------- prompting ---------------- */

  const SYSTEM = [
    'You check a sworn affidavit against police reports for consistency.',
    'You get ONE statement from the affidavit and numbered passages from the reports. Use ONLY those passages, never outside knowledge.',
    'Choose a verdict:',
    '- "supported": a passage states the same facts.',
    '- "contradicted": a passage states something that conflicts with the statement (a different time, date, place, person, number, order of events, or action).',
    '- "not_found": the passages do not address the statement.',
    'For "supported" or "contradicted", copy the single most relevant sentence from the passages into "quote" EXACTLY, character for character, and give its passage number. For "not_found" use an empty quote and passage 0.',
    'Explain in one short sentence. Reply with JSON only.',
  ].join('\n');

  const SCHEMA = {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['supported', 'contradicted', 'not_found'] },
      passage: { type: 'integer' },
      quote: { type: 'string' },
      explanation: { type: 'string' },
    },
    required: ['verdict', 'passage', 'quote', 'explanation'],
  };

  function userPrompt(statement, passages) {
    const list = passages.map((p, i) => `[${i + 1}] (${p.docName}${p.sheet != null ? `, ${p.sheet} row ${p.row}` : p.field != null ? `, ${p.field}` : p.page ? `, page ${p.page}` : ''})\n${p.promptText || p.text}`).join('\n\n');
    return `STATEMENT FROM THE AFFIDAVIT:\n${statement.text}\n\nPASSAGES FROM THE REPORTS:\n${list}`;
  }

  /**
   * Keep the retrieved passages (best first) that fit the model's context window, leaving room for
   * the instructions and the answer. The last one that only partly fits is shortened for the prompt
   * (promptText); its full text is still used to verify the quote.
   */
  function fitPassages(statement, passages, numCtx = DEFAULT_CTX) {
    const answer = 300;
    let budget = numCtx - answer - tokensOf(SYSTEM) - tokensOf(JSON.stringify(SCHEMA)) - tokensOf(statement.text) - 40;
    const out = [];
    for (const p of passages) {
      const cost = tokensOf(p.text) + 12;
      if (cost <= budget) { out.push(p); budget -= cost; continue; }
      if (!out.length || budget > 120) {
        const chars = Math.max(200, Math.floor((budget - 12) * 3.5));
        out.push({ ...p, promptText: `${p.text.slice(0, chars)} …` });
      }
      break;
    }
    return out;
  }

  function parseAnswer(content) {
    let obj;
    try { obj = JSON.parse(content); } catch {
      const m = /\{[\s\S]*\}/.exec(content || '');
      if (!m) return null;
      try { obj = JSON.parse(m[0]); } catch { return null; }
    }
    const verdict = String(obj.verdict || '').toLowerCase().replace(/[\s-]/g, '_');
    if (!['supported', 'contradicted', 'not_found'].includes(verdict)) return null;
    return { verdict, passage: Number(obj.passage) || 0, quote: String(obj.quote || ''), explanation: String(obj.explanation || '').trim() };
  }

  /* ---------------- the review ---------------- */

  /**
   * docs: [{ name, role, docIndex, paragraphs }] (docIndex = position in the check's document list)
   * engine: { base, model, embed }
   * Returns { flags, stats: { statements, reviewed, supported, contradicted, notFound, discarded, errors }, complete }
   */
  async function review({ docs, engine, fetchImpl, onProgress = () => {}, signal } = {}) {
    fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    const affidavits = docs.filter((d) => d.role === 'affidavit');
    const reports = docs.filter((d) => d.role === 'report');
    const stats = { statements: 0, reviewed: 0, supported: 0, contradicted: 0, notFound: 0, discarded: 0, errors: 0 };
    const flags = [];
    if (!affidavits.length || !reports.length) return { flags, stats, complete: true };

    const passages = reports.flatMap(passagesOf);
    const statements = affidavits.flatMap((d) => statementsOf(d));
    stats.statements = statements.length;
    const index = T.createIndex(passages);

    // Optional semantic retrieval with an embedding model.
    let passageVecs = null;
    const embedAll = async (inputs) => {
      const vecs = [];
      for (let i = 0; i < inputs.length; i += 32) {
        const data = await fetchJson(fetchImpl, `${engine.base}/api/embed`, { method: 'POST', body: JSON.stringify({ model: engine.embed, input: inputs.slice(i, i + 32), keep_alive: KEEP_ALIVE }), signal });
        vecs.push(...data.embeddings);
      }
      return vecs;
    };
    if (engine.embed && passages.length) {
      try {
        onProgress({ phase: 'embed', done: 0, total: statements.length });
        passageVecs = await embedAll(passages.map((p) => p.text));
      } catch (err) {
        if (signal && signal.aborted) throw err;
        passageVecs = null; // keyword retrieval still works
      }
    }

    let seq = 0;
    const loc = (doc, at, text, start, end, highlight) => ({
      doc: doc.name, docIndex: doc.docIndex, page: at.page, ...cellOf(at), paragraph: at.paragraph, text, start, end, ...(highlight ? { highlight } : {}),
    });
    const docByIndex = new Map(docs.map((d) => [d.docIndex, d]));

    for (let i = 0; i < statements.length; i++) {
      if (signal && signal.aborted) return { flags, stats, complete: false };
      const st = statements[i];
      onProgress({ phase: 'review', done: i, total: statements.length });

      // Retrieve: best keyword matches, plus best semantic matches when available.
      let picked = index.search(st.text, passageVecs ? 4 : 6);
      if (passageVecs) {
        try {
          const [qv] = await embedAll([st.text]);
          const sem = passages.map((p, k) => ({ p, s: cosine(qv, passageVecs[k]) })).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.p);
          for (const p of sem) if (!picked.some((q) => q.doc === p.doc && q.paragraph === p.paragraph && q.start === p.start)) picked.push(p);
          picked = picked.slice(0, 6);
        } catch (err) {
          if (signal && signal.aborted) return { flags, stats, complete: false };
        }
      }

      picked = fitPassages(st, picked, engine.numCtx || DEFAULT_CTX);
      const stDoc = docByIndex.get(st.doc);
      const statementLoc = loc(stDoc, st, st.text, st.start, st.end);
      const mk = (severity, title, detail, source) => ({
        id: `a${Date.now().toString(36)}${(seq++).toString(36)}`,
        layer: 'ai', severity, type: 'statement', title, detail, statement: statementLoc, source, status: 'open', note: '',
      });

      if (!picked.length) {
        stats.reviewed++; stats.notFound++;
        flags.push(mk('Low', 'Not found in the reports', 'No report passage mentions anything in this statement.', null));
        continue;
      }

      let answer = null;
      try {
        const data = await fetchJson(fetchImpl, `${engine.base}/api/chat`, {
          method: 'POST',
          signal,
          body: JSON.stringify({
            model: engine.model,
            stream: false,
            format: SCHEMA,
            keep_alive: KEEP_ALIVE,
            options: { temperature: 0, seed: 7, num_ctx: engine.numCtx || DEFAULT_CTX },
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(st, picked) }],
          }),
        });
        answer = parseAnswer(data.message && data.message.content);
      } catch (err) {
        if (signal && signal.aborted) return { flags, stats, complete: false };
        stats.errors++;
        if (stats.errors >= 3 && stats.errors > stats.reviewed) throw err; // engine is down, not a one-off
        continue;
      }
      stats.reviewed++;
      if (!answer) { stats.discarded++; continue; }

      if (answer.verdict === 'not_found') {
        stats.notFound++;
        flags.push(mk('Low', 'Not found in the reports', answer.explanation || 'The reports do not mention this.', null));
        continue;
      }

      // Anti-hallucination: the quote must exist verbatim in the passage (or another retrieved passage).
      const order = [picked[answer.passage - 1], ...picked].filter(Boolean);
      let hit = null;
      for (const p of order) {
        const at = T.findVerbatim(p.text, answer.quote);
        if (at) { hit = { p, at }; break; }
      }
      if (!hit) {
        stats.discarded++;
        if (answer.verdict === 'supported') {
          // Support that can't be shown is not support: leave it for a human to look at.
          flags.push(mk('Low', 'Not found in the reports', 'The AI said this was supported but could not quote the reports exactly, so the answer was not trusted.', null));
          stats.notFound++;
        }
        continue;
      }
      if (answer.verdict === 'supported') { stats.supported++; continue; }

      stats.contradicted++;
      const p = hit.p;
      // Widen the highlight to the whole sentence in the paragraph for context.
      const s0 = p.start + hit.at.start;
      const s1 = p.start + hit.at.end;
      const sent = T.sentences(p.paraText).find((s) => s.start <= s0 && s.end >= s1) || { text: p.paraText.slice(s0, s1), start: s0, end: s1 };
      const srcDoc = docByIndex.get(p.doc);
      flags.push(mk('Medium', `Contradicted by ${srcDoc.name}`, answer.explanation || 'The report says something different.',
        loc(srcDoc, p, sent.text, sent.start, sent.end, [s0 - sent.start, s1 - sent.start])));
    }
    onProgress({ phase: 'review', done: statements.length, total: statements.length });
    return { flags, stats, complete: true };
  }

  const api = { PROFILES, KEEP_ALIVE, DEFAULT_CTX, numCtxFor, tokensOf, fitPassages, userPrompt, detect, choose, review, statementsOf, passagesOf, parseAnswer, sizeB };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVAI = api;
})(this);
