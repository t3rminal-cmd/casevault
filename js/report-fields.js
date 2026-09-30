/* CaseVault — Report Fields: the facts a supplementary report asks for, entered once per case
 * in Reports → Report Fields and kept in the case folder as report-fields.json.
 *
 * v1.21: victims, offenders, charges, gangs, persons not arrested, personnel and vehicles are lists
 * you add to; any part can be left out; exhibits can have photos.
 *
 * v1.20 lays them out like a narcotics supplementary report: case numbers, the offense, victims
 * and offenders, the assignment, update information and status, the officer's report lines,
 * evidence inventoried, the summary of investigation, and submission and approval. The printed
 * report (js/report-pdf.js) follows the same order. No agency's name or form number is written
 * into the app: the printed header uses the agency from Vault → My Profile.
 *
 * They fill {{report.*}} in templates, go to Draft with AI with the case, and "Create report from
 * fields" turns them into a report. Evidence gets exhibit numbers by itself: they count on across
 * every case with the same agency case number (an operation with several case numbers keeps one
 * exhibit sequence), and a number, once given, never changes.
 *
 * The field list and the text conversions are plain logic with no DOM, so the tests run them.
 */
'use strict';

(function (root) {
  // [key, label, kind, options]. kind: text, number, date, time, select, yesno, textarea, ucr,
  // location, check (a tick box), line (a long one-line entry, label on the left).
  const SECTIONS = [
    { id: 'numbers', title: 'Case Numbers', icon: 'hash', fields: [
      ['caseNumber', 'Agency Report Number', 'text'],
      ['eventNumber', 'Event Number', 'text'],
      ['incidentNumber', 'Incident Number', 'text'],
      ['raidNumber', 'Raid Number', 'text'],
      ['rdNumber', 'R.D. Number', 'text'],
      ['activity', 'Officer Report Type', 'select', ['', 'Investigation', 'Purchase', 'Surveillance', 'Correction']],
    ] },
    { id: 'offense', title: 'Offense', icon: 'file-earmark-text', fields: [
      ['offense', 'Offense Classification / Last Report', 'text'],
      ['ucr', 'IUCR Code', 'ucr'],
      ['address', 'Address of Occurrence', 'text'],
      ['locationType', 'Type of Location', 'text'],
      ['locationCode', 'Location Code', 'location'],
      ['reclass', 'Offense Reclassification / DNA', 'text'],
      ['revisedUcr', 'Revised IUCR', 'ucr'],
      ['date', 'Date of Occurrence', 'date'],
      ['time', 'Time of Occurrence', 'time'],
      ['beatOccurrence', 'Beat of Occurrence', 'text'],
      ['beatAssigned', 'Beat Assigned', 'text'],
    ] },
    { id: 'people', title: 'Victims and Offenders', icon: 'people', fields: [
      ['victims', 'Number of Victims', 'number'],
      ['offenders', 'Number of Offenders', 'number'],
      ['arrested', 'Number Arrested', 'number'],
      ['methodCode', 'Method Code', 'text'],
    ], lists: ['victimsList', 'offendersList'] },
    { id: 'assignment', title: 'Assignment', icon: 'person-badge', fields: [
      ['method', 'Method Assigned', 'select', ['', 'Field', 'Supervisor', 'On View', 'OEMC']],
      ['unit', 'Unit Number', 'text'],
      ['safeMethod', 'Safe Method', 'text'],
      ['residence', 'If Residence, Where', 'text'],
      ['arrestUnit', 'Arrest Unit', 'text'],
      ['adults', 'Adults', 'number'],
      ['juveniles', 'Juveniles', 'number'],
      ['fire', 'Fire', 'yesno'],
      ['gang', 'Gang Related', 'yesno'],
    ] },
    { id: 'update', title: 'Update Information and Status', icon: 'list-check', fields: [
      ['victimVerified', 'Victim Verified', 'check'],
      ['offenderVerified', 'Offender Verified', 'check'],
      ['propertyVerified', 'Property Verified', 'check'],
      ['circumstancesVerified', 'Circumstances Verified', 'check'],
      ['victimUpdated', 'Victim Updated', 'check'],
      ['offenderUpdated', 'Offender Updated', 'check'],
      ['propertyUpdated', 'Property Updated', 'check'],
      ['circumstancesUpdated', 'Circumstances Updated', 'check'],
      ['status', 'Status', 'select', ['', '0 - Prog', '1 - Sus', '2 - Unf', '3 - C/C', '4 - C/O', '5 - C/C/X', '6 - C/O/X', '7 - C/N/C']],
      ['cleared', 'How Cleared', 'select', ['', '1 - Arrest', '2 - Juv-Ct', '3 - Ref Pros', '4 - Comm Adj', '5 - Other']],
    ] },
    { id: 'report', title: "Officer's Report", icon: 'card-checklist', fields: [
      ['operation', 'Operation / Mission Number', 'line'],
      ['within1000', 'Within 1000 Feet Of', 'line'],
      ['courtBranch', 'Court Branch and Court Officer', 'line'],
      ['courtDate', 'Court Date', 'date'],
      ['searchWarrant', 'Search Warrant Number', 'line'],
      ['asa', 'ASA Approving Search Warrant', 'line'],
      ['judge', 'Judge Approving Search Warrant', 'line'],
      ['totalWeight', 'Total Weight', 'line'],
      ['streetValue', 'Street Value', 'line'],
      ['purchasePrice', 'Purchase Price', 'line'],
      ['fundSheet', 'Pre-Recorded Fund Sheet Inventory Number', 'line'],
      ['evidenceOfficer', 'Evidence Officer', 'line'],
      ['proofResidence', 'Proof of Residence', 'line'],
    ], lists: ['charges', 'gangs', 'notArrested', 'personnel', 'vehicles', 'notifications'] },
    // One row per officer: name, star, date, time (v1.23; the Lieutenant lines were removed).
    { id: 'approval', title: 'Submission and Approval', icon: 'pencil-square', fields: [
      ['reportingOfficer', 'Reporting Officer', 'text'],
      ['reportingStar', 'Reporting Officer Star', 'text'],
      ['dateSubmitted', 'Date Submitted', 'date'],
      ['timeSubmitted', 'Time Submitted', 'time'],
      ['secondOfficer', 'Secondary Reporting Officer', 'text'],
      ['secondStar', 'Secondary Officer Star', 'text'],
      ['secondDate', 'Secondary Officer Date', 'date'],
      ['secondTime', 'Secondary Officer Time', 'time'],
      ['supervisor', 'Supervisor Approval', 'text'],
      ['supervisorStar', 'Supervisor Star', 'text'],
      ['dateApproved', 'Date Approved', 'date'],
      ['timeApproved', 'Time Approved', 'time'],
      ['extraCopies', 'Extra Copies Required', 'text', 'span'],
    ] },
  ];
  // Parts of the report that can be left out ("doesn't apply"): the sections above, and these.
  const EXTRA_PARTS = [{ id: 'evidence', title: 'Evidence Inventoried' }, { id: 'summary', title: 'Summary of Investigation' }];

  /* ---------------- lists you add to (v1.21) ---------------- */

  // [key, label, kind, options]. kind: text, date, select, phone, wide (a full-width entry), and
  // the pick-lists below (write-in allowed): victim, gang, hair, eyes.
  const PERSON = [
    ['name', 'Name', 'text'], ['relation', 'Relation Code', 'text'], ['dob', 'Date of Birth', 'date'], ['age', 'Age', 'age'],
    ['gender', 'Gender', 'select', ['', 'Male', 'Female', 'X', 'Unknown']],
    ['identity', 'Gender Identity', 'select', ['', 'Man', 'Woman', 'Transgender Man', 'Transgender Woman', 'Non-Binary', 'Other', 'Declined to State']],
    ['race', 'Race', 'select', ['', 'White', 'Black', 'White Hispanic', 'Black Hispanic', 'Asian / Pacific Islander', 'American Indian / Alaska Native', 'Unknown']],
    ['complexion', 'Complexion', 'select', ['', 'Light', 'Fair', 'Medium', 'Olive', 'Light Brown', 'Medium Brown', 'Dark Brown', 'Dark', 'Ruddy', 'Albino']],
    ['height', 'Height', 'text'], ['weight', 'Weight', 'text'], ['hair', 'Hair Color', 'hair'], ['eyes', 'Eye Color', 'eyes'],
    ['veteran', 'Veteran', 'select', ['', 'Yes', 'No']],
    ['marks', 'Tattoos / Scars', 'wide'], ['clothing', 'Clothing Description', 'wide'],
  ];
  // The officers' roles at the scene (Police Personnel).
  const ROLES = ['', 'Case', 'Affiant', 'Entry', 'Perimeter', 'UC', 'Surveillance', 'Enforcement', 'Sergeant', 'Lieutenant', 'Agent', 'Other'];
  // Officer's Report lines that can be ticked off when they don't apply (v1.22).
  const OPTIONAL_LINES = ['within1000', 'searchWarrant', 'asa', 'judge', 'proofResidence'];
  const LISTS = {
    victimsList: { title: 'Victims', item: 'Victim', fields: [['name', 'Name', 'victim'], ...PERSON.slice(1)] },
    offendersList: { title: 'Offenders', item: 'Offender', fields: PERSON },
    charges: { title: 'Charges', item: 'Charge', fields: [['statute', 'Statute', 'charge'], ['description', 'Statute Description', 'chargeWide']] },
    gangs: { title: 'Gang Affiliations', item: 'Gang', fields: [['name', 'Gang', 'gang'], ['faction', 'Faction / Set', 'text']] },
    notArrested: { title: 'Persons Present Not Arrested', item: 'Person', fields: [['name', 'Name', 'text'], ['phone', 'Contact Number', 'phone'], ['address', 'Address', 'wide']] },
    personnel: { title: 'Police Personnel on Scene', item: 'Officer', fields: [['name', 'Name', 'text'], ['star', 'Star Number', 'text'], ['unit', 'Unit', 'text'], ['role', 'Role', 'select', ROLES]] },
    notifications: { title: 'Notifications', item: 'Notification', fields: [['date', 'Date', 'date'], ['name', 'Person Notified', 'text'], ['by', 'Notified By', 'text'], ['notes', 'Notes', 'wide']] },
    vehicles: { title: 'Vehicles', item: 'Vehicle', fields: [['year', 'Year', 'text'], ['make', 'Make', 'text'], ['model', 'Model', 'text'], ['color', 'Color', 'text'], ['plate', 'License Plate', 'text'], ['state', 'Plate State', 'text'], ['vin', 'VIN', 'text'], ['disposition', 'Impound / Tow', 'select', ['', 'Impound', 'Tow', 'Other']], ['notes', 'Owner and Notes', 'wide']] },
  };
  const PICKS = {
    victim: ['State of Illinois'],
    hair: ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Bald', 'Dyed'],
    eyes: ['Brown', 'Black', 'Blue', 'Green', 'Hazel', 'Gray'],
    // Street gangs often named in Chicago reports, then national and foreign gangs and cartels.
    gang: ['Gangster Disciples', 'Black Disciples', 'Black P. Stones', 'Vice Lords', 'Conservative Vice Lords', 'Traveling Vice Lords', 'Four Corner Hustlers', 'Mickey Cobras', 'New Breeds', 'Black Souls',
      'Latin Kings', 'Maniac Latin Disciples', 'Spanish Cobras', 'Satan Disciples', 'Two-Six', 'La Raza', 'Ambrose', 'Latin Counts', 'Imperial Gangsters', 'Insane Unknowns', 'Latin Dragons', 'Harrison Gents', 'Party People', 'Spanish Gangster Disciples', 'Latin Saints', 'Ashland Vikings',
      'MS-13', '18th Street', 'Sureños', 'Norteños', 'Barrio Azteca', 'Tren de Aragua', 'Sinaloa Cartel', 'CJNG - Jalisco New Generation Cartel', 'Gulf Cartel', 'Los Zetas', 'Juárez Cartel', 'Hells Angels', 'Outlaws MC', 'Aryan Brotherhood', 'Crips', 'Bloods'],
  };

  const EVIDENCE_TYPES = ['Narcotics', 'Currency', 'Personal Currency', 'Personal Property', 'Personal Jewelry', 'Jewelry', 'Electronics', 'Video/Audio', 'Photograph', 'Packaging', 'Other'];
  const DRUG_TYPES = ['Cannabis', 'Cocaine', 'Crack Cocaine', 'Heroin', 'Fentanyl', 'Methamphetamine', 'MDMA / Ecstasy', 'PCP', 'Oxycodone', 'Hydrocodone', 'Alprazolam', 'Ketamine', 'Psilocybin', 'LSD', 'Other Controlled Substance'];
  // Types saved before v1.20.
  const OLD_TYPES = { Narcotic: 'Narcotics', 'Personal property': 'Personal Property', 'Personal currency': 'Personal Currency', 'Recording (audio/video)': 'Video/Audio' };
  const FIELDS = SECTIONS.flatMap((s) => s.fields);

  const empty = () => ({ schema: 4, ...Object.fromEntries(FIELDS.map(([k, , kind]) => [k, kind === 'check' ? false : ''])), ...Object.fromEntries(Object.keys(LISTS).map((k) => [k, []])), evidence: [], narrative: '', hidden: [] });

  const blankItem = (list) => Object.fromEntries(LISTS[list].fields.map(([k]) => [k, '']));
  const filled = (item) => Object.values(item || {}).some((v) => String(v || '').trim());

  /** Saved data brought up to date: older type names, missing fields, and the single entries of
   * v1.20 (victim's name, charges, vehicle…) moved into the lists. */
  function normalize(data) {
    const src = data || {};
    const d = { ...empty(), ...src };
    d.evidence = (Array.isArray(d.evidence) ? d.evidence : []).map((e) => ({ number: e.number, inventory: e.inventory || '', type: OLD_TYPES[e.type] || e.type || '', drug: e.drug || '', weight: e.weight || '', description: e.description || '', photos: Array.isArray(e.photos) ? e.photos.filter((x) => typeof x === 'string') : [] }));
    // A v1.21 single Notifications line becomes the first notification.
    if (typeof src.notifications === 'string') d.notifications = String(src.notifications).trim() ? [{ notes: String(src.notifications).trim() }] : [];
    for (const k of Object.keys(LISTS)) d[k] = (Array.isArray(d[k]) ? d[k] : []).map((it) => ({ ...blankItem(k), ...(it && typeof it === 'object' ? it : {}) }));
    // v1.21's "Unit / Role" text goes to Unit when it isn't one of the roles.
    for (const p of d.personnel) if (p.role && !ROLES.includes(p.role)) { p.unit = p.unit || p.role; p.role = ''; }
    const old = (k) => String(src[k] || '').trim();
    if ((src.schema || 1) < 3) {
      if (!d.victimsList.length && (old('victimName') || old('victimDetails'))) d.victimsList.push({ ...blankItem('victimsList'), name: old('victimName') || old('victimDetails'), relation: old('victimRelation') });
      if (!d.offendersList.length && (old('offenderName') || old('offenderDetails'))) d.offendersList.push({ ...blankItem('offendersList'), name: old('offenderName') || old('offenderDetails'), relation: old('offenderRelation') });
      if (old('charges') && typeof src.charges === 'string') d.charges = [{ ...blankItem('charges'), description: old('charges') }];
      if (old('gangAffiliation')) d.gangs.push({ ...blankItem('gangs'), name: old('gangAffiliation') });
      if (old('notArrested') && typeof src.notArrested === 'string') d.notArrested = [{ ...blankItem('notArrested'), name: old('notArrested') }];
      if (old('personnel') && typeof src.personnel === 'string') d.personnel = [{ ...blankItem('personnel'), name: old('personnel') }];
      if (old('vehicle') || old('impound')) d.vehicles.push({ ...blankItem('vehicles'), notes: [old('vehicle'), old('impound')].filter(Boolean).join('; ') });
    }
    for (const k of ['victimName', 'victimRelation', 'victimDetails', 'offenderName', 'offenderRelation', 'offenderDetails', 'gangAffiliation', 'vehicle', 'impound', 'lieutenant', 'lieutenantStar']) delete d[k];
    d.hidden = Array.isArray(d.hidden) ? d.hidden.filter((x) => typeof x === 'string') : [];
    d.schema = 4;
    return d;
  }
  const isHidden = (d, id) => (d.hidden || []).includes(id);

  /** A photo's label under its exhibit: 1a, 1b … 1z, 1aa. */
  function photoLabel(n, j) {
    let x = j; let t = '';
    do { t = String.fromCharCode(97 + (x % 26)) + t; x = Math.floor(x / 26) - 1; } while (x >= 0);
    return `${n}${t}`;
  }

  /** Whole years from a date of birth to a day (both YYYY-MM-DD); '' when unknown. */
  function ageOn(dob, day) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ''); const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    if (!a || !b) return '';
    let n = Number(b[1]) - Number(a[1]);
    if (b[2] < a[2] || (b[2] === a[2] && b[3] < a[3])) n -= 1;
    return n >= 0 && n < 130 ? String(n) : '';
  }

  /** One list entry as text: "DOE, John, DOB 01.02.1990, 5'10\", 180 lbs, Black hair…" */
  function itemLine(list, it) {
    return LISTS[list].fields.map(([k, label, kind]) => {
      let v = String(it[k] || '').trim();
      if (!v) return '';
      if (kind === 'date') { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (m) v = `${m[2]}.${m[3]}.${m[1]}`; }
      return k === 'name' || k === 'statute' ? v : `${label}: ${v}`;
    }).filter(Boolean).join(', ');
  }

  // The Offender fields a suspect's More Info holds (Details → Suspects, v1.23): all but the three
  // on the suspect's own row (name, date of birth, age).
  const SUSPECT_INFO = PERSON.filter(([k]) => !['name', 'dob', 'age'].includes(k));
  const nameKey = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();

  /** A Details suspect copied into the report's Offenders: the offender with the same name is
   * updated (or an empty one filled, or a new one added). Only filled suspect fields overwrite.
   * Returns { index, added }, or null when the suspect has no name. */
  function suspectToOffender(d, s, day) {
    const name = String((s && s.name) || '').trim();
    if (!name) return null;
    const list = d.offendersList;
    let index = list.findIndex((o) => nameKey(o.name) === nameKey(name));
    let added = false;
    if (index < 0) index = list.findIndex((o) => !filled(o));
    if (index < 0) { list.push(blankItem('offendersList')); index = list.length - 1; added = true; }
    const o = list[index];
    o.name = name;
    if (s.dob) { o.dob = s.dob; o.age = ageOn(s.dob, day); }
    const info = (s && s.info) || {};
    for (const [k] of SUSPECT_INFO) if (String(info[k] || '').trim()) o[k] = String(info[k]).trim();
    return { index, added };
  }

  /** The next exhibit number: one more than the highest used in this case or any case sharing its agency case number. */
  function nextExhibit(numbersInUse) {
    const max = (numbersInUse || []).map((n) => parseInt(String(n).replace(/\D+/g, ''), 10)).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
    return max + 1;
  }

  const shown = (key, v) => {
    const f = FIELDS.find(([k]) => k === key);
    if (!f) return String(v || '');
    if (f[2] === 'check') return v ? 'Yes' : '';
    if (f[2] === 'date') { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? `${m[2]}.${m[3]}.${m[1]}` : String(v || ''); }
    return String(v == null ? '' : v).trim();
  };

  /** One exhibit as a line: "Exhibit 3, Inventory 123456: Narcotics, Cocaine, 12.4 g. Three bags…" */
  function exhibitLine(e) {
    const what = [e.type, e.type === 'Narcotics' ? e.drug : '', e.type === 'Narcotics' ? e.weight : ''].filter(Boolean).join(', ');
    return `Exhibit ${e.number}${e.inventory ? `, Inventory ${e.inventory}` : ''}: ${[what, e.description].filter(Boolean).join('. ') || 'no description'}`;
  }

  /** {{report.*}} values for templates; {{report.evidence}} is the exhibit list, one per line. */
  function context(data) {
    const d = normalize(data);
    const ctx = {};
    for (const [k] of FIELDS) ctx[`report.${k}`] = shown(k, d[k]);
    for (const k of Object.keys(LISTS)) ctx[`report.${k}`] = d[k].filter(filled).map((it) => itemLine(k, it)).join('\n');
    ctx['report.evidence'] = d.evidence.map(exhibitLine).join('\n');
    ctx['report.narrative'] = String(d.narrative || '').trim();
    return ctx;
  }

  /** The filled fields as plain lines, for the AI. Empty ones are left out. */
  function asText(data) {
    const d = normalize(data);
    const lines = [];
    for (const s of SECTIONS) {
      if (isHidden(d, s.id)) continue;
      for (const [k, label] of s.fields) { if (isHidden(d, k)) continue; const v = shown(k, d[k]); if (v) lines.push(`${label}: ${v.replace(/\s*\n\s*/g, '; ')}`); }
      for (const k of s.lists || []) for (const it of d[k].filter(filled)) lines.push(`${LISTS[k].item}: ${itemLine(k, it)}`);
    }
    if (!isHidden(d, 'evidence')) for (const e of d.evidence) lines.push(`Evidence ${exhibitLine(e)}`);
    if (!isHidden(d, 'summary') && String(d.narrative || '').trim()) lines.push(`Summary of investigation (the investigator's own words): ${String(d.narrative).trim()}`);
    return lines.join('\n');
  }

  /** A report (Markdown) made from the fields: a table per section, the evidence, the summary. */
  function toMarkdown(data, title = 'Supplementary Report') {
    const d = normalize(data);
    const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, '; ');
    const out = [`# ${title}`, ''];
    for (const s of SECTIONS) {
      if (isHidden(d, s.id)) continue;
      const rows = s.fields.filter(([k]) => !isHidden(d, k)).map(([k, label]) => [label, shown(k, d[k])]).filter(([, v]) => v);
      for (const k of s.lists || []) d[k].filter(filled).forEach((it, i) => rows.push([`${LISTS[k].item} ${i + 1}`, itemLine(k, it)]));
      if (!rows.length) continue;
      out.push(`## ${s.title}`, '', '| Field | Entry |', '|---|---|', ...rows.map(([l, v]) => `| ${l} | ${esc(v)} |`), '');
    }
    if (d.evidence.length && !isHidden(d, 'evidence')) {
      out.push('## Evidence Inventoried', '', '| Exhibit | Inventory Number | Type | Narcotic Type | Weight | Description |', '|---|---|---|---|---|---|',
        ...d.evidence.map((e) => `| ${e.number} | ${esc(e.inventory)} | ${esc(e.type)} | ${esc(e.type === 'Narcotics' ? e.drug : '')} | ${esc(e.type === 'Narcotics' ? e.weight : '')} | ${esc(e.description)} |`), '');
    }
    if (!isHidden(d, 'summary')) out.push('## Summary of Investigation', '', String(d.narrative || '').trim() || '[CONFIRM: summary of investigation]', '');
    return out.join('\n');
  }

  const PLACEHOLDERS = [...FIELDS.map(([k]) => `report.${k}`), ...Object.keys(LISTS).map((k) => `report.${k}`), 'report.evidence', 'report.narrative'];

  const api = { SECTIONS, FIELDS, LISTS, PICKS, ROLES, OPTIONAL_LINES, SUSPECT_INFO, suspectToOffender, ageOn, photoLabel, EXTRA_PARTS, EVIDENCE_TYPES, DRUG_TYPES, PLACEHOLDERS, empty, blankItem, filled, normalize, isHidden, nextExhibit, exhibitLine, itemLine, shown, context, asText, toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReportFields = api;
})(this);
