/* CaseVault — in-browser AI fallback (WebLLM on WebGPU).
 *
 * When the Ollama engine isn't running, CaseVault can run a small model inside the browser on the
 * PC's graphics chip. The model files live on the SSD in W:\webllm\<model>\ and are served by the
 * CaseVault helper at /webllm/ (same origin, read-only), so nothing is downloaded from the internet.
 *
 * WebLLM always copies what it loads into the browser's cache storage. To keep the PC free of
 * those files, the copy is deleted as soon as the model is in GPU memory: the files are only on
 * the PC's disk while the model loads.
 *
 * detect() returns an engine description in the same shape as CVAI.detect() (Ollama), with a
 * fetchImpl that answers Ollama-style calls from the model (see ollama-shim.js).
 */
'use strict';

const CVWebLLM = (() => {
  const CACHE_SCOPES = ['webllm/model', 'webllm/config', 'webllm/wasm'];
  const PREFERRED = ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'Qwen2.5-3B-Instruct-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'];
  const CONTEXT = 4096;

  const s = { engine: null, worker: null, loadedId: null, loading: null, shims: new Map(), progress: () => {}, lastError: null };
  const base = () => location.origin;
  const url = (p) => new URL(p, document.baseURI).href;

  /** Why the in-browser engine can or can't run here: { ok, reason, models: [{ id, wasm, bytes }] } */
  async function available() {
    if (!(typeof HelperFS !== 'undefined' && HelperFS.servedByHelper)) {
      return { ok: false, reason: 'Open CaseVault through Start-CaseVault.bat (http://127.0.0.1:8517) to use the in-browser engine.', models: [] };
    }
    if (!('gpu' in navigator)) return { ok: false, reason: 'This browser has no WebGPU. Use a current Chrome, Edge or Firefox.', models: [] };
    let adapter = null;
    try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch { adapter = null; }
    if (!adapter) return { ok: false, reason: 'WebGPU is not available on this PC (no compatible graphics adapter or driver).', models: [] };
    let models = [];
    try {
      const res = await fetch(new URL('/api/webllm', location.href), { headers: { 'X-CaseVault': '1' }, cache: 'no-store' });
      if (res.ok) models = await res.json();
    } catch { models = []; }
    if (!models.length) return { ok: false, reason: 'No in-browser model on the SSD yet. See docs/AI-SETUP.md, "In-browser AI".', models: [] };
    return { ok: true, reason: '', models };
  }

  function pick(models, preferredId) {
    return models.find((m) => m.id === preferredId)
      || PREFERRED.map((id) => models.find((m) => m.id === id)).find(Boolean)
      || models[0];
  }

  function appConfig(m) {
    const dir = `${base()}/webllm/${encodeURIComponent(m.id)}/`;
    return {
      model_list: [{
        model: dir, // WebLLM adds "resolve/main/"; the helper maps that to the model folder
        model_id: m.id,
        model_lib: `${dir}${encodeURIComponent(m.wasm)}`,
        low_resource_required: true,
        overrides: { context_window_size: CONTEXT },
      }],
      cacheBackend: 'cache',
    };
  }

  /** Delete WebLLM's copy of the model files from the browser's storage on the PC. */
  async function purgeBrowserCopy() {
    if (!('caches' in self)) return;
    await Promise.all(CACHE_SCOPES.map((k) => caches.delete(k).catch(() => false)));
  }

  function friendly(err, m) {
    const msg = String((err && err.message) || err || '');
    if (/device.*lost|out of memory|OOM|allocat/i.test(msg)) return new Error(`The graphics chip ran out of memory loading ${m.id}. Try a smaller model (for example Qwen2.5-0.5B).`);
    if (/404|not found|Failed to fetch|NetworkError/i.test(msg)) return new Error(`Some files of ${m.id} are missing in W:\\webllm\\${m.id}. Download the model again (see docs/AI-SETUP.md).`);
    return new Error(`The in-browser AI could not start with ${m.id}. Its files in W:\\webllm\\${m.id} may be incomplete or damaged: download the model again (see docs/AI-SETUP.md). Details: ${msg || 'unknown error'}`);
  }

  async function unload() {
    const e = s.engine;
    s.engine = null;
    s.loadedId = null;
    try { if (e) await e.unload(); } catch { /* ignore */ }
    if (s.worker) { s.worker.terminate(); s.worker = null; }
  }

  /** Load the model once (lazily, on first use) and return the engine. */
  function engine(m) {
    if (s.engine && s.loadedId === m.id) return Promise.resolve(s.engine);
    if (s.loading && s.loading.id === m.id) return s.loading.promise;
    const promise = (async () => {
      await unload();
      s.progress({ id: m.id, progress: 0, text: 'Starting…' });
      try {
        const lib = await import(url('vendor/webllm/web-llm.js'));
        s.worker = new Worker(url('js/ai/webllm-worker.js'), { type: 'module' });
        const e = await lib.CreateWebWorkerMLCEngine(s.worker, m.id, {
          appConfig: appConfig(m),
          initProgressCallback: (r) => s.progress({ id: m.id, progress: r.progress, text: r.text }),
        });
        s.engine = e;
        s.loadedId = m.id;
        s.lastError = null;
        return e;
      } catch (err) {
        if (s.worker) { s.worker.terminate(); s.worker = null; }
        s.lastError = friendly(err, m);
        throw s.lastError;
      } finally {
        await purgeBrowserCopy();
        s.progress({ id: m.id, progress: 1, text: '', done: true });
        s.loading = null;
      }
    })();
    s.loading = { id: m.id, promise };
    return promise;
  }

  /**
   * An engine description like CVAI.detect()'s, or null when the in-browser engine can't run.
   * The model is not loaded until the first AI request.
   */
  async function detect(preferredId) {
    const a = await available();
    if (!a.ok) return null;
    const m = pick(a.models, preferredId);
    if (!s.shims.has(m.id)) {
      s.shims.set(m.id, CVOllamaShim.createShim({ modelId: m.id, sizeB: CVOllamaShim.sizeFromId(m.id), getEngine: () => engine(m) }));
    }
    const fetchImpl = s.shims.get(m.id);
    const d = await CVAI.detect({ fetchImpl });
    return { ...d, engine: 'webllm', fetchImpl, webllm: { model: m.id, installed: a.models.map((x) => x.id), loaded: s.loadedId === m.id } };
  }

  return {
    available, detect, unload, purgeBrowserCopy,
    onProgress(fn) { s.progress = fn || (() => {}); },
    get loadedId() { return s.loadedId; },
    get lastError() { return s.lastError; },
  };
})();
