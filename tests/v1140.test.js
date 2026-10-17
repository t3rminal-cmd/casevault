// v1.140: Training certificates: details, renewal notices, the affidavit paragraph, the placeholders
// and the Training Record PDF. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/training.js');
const D = require('../js/drafts/draft-core.js');

const files = [{ base: 'Basic Narcotics.pdf' }, { base: 'Interview Course.pdf' }, { base: 'First Aid.jpg' }, { base: 'No Details.pdf' }];
const meta = {
  'Basic Narcotics.pdf': { course: 'Basic Narcotics Investigations', provider: 'Example Police Academy', date: '2024-03-04', hours: '40' },
  'Interview Course.pdf': { course: 'Interview and Interrogation', provider: 'Example Training Group', date: '2025-06-10', hours: '16.5', expires: '' },
  'First Aid.jpg': { course: 'First Aid / CPR', date: '2025-11-01', hours: '8', expires: '2026-11-01' },
  'Gone.pdf': { course: 'A deleted file' },
};

test('rows: details per file, the file name when no course, newest first, deleted files left out', () => {
  const r = T.rows(files, meta);
  assert.deepStrictEqual(r.map((x) => x.course), ['First Aid / CPR', 'Interview and Interrogation', 'Basic Narcotics Investigations', 'No Details']);
  assert.strictEqual(r[1].hours, '16.5');
  assert.ok(!r.some((x) => x.course === 'A deleted file'));
});

test('normalize: bad dates and hours are dropped', () => {
  assert.deepStrictEqual(T.normalize({ course: ' X ', date: '03/04/2024', hours: 'abc', expires: '2027-01-01' }), { course: 'X', provider: '', date: '', hours: '', expires: '2027-01-01' });
  assert.strictEqual(T.normalize({ hours: '1,000' }).hours, '1000');
  assert.strictEqual(T.normalize({ hours: '-2' }).hours, '');
});

test('notice: 90 and 30 days before, and expired', () => {
  const row = { expires: '2026-11-01' };
  assert.strictEqual(T.notice(row, '2026-07-01'), '');
  assert.strictEqual(T.notice(row, '2026-08-03'), 'notice'); // 90 days
  assert.strictEqual(T.notice(row, '2026-10-02'), 'soon');   // 30 days
  assert.strictEqual(T.notice(row, '2026-11-01'), 'soon');   // the last day
  assert.strictEqual(T.notice(row, '2026-11-02'), 'expired');
  assert.strictEqual(T.notice({ expires: '' }, '2026-11-02'), '');
  assert.strictEqual(T.daysLeft(row, '2026-10-17'), 15);
  assert.deepStrictEqual(T.renewals(T.rows(files, meta), '2026-10-17').map((x) => x.course), ['First Aid / CPR']);
});

test('paragraph: oldest first, each with who, when and hours, and the total', () => {
  const p = T.paragraph(T.rows(files, meta));
  assert.strictEqual(p, 'Your Affiant has completed the following training: Basic Narcotics Investigations (Example Police Academy, March 4, 2024, 40 hours); '
    + 'Interview and Interrogation (Example Training Group, June 10, 2025, 16.5 hours); First Aid / CPR (November 1, 2025, 8 hours); No Details. '
    + 'In total, your Affiant has completed 64.5 hours of training.');
  assert.strictEqual(T.paragraph([]), '');
});

test('placeholders: {{training}}, {{training.list}}, {{training.hours}}, {{training.count}}', () => {
  const ctx = D.templateContext({ number: 'EX-1' }, new Date(2026, 9, 17), {}, T.context(T.rows(files, meta)));
  const out = D.fillTemplate('{{training.count}} courses, {{training.hours}} hours.\n{{training.list}}\n\n{{training}}', ctx);
  assert.match(out, /^4 courses, 64.5 hours\./);
  assert.match(out, /Basic Narcotics Investigations, Example Police Academy, March 4, 2024, 40 hours\nInterview and Interrogation/);
  assert.match(out, /Your Affiant has completed the following training:/);
  const empty = D.fillTemplate('{{training}}', D.templateContext({}, new Date(), {}, T.context([])));
  assert.match(empty, /CONFIRM: training/);
  const groups = D.placeholderGroups().find((g) => g.title === 'Your training');
  assert.deepStrictEqual(groups.keys, T.PLACEHOLDERS);
});

test('build: a Training Record PDF with the courses and total hours', () => {
  const bytes = T.build(T.rows(files, meta), { name: 'Jane Doe, Detective', printed: 'October 17, 2026', today: '2026-10-17' });
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-'));
  for (const w of ['TRAINING RECORD', 'Jane Doe, Detective', 'Basic Narcotics Investigations', 'Example Police Academy', 'Total hours', '64.5', 'November 1, 2026']) assert.ok(s.includes(w), w);
  const none = Buffer.from(T.build([], {})).toString('latin1');
  assert.ok(none.includes('No certificates in Training yet.'));
});
