/* CaseVault — makes the in-browser AI engine (WebLLM) look like Ollama.
 *
 * The checker and the drafting copilot talk to Ollama's HTTP API (/api/tags, /api/chat,
 * /api/generate). When Ollama isn't running, CaseVault can fall back to a small model that runs
 * inside the browser on the GPU (WebLLM). Rather than teach every caller a second API, this file
 * provides a fetch() replacement that answers those same Ollama calls from the WebLLM engine.
 * No network is involved: nothing here leaves the browser tab.
 *
 * createShim({ modelId, sizeB, getEngine }) -> fetchImpl(url, options) -> Promise<Response>
 *   getEngine(): Promise<engine> where engine.chat.completions.create(req) follows the OpenAI API
 *   (WebLLM's MLCEngine), and engine.interruptGenerate() stops a running generation.
 */
'use strict';

(function (root) {
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const abortError = () => new DOMException('The request was cancelled.', 'AbortError');

  // Ollama request body -> OpenAI-style chat completion request.
  function toCompletion(body, { stream }) {
    const o = body.options || {};
    const req = {
      messages: body.messages,
      stream: !!stream,
      temperature: o.temperature ?? 0.2,
      top_p: o.top_p,
      max_tokens: o.num_predict && o.num_predict > 0 ? o.num_predict : undefined,
      stop: o.stop,
      seed: o.seed,
    };
    if (body.format && typeof body.format === 'object') {
      req.response_format = { type: 'json_object', schema: JSON.stringify(body.format) };
    } else if (body.format === 'json') {
      req.response_format = { type: 'json_object' };
    }
    for (const k of Object.keys(req)) if (req[k] === undefined) delete req[k];
    return req;
  }

  function createShim({ modelId, sizeB = null, getEngine }) {
    // WebLLM runs one generation at a time: queue requests in order.
    let chain = Promise.resolve();
    const queue = (fn) => {
      const run = chain.then(fn, fn);
      chain = run.catch(() => {});
      return run;
    };

    async function withAbort(signal, engine, work) {
      if (signal && signal.aborted) throw abortError();
      let onAbort = null;
      const aborted = new Promise((_, reject) => {
        onAbort = () => { try { engine.interruptGenerate(); } catch { /* not running */ } reject(abortError()); };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        return await Promise.race([work(), aborted]);
      } finally {
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    }

    async function chatOnce(body, signal) {
      return queue(async () => {
        if (signal && signal.aborted) throw abortError();
        const engine = await getEngine();
        const res = await withAbort(signal, engine, () => engine.chat.completions.create(toCompletion(body, { stream: false })));
        return (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
      });
    }

    function chatStream(body, signal) {
      const enc = new TextEncoder();
      let engineRef = null;
      return new ReadableStream({
        start(controller) {
          queue(async () => {
            if (signal && signal.aborted) throw abortError();
            const engine = await getEngine();
            engineRef = engine;
            await withAbort(signal, engine, async () => {
              const chunks = await engine.chat.completions.create(toCompletion(body, { stream: true }));
              for await (const chunk of chunks) {
                if (signal && signal.aborted) throw abortError();
                const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
                if (delta) controller.enqueue(enc.encode(`${JSON.stringify({ model: modelId, message: { role: 'assistant', content: delta }, done: false })}\n`));
              }
            });
            controller.enqueue(enc.encode(`${JSON.stringify({ model: modelId, message: { role: 'assistant', content: '' }, done: true })}\n`));
            controller.close();
          }).catch((err) => controller.error(err));
        },
        cancel() { if (engineRef) try { engineRef.interruptGenerate(); } catch { /* ignore */ } },
      });
    }

    return async function fetchImpl(url, options = {}) {
      const path = new URL(String(url), 'http://127.0.0.1/').pathname; // only the path matters; nothing is fetched
      const signal = options.signal;
      let body = {};
      if (options.body) {
        try { body = JSON.parse(options.body); } catch { return json(400, { error: 'Bad request body.' }); }
      }
      if (path === '/api/tags') {
        return json(200, { models: [{ name: modelId, model: modelId, details: { family: 'webllm', parameter_size: sizeB ? `${sizeB}B` : '' } }] });
      }
      if (path === '/api/version') return json(200, { version: 'webllm' });
      if (path === '/api/embed' || path === '/api/embeddings') {
        return json(501, { error: 'Embeddings are not available with the in-browser engine; keyword search is used instead.' });
      }
      if (path === '/api/generate') {
        const messages = [...(body.system ? [{ role: 'system', content: body.system }] : []), { role: 'user', content: String(body.prompt || '') }];
        const text = await chatOnce({ ...body, messages }, signal);
        return json(200, { model: modelId, response: text, done: true });
      }
      if (path === '/api/chat') {
        if (body.stream) {
          if (signal && signal.aborted) throw abortError();
          return new Response(chatStream(body, signal), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
        }
        const text = await chatOnce(body, signal);
        return json(200, { model: modelId, message: { role: 'assistant', content: text }, done: true });
      }
      return json(404, { error: `Not available in the in-browser engine: ${path}` });
    };
  }

  /** "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" -> 1.5 (billions of parameters), or null. */
  function sizeFromId(id) {
    const m = /(\d+(?:\.\d+)?)\s*([BM])(?=[-_]|$)/i.exec(String(id));
    if (!m) return /phi-3\.5-mini|phi-3-mini/i.test(id) ? 3.8 : null;
    return Number(m[1]) / (m[2].toUpperCase() === 'M' ? 1000 : 1);
  }

  const api = { createShim, toCompletion, sizeFromId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVOllamaShim = api;
})(this);
