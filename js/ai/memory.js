/* CaseVault — memory indicator in the header.
 *
 * Shows, at a glance:
 *   - CaseVault's own memory in this browser tab (Chrome/Edge report it; Firefox doesn't),
 *   - what the local AI model uses: on the graphics card and in RAM (Ollama's /api/ps),
 *     or that the in-browser model is loaded,
 *   - in helper mode, this PC's RAM and the CASEVAULT drive's free space.
 * The pop-up has "Free AI memory", which asks Ollama to unload its models now instead of after
 * the 10-minute keep-alive. Everything stays on this computer (127.0.0.1).
 *
 * summarize() is plain logic that the tests run under Node.
 */
'use strict';

(function (root) {
  const OLLAMA = 'http://127.0.0.1:11434';
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;

  const fmt = (n) => (n == null ? '—' : n >= GB ? `${(n / GB).toFixed(n >= 10 * GB ? 0 : 1)} GB` : `${Math.round(n / MB)} MB`);

  /**
   * Turn raw readings into what the indicator shows.
   * r = { heap: { used, limit } | null, models: [{ name, size, size_vram }] | null, webllm: id | null,
   *       sys: { ramTotal, ramFree, diskTotal, diskFree } | null, deviceMemory: GB | null }
   * -> { text, level: 'ok'|'warn'|'high', lines: [..] }
   */
  function summarize(r) {
    const lines = [];
    let level = 'ok';
    const bump = (l) => { if (l === 'high' || (l === 'warn' && level === 'ok')) level = l; };
    const bits = [];

    if (r.heap && r.heap.used) {
      const pct = r.heap.limit ? r.heap.used / r.heap.limit : 0;
      bits.push(`App ${fmt(r.heap.used)}`);
      lines.push(`CaseVault in this tab: ${fmt(r.heap.used)}${r.heap.limit ? ` of ${fmt(r.heap.limit)} allowed (${Math.round(pct * 100)}%)` : ''}`);
      if (pct > 0.85) bump('high'); else if (pct > 0.7) bump('warn');
    }

    if (r.models && r.models.length) {
      const vram = r.models.reduce((n, m) => n + (m.size_vram || 0), 0);
      const ram = r.models.reduce((n, m) => n + Math.max(0, (m.size || 0) - (m.size_vram || 0)), 0);
      bits.push(`AI ${fmt(vram + ram)}`);
      for (const m of r.models) {
        const gpuPct = m.size ? Math.round(((m.size_vram || 0) / m.size) * 100) : 0;
        lines.push(`AI model ${m.name}: ${fmt(m.size_vram || 0)} on the GPU${m.size - (m.size_vram || 0) > 0 ? `, ${fmt(m.size - (m.size_vram || 0))} in RAM` : ''} (${gpuPct}% GPU)`);
      }
    } else if (r.models) {
      lines.push('Local AI: no model loaded');
    }
    if (r.webllm) { bits.push('AI in-browser'); lines.push(`In-browser AI model loaded: ${r.webllm}`); }

    if (r.sys && r.sys.ramTotal) {
      const used = r.sys.ramTotal - r.sys.ramFree;
      const pct = used / r.sys.ramTotal;
      bits.unshift(`RAM ${Math.round(pct * 100)}%`);
      lines.push(`This PC: ${fmt(used)} of ${fmt(r.sys.ramTotal)} RAM in use (${fmt(r.sys.ramFree)} free)`);
      if (pct > 0.92) bump('high'); else if (pct > 0.82) bump('warn');
    } else if (r.deviceMemory) {
      lines.push(`This PC: about ${r.deviceMemory} GB RAM or more (the browser doesn't report how much is free)`);
    }
    if (r.sys && r.sys.diskTotal) {
      const pct = r.sys.diskFree / r.sys.diskTotal;
      lines.push(`CASEVAULT drive: ${fmt(r.sys.diskFree)} free of ${fmt(r.sys.diskTotal)}`);
      if (pct < 0.03) bump('high'); else if (pct < 0.08) bump('warn');
    }

    return { text: bits.length ? bits.join(' · ') : 'Memory', level, lines };
  }

  /* ---------- in the page ---------- */

  function mount(el, { isHelper = () => false, engineConnected = () => false } = {}) {
    if (!el) return;
    let sys = null;
    let sysAt = 0;
    let models = null;

    const pop = document.createElement('span');
    pop.className = 'mem-pop';
    pop.setAttribute('role', 'tooltip');
    const label = document.createElement('span');
    label.className = 'mem-label';
    const bar = document.createElement('span');
    bar.className = 'mem-icon';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<i></i><i></i><i></i>';
    const free = document.createElement('button');
    free.type = 'button';
    free.className = 'btn small';
    free.textContent = 'Free AI memory';
    free.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (typeof CVActivity !== 'undefined' && CVActivity.state()) {
        if (root.CaseVaultUI) root.CaseVaultUI.toast('The AI is busy. Free its memory when the check or draft has finished.', 'error');
        return;
      }
      free.disabled = true;
      try {
        for (const m of models || []) {
          await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.name, keep_alive: 0 }) });
        }
        if (root.CaseVaultUI) root.CaseVaultUI.toast('The local AI model was unloaded. It loads again the next time it\'s needed.', 'success');
      } catch { /* Ollama not running */ }
      free.disabled = false;
      tick();
    });
    const popText = document.createElement('span');
    pop.append(popText, free);
    el.replaceChildren(bar, label, pop);
    el.tabIndex = 0;

    async function readModels() {
      if (!engineConnected()) return null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(`${OLLAMA}/api/ps`, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (!res.ok) return null;
        return ((await res.json()).models || []).map((m) => ({ name: m.name || m.model, size: m.size || 0, size_vram: m.size_vram || 0 }));
      } catch { return null; }
    }

    async function tick() {
      if (document.hidden || typeof Vault === 'undefined' || !Vault.data) { el.hidden = !(typeof Vault !== 'undefined' && Vault.data); return; }
      el.hidden = false;
      const pm = performance.memory;
      const heap = pm ? { used: pm.usedJSHeapSize, limit: pm.jsHeapSizeLimit } : null;
      models = await readModels();
      // Tell the per-PC AI settings how much of the Quick model sits on the graphics card here.
      if (models && root.CVHardware && root.CVChecks && root.CVChecks.Engine && root.CVChecks.Engine.detected) {
        const flipped = root.CVHardware.observe(models, root.CVChecks.Engine.detected.profiles);
        if (flipped && root.CVChecks.Engine.setting() === 'auto' && root.CaseVaultUI) {
          const first = root.CVHardware.autoOrder(root.CVHardware.state)[0];
          root.CaseVaultUI.toast(first === 'light'
            ? 'This PC runs the AI on its processor, so Auto now uses the Light model here. (Choose a profile by clicking "AI:".)'
            : 'This PC runs the AI on its graphics card, so Auto now uses the Quick model here.', 'info', 10000);
        }
      }
      if (isHelper() && Date.now() - sysAt > 15000) { sys = await HelperFS.sysinfo(); sysAt = Date.now(); }
      const webllm = (typeof CVWebLLM !== 'undefined' && CVWebLLM.loadedId) || null;
      const s = summarize({ heap, models, webllm, sys, deviceMemory: navigator.deviceMemory || null });
      label.textContent = s.text;
      el.className = `mem-status ${s.level}`;
      popText.textContent = [...s.lines, 'Updated every few seconds.'].join('\n');
      free.hidden = !(models && models.length);
      el.setAttribute('aria-label', `Memory: ${s.lines.join('. ')}`);
    }

    setInterval(tick, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
    return { tick };
  }

  const api = { summarize, mount, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVMemory = api;
})(this);
