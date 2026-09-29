/* CaseVault — AI activity: one place that knows what the local AI is doing right now.
 *
 * - Tasks ("check", "draft", "suggest") say what the user is waiting for: "Checking 11 of 16",
 *   "Drafting…", "Suggesting…".
 * - Every AI request goes through wrap(fetchImpl), which counts requests in flight, notices a slow
 *   first response while the model loads ("Loading model…"), and reads Ollama's eval_count /
 *   eval_duration for the tokens-per-second figure.
 * - One shared queue: a check and "Draft with AI" run one at a time, and inline suggestions are
 *   skipped while either is running or waiting, so a small GPU is never asked to do two things.
 *
 * The header indicator (a small CSS waveform next to "AI:") is drawn by mount(); the rest is plain
 * logic that the tests run under Node.
 */
'use strict';

(function (root) {
  const LOADING_AFTER_MS = 10000; // no first response after this long: the model is probably loading
  const WARM_MS = 10 * 60 * 1000; // matches keep_alive "10m": a model used this recently is still loaded
  const HEAVY = new Set(['check', 'draft', 'chat']);
  const DEFAULT_LABEL = { check: 'Checking…', draft: 'Drafting…', chat: 'Answering…', suggest: 'Suggesting…', embed: 'Indexing…' };

  function createActivity({ now = () => Date.now() } = {}) {
    const tasks = new Map(); // id -> { id, kind, label, model, start, waiting }
    const requests = new Map(); // id -> { id, model, kind, stream, start, firstAt }
    const warm = new Map(); // model -> last time it answered
    const listeners = new Set();
    let seq = 0;
    let last = null; // { model, tps, at }
    let queue = Promise.resolve();
    let queued = 0;

    const notify = () => { for (const fn of listeners) { try { fn(); } catch (err) { console.error(err); } } };

    /** Start a task. Returns { set(label), setModel(model), end() }. */
    function begin(kind, { label = '', model = '' } = {}) {
      const t = { id: ++seq, kind, label, model, start: now(), waiting: false };
      tasks.set(t.id, t);
      notify();
      return {
        id: t.id,
        set(l) { if (t.label !== l) { t.label = l; notify(); } },
        setModel(m) { t.model = m; notify(); },
        end() { if (tasks.delete(t.id)) notify(); },
      };
    }

    /**
     * Run a heavy task (a check, or Draft with AI) in the shared queue: one at a time.
     * fn(task) gets the task handle; the task ends when fn settles.
     */
    function exclusive(kind, fn, opts = {}) {
      const task = begin(kind, opts);
      const t = tasks.get(task.id);
      t.waiting = true;
      queued++;
      notify();
      const run = queue.then(async () => {
        queued--;
        t.waiting = false;
        t.start = now();
        notify();
        try { return await fn(task); } finally { task.end(); }
      });
      queue = run.catch(() => {});
      return run;
    }

    /** Is a check or a draft running or waiting? Inline suggestions stay quiet then. */
    const heavyBusy = () => queued > 0 || [...tasks.values()].some((t) => HEAVY.has(t.kind));
    const busy = (kinds) => [...tasks.values()].some((t) => !kinds || kinds.includes(t.kind));

    function isAiUrl(url) {
      return /\/api\/(chat|generate|embed|embeddings)\b/.test(String(url));
    }

    function readBody(init) {
      try { return init && typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch { return {}; }
    }

    function recordStats(model, obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.eval_count && obj.eval_duration) {
        last = { model, tps: obj.eval_count / (obj.eval_duration / 1e9), at: now() };
      } else if (obj.__tokens && obj.__ms) {
        last = { model, tps: obj.__tokens / (obj.__ms / 1000), at: now() };
      }
      if (model) warm.set(model, now());
    }

    /** Wrap a fetch so AI requests are counted and measured. Other requests pass straight through. */
    function wrap(fetchImpl) {
      const base = fetchImpl || ((...a) => globalThis.fetch(...a));
      return async (url, init = {}) => {
        if (!isAiUrl(url)) return base(url, init);
        const body = readBody(init);
        const kind = /\/api\/embed/.test(String(url)) ? 'embed' : 'generate';
        const r = { id: ++seq, model: body.model || '', kind, stream: body.stream !== false && kind !== 'embed', start: now(), firstAt: null };
        requests.set(r.id, r);
        notify();
        const finish = () => { if (requests.delete(r.id)) notify(); };
        let res;
        try {
          res = await base(url, init);
        } catch (err) {
          finish();
          throw err;
        }
        r.firstAt = now();
        if (r.model) warm.set(r.model, now());
        notify();
        if (!res.ok || kind === 'embed') { finish(); return res; }
        if (!r.stream || !res.body || typeof TransformStream === 'undefined') {
          // Non-streaming: the answer has arrived. Read the stats from a copy, without holding up the caller.
          finish();
          try {
            res.clone().json().then((obj) => { recordStats(r.model, obj); notify(); }, () => {});
          } catch { /* no stats */ }
          return res;
        }
        // Streaming: pass the bytes through untouched, watching the NDJSON lines for the final stats.
        const dec = new TextDecoder();
        let buf = '';
        let pieces = 0;
        let genStart = null;
        const scan = (line) => {
          if (!line.trim()) return;
          try {
            const obj = JSON.parse(line);
            if ((obj.message && obj.message.content) || obj.response) { pieces++; if (genStart == null) genStart = now(); }
            if (obj.done) recordStats(r.model, obj.eval_count ? obj : { __tokens: pieces, __ms: Math.max(1, now() - (genStart ?? r.firstAt)) });
          } catch { /* partial or non-JSON line */ }
        };
        const watch = new TransformStream({
          transform(chunk, ctrl) {
            buf += dec.decode(chunk, { stream: true });
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) { scan(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
            ctrl.enqueue(chunk);
          },
          flush() { scan(buf); finish(); },
        });
        const piped = res.body.pipeThrough(watch);
        // If the caller aborts, the stream errors: stop counting the request.
        if (init.signal) init.signal.addEventListener('abort', finish, { once: true });
        return new Response(piped, { status: res.status, statusText: res.statusText, headers: res.headers });
      };
    }

    /** What to show: null when idle. */
    function state() {
      const t = now();
      const list = [...tasks.values()];
      const reqs = [...requests.values()];
      if (!list.length && !reqs.length) return null;
      const running = list.filter((x) => !x.waiting);
      // The heaviest running task decides the label; suggestions only when nothing else runs.
      const task = running.find((x) => HEAVY.has(x.kind)) || running[0] || list[0] || null;
      const loading = reqs.some((q) => q.firstAt == null && q.kind !== 'embed' && t - q.start >= LOADING_AFTER_MS
        && (q.stream || !(warm.has(q.model) && t - warm.get(q.model) < WARM_MS)));
      let label = task ? (task.waiting ? 'Waiting…' : task.label || DEFAULT_LABEL[task.kind] || 'Working…') : (DEFAULT_LABEL[(reqs[0] || {}).kind] || 'Working…');
      if (loading) label = 'Loading model…';
      const model = (task && task.model) || (reqs.find((q) => q.model) || {}).model || '';
      const since = task ? task.start : Math.min(...reqs.map((q) => q.start));
      return {
        label,
        loading,
        kind: task ? task.kind : 'request',
        model,
        elapsedMs: Math.max(0, t - since),
        inFlight: reqs.length,
        tasks: list.length,
        tokensPerSec: last && (!model || last.model === model) ? last.tps : null,
      };
    }

    return {
      begin, exclusive, wrap, state, busy, heavyBusy,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      get lastStats() { return last; },
      LOADING_AFTER_MS,
    };
  }

  /* ---------------- header indicator ---------------- */

  function fmtElapsed(ms) {
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Draws into the #ai-activity element next to the "AI:" status. Hidden when idle.
  function mount(activity, el) {
    if (!el) return;
    el.replaceChildren();
    const bars = document.createElement('span');
    bars.className = 'ai-wave';
    bars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) bars.append(document.createElement('i'));
    const label = document.createElement('span');
    label.className = 'ai-activity-label';
    const pop = document.createElement('span');
    pop.className = 'ai-activity-pop';
    pop.id = 'ai-activity-pop';
    pop.setAttribute('role', 'tooltip');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-describedby', pop.id);
    el.append(bars, label, pop);
    // The label is announced politely when it changes (not every second).
    const live = document.createElement('span');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    el.append(live);

    let timer = null;
    const draw = () => {
      const s = activity.state();
      if (!s) {
        el.hidden = true;
        live.textContent = '';
        if (timer) { clearInterval(timer); timer = null; }
        return;
      }
      el.hidden = false;
      el.classList.toggle('loading', s.loading);
      if (label.textContent !== s.label) { label.textContent = s.label; live.textContent = s.label; }
      const lines = [
        s.model ? `Model: ${s.model}` : null,
        `Elapsed: ${fmtElapsed(s.elapsedMs)}`,
        s.tokensPerSec ? `Speed: ${s.tokensPerSec.toFixed(1)} tokens/s` : null,
        s.loading ? 'The model is being loaded into memory. The first answer can take 10–30 seconds.' : null,
      ].filter(Boolean);
      pop.textContent = lines.join('\n');
      if (!timer) timer = setInterval(draw, 1000);
    };
    activity.subscribe(draw);
    draw();
  }

  const api = { createActivity, mount, fmtElapsed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.CVActivityLib = api;
    root.CVActivity = createActivity();
  }
})(this);
