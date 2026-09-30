/* CaseVault — Report Fields: the facts an incident / case report asks for, entered once per case
 * in Reports → Report Fields and kept in the case folder as report-fields.json.
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
  // [key, label, kind, options/hint]. kind: text, number, date, time, select, yesno, textarea, ucr, location.
  const SECTIONS = [
    { title: 'Incident', icon: 'file-earmark-text', fields: [
      ['caseNumber', 'Case number', 'text'],
      ['offense', 'Offense classification', 'text'],
      ['ucr', 'UCR code', 'ucr'],
      ['address', 'Address of occurrence', 'text'],
      ['locationType', 'Location type', 'text'],
      ['locationCode', 'Location code', 'location'],
      ['date', 'Date of occurrence', 'date'],
      ['time', 'Time of occurrence', 'time'],
      ['beatOccurrence', 'Beat of occurrence', 'text'],
      ['beatAssigned', 'Beat assigned', 'text'],
      ['activity', 'Activity', 'select', ['', 'Purchase', 'Surveillance', 'Investigation', 'Correction']],
      ['operation', 'Operation / mission', 'text'],
      ['method', 'Method assigned', 'select', ['', 'Field', 'Supervisor', 'On View', 'OEMC']],
      ['unit', 'Unit (number)', 'text'],
    ] },
    { title: 'People', icon: 'people', fields: [
      ['victims', 'Victims (number)', 'number'],
      ['victimName', 'Victim name', 'text'],
      ['victimRelation', 'Victim relation (code)', 'text'],
      ['offenders', 'Offenders (number)', 'number'],
      ['offenderName', 'Offender name', 'text'],
      ['offenderRelation', 'Offender relation (code)', 'text'],
      ['arrested', 'Number arrested', 'number'],
      ['arrestUnit', 'Arrest unit', 'text'],
      ['adults', 'Adults (number)', 'number'],
      ['juveniles', 'Juveniles (number)', 'number'],
      ['fire', 'Fire', 'yesno'],
      ['gang', 'Gang', 'yesno'],
      ['notArrested', 'Person(s) not arrested', 'textarea'],
      ['personnel', 'Police personnel on scene', 'textarea'],
    ] },
    { title: 'Evidence and money', icon: 'box-seam', fields: [
      ['totalWeight', 'Total weight', 'text'],
      ['streetValue', 'Street value', 'text'],
      ['purchasePrice', 'Purchase price', 'text'],
      ['fundSheet', 'Fund sheet', 'text'],
      ['evidenceOfficer', 'Evidence officer', 'text'],
    ] },
    { title: 'Vehicle', icon: 'car-front', fields: [
      ['vehicle', 'Vehicle information', 'textarea'],
      ['impound', 'Vehicle impound / towed', 'text'],
    ] },
    { title: 'Court and approvals', icon: 'bank2', fields: [
      ['courtBranch', 'Court branch', 'text'],
      ['courtDate', 'Court date', 'date'],
      ['charges', 'Charges', 'textarea'],
      ['judge', 'Judge approving', 'text'],
      ['searchWarrant', 'Search warrant', 'text'],
      ['asa', 'ASA approving', 'text'],
      ['notifications', 'Notifications', 'textarea'],
    ] },
  ];
  const EVIDENCE_TYPES = ['Narcotic', 'Personal property', 'Personal currency', 'Currency', 'Recording (audio/video)', 'Photograph', 'Other'];
  const FIELDS = SECTIONS.flatMap((s) => s.fields);

  const empty = () => ({ schema: 1, ...Object.fromEntries(FIELDS.map(([k]) => [k, ''])), evidence: [], narrative: '' });

  /** The next exhibit number: one more than the highest used in this case or any case sharing its agency case number. */
  function nextExhibit(numbersInUse) {
    const max = (numbersInUse || []).map((n) => parseInt(String(n).replace(/\D+/g, ''), 10)).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
    return max + 1;
  }

  const shown = (key, v) => {
    const f = FIELDS.find(([k]) => k === key);
    if (!f) return String(v || '');
    if (f[2] === 'date') { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? `${m[2]}.${m[3]}.${m[1]}` : String(v || ''); }
    return String(v == null ? '' : v).trim();
  };

  /** {{report.*}} values for templates; {{report.evidence}} is the exhibit list, one per line. */
  function context(data) {
    const d = { ...empty(), ...(data || {}) };
    const ctx = {};
    for (const [k] of FIELDS) ctx[`report.${k}`] = shown(k, d[k]);
    ctx['report.evidence'] = (d.evidence || []).map((e) => `Exhibit ${e.number}: ${e.description || '(no description)'}${e.type ? ` (${e.type})` : ''}`).join('\n');
    ctx['report.narrative'] = String(d.narrative || '').trim();
    return ctx;
  }

  /** The filled fields as plain lines, for the AI. Empty ones are left out. */
  function asText(data) {
    const d = { ...empty(), ...(data || {}) };
    const lines = [];
    for (const [k, label] of FIELDS) { const v = shown(k, d[k]); if (v) lines.push(`${label}: ${v.replace(/\s*\n\s*/g, '; ')}`); }
    for (const e of d.evidence || []) lines.push(`Evidence exhibit ${e.number}: ${e.description || ''}${e.type ? ` (${e.type})` : ''}`);
    if (String(d.narrative || '').trim()) lines.push(`Narrative (the investigator's own words): ${String(d.narrative).trim()}`);
    return lines.join('\n');
  }

  /** A report (Markdown) made from the fields: a table per section, the evidence, the narrative. */
  function toMarkdown(data, title = 'Case Report') {
    const d = { ...empty(), ...(data || {}) };
    const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, '; ');
    const out = [`# ${title}`, ''];
    for (const s of SECTIONS) {
      const rows = s.fields.map(([k, label]) => [label, shown(k, d[k])]).filter(([, v]) => v);
      if (!rows.length) continue;
      out.push(`## ${s.title}`, '', '| Field | Entry |', '|---|---|', ...rows.map(([l, v]) => `| ${l} | ${esc(v)} |`), '');
    }
    if ((d.evidence || []).length) {
      out.push('## Evidence inventoried', '', '| Exhibit | Description | Type |', '|---|---|---|',
        ...d.evidence.map((e) => `| ${e.number} | ${esc(e.description || '')} | ${esc(e.type || '')} |`), '');
    }
    out.push('## Narrative', '', String(d.narrative || '').trim() || '[CONFIRM: narrative]', '');
    return out.join('\n');
  }

  const PLACEHOLDERS = [...FIELDS.map(([k]) => `report.${k}`), 'report.evidence', 'report.narrative'];

  const api = { SECTIONS, FIELDS, EVIDENCE_TYPES, PLACEHOLDERS, empty, nextExhibit, context, asText, toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReportFields = api;
})(this);
