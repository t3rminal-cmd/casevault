/* CaseVault — case status rules, closing a case, and arrest details.
 *
 *   Open      You are actively working the case. (A new case starts here.)
 *   Pending   Waiting on someone else: lab results, a warrant signature, DA review, a subpoena
 *             return… CaseVault asks what you're waiting on and a follow-up date, and puts that
 *             date on the timeline so the case comes back to you.
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
    Pending: 'Pending: waiting on someone else, such as the lab, a warrant, the prosecutor or records. Set what you\'re waiting on and when to follow up.',
    Closed: 'Closed: the investigation is finished, with a disposition. Use "Close case…" to close it.',
    Archived: 'Archived: closed and moved to the archive, read-only.',
  };

  const PENDING_REASONS = [
    'Lab results', 'Warrant signature', 'Prosecutor / DA review', 'Subpoena or records return', 'Suspect not located',
    'Witness or victim contact', 'Another agency', 'Court date', 'Other',
  ];

  const DISPOSITIONS = [
    { key: 'arrest', label: 'Cleared by arrest', hint: 'At least one person arrested and charged. Fill in the Arrest details.' },
    { key: 'exceptional', label: 'Exceptionally cleared', hint: 'Offender known and enough to charge, but something outside your control prevents it.',
      reasons: ['Death of the offender', 'Prosecution declined', 'Victim refused to cooperate', 'Extradition denied', 'Juvenile, no custody', 'Other'] },
    { key: 'unfounded', label: 'Unfounded', hint: 'The investigation showed no offense occurred.' },
    { key: 'inactive', label: 'Inactive / no further leads', hint: 'Suspended until new information comes in. Can be reopened.' },
    { key: 'referred', label: 'Referred to another agency', hint: 'Handed to the agency with jurisdiction.' },
    { key: 'other', label: 'Other', hint: 'Explain in the closing note.' },
  ];
  const disposition = (key) => DISPOSITIONS.find((d) => d.key === key) || null;

  // The fields of an arrest report. type: text (default), date, time, select, textarea.
  const ARRESTEE_FIELDS = [
    { key: 'lastName', label: 'Last name' }, { key: 'firstName', label: 'First name' }, { key: 'middleName', label: 'Middle name' },
    { key: 'dob', label: 'Date of birth', type: 'date' },
    { key: 'sex', label: 'Sex', type: 'select', options: ['', 'Male', 'Female', 'Other', 'Unknown'] },
    { key: 'race', label: 'Race / ethnicity' }, { key: 'height', label: 'Height' }, { key: 'weight', label: 'Weight' },
    { key: 'hair', label: 'Hair' }, { key: 'eyes', label: 'Eyes' },
    { key: 'address', label: 'Address', type: 'textarea' }, { key: 'phone', label: 'Phone' },
    { key: 'idNumber', label: 'DL / ID number and state' },
  ];
  const ARREST_FIELDS = [
    { key: 'date', label: 'Arrest date', type: 'date' }, { key: 'time', label: 'Arrest time', type: 'time' },
    { key: 'location', label: 'Arrest location' },
    { key: 'type', label: 'Type of arrest', type: 'select', options: ['', 'On-view', 'Warrant', 'Summons / citation', 'Turned self in', 'Other'] },
    { key: 'warrantNumber', label: 'Warrant number' },
    { key: 'arrestingOfficer', label: 'Arresting officer' }, { key: 'assistingOfficers', label: 'Assisting officers' },
    { key: 'miranda', label: 'Miranda', type: 'select', options: ['', 'Given and waived', 'Given, rights invoked', 'Not given, no questioning', 'Not given'] },
    { key: 'mirandaTime', label: 'Miranda time', type: 'time' },
    { key: 'bookingNumber', label: 'Booking number' }, { key: 'facility', label: 'Booked into facility' }, { key: 'bond', label: 'Bond' },
  ];
  const CHARGE_FIELDS = [
    { key: 'statute', label: 'Statute / code' }, { key: 'description', label: 'Charge' },
    { key: 'level', label: 'Level', type: 'select', options: ['', 'Felony', 'Misdemeanor', 'Infraction / violation', 'Other'] },
    { key: 'degree', label: 'Degree / class' }, { key: 'counts', label: 'Counts' },
  ];

  const emptyCharge = () => Object.fromEntries(CHARGE_FIELDS.map((f) => [f.key, f.key === 'counts' ? '1' : '']));
  const emptyArrestee = () => ({
    ...Object.fromEntries([...ARRESTEE_FIELDS, ...ARREST_FIELDS].map((f) => [f.key, ''])),
    charges: [emptyCharge()], property: '', notes: '',
  });
  const emptyArrest = () => ({ schema: 1, arrestees: [emptyArrestee()] });

  const clean = (s) => String(s == null ? '' : s).trim();
  const arresteeName = (a) => [a.firstName, a.middleName, a.lastName].map(clean).filter(Boolean).join(' ');

  function chargesText(charges) {
    return (charges || []).filter((c) => clean(c.statute) || clean(c.description)).map((c, i) => {
      const extra = [[clean(c.level), clean(c.degree)].filter(Boolean).join(', '), Number(c.counts) > 1 ? `${Number(c.counts)} counts` : ''].filter(Boolean).join('; ');
      return `${i + 1}. ${[clean(c.statute), clean(c.description)].filter(Boolean).join(' — ')}${extra ? ` (${extra})` : ''}`;
    }).join('\n');
  }

  const US = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso)); return m ? `${m[2]}/${m[3]}/${m[1]}` : clean(iso); };

  /** {{arrest.*}} values: the first arrestee as arrest.x, every arrestee as arrest.N.x. */
  function arrestContext(arrest) {
    const ctx = {};
    const list = (arrest && arrest.arrestees) || [];
    list.forEach((a, i) => {
      const put = (k, v) => { ctx[`arrest.${i + 1}.${k}`] = v; if (i === 0) ctx[`arrest.${k}`] = v; };
      put('name', arresteeName(a));
      put('description', [clean(a.sex), clean(a.race), clean(a.height), clean(a.weight), clean(a.hair) && `${clean(a.hair)} hair`, clean(a.eyes) && `${clean(a.eyes)} eyes`].filter(Boolean).join(', '));
      put('dob', US(a.dob)); put('date', US(a.date));
      for (const f of [...ARRESTEE_FIELDS, ...ARREST_FIELDS]) if (!['dob', 'date'].includes(f.key)) put(f.key, clean(a[f.key]));
      put('charges', chargesText(a.charges));
      put('property', clean(a.property)); put('notes', clean(a.notes));
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

  /** The timeline deadline that brings a Pending case back: "Follow up: Lab results". */
  function followUpEvent(reason, detail, date, id) {
    return { id, kind: 'deadline', date, time: '', title: `Follow up: ${[clean(reason), clean(detail)].filter(Boolean).join(' — ')}`, note: 'Added when the case was set to Pending.', done: false };
  }

  /** People named in the arrest details, for the privacy scan (names CaseVault always hides). */
  const peopleOf = (arrest) => ((arrest && arrest.arrestees) || []).map(arresteeName).filter(Boolean);

  const api = {
    STATUS_HELP, PENDING_REASONS, DISPOSITIONS, disposition, ARRESTEE_FIELDS, ARREST_FIELDS, CHARGE_FIELDS,
    emptyArrest, emptyArrestee, emptyCharge, arresteeName, chargesText, arrestContext, closureContext, closeChecklist, followUpEvent, peopleOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVClosing = api;
})(this);
