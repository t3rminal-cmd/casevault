'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/report-fields.js');
const P = require('../js/report-pdf.js');

test('Report Fields: exhibit numbers count on across cases and are never reused', () => {
  assert.strictEqual(F.nextExhibit([]), 1);
  assert.strictEqual(F.nextExhibit([1, 2, 3]), 4);
  assert.strictEqual(F.nextExhibit([1, '7', 0, 'N-12']), 13, 'numbers from other cases and a kept "last given" count too');
});

test('Report Fields: labels are Title Case without parentheses', () => {
  for (const [, label] of F.FIELDS) {
    assert.doesNotMatch(label, /[()]/, label);
    assert.match(label, /^[A-Z0-9]/, label);
  }
});

test('Report Fields: saves from before v1.20 are brought up to date', () => {
  const d = F.normalize({ schema: 1, offense: 'X', evidence: [{ number: 1, description: 'old', type: 'Narcotic' }, { number: 2, type: 'Recording (audio/video)' }] });
  assert.deepStrictEqual(d.evidence.map((e) => e.type), ['Narcotics', 'Video/Audio']);
  assert.strictEqual(d.evidence[0].inventory, '');
  assert.strictEqual(d.victimVerified, false);
  assert.strictEqual(d.schema, 4);
});

test('Report Fields: placeholders, AI text and a report made from them', () => {
  const d = { ...F.empty(), caseNumber: 'JH123456', offense: 'Delivery of a controlled substance', ucr: '2012 Delv: Cocaine', date: '2026-03-14', fire: 'No', method: 'On View', victimVerified: true,
    evidence: [{ number: 5, inventory: '14000001', description: '3 bags of white powder', type: 'Narcotics', drug: 'Cocaine', weight: '12.4 g' }, { number: 6, type: 'Currency', drug: 'ignored', description: '$300' }],
    narrative: 'On March 14, 2026 TFO Sample purchased…' };
  const ctx = F.context(d);
  assert.strictEqual(ctx['report.ucr'], '2012 Delv: Cocaine');
  assert.strictEqual(ctx['report.date'], 'March 14, 2026');
  assert.strictEqual(ctx['report.victimVerified'], 'Yes');
  assert.strictEqual(ctx['report.evidence'], 'Exhibit 5, Inventory 14000001: Narcotics, Cocaine, 12.4 g. 3 bags of white powder\nExhibit 6: Currency. $300');
  const t = F.asText(d);
  assert.match(t, /Offense Classification \/ Last Report: Delivery/);
  assert.doesNotMatch(t, /Beat Assigned/, 'empty fields are left out');
  const md = F.toMarkdown(d, 'Supplementary Report');
  // v1.31: laid out like the PDF: a row of labels, the entries under them.
  assert.match(md, /\| Offense Classification \/ Last Report \| IUCR Code \|\n\|---\|---\|\n\| Delivery of a controlled substance \| 2012 Delv: Cocaine \|/);
  assert.match(md, /\| 5 \| 14000001 \| Narcotics \| Cocaine \| 12\.4 g \| 3 bags of white powder \|/);
  assert.match(md, /\| 6 \|\s+\| Currency \|\s+\|\s+\| \$300 \|/, 'narcotic type and weight only for narcotics');
  assert.match(md, /## Summary of Investigation\n\nOn March 14, 2026/);
  assert.ok(F.PLACEHOLDERS.includes('report.narrative'));
});

test('Report PDF: a valid PDF with the fields, signature fields and page numbers', () => {
  const d = { ...F.empty(), caseNumber: 'JH123456', offense: 'Delivery (cocaine)', status: '3 - C/C', victimVerified: true,
    evidence: [{ number: 1, inventory: '14000001', type: 'Narcotics', drug: 'Cocaine', weight: '12.4 g', description: 'Three bags. '.repeat(40) }],
    narrative: `**Bold** start. “Quoted” – dash.\n\n${'Surveillance continued. '.repeat(400)}` };
  const bytes = P.build(d, { agency: 'Example Police Department', caseLabel: 'Operation Example · Case JH123456', printed: 'March 15, 2026' });
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.7'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\(EXAMPLE POLICE DEPARTMENT\)/); // v1.43: the agency in capitals under the title
  assert.match(s, /\/BaseFont \/Times-Roman/, 'set in Times, like the form');
  assert.match(s, /\(Delivery \\\(cocaine\\\)\)/, 'parentheses are escaped');
  assert.match(s, /\\223Quoted\\224 \\226 dash/, 'curly quotes and dashes in WinAnsi');
  assert.doesNotMatch(s, /\*\*Bold/, 'Markdown marks are taken off');
  const pages = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.ok(pages >= 3, `long summary flows onto more pages (${pages})`);
  assert.match(s, new RegExp(`Page ${pages} of ${pages}`));
  assert.strictEqual((s.match(/\/FT \/Sig/g) || []).length, 3, 'three signature fields: reporting, secondary, supervisor');
  // Every xref offset points at its object.
  const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
  const table = s.slice(xref).split('\n').slice(3).filter((l) => /^\d{10} 00000 n/.test(l));
  table.forEach((l, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, Number(l.slice(0, 10))), `object ${i + 1}`));
});

test('Report PDF: wrapping keeps lines inside the width and breaks long words', () => {
  const lines = P.wrap('A '.repeat(100) + 'X'.repeat(300), 9, 200);
  for (const l of lines) assert.ok(P.width(l, 9) <= 200.01, l);
  assert.ok(lines.join('').includes('XXXX'));
});

test('Report Fields v1.21: lists, parts left out, and v1.20 single entries moved into the lists', () => {
  const d = F.normalize({ schema: 2, victimName: 'State of Illinois', offenderName: 'DOE, John', offenderRelation: 'X', charges: '720 ILCS 570/401', gangAffiliation: 'Latin Kings', vehicle: '2015 Honda', impound: 'Towed' });
  assert.strictEqual(d.victimsList[0].name, 'State of Illinois');
  assert.deepStrictEqual([d.offendersList[0].name, d.offendersList[0].relation], ['DOE, John', 'X']);
  assert.strictEqual(d.charges[0].description, '720 ILCS 570/401');
  assert.strictEqual(d.gangs[0].name, 'Latin Kings');
  assert.strictEqual(d.vehicles[0].notes, '2015 Honda; Towed');
  assert.ok(!('victimName' in d) && !('vehicle' in d));
  assert.strictEqual(F.normalize(d).victimsList.length, 1, 'normalizing twice does not add again');
  d.offendersList[0].dob = '1990-01-02';
  assert.match(F.itemLine('offendersList', d.offendersList[0]), /^DOE, John, Relation Code: X, Date of Birth: January 2, 1990/);
  d.hidden = ['people'];
  assert.doesNotMatch(F.asText(d), /Offender:/);
  assert.doesNotMatch(F.toMarkdown(d), /Victims and Offenders/);
  assert.ok(F.PICKS.gang.includes('Gangster Disciples') && F.PICKS.victim.includes('State of Illinois'));
});

test('Report PDF: exhibit photos on Exhibit Attachments pages; hidden parts left out', () => {
  // A tiny valid JPEG is not needed: the writer only wraps the bytes.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const d = F.normalize({ evidence: [{ number: 1, type: 'Narcotics', photos: ['a.jpg'] }], hidden: ['assignment'], offendersList: [{ name: 'DOE, John' }] });
  const s = Buffer.from(P.build(d, { photos: [{ jpeg, w: 800, h: 600, caption: 'Exhibit 1' }, { jpeg, w: 600, h: 800, caption: 'Exhibit 1' }] })).toString('latin1');
  assert.match(s, /\/Subtype \/Image \/Width 800 \/Height 600/);
  assert.match(s, /\(EXHIBIT ATTACHMENTS\)/);
  assert.match(s, /\/XObject << \/Im0 \d+ 0 R \/Im1 \d+ 0 R >>/, 'both photos on one page');
  assert.doesNotMatch(s, /\(ASSIGNMENT\)/);
  assert.match(s, /\(DOE, John\)/);
  const noEvidence = Buffer.from(P.build({ ...d, hidden: ['evidence'] }, { photos: [{ jpeg, w: 10, h: 10 }] })).toString('latin1');
  assert.doesNotMatch(noEvidence, /EXHIBIT ATTACHMENTS|\/Subtype \/Image/, 'no evidence part, no photo pages');
});

test('v1.22: age from DOB, photo labels, roles, notifications and optional lines', () => {
  assert.strictEqual(F.ageOn('1990-10-05', '2026-09-30'), '35');
  assert.strictEqual(F.ageOn('1990-09-30', '2026-09-30'), '36');
  assert.strictEqual(F.ageOn('', '2026-09-30'), '');
  assert.deepStrictEqual([F.photoLabel(1, 0), F.photoLabel(1, 1), F.photoLabel(3, 25), F.photoLabel(3, 26)], ['1a', '1b', '3z', '3aa']);
  assert.deepStrictEqual(F.PICKS.victim, ['State of Illinois']);
  const d = F.normalize({ schema: 3, notifications: 'Called the watch commander', personnel: [{ name: 'A', role: 'Unit 189' }, { name: 'B', role: 'Entry' }], within1000: 'School', hidden: ['within1000'] });
  assert.strictEqual(d.notifications[0].name, 'Called the watch commander');
  assert.deepStrictEqual(d.personnel.map((p) => [p.unit, p.role]), [['Unit 189', ''], ['', 'Entry']]);
  assert.doesNotMatch(F.asText(d), /Within 1000/);
  const s = Buffer.from(P.build(d)).toString('latin1');
  assert.doesNotMatch(s, /WITHIN 1000 FEET/);
  assert.match(s, /SEARCH WARRANT NUMBER/);
});

test('v1.22: searchable lists and the charges from LE Cyber-Docs', () => {
  const C = require('../js/combo.js');
  const items = [{ label: '2012 Delv: Cocaine', hint: 'Narcotics' }, { label: '2022 Poss: Cocaine', hint: 'Narcotics' }, { label: '0810 Over $500', hint: 'Theft' }];
  assert.deepStrictEqual(C.filter(items, 'cocaine delv').map((i) => i.label), ['2012 Delv: Cocaine']);
  assert.strictEqual(C.filter(items, 'narcotics').length, 2, 'the hint (group) is searched too');
  assert.strictEqual(C.filter(items, '').length, 3);
  const RD = require('../js/reference/ref-data.js');
  const all = RD.CHARGES.flatMap((g) => g.codes);
  assert.ok(all.length >= 50);
  assert.ok(all.some(([s, d]) => s === '720 ILCS 570/401(a)(2)(A)' && /Cocaine, 15 to 100 grams/.test(d)));
  assert.ok(all.every(([s]) => /^(720 ILCS \d+\/|21 U\.S\.C\. §|18 U\.S\.C\. §)/.test(s)), 'Illinois and federal statutes only');
  const { pathText } = require('../js/formats.js');
  assert.strictEqual(pathText('cases\\2024-JH123456'), 'cases | 2024-JH123456');
});

test('v1.23: Submission and Approval is one row per officer, no Lieutenant', () => {
  const keys = F.SECTIONS.find((s) => s.id === 'approval').fields.map(([k]) => k);
  assert.deepStrictEqual(keys.slice(0, 12), ['reportingOfficer', 'reportingStar', 'dateSubmitted', 'timeSubmitted',
    'secondOfficer', 'secondStar', 'secondDate', 'secondTime', 'supervisor', 'supervisorStar', 'dateApproved', 'timeApproved']);
  assert.ok(!keys.includes('lieutenant') && !keys.includes('lieutenantStar'));
  const d = F.normalize({ lieutenant: 'LT Example', lieutenantStar: '99', reportingOfficer: 'P.O. Example' });
  assert.ok(!('lieutenant' in d) && !('lieutenantStar' in d), 'old Lieutenant entries are dropped');
  assert.strictEqual(d.secondDate, '');
  const s = Buffer.from(P.build({ ...d, secondOfficer: 'P.O. Second', secondDate: '2026-03-15', secondTime: '14:30' }, {})).toString('latin1');
  assert.doesNotMatch(s, /LIEUTENANT|LieutenantSignature/);
  assert.match(s, /SECONDARY REPORTING OFFICER/);
  assert.match(s, /\(March 15, 2026\)/);
});

test('v1.23: a Details suspect fills the report Offenders by name', () => {
  const d = F.normalize({ offendersList: [{ name: '' }] });
  const s = { name: 'John Example', dob: '1990-06-15', info: { race: 'White', hair: 'Brown', marks: 'Tattoo, left forearm', bogus: 'x' } };
  assert.deepStrictEqual(F.suspectToOffender(d, s, '2026-03-15'), { index: 0, added: false }, 'the empty offender is used first');
  assert.strictEqual(d.offendersList[0].age, '35');
  assert.strictEqual(d.offendersList[0].marks, 'Tattoo, left forearm');
  assert.ok(!('bogus' in d.offendersList[0]));
  // Same name (any case or spacing): updated, and blank suspect fields don't wipe the report's.
  d.offendersList[0].eyes = 'Blue';
  assert.deepStrictEqual(F.suspectToOffender(d, { name: ' john  EXAMPLE ', info: { eyes: '', weight: '180' } }, '2026-03-15'), { index: 0, added: false });
  assert.strictEqual(d.offendersList[0].eyes, 'Blue');
  assert.strictEqual(d.offendersList[0].weight, '180');
  assert.deepStrictEqual(F.suspectToOffender(d, { name: 'Jane Example' }, '2026-03-15'), { index: 1, added: true });
  assert.strictEqual(F.suspectToOffender(d, { name: '  ' }, '2026-03-15'), null);
  assert.ok(F.SUSPECT_INFO.every(([k]) => !['name', 'dob', 'age'].includes(k)));
});

test('v1.23: LSD and psilocybin (Schedule I hallucinogens) are in the charges', () => {
  const RD = require('../js/reference/ref-data.js');
  const all = RD.CHARGES.flatMap((g) => g.codes);
  for (const drug of ['LSD', 'Psilocybin']) {
    assert.ok(all.some(([s, d]) => s === '720 ILCS 570/401(e)' && d.includes(drug) && /Hallucinogen/.test(d)), `${drug} delivery`);
    assert.ok(all.some(([s, d]) => s === '720 ILCS 570/402(c)' && d.includes(drug)), `${drug} possession`);
  }
});

test('v1.25: height in feet and inches, weight in pounds, unknown offender ranges', () => {
  assert.deepStrictEqual(F.parseHeight('5\'10"'), { ft: 5, in: 10 });
  assert.deepStrictEqual(F.parseHeight('5 10'), { ft: 5, in: 10 });
  assert.deepStrictEqual(F.parseHeight('70in'), { ft: 5, in: 10 });
  assert.deepStrictEqual(F.parseHeight('6'), { ft: 6, in: 0 });
  assert.strictEqual(F.parseHeight('tall'), null);
  assert.strictEqual(F.parseHeight('5 13'), null);
  assert.strictEqual(F.heightOf(5, 10), '5\'10"');
  assert.deepStrictEqual(F.heightParts('5\'8" - 5\'11"'), [{ ft: 5, in: 8 }, { ft: 5, in: 11 }]);
  assert.strictEqual(F.withLbs('180'), '180 lbs');
  assert.strictEqual(F.withLbs('170 - 190'), '170 - 190 lbs');
  assert.strictEqual(F.withLbs('about 180 lbs'), 'about 180 lbs', 'free text is left as typed');
  const d = F.normalize({ offendersList: [{ height: '5\'10"', weight: '180', name: 'John Example' }, { unknown: true, age: '25 - 30', height: '5\'8" - 5\'11"', weight: '170 - 190' }] });
  assert.strictEqual(d.offendersList[1].name, F.UNKNOWN, 'an unknown offender without a name is called Unknown Offender');
  assert.strictEqual(F.itemLine('offendersList', d.offendersList[0]), 'John Example, Height: 5\'10", Weight: 180 lbs');
  assert.strictEqual(F.itemLine('offendersList', d.offendersList[1]), 'Unknown Offender, Age Range: 25 - 30, Height Range: 5\'8" - 5\'11", Weight Range: 170 - 190 lbs');
  const s = Buffer.from(P.build(d, {})).toString('latin1');
  assert.match(s, /Age Range: 25 - 30/); // v1.43: each offender on a line under OFFENDER(S)
  assert.match(s, /Weight Range: 170/);
});

test('v1.25: narcotics recovered, one line each; older single lines move into the list', () => {
  const old = F.normalize({ totalWeight: '12.4 g', streetValue: '$1,550', purchasePrice: '$400' });
  assert.deepStrictEqual(old.narcotics, [{ drug: '', amount: '12.4 g', unit: '', price: '$400', value: '$1,550' }]);
  assert.ok(!('totalWeight' in old) && !('streetValue' in old) && !('purchasePrice' in old));
  const d = F.normalize({ narcotics: [{ drug: 'Cocaine (Powder)', amount: '28', unit: 'gram', price: '$1,200.00', value: '$3,500.00' }, { drug: 'Adderall', amount: '1', unit: 'pill' }], subpoenaGJ: 'GJ-1' });
  assert.strictEqual(F.itemLine('narcotics', d.narcotics[0]), 'Cocaine (Powder), Total Weight: 28 grams, Purchase Price: $1,200.00, Street Value: $3,500.00');
  assert.strictEqual(F.itemLine('narcotics', d.narcotics[1]), 'Adderall, Total Weight: 1 pill');
  assert.ok(!F.FIELDS.some(([k]) => k === 'narcotics'), 'the list marker is not a field');
  assert.ok(F.OPTIONAL_LINES.includes('subpoenaGJ'));
  const ctx = F.context(d);
  assert.strictEqual(ctx['report.streetValue'], '$3,500.00', 'templates from before v1.25 still fill in');
  assert.strictEqual(ctx['report.totalWeight'], 'Cocaine (Powder) 28 grams; Adderall 1 pill');
  assert.match(F.asText(d), /Subpoena GJ Number: GJ-1\n[\s\S]*Narcotic: Cocaine \(Powder\), Total Weight: 28 grams/);
  const md = F.toMarkdown(d);
  assert.match(md, /\| 1 \| Cocaine \(Powder\) \| 28 grams \|/);
  const s = Buffer.from(P.build(d, {})).toString('latin1');
  assert.match(s, /NARCOTICS RECOVERED/);
  assert.match(s, /Total Weight: 28 grams/);
  assert.match(s, /SUBPOENA GJ NUMBER/);
  // The four narcotic boxes share one row.
  const R = require('../js/reference/reference.js');
  assert.strictEqual(R.streetValue('Cocaine (Powder)', 28, 'gram').value, 3500);
});

test('v1.26: Illinois and federal charges, grouped, with the mail-related narcotics statutes', () => {
  const RD = require('../js/reference/ref-data.js');
  const titles = RD.CHARGES.map((g) => g.title);
  assert.ok(titles.every((t) => /^(Illinois|Federal): /.test(t)), 'every group says whose law it is');
  const all = RD.CHARGES.flatMap((g) => g.codes);
  for (const s of ['21 U.S.C. § 841(a)(1)', '21 U.S.C. § 846', '21 U.S.C. § 843(b)', '18 U.S.C. § 1716', '18 U.S.C. § 1952', '18 U.S.C. § 924(c)', '720 ILCS 570/401.1', '720 ILCS 570/405.1']) {
    assert.ok(all.some(([c]) => c === s), s);
  }
  assert.match(all.find(([c]) => c === '21 U.S.C. § 843(b)')[1], /mail/);
  const keys = RD.CHARGES.map((g) => g.key);
  assert.strictEqual(new Set(keys).size, keys.length, 'group keys are unique');
});

test('v1.26: LEO partners text, Supplemental Report type and template, mail signature and preloaded domains', () => {
  const D = require('../js/drafts/draft-core.js');
  assert.deepStrictEqual(D.PARTNER_AGENCIES, ['DEA', 'FBI', 'ATF', 'USMS', 'IRS', 'CBP', 'HSI', 'ICE', 'USSS', 'USPIS', 'State PD', 'Local PD', 'Sheriff Dept', 'Other']);
  assert.strictEqual(D.partnersText([{ agency: 'USPIS' }, { agency: 'DEA' }, { agency: 'Local PD', name: 'Example Police Department' }, { agency: 'Sheriff Dept', name: 'Example County Sheriff' }]),
    'DEA, USPIS, Local PD (Example Police Department), Sheriff Dept (Example County Sheriff)');
  assert.strictEqual(D.partnersText([]), '');
  assert.strictEqual(D.DOC_TYPES.supplemental.label, 'Supplemental Report');
  assert.ok(D.STARTER_TEMPLATES['generic-supplemental-report.md'].includes('{{report.narcotics}}'));
  const M = require('../js/secure/mail.js');
  assert.deepStrictEqual(M.settingsOf({}).domains, ['chicagopolice.org', 'dea.gov', 'uspis.gov']);
  assert.deepStrictEqual(M.settingsOf({ domains: ['agency.gov'], preloaded: 2 }).domains, ['agency.gov'], 'your own list wins once saved');
  assert.deepStrictEqual(M.settingsOf({ domains: ['agency.gov'], preloaded: true }).domains, ['chicagopolice.org', 'dea.gov', 'uspis.gov', 'agency.gov'], 'v1.28: a list saved in v1.27 gets chicagopolice.org once more');
  assert.deepStrictEqual(M.settingsOf({ domains: ['agency.gov'] }).domains, ['chicagopolice.org', 'dea.gov', 'uspis.gov', 'agency.gov'], 'an older list gets the preloaded domains once');
  assert.ok(M.checkRecipients([{ email: 'a.b@dea.gov' }], M.settingsOf({}).domains).ok);
  assert.strictEqual(M.closing({ signature: 'Det. Example\nNarcotics', footer: 'NOTICE' }), 'Det. Example\nNarcotics\n\n--\nNOTICE');
  assert.strictEqual(M.closing({ signature: '', footer: 'NOTICE' }), '--\nNOTICE');
  assert.strictEqual(M.signatureFrom({ name: 'Det. Example', title: 'Detective', agency: 'Example PD', phone: '555-010-0100', email: 'det@example.gov' }),
    'Det. Example\nDetective\nExample PD\nPhone: 555-010-0100\ndet@example.gov');
});

test('v1.27: operations share one Case Overview and one Timeline', () => {
  const O = require('../js/operation.js');
  const a = { suspects: [{ name: 'John Example', role: 'Main' }, { name: '', role: 'Secondary' }], contacts: { officer: { name: 'Det. A' }, prosecutor: {}, others: [{ role: 'Finance', name: 'F. Example' }] }, deconfliction: [{ date: '2026-01-02', event: 'Buy', system: 'RISSafe', number: '1' }] };
  const b = { suspects: [{ name: 'john example', role: 'Main' }, { name: 'Jane Example', role: 'Secondary' }], contacts: { officer: {}, prosecutor: { title: 'ASA', name: 'P. Example' }, others: [{ role: 'finance', name: 'f. example' }, { role: 'Supervisor', name: 'S. Example' }] }, deconfliction: [{ date: '2026-01-02', event: 'buy', system: 'RISSafe', number: '1' }, { date: '2026-02-03', event: 'Search warrant', system: 'RISSafe', number: '2' }] };
  const m = O.mergeOverview([a, b]);
  assert.deepStrictEqual(m.suspects.map((s) => s.name), ['John Example', '', 'Jane Example'], 'each person once; the case on screen comes first');
  assert.strictEqual(m.contacts.officer.name, 'Det. A');
  assert.strictEqual(m.contacts.prosecutor.name, 'P. Example');
  assert.deepStrictEqual(m.contacts.others.map((o) => o.name), ['F. Example', 'S. Example']);
  assert.strictEqual(m.deconfliction.length, 2);
  assert.ok(O.sameOverview({ ...a, ...m }, { ...b, ...m }));
  assert.ok(!O.sameOverview(a, b));
  assert.strictEqual(O.opKey('  Operation   Example '), 'operation example');
  const ev = O.mergeEvents([
    { caseId: 'c1', number: 'JH1', events: [{ id: 1, date: '2026-03-01', time: '10:00', title: 'Buy 2' }, { id: 2, date: '2026-01-01', title: 'Opened' }] },
    { caseId: 'c2', number: 'JH2', events: [{ id: 3, date: '2026-02-01', title: 'Warrant' }, { id: 4, date: '2026-03-01', time: '09:00', title: 'Buy 1' }] },
  ]);
  assert.deepStrictEqual(ev.map((x) => `${x.number} ${x.ev.title}`), ['JH1 Opened', 'JH2 Warrant', 'JH2 Buy 1', 'JH1 Buy 2']);
});

test('v1.27: State of Illinois victim, compact Local AI box', () => {
  const d = F.normalize({ victimsList: [{ name: 'State of Illinois', officer: 'P.O. Example #1234', race: 'White' }, { name: 'Jane Example', race: 'Black', officer: 'left over' }] });
  assert.deepStrictEqual(F.fieldsFor('victimsList', d.victimsList[0]).map(([k]) => k), ['name', 'officer']);
  assert.ok(!F.fieldsFor('victimsList', d.victimsList[1]).some(([k]) => k === 'officer'));
  assert.strictEqual(F.itemLine('victimsList', d.victimsList[0]), 'State of Illinois, Officer Name: P.O. Example #1234');
  assert.strictEqual(F.itemLine('victimsList', d.victimsList[1]), 'Jane Example, Race: Black');
  const s = Buffer.from(P.build(d, {})).toString('latin1');
  assert.match(s, /Officer Name: P.O. Example/);
  assert.doesNotMatch(s, /State of Illinois, Race/);
  const M = require('../js/ai/memory.js');
  // v1.28: Local AI, RAM in use of total, RAM free, the drive's free space.
  const G = 1024 ** 3;
  assert.deepStrictEqual(M.compact({ ramTotal: 32 * G, ramFree: 24.4 * G, diskFree: 779 * G }), ['Local AI', '7.6 GB of 32 GB', '24 GB Free', 'Drive: 779 GB Free']);
  assert.deepStrictEqual(M.compact({ deviceMemory: 8 }), ['Local AI', '8 GB or more RAM']);
  const AI = require('../js/checker/ai.js');
  assert.deepStrictEqual(['qwen3:8b', 'gemma3:12b', 'llama3.1:8b:latest', 'Qwen2.5', ''].map(AI.modelName), ['Qwen3:8b', 'Gemma3:12b', 'Llama3.1:8b', 'Qwen2.5', '']);
});

test('v1.31: Officer\'s Report lines, UCO, no reclassification, and a report drawn as a PDF like the form', () => {
  const report = F.SECTIONS.find((s) => s.id === 'report').fields.map(([, l]) => l);
  assert.deepStrictEqual(report.slice(0, 16), ['Operation / Mission Number', 'Within 1000 FT Of', 'Court Branch and Court Officer', 'Court Date', 'Search Warrant Number', 'Subpoena GJ Number',
    'ASA Approving Search Warrant', 'AUSA Approving Search Warrant', 'Judge Approving Search Warrant', 'Purchase Price', 'Pre-Recorded Funds', 'Pre-Recorded Fund Sheet', 'Evidence Officer', 'Proof of Residence', 'IR Number', 'CB Number']);
  assert.ok(!F.FIELDS.some(([k]) => k === 'reclass' || k === 'revisedUcr'));
  assert.ok(F.ROLES.includes('UCO') && !F.ROLES.includes('UC'));
  assert.strictEqual(F.normalize({ personnel: [{ name: 'Officer Alex Sample', role: 'UC' }] }).personnel[0].role, 'UCO');
  const DP = require('../js/draft-pdf.js');
  const md = F.toMarkdown({ ...F.empty(), caseNumber: 'TEST-1', offense: 'Sample offense', narrative: 'Sample summary.' });
  const b = DP.blocks(md);
  assert.strictEqual(b[0].kind, 'title');
  assert.ok(b.some((x) => x.kind === 'band' && x.text === 'Offense'));
  assert.deepStrictEqual(b.find((x) => x.kind === 'table').rows[0].slice(0, 2), ['Agency Report Number', 'Event Number']);
  const all = DP.layout(md, { agency: 'Example Agency' }).map((p) => p.ops.join('\n')).join('\n');
  for (const s of ['SUPPLEMENTARY REPORT', 'OFFENSE', 'AGENCY REPORT NUMBER', 'TEST-1', 'Sample summary.', "OFFICER'S REPORT"]) assert.ok(all.includes(s), s);
  const pdf = Buffer.from(DP.build('# A Report\n\nSome **text**.\n\n- one\n- two\n\n| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n')).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.7') && pdf.includes('(A REPORT)') && pdf.includes('(Some text.)'));
});

test('v1.34: every Officer\'s Report line and list can be ticked off', () => {
  const F = require('../js/report-fields.js');
  for (const k of ['operation', 'courtBranch', 'courtDate', 'fundSheet', 'evidenceOfficer', 'cbNumber']) assert.ok(F.OPTIONAL_LINES.includes(k), k);
  assert.deepStrictEqual(F.OPTIONAL_LISTS, ['funds', 'narcotics', 'charges', 'gangs', 'notArrested', 'personnel', 'vehicles', 'notifications']);
  const d = F.normalize({ evidenceOfficer: 'Officer Sample', courtBranch: 'Branch 1', courtDate: '2026-10-20', charges: [{ statute: '720 ILCS 570/402(c)', description: 'Possession' }], hidden: ['evidenceOfficer', 'charges', 'courtDate'] });
  const md = F.toMarkdown(d);
  assert.ok(!/Officer Sample/.test(md));
  assert.ok(!/Possession/.test(md));
  assert.match(md, /Court Branch and Court Officer \| Branch 1 \|/);
  assert.deepStrictEqual(F.courtLine({ ...d, hidden: ['courtBranch'] }, F.shown), ['Court Date', F.shown('courtDate', '2026-10-20')]);
  assert.strictEqual(F.courtLine({ ...d, hidden: ['courtBranch', 'courtDate'] }, F.shown), null);
});

test('v1.34: each evidence photo keeps its label', () => {
  const F = require('../js/report-fields.js');
  const d = F.normalize({ evidence: [{ number: 1, photos: ['a.png', 'b.png'], photoLabels: ['Front'] }, { number: 2, photos: ['c.png'] }] });
  assert.deepStrictEqual(d.evidence[0].photoLabels, ['Front', '']);
  assert.deepStrictEqual(d.evidence[1].photoLabels, ['']);
});

test('uniqueTitle: reports never share a title or PDF (v1.41)', () => {
  const t = 'Supplementary Report - Purchase';
  assert.strictEqual(F.uniqueTitle(t, new Set()), t);
  assert.strictEqual(F.uniqueTitle(t, new Set([t.toLowerCase()])), `${t} 2`);
  assert.strictEqual(F.uniqueTitle(t, new Set([t.toLowerCase(), `${t} 2`.toLowerCase()])), `${t} 3`);
  assert.strictEqual(F.photoLabel(1, 0), '1a');
  assert.strictEqual(F.photoLabel(1, 1), '1b');
});

test('v1.42: exhibit numbering from a start, funds without quantity, notifications without notes', () => {
  assert.strictEqual(F.nextFrom(1, [1, 2, 5]), 3);
  assert.strictEqual(F.nextFrom(20, [1, 20]), 21);
  assert.strictEqual(F.nextFrom(0, []), 1);
  assert.deepStrictEqual(F.LISTS.funds.fields.map((f) => f[0]), ['denomination', 'serial', 'recovered']);
  assert.deepStrictEqual(F.LISTS.notifications.fields.map((f) => f[0]), ['date', 'name', 'by']);
  const d = F.normalize({ notifications: [{ notes: 'Called the watch commander' }] });
  assert.strictEqual(d.notifications[0].name, 'Called the watch commander');
});

test('v1.44: military time without the colon', () => {
  assert.strictEqual(F.militaryTime('14:35'), '1435');
  assert.strictEqual(F.militaryTime('9:05'), '0905');
  assert.strictEqual(F.militaryTime(''), '');
  assert.strictEqual(F.shown('time', '07:30'), '0730');
  const s = Buffer.from(P.build(F.normalize({ time: '14:35', timeSubmitted: '18:10' }), {})).toString('latin1');
  assert.match(s, /\(1435\)/);
  assert.doesNotMatch(s, /\(14:35\)/);
});
