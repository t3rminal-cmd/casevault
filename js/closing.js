/* CaseVault — case status rules, closing a case, and arrest details.
 *
 *   Open      You are actively working the case. (A new case starts here.)
  *             (v1.105: there is no Pending. Waiting on a lab or the DA is Open, with a deadline
 *             on the timeline.)
 *   Closed    The investigation is finished, with a disposition (cleared by arrest, exceptionally
 *             cleared, unfounded, inactive, referred…). Set through "Close case…", which also
 *             lists loose ends (open deadlines, open check flags, [CONFIRM: …] left in drafts).
 *   Archived  Closed and out of the way: moved to archive/, read-only (see vault.js).
 *
 * Arrest details (arrestee, arrest, charges) are kept in cases/<id>/arrest.json and fill the
 * {{arrest.*}} placeholders in templates, for arrest reports.
 *
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const STATUS_HELP = {
    Open: 'Open: you are actively working this case.',
    Closed: 'Closed: the investigation is finished, with a disposition. Use "Close case…" to close it.',
    Archived: 'Archived: closed and moved to the archive, read-only.',
  };

  const DISPOSITIONS = [
    { key: 'arrest', label: 'Cleared by arrest', hint: 'At least one person arrested and charged. Fill in the Arrest details.' },
    { key: 'exceptional', label: 'Exceptionally cleared', hint: 'Offender known and enough to charge, but something outside your control prevents it.',
      reasons: ['Death of the offender', 'Prosecution declined', 'Victim refused to cooperate', 'Extradition denied', 'Juvenile, no custody', 'Other'] },
    { key: 'unfounded', label: 'Unfounded', hint: 'The investigation showed no offense occurred.' },
    { key: 'inactive', label: 'Inactive / no further leads', hint: 'Nothing left to work and nothing to wait for: closed until new information comes in. Can be reopened. (Waiting on a lab or the DA: keep it Open, with a deadline on the Timeline.)' },
    { key: 'referred', label: 'Referred to another agency', hint: 'Handed to the agency with jurisdiction.' },
    { key: 'other', label: 'Other', hint: 'Explain in the closing note.' },
  ];
  const disposition = (key) => DISPOSITIONS.find((d) => d.key === key) || null;

  // The fields of an arrest report (v1.30: laid out like an arrest report: the report numbers,
  // Offender, Incident, Charges, Recovered Narcotics, Warrant, Victim and Complainant, Arrestee
  // Vehicle, Properties, Incident Narrative, Court and Bond, Reporting Personnel). One report per
  // arrestee. type: text (default), date, time, select, textarea, yn (Yes / No).
  // Keys from before v1.30 are kept, so older arrest.json files and {{arrest.*}} still work.
  const SEX = ['', 'Male', 'Female', 'Other', 'Unknown'];
  const NUMBER_FIELDS = [
    { key: 'bookingNumber', label: 'CB #' }, { key: 'irNumber', label: 'IR #' }, { key: 'ydNumber', label: 'YD #' },
    { key: 'rdNumber', label: 'RD #' }, { key: 'eventNumber', label: 'Event #' },
  ];
  const ARRESTEE_FIELDS = [
    { key: 'lastName', label: 'Last name' }, { key: 'firstName', label: 'First name' }, { key: 'middleName', label: 'Middle name' },
    { key: 'address', label: 'Residence', type: 'textarea' }, { key: 'beatResidence', label: 'Beat' },
    { key: 'dob', label: 'Date of birth', type: 'date' }, { key: 'pob', label: 'Place of birth' },
    { key: 'idNumber', label: 'Driver\'s licence no. (DLN)' }, { key: 'armedWith', label: 'Armed with' },
    { key: 'ssn', label: 'SSN', format: 'ssn' }, { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'sex', label: 'Sex', type: 'select', options: SEX },
    { key: 'race', label: 'Race / ethnicity' }, { key: 'height', label: 'Height' }, { key: 'weight', label: 'Weight' },
    { key: 'eyes', label: 'Eyes' }, { key: 'hair', label: 'Hair' }, { key: 'hairStyle', label: 'Hair style' }, { key: 'complexion', label: 'Complexion' },
  ];
  const INCIDENT_FIELDS = [
    { key: 'date', label: 'Arrest date', type: 'date' }, { key: 'time', label: 'Arrest time', type: 'time' },
    { key: 'location', label: 'Location', type: 'textarea' }, { key: 'beat', label: 'Beat' },
    { key: 'facility', label: 'Holding facility' },
    { key: 'type', label: 'Type of arrest', type: 'select', options: ['', 'On-view', 'Warrant', 'Summons / citation', 'Turned self in', 'Other'] },
    { key: 'resisted', label: 'Resisted arrest?', type: 'yn' }, { key: 'cma', label: 'Declared CMA incident?', type: 'yn' },
    { key: 'trr', label: 'TRR completed?', type: 'yn' }, { key: 'totalArrested', label: 'Total no. arrested' },
    { key: 'coArrests', label: 'Co-arrests' }, { key: 'assocCases', label: 'Associated cases' },
    { key: 'dcfsWard', label: 'DCFS ward?', type: 'yn' }, { key: 'dependentChildren', label: 'Dependent children?', type: 'yn' },
    { key: 'miranda', label: 'Miranda', type: 'select', options: ['', 'Given and waived', 'Given, rights invoked', 'Not given, no questioning', 'Not given'] },
    { key: 'mirandaTime', label: 'Miranda time', type: 'time' },
  ];
  const VEHICLE_FIELDS = [
    { key: 'vehYear', label: 'Year' }, { key: 'vehMake', label: 'Make' }, { key: 'vehModel', label: 'Model' }, { key: 'vehStyle', label: 'Body style' },
    { key: 'vehColor', label: 'Color' }, { key: 'vin', label: 'VIN' }, { key: 'plate', label: 'Licence plate' }, { key: 'plateState', label: 'State' },
    { key: 'impounded', label: 'Vehicle impounded?', type: 'yn' }, { key: 'poundNumber', label: 'Pound #' }, { key: 'vehInventory', label: 'Inv #' },
    { key: 'vehDisposition', label: 'Disposition' },
  ];
  const COURT_FIELDS = [
    { key: 'desiredCourtDate', label: 'Desired court date', type: 'date' }, { key: 'courtBranch', label: 'Branch' },
    { key: 'courtSgt', label: 'Court sergeant handle?', type: 'yn' },
    { key: 'initialCourtDate', label: 'Initial court date', type: 'date' }, { key: 'initialBranch', label: 'Branch' },
    { key: 'docket', label: 'Docket #' },
  ];
  const BOND_FIELDS = [
    { key: 'bondDate', label: 'Bond date', type: 'date' }, { key: 'bondTime', label: 'Bond time', type: 'time' },
    { key: 'bondType', label: 'Type' }, { key: 'bondReceipt', label: 'Receipt #' }, { key: 'bond', label: 'Amount' },
  ];
  const PERSONNEL_FIELDS = [
    { key: 'attestingOfficer', label: 'Attesting officer' }, { key: 'attestingStar', label: 'Star #' },
    { key: 'attestingDate', label: 'Date', type: 'date' }, { key: 'attestingTime', label: 'Time', type: 'time' },
    { key: 'arrestingOfficer', label: '1st arresting officer' }, { key: 'arrestingStar', label: 'Star #' }, { key: 'arrestingBeat', label: 'Beat' },
    { key: 'secondOfficer', label: 'Second arresting officer' }, { key: 'secondStar', label: 'Star #' }, { key: 'secondBeat', label: 'Beat' },
    { key: 'assistingOfficers', label: 'Assisting officers' },
    { key: 'supervisor', label: 'Approving supervisor' }, { key: 'supervisorStar', label: 'Star #' },
    { key: 'approvalDate', label: 'Date', type: 'date' }, { key: 'approvalTime', label: 'Time', type: 'time' },
  ];
  // Every one-value field; ARREST_FIELDS is everything but the offender's own (kept as before).
  const ARREST_FIELDS = [...NUMBER_FIELDS, ...INCIDENT_FIELDS, ...VEHICLE_FIELDS, ...COURT_FIELDS, ...BOND_FIELDS, ...PERSONNEL_FIELDS,
    { key: 'warrantNumber', label: 'Warrant number' }];

  // Lists, one entry per row on the report.
  const CHARGE_FIELDS = [
    { key: 'statute', label: 'Offense as cited' }, { key: 'description', label: 'Charge' },
    { key: 'degree', label: 'Class' },
    { key: 'level', label: 'Type', type: 'select', options: ['', 'Felony', 'Misdemeanor', 'Infraction / violation', 'Other'] },
    { key: 'counts', label: 'Counts' }, { key: 'victim', label: 'Victim' },
  ];
  const NARCOTIC_FIELDS = [
    { key: 'drug', label: 'Narcotic' }, { key: 'amount', label: 'Amount' },
    { key: 'unit', label: 'Unit', type: 'select', options: ['', 'g', 'kg', 'oz', 'lb', 'pills', 'units', 'ml'] },
    { key: 'inventory', label: 'Inventory #' }, { key: 'description', label: 'Description' },
  ];
  const WARRANT_FIELDS = [
    { key: 'number', label: 'Warrant #' },
    { key: 'kind', label: 'Type', type: 'select', options: ['', 'Arrest warrant', 'Bench warrant', 'Investigative alert', 'Other'] },
    { key: 'issuedBy', label: 'Issued by' }, { key: 'issued', label: 'Date issued', type: 'date' }, { key: 'offense', label: 'Offense' },
  ];
  const NON_OFFENDER_FIELDS = [
    { key: 'role', label: 'Role', type: 'select', options: ['Victim', 'Complainant', 'Victim and complainant', 'Witness'] },
    { key: 'name', label: 'Name' }, { key: 'address', label: 'Residence', type: 'textarea' }, { key: 'beat', label: 'Beat' },
    { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'employer', label: 'Employer address', type: 'textarea' }, { key: 'employerBeat', label: 'Employer beat' },
    { key: 'sex', label: 'Sex', type: 'select', options: SEX }, { key: 'race', label: 'Race / ethnicity' },
    { key: 'dob', label: 'Date of birth', type: 'date' },
    { key: 'injured', label: 'Injured?', type: 'yn' }, { key: 'deceased', label: 'Deceased?', type: 'yn' },
    { key: 'hospitalized', label: 'Hospitalized?', type: 'yn' }, { key: 'treated', label: 'Treated and released?', type: 'yn' },
    { key: 'comments', label: 'Comments', type: 'textarea' },
  ];
  const LISTS = {
    charges: { fields: CHARGE_FIELDS, item: 'Charge', none: '' },
    narcotics: { fields: NARCOTIC_FIELDS, item: 'Narcotic', none: 'No narcotics recovered' },
    warrants: { fields: WARRANT_FIELDS, item: 'Warrant', none: 'No warrant identified' },
    nonOffenders: { fields: NON_OFFENDER_FIELDS, item: 'Person', none: 'None' },
  };

  const blank = (fields) => Object.fromEntries(fields.map((f) => [f.key, f.key === 'counts' ? '1' : f.key === 'role' ? 'Victim' : '']));
  const emptyCharge = () => blank(CHARGE_FIELDS);
  const emptyItem = (list) => (list === 'charges' ? emptyCharge() : blank(LISTS[list].fields));
  const emptyArrestee = () => ({
    ...Object.fromEntries([...ARRESTEE_FIELDS, ...ARREST_FIELDS].map((f) => [f.key, ''])),
    photo: '', charges: [emptyCharge()], narcotics: [], warrants: [], nonOffenders: [], property: '', narrative: '', notes: '',
  });
  const emptyArrest = () => ({ schema: 2, arrestees: [emptyArrestee()] });

  /** An arrestee from any version: missing fields added; a warrant number from before v1.30 becomes a
   * Warrant entry; the old Notes become the Incident Narrative. */
  function normalizeArrestee(a) {
    const out = { ...emptyArrestee(), ...(a || {}) };
    for (const k of Object.keys(LISTS)) out[k] = Array.isArray(out[k]) ? out[k].map((x) => ({ ...emptyItem(k), ...(x || {}) })) : [];
    if (!out.charges.length) out.charges = [emptyCharge()];
    if (clean(out.warrantNumber) && !out.warrants.some((w) => clean(w.number) === clean(out.warrantNumber))) out.warrants.push({ ...emptyItem('warrants'), number: clean(out.warrantNumber) });
    if (!clean(out.narrative) && clean(out.notes)) { out.narrative = out.notes; out.notes = ''; }
    return out;
  }
  const normalizeArrest = (arrest) => ({ schema: 2, arrestees: ((arrest && arrest.arrestees) || []).map(normalizeArrestee) });
  const itemFilled = (it) => !!it && Object.entries(it).some(([k, v]) => k !== 'counts' && k !== 'role' && clean(v));

  /** Age in whole years on a day (both YYYY-MM-DD); '' when unknown. */
  function ageOn(dob, day) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(dob)); const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(day));
    if (!a || !b) return '';
    let n = Number(b[1]) - Number(a[1]);
    if (b[2] < a[2] || (b[2] === a[2] && b[3] < a[3])) n -= 1;
    return n >= 0 && n < 130 ? String(n) : '';
  }

  const clean = (s) => String(s == null ? '' : s).trim();
  const arresteeName = (a) => [a.firstName, a.middleName, a.lastName].map(clean).filter(Boolean).join(' ');

  function chargesText(charges) {
    return (charges || []).filter((c) => clean(c.statute) || clean(c.description)).map((c, i) => {
      const extra = [[clean(c.level), clean(c.degree)].filter(Boolean).join(', '), Number(c.counts) > 1 ? `${Number(c.counts)} counts` : ''].filter(Boolean).join('; ');
      return `${i + 1}. ${[clean(c.statute), clean(c.description)].filter(Boolean).join(' — ')}${extra ? ` (${extra})` : ''}`;
    }).join('\n');
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The long date, as everywhere in CaseVault (v1.32): "September 30, 2026".
  const US = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso)); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[3]}, ${m[1]}` : clean(iso); };

  /** {{arrest.*}} values: the first arrestee as arrest.x, every arrestee as arrest.N.x. */
  function arrestContext(arrest) {
    const ctx = {};
    const list = (arrest && arrest.arrestees) || [];
    list.forEach((a, i) => {
      const put = (k, v) => { ctx[`arrest.${i + 1}.${k}`] = v; if (i === 0) ctx[`arrest.${k}`] = v; };
      put('name', arresteeName(a));
      put('description', [clean(a.sex), clean(a.race), clean(a.height), clean(a.weight), clean(a.hair) && `${clean(a.hair)} hair`, clean(a.eyes) && `${clean(a.eyes)} eyes`].filter(Boolean).join(', '));
      const n = normalizeArrestee(a);
      for (const f of [...ARRESTEE_FIELDS, ...ARREST_FIELDS]) put(f.key, f.type === 'date' ? US(n[f.key]) : clean(n[f.key]));
      put('age', ageOn(n.dob, n.date));
      put('charges', chargesText(n.charges));
      put('vehicle', [n.vehYear, n.vehMake, n.vehModel, n.vehStyle].map(clean).filter(Boolean).join(' '));
      put('narcotics', n.narcotics.filter(itemFilled).map((x) => [clean(x.drug), [clean(x.amount), clean(x.unit)].filter(Boolean).join(' '), clean(x.inventory) && `Inv. ${clean(x.inventory)}`].filter(Boolean).join(', ')).join('\n'));
      put('warrants', n.warrants.filter(itemFilled).map((x) => [clean(x.number), clean(x.kind), clean(x.offense)].filter(Boolean).join(', ')).join('\n'));
      if (!clean(n.warrantNumber) && n.warrants[0]) put('warrantNumber', clean(n.warrants[0].number));
      put('property', clean(n.property)); put('narrative', clean(n.narrative)); put('notes', clean(n.narrative || n.notes));
    });
    ctx['arrest.count'] = String(list.filter((a) => arresteeName(a)).length);
    ctx['arrest.names'] = list.map(arresteeName).filter(Boolean).join('; ');
    return ctx;
  }

  /** {{closure.*}} values from case.json's closure. */
  function closureContext(closure) {
    const c = closure || {};
    const d = disposition(c.disposition);
    return { 'closure.disposition': d ? d.label : '', 'closure.reason': clean(c.reason), 'closure.date': US(c.date), 'closure.note': clean(c.note) };
  }

  /**
   * Loose ends before closing: { timeline, checks: [{ open }], drafts: [{ title, confirm }] } ->
   * [{ kind, text }]. Nothing here stops a case from closing; it's a reminder.
   */
  function closeChecklist({ timeline = { events: [] }, checks = [], drafts = [] } = {}) {
    const out = [];
    const open = (timeline.events || []).filter((e) => e.kind === 'deadline' && !e.done);
    if (open.length) out.push({ kind: 'deadlines', text: `${open.length} open deadline${open.length === 1 ? '' : 's'} on the timeline: ${open.slice(0, 3).map((e) => e.title || e.date).join('; ')}${open.length > 3 ? '…' : ''}. Mark them done or delete them.` });
    const flags = checks.reduce((n, k) => n + (Number(k.open) || 0), 0);
    if (flags) out.push({ kind: 'flags', text: `${flags} consistency check flag${flags === 1 ? ' is' : 's are'} still open.` });
    const confirm = drafts.filter((d) => d.confirm > 0);
    if (confirm.length) out.push({ kind: 'confirm', text: `[CONFIRM: …] still in ${confirm.map((d) => `"${d.title}" (${d.confirm})`).join(', ')}.` });
    return out;
  }

  /** People named in the arrest details, for the privacy scan (names CaseVault always hides). */
  const peopleOf = (arrest) => ((arrest && arrest.arrestees) || []).map(arresteeName).filter(Boolean);

  const api = {
    STATUS_HELP, DISPOSITIONS, disposition, ARRESTEE_FIELDS, ARREST_FIELDS, CHARGE_FIELDS,
    NUMBER_FIELDS, INCIDENT_FIELDS, VEHICLE_FIELDS, COURT_FIELDS, BOND_FIELDS, PERSONNEL_FIELDS, NARCOTIC_FIELDS, WARRANT_FIELDS, NON_OFFENDER_FIELDS, LISTS,
    emptyArrest, emptyArrestee, emptyCharge, emptyItem, normalizeArrest, normalizeArrestee, itemFilled, ageOn, arresteeName, chargesText, arrestContext, closureContext, closeChecklist, peopleOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVClosing = api;
})(this);
