/* CaseVault — this PC's AI settings: the chosen profile, and what "Auto" should pick here.
 *
 * The SSD travels between PCs, and every PC sees the same models on W:. A laptop without a
 * graphics card (the L14) should not run the 7-8B Quick model on its processor just because it's
 * installed, while the Beelink (RTX 3050) should. So the profile is remembered per PC, in this
 * browser's storage (only the word "quick", "light"… — never case data), and "Auto" decides from:
 *
 *   1. what Ollama reports once a model is loaded: how much of it sits on the graphics card
 *      (/api/ps size_vram). Mostly on the processor means this PC has no usable GPU. This is the
 *      real answer, so it wins;
 *   2. before that, the graphics chip the browser reports (WebGPU adapter info): NVIDIA or a
 *      Radeon RX card counts as a GPU for AI, Intel / other integrated graphics don't;
 *   3. nothing known: Quick first, as before (corrected by 1 after the first request).
 *
 * The decision logic is plain functions, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const KEY = 'casevault.pc';
  const LIGHT_FIRST = ['light', 'quick', 'thorough'];
  const QUICK_FIRST = ['quick', 'light', 'thorough'];

  /** From WebGPU adapter info { vendor, architecture, description, device }: 'dedicated' | 'integrated' | 'unknown'. */
  function classifyGpu(info) {
    if (!info) return 'unknown';
    const v = String(info.vendor || '').toLowerCase();
    const d = `${info.description || ''} ${info.device || ''} ${info.architecture || ''}`.toLowerCase();
    if (/nvidia|geforce|rtx|quadro/.test(v + d)) return 'dedicated';
    if (/radeon\s*(rx|pro)|\brx\s*\d{3,4}/.test(d)) return 'dedicated';
    if (/intel/.test(v) && /arc(?:\(tm\))?\s*a\d{3}/.test(d)) return 'dedicated';
    if (/intel|qualcomm|adreno|\barm\b|mali|microsoft|swiftshader|llvmpipe|google/.test(`${v} ${d}`)) return 'integrated';
    if (/amd|ati/.test(v)) return 'unknown'; // Ryzen integrated graphics and Radeon cards look alike
    if (/apple/.test(v)) return 'dedicated'; // unified memory runs 7B models well
    return 'unknown';
  }

  /**
   * What the loaded models tell about this PC: { gpuShare, model } for the Quick model when it's
   * loaded (share of it on the GPU, 0..1), else null.
   */
  function measure(models, profiles) {
    const quick = profiles && profiles.quick;
    const m = (models || []).find((x) => x.name === quick && x.size > 0);
    return m ? { model: m.name, gpuShare: Math.max(0, Math.min(1, (m.size_vram || 0) / m.size)) } : null;
  }

  /** The order "Auto" tries profiles in, from what is known about this PC. */
  function autoOrder(pc) {
    const p = pc || {};
    if (p.measured && typeof p.measured.gpuShare === 'number') return p.measured.gpuShare < 0.5 ? LIGHT_FIRST : QUICK_FIRST;
    if (p.gpu === 'integrated') return LIGHT_FIRST;
    return QUICK_FIRST;
  }

  /** One-line explanation of the Auto decision, for the AI engine dialog. */
  function explain(pc) {
    const p = pc || {};
    if (p.measured && typeof p.measured.gpuShare === 'number') {
      const pct = Math.round(p.measured.gpuShare * 100);
      return p.measured.gpuShare < 0.5
        ? `${p.measured.model} ran ${pct}% on the graphics card here, so this PC does AI on its processor: Auto uses Light first.`
        : `${p.measured.model} ran ${pct}% on the graphics card here: Auto uses Quick.`;
    }
    if (p.gpu === 'dedicated') return `Graphics: ${p.gpuName || 'a dedicated graphics card'}. Auto uses Quick (checked again once a model has loaded).`;
    if (p.gpu === 'integrated') return `Graphics: ${p.gpuName || 'integrated graphics'}, not enough for the Quick model. Auto uses Light first.`;
    return 'This PC\'s graphics are not known yet. Auto tries Quick, and switches to Light if it turns out to run on the processor.';
  }

  /* ---------------- per-PC storage (browser only) ---------------- */

  function load() {
    try { return JSON.parse((root.localStorage && root.localStorage.getItem(KEY)) || '{}') || {}; } catch { return {}; }
  }
  function save(pc) {
    try { if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(pc)); } catch { /* private window: this session only */ }
  }

  let pc = load();
  const listeners = new Set();
  const changed = () => { for (const fn of listeners) { try { fn(); } catch (err) { console.error(err); } } };

  /** The profile chosen on this PC ('auto', 'quick', 'light', 'thorough', 'rules-only'), or null. */
  const profile = () => pc.profile || null;
  function setProfile(value) { pc = { ...pc, profile: value }; save(pc); changed(); }

  // Ask the browser which graphics chip it would use for heavy work. Nothing leaves the PC.
  async function probeGpu() {
    try {
      if (!root.navigator || !root.navigator.gpu) return;
      const adapter = await root.navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return;
      const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
      const kind = classifyGpu(info);
      const name = info ? [info.vendor, info.description || info.architecture].filter(Boolean).join(' ') : '';
      if (kind !== pc.gpu || name !== pc.gpuName) { pc = { ...pc, gpu: kind, gpuName: name }; save(pc); changed(); }
    } catch { /* no WebGPU here */ }
  }

  /**
   * Called with Ollama's loaded models (the memory indicator polls /api/ps). Returns true when the
   * measurement changed Auto's decision.
   */
  function observe(models, profiles) {
    const m = measure(models, profiles);
    if (!m) return false;
    const before = autoOrder(pc)[0];
    const prev = pc.measured;
    if (prev && prev.model === m.model && Math.abs(prev.gpuShare - m.gpuShare) < 0.05) return false;
    pc = { ...pc, measured: { ...m, at: new Date().toISOString() } };
    save(pc);
    const flipped = autoOrder(pc)[0] !== before;
    changed();
    return flipped;
  }

  const api = {
    classifyGpu, measure, autoOrder, explain, LIGHT_FIRST, QUICK_FIRST,
    profile, setProfile, probeGpu, observe,
    get state() { return { ...pc }; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { pc = {}; save(pc); changed(); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVHardware = api;
})(this);
