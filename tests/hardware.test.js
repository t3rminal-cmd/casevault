// Tests for the per-PC AI profile (js/ai/hardware.js): which model "Auto" picks on a PC with a
// graphics card (the Beelink) and without one (the L14).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('../js/ai/hardware.js');
const AI = require('../js/checker/ai.js');

// Your two models: Quick for the Beelink, Light for the L14. No Thorough model.
const detected = {
  status: 'connected',
  chat: [{ name: 'qwen2.5:7b', size: 7.6 }, { name: 'qwen2.5:3b', size: 3.1 }],
  profiles: { quick: 'qwen2.5:7b', light: 'qwen2.5:3b', thorough: null },
};

test('graphics chips as the browser reports them', () => {
  assert.strictEqual(H.classifyGpu({ vendor: 'nvidia', architecture: 'ampere', description: 'NVIDIA GeForce RTX 3050' }), 'dedicated');
  assert.strictEqual(H.classifyGpu({ vendor: 'intel', architecture: 'gen-12lp', description: 'Intel(R) Iris(R) Xe Graphics' }), 'integrated');
  assert.strictEqual(H.classifyGpu({ vendor: 'intel', description: 'Intel(R) Arc(TM) A770 Graphics' }), 'dedicated');
  assert.strictEqual(H.classifyGpu({ vendor: 'amd', description: 'AMD Radeon RX 7600' }), 'dedicated');
  assert.strictEqual(H.classifyGpu({ vendor: 'amd', description: '' }), 'unknown');
  assert.strictEqual(H.classifyGpu({ vendor: 'google', architecture: 'swiftshader' }), 'integrated');
  assert.strictEqual(H.classifyGpu(null), 'unknown');
});

test('Auto: Quick on a PC with a graphics card, Light on one without', () => {
  const pick = (pc) => AI.choose(detected, 'auto', H.autoOrder(pc)).model;
  assert.strictEqual(pick({ gpu: 'dedicated' }), 'qwen2.5:7b', 'Beelink');
  assert.strictEqual(pick({ gpu: 'integrated' }), 'qwen2.5:3b', 'L14');
  assert.strictEqual(pick({}), 'qwen2.5:7b', 'unknown: Quick first, as before');
  // What Ollama measured wins over the browser's guess.
  assert.strictEqual(pick({ gpu: 'dedicated', measured: { model: 'qwen2.5:7b', gpuShare: 0 } }), 'qwen2.5:3b');
  assert.strictEqual(pick({ gpu: 'integrated', measured: { model: 'qwen2.5:7b', gpuShare: 1 } }), 'qwen2.5:7b');
  // A profile chosen on this PC is kept, whatever the hardware.
  assert.strictEqual(AI.choose(detected, 'quick', H.autoOrder({ gpu: 'integrated' })).model, 'qwen2.5:7b');
  assert.strictEqual(AI.choose(detected, 'rules-only', H.autoOrder({})), null);
  // Only one model installed: Auto uses it wherever it is.
  const onlyQuick = { ...detected, chat: [detected.chat[0]], profiles: { quick: 'qwen2.5:7b' } };
  assert.strictEqual(AI.choose(onlyQuick, 'auto', H.autoOrder({ gpu: 'integrated' })).model, 'qwen2.5:7b');
});

test('measurement from Ollama (/api/ps): share of the Quick model on the GPU', () => {
  assert.deepStrictEqual(H.measure([{ name: 'qwen2.5:7b', size: 5e9, size_vram: 5e9 }], detected.profiles), { model: 'qwen2.5:7b', gpuShare: 1 });
  assert.deepStrictEqual(H.measure([{ name: 'qwen2.5:7b', size: 5e9, size_vram: 0 }], detected.profiles), { model: 'qwen2.5:7b', gpuShare: 0 });
  assert.strictEqual(H.measure([{ name: 'qwen2.5:3b', size: 2e9, size_vram: 0 }], detected.profiles), null, 'only the Quick model tells us something');
  assert.strictEqual(H.measure(null, detected.profiles), null);
});

test('observe(): the L14 switches to Light after running Quick on its processor', () => {
  H.reset();
  assert.strictEqual(H.autoOrder(H.state)[0], 'quick');
  const flipped = H.observe([{ name: 'qwen2.5:7b', size: 5e9, size_vram: 0 }], detected.profiles);
  assert.strictEqual(flipped, true);
  assert.strictEqual(H.autoOrder(H.state)[0], 'light');
  assert.match(H.explain(H.state), /processor/);
  assert.strictEqual(H.observe([{ name: 'qwen2.5:7b', size: 5e9, size_vram: 0 }], detected.profiles), false, 'same reading: no change');
  H.setProfile('quick');
  assert.strictEqual(H.profile(), 'quick');
  H.reset();
  assert.strictEqual(H.profile(), null);
});
