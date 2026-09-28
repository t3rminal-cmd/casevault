// Loads CaseVault's browser scripts into Node the same way the page does: as classic scripts that
// share one global scope. Used by tests that exercise vault.js with the real storage layers.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function load(...files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}

/** Evaluate a global name declared by a loaded script (top-level const lives in the shared scope). */
const get = (name) => vm.runInThisContext(name);

module.exports = { load, get, ROOT };
