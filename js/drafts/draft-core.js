/* CaseVault drafts — file format, placeholders and templates. Pure functions (no DOM), also used by the tests.
 *
 * A draft is a Markdown file: cases/<case-id>/drafts/<slug>.md
 * Its details (title, type, whether AI wrote it) live in an HTML comment on the first line, so the
 * file stays a normal Markdown document that any editor can open:
 *
 *   <!-- casevault-draft {"title":"Affidavit for search warrant","type":"affidavit","ai":true} -->
 *
 *   # AFFIDAVIT ...
 */
'use strict';

(function (root) {
  const META_RE = /^<!-- casevault-draft (\{.*?\}) -->\r?\n?(\r?\n)?/;
  const CONFIRM_RE = /\[CONFIRM:\s*([^\]\n]*)\]/g;

  const DOC_TYPES = {
    linkchart: { // v1.59: a Link Chart saved to the case (its PDF is in Files → Link Charts)
      label: 'Link Chart',
      guide: 'A link chart of the people in the case and how they connect.',
    },
    summary: {
      label: 'Case Summary',
      guide: 'A case summary: an overview paragraph, the parties involved, a dated chronology of key events, the evidence and documents, and open questions.',
    },
    supplemental: {
      label: 'Supplemental Report',
      guide: 'A police supplemental (supplementary) report: the case, event and report numbers, the offense and where and when it happened, the victims and offenders with their descriptions, the charges, then the narrative in the first person and in time order (what was done, seen and recovered), the evidence inventoried with exhibit and inventory numbers, narcotics with type, weight, purchase price and street value, the personnel on scene, notifications, and the reporting officer. Use [CONFIRM: ...] for anything not in the case material.',
    },
    affidavit: {
      label: 'Affidavit',
      guide: 'A sworn affidavit written in the first person by the affiant, with numbered paragraphs that state the facts in time order. Every fact must come from the case material. End with signature and jurat placeholders.',
    },
    subpoena: {
      label: 'Subpoena',
      guide: 'A subpoena: court and case caption, the person or custodian it is addressed to, what they must do (appear and/or produce records), the date, time and place, and the issuing party. Use placeholders for anything not in the material.',
    },
    memo: {
      label: 'Memo',
      guide: 'An internal memo with a To / From / Date / Re header, then purpose, relevant facts, and recommended next steps.',
    },
    dea6: {
      label: 'DEA Style', // v1.48 (was "DEA 6")
      guide: 'A DEA-6 style Report of Investigation: header lines (File No., File Title, G-DEP Identifier, Program Code, By, At, Date Prepared), SYNOPSIS, DETAILS in numbered paragraphs in time order, and INDEXING of every person, business, vehicle and telephone number mentioned.',
    },
    dea7: {
      label: 'DEA 7',
      guide: 'A DEA-7 style report of drug property collected, purchased or seized: for each exhibit its number, description, packaging, gross weight, how and when it was obtained, where, by whom, the chain of custody, and the laboratory it was submitted to.',
    },
    dea7a: {
      label: 'DEA 7a',
      guide: 'A DEA-7a style report of non-drug property or evidence collected or seized (money, documents, phones, firearms, vehicles): for each exhibit its number, a description, how, when and where it was obtained, by whom, the chain of custody, and where it is stored.',
    },
    dea202: {
      label: 'DEA 202',
      guide: 'A DEA-202 style personal history: the subject\'s name and aliases, date and place of birth, identifying numbers, physical description, addresses, telephone numbers, vehicles, employment, associates, criminal history and remarks. Only facts from the material; [CONFIRM: ...] for the rest.',
    },
    complaint: {
      label: 'Criminal Complaint',
      guide: 'A criminal complaint that follows the reference complaint form\'s layout and statutory wording: the caption, the defendant, the offense charged with its statute citation, the date and place, the substance and its weight, and the complainant\'s signature and verification. Use [CONFIRM: ...] for anything not in the case material.',
    },
    other: { label: 'Other', guide: 'A clear, well-structured document.' },
  };

  /** The document type a template's file name or title suggests (DEA 6 sample -> dea6). */
  function docTypeOf(name) {
    const n = String(name || '').toLowerCase();
    if (/dea[\s_-]?6(?![0-9])/.test(n)) return 'dea6';
    if (/dea[\s_-]?7a/.test(n)) return 'dea7a';
    if (/dea[\s_-]?7(?![0-9a])/.test(n)) return 'dea7';
    if (/dea[\s_-]?202/.test(n)) return 'dea202';
    return Object.keys(DOC_TYPES).find((k) => k !== 'other' && n.includes(k)) || 'other';
  }

  /* ---------------- file format ---------------- */

  function parseDraft(text) {
    const src = String(text || '');
    const m = META_RE.exec(src);
    if (!m) return { meta: {}, body: src };
    let meta = {};
    try { meta = JSON.parse(m[1]); } catch { meta = {}; }
    return { meta: meta && typeof meta === 'object' ? meta : {}, body: src.slice(m[0].length) };
  }

  function serializeDraft(meta, body) {
    // "--" can't appear inside an HTML comment; JSON never needs it, but a title could contain it.
    const json = JSON.stringify(meta || {}).replace(/--/g, '-\\u002d');
    return `<!-- casevault-draft ${json} -->\n\n${String(body || '').replace(/^\s*\n/, '')}`;
  }

  function slugify(title) {
    const s = String(title || '')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 60).replace(/-+$/, '');
    return s || 'draft';
  }

  /* ---------------- placeholders ---------------- */

  /** Every [CONFIRM: ...] in the text, with its position and line number, in order. */
  function extractPlaceholders(text) {
    const src = String(text || '');
    const out = [];
    CONFIRM_RE.lastIndex = 0;
    let m;
    while ((m = CONFIRM_RE.exec(src))) {
      out.push({ text: m[0], label: m[1].trim() || '(unspecified)', start: m.index, end: m.index + m[0].length, line: src.slice(0, m.index).split('\n').length });
    }
    return out;
  }

  /* ---------------- templates ---------------- */

  /* ---------------- LEO partners (v1.26) ---------------- */

  // v1.33: Secret Service (USSS) and ICE added; USPIS stays just before Local PD and Sheriff.
  // Federal agencies first, then state and local ones, then Other (v1.34: ATF, U.S. Marshals and State PD added).
  const PARTNER_AGENCIES = ['DEA', 'FBI', 'ATF', 'USMS', 'IRS', 'CBP', 'HSI', 'ICE', 'USSS', 'USPIS', 'State PD', 'Local PD', 'Sheriff Dept', 'Other'];
  /** "DEA, USPIS, Local PD (Evanston Police Department)" from [{ agency, name }]. */
  function partnersText(list) {
    const out = [];
    const agencies = [...new Set([...PARTNER_AGENCIES, ...(list || []).map((p) => p && p.agency).filter(Boolean)])];
    for (const a of agencies) {
      const mine = (list || []).filter((p) => p && p.agency === a);
      if (!mine.length) continue;
      const names = mine.map((p) => String(p.name || '').trim()).filter(Boolean);
      out.push(names.length ? `${a} (${names.join(', ')})` : a);
    }
    return out.join(', ');
  }

  function longDate(d) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const AFFIANT_FIELDS = ['name', 'title', 'agency', 'address', 'phone', 'email'];
  // v1.36: Primary (was "Main"; a saved Main reads as Primary).
  const SUSPECT_ROLES = ['Primary', 'Secondary', 'Other'];
  const isPrimary = (r) => r === 'Primary' || r === 'Main';

  /** Age in whole years on `now` from a "YYYY-MM-DD" date of birth; null if there is none. */
  function ageOn(dob, now = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    let age = now.getFullYear() - y;
    if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
    return age >= 0 && age < 130 ? age : null;
  }
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The long date, as everywhere in CaseVault (v1.32): "September 30, 2026".
  const usDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(iso || ''); };

  /**
   * Values available to {{placeholders}} for one case. `affiant` is the "My details" profile from
   * the vault settings ({ name, title, agency, address, phone, email }); empty values still become
   * [CONFIRM: affiant.name] and so on.
   */
  // extra: more values, e.g. {{arrest.*}} and {{closure.*}} from js/closing.js.
  function templateContext(caseObj, now = new Date(), affiant = null, extra = null) {
    const c = caseObj || {};
    const d = c.dates || {};
    const a = affiant || {};
    const ctx = {
      'case.title': c.title, 'case.number': c.number, 'case.fileNumber': c.fileNumber, 'case.agencyNumber': c.agencyNumber, 'case.client': c.client, 'case.status': c.status,
      'case.tags': (c.tags || []).join(', '), 'case.opened': d.opened, 'case.closed': d.closed,
      'case.partners': partnersText(c.partners),
      // v1.46: the Subject Name, and the Operation the case is in (blank when it's in none).
      'case.subject': c.subject, 'operation.number': (c.operation && c.operation.number) || '', 'operation.name': (c.operation && c.operation.name) || '',
      today: longDate(now), 'today.iso': isoDate(now),
    };
    // Contacts from the Details tab.
    const k = c.contacts || {};
    for (const [who, obj] of [['officer', k.officer], ['prosecutor', k.prosecutor]]) {
      for (const f of ['name', 'email', 'phone']) ctx[`case.${who}.${f}`] = String((obj && obj[f]) || '').trim();
    }
    ctx['case.prosecutor.title'] = String((k.prosecutor && k.prosecutor.title) || '').trim();
    // Suspects from the Details tab: {{suspect.*}} is the main suspect (or the first one).
    // v1.67: a suspect ticked Not Identified is named "Not Identified".
    const sus = (Array.isArray(c.suspects) ? c.suspects : []).filter(Boolean)
      .map((x) => (x.notIdentified ? { ...x, name: 'Not Identified' } : x)).filter((x) => String(x.name || '').trim());
    const main = sus.find((x) => isPrimary(x.role)) || sus[0] || {};
    const age = ageOn(main.dob, now);
    Object.assign(ctx, {
      'suspect.name': String(main.name || '').trim(), 'suspect.dob': usDate(main.dob), 'suspect.age': age == null ? '' : String(age),
      'suspect.residence': String(main.residence || '').trim(), 'suspect.role': String(main.role === 'Main' ? 'Primary' : main.role || '').trim(),
      suspects: sus.map((x) => { const a = ageOn(x.dob, now); return [x.name.trim(), x.dob ? `DOB ${usDate(x.dob)}${a == null ? '' : `, age ${a}`}` : '', x.residence ? String(x.residence).trim() : '', x.role ? `(${x.role === 'Main' ? 'Primary' : x.role})` : ''].filter(Boolean).join(', ').replace(/, \(/, ' ('); }).join('\n'),
    });
    for (const k of AFFIANT_FIELDS) {
      ctx[`affiant.${k}`] = k === 'address' ? String(a[k] || '').replace(/\r\n?/g, '\n').trim() : String(a[k] || '').trim();
    }
    return extra ? Object.assign(ctx, extra) : ctx;
  }

  /**
   * The placeholders a template can use, grouped for the template editor's help list. `arrestKeys`
   * are the arrest field names (from js/closing.js), so this file stays independent of it.
   */
  function placeholderGroups(arrestKeys = [], reportKeys = []) {
    const g = (title, keys) => ({ title, keys });
    return [
      g('Case', ['case.fileNumber', 'case.number', 'case.subject', 'case.agencyNumber', 'case.title', 'case.client', 'case.status', 'case.opened', 'case.closed', 'case.tags', 'case.partners']),
      g('Mission', ['operation.number', 'operation.name']),
      g('Suspects', ['suspect.name', 'suspect.dob', 'suspect.age', 'suspect.residence', 'suspect.role', 'suspects']),
      g('Contacts', ['case.officer.name', 'case.officer.email', 'case.officer.phone', 'case.prosecutor.title', 'case.prosecutor.name', 'case.prosecutor.email', 'case.prosecutor.phone']),
      g('Date', ['today', 'today.iso']),
      g('You', AFFIANT_FIELDS.map((k) => `affiant.${k}`)),
      g('Arrest details', ['arrest.name', 'arrest.dob', 'arrest.description', 'arrest.charges', 'arrest.names', 'arrest.count',
        ...arrestKeys.filter((k) => !['dob'].includes(k)).map((k) => `arrest.${k}`), 'arrest.property', 'arrest.notes']
        .filter((k, i, all) => all.indexOf(k) === i)),
      g('Closing', ['closure.disposition', 'closure.reason', 'closure.date', 'closure.note']),
      ...(reportKeys.length ? [g('Report fields', reportKeys)] : []),
      g('Ask yourself to check', ['confirm: what to check']),
    ];
  }

  /**
   * Fill {{placeholders}}. Known but empty values and unknown names become [CONFIRM: name], so
   * nothing missing slips through. {{confirm: Badge number}} is a shortcut for [CONFIRM: Badge number].
   */
  function fillTemplate(template, ctx) {
    const lower = new Map(Object.entries(ctx).map(([k, v]) => [k.toLowerCase(), v]));
    return String(template || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (all, key) => {
      const confirm = /^confirm\s*:\s*(.+)$/i.exec(key);
      if (confirm) return `[CONFIRM: ${confirm[1].trim()}]`;
      const k = key.trim();
      const v = ctx[k] ?? lower.get(k.toLowerCase());
      return v != null && String(v).trim() !== '' ? String(v) : `[CONFIRM: ${k}]`;
    });
  }


  function templateTitle(text, fileName) {
    const m = /^#\s+(.+)$/m.exec(String(text || ''));
    // Starter templates from before v1.14 were titled "Affidavit (generic example)" and so on.
    return (m ? m[1] : String(fileName || '').replace(/\.md$/i, '')).replace(/\s*\(generic example\)\s*$/i, '').trim();
  }

  const GENERIC_NOTE = '> **Generic example, not a legal form.** Replace this template with your agency\'s approved format before use. Delete this line in your own copy.';

  // Shipped with the app; copied into CaseVault-Data/templates/ when the user asks for them.
  // v1.28: only the Supplemental Report is built in. The generic affidavit, subpoena, arrest report
  // and case summary were taken out; an unchanged copy of one on the SSD is removed (Vault).
  const RETIRED_TEMPLATES = ['generic-affidavit.md', 'generic-subpoena.md', 'generic-arrest-report.md', 'generic-case-summary.md', 'generic-supplemental-report.md'];
  // Start an arrest report draft (Arrest details tab) uses your own arrest template; without one,
  // this built-in outline (v1.28: no longer listed under Templates).
  const ARREST_OUTLINE = `# Arrest Report

${GENERIC_NOTE}

**Case No.** {{case.number}} · **Case:** {{case.title}} · **Prepared:** {{today}} by {{affiant.name}}, {{affiant.title}}, {{affiant.agency}}

## Arrestee

- **Name:** {{arrest.name}}
- **Date of birth:** {{arrest.dob}}
- **Description:** {{arrest.description}}
- **Address:** {{arrest.address}}
- **Phone:** {{arrest.phone}}
- **DL / ID:** {{arrest.idNumber}}

## Arrest

- **Date and time:** {{arrest.date}} at {{arrest.time}}
- **Location:** {{arrest.location}}
- **Type of arrest:** {{arrest.type}} · **Warrant:** {{arrest.warrantNumber}}
- **Arresting officer:** {{arrest.arrestingOfficer}} · **Assisting:** {{arrest.assistingOfficers}}
- **Miranda:** {{arrest.miranda}} at {{arrest.mirandaTime}}
- **Booked into:** {{arrest.facility}} · **Booking number:** {{arrest.bookingNumber}} · **Bond:** {{arrest.bond}}

## Charges

{{arrest.charges}}

## Property seized

{{arrest.property}}

## Narrative

{{confirm: narrative of the arrest}}

{{arrest.notes}}

______________________________
{{affiant.name}}, {{affiant.title}}, {{confirm: badge number}}
`;
  // v1.48: no built-in templates; your own (the DEA 6 sample) stay. The Supplemental Report starter
  // that came before is retired: an unchanged copy on the SSD is removed (Vault).
  const STARTER_TEMPLATES = {};
  const RETIRED_SUPPLEMENTAL = {
    'generic-supplemental-report.md': `# Supplemental Report

${GENERIC_NOTE}

**Case:** {{case.title}}
**Original Case Number:** {{case.number}}
**Federal Jacket Number:** {{case.agencyNumber}}
**Date of Occurrence:** {{report.date}} {{report.time}}
**Location:** {{report.address}}
**Offense:** {{report.offense}} ({{report.ucr}})

## Victims

{{report.victimsList}}

## Offenders

{{report.offendersList}}

## Charges

{{report.charges}}

## Narrative

{{report.narrative}}

## Narcotics Recovered

{{report.narcotics}}

## Evidence Inventoried

{{report.evidence}}

## Personnel on Scene

{{report.personnel}}

## Notifications

{{report.notifications}}

______________________________
{{affiant.name}}, {{affiant.title}}, {{confirm: star number}}
Prepared {{today}}
`,
  }['generic-supplemental-report.md'];

  /* ---------------- plain text ---------------- */

  /** Markdown to readable plain text (for "Copy as plain text" and for the consistency checker). */
  function stripMarkdown(md) {
    return String(parseDraft(md).body)
      .replace(/\r\n?/g, '\n')
      .replace(/^```.*$/gm, '')
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
      .replace(/^[ \t]*[-*+][ \t]+(\[[ xX]\][ \t]+)?/gm, '• ')
      .replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\+\+([^+\n]+)\+\+/g, '$1')
      .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '')
      .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (all, inner) => inner.split('|').map((c) => c.trim()).join('   '))
      .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1$2')
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Reports in the order arranged under Reports (v1.40): the slugs in `order` first, in that
   * order; reports not in it (new ones) before them, as listed. */
  function orderReports(list, order) {
    const at = new Map((Array.isArray(order) ? order : []).map((s, i) => [String(s), i]));
    const fresh = list.filter((d) => !at.has(d.slug));
    const placed = list.filter((d) => at.has(d.slug)).sort((a, b) => at.get(a.slug) - at.get(b.slug));
    return [...fresh, ...placed];
  }

  const api = {
    orderReports, DOC_TYPES, STARTER_TEMPLATES, RETIRED_SUPPLEMENTAL, RETIRED_TEMPLATES, docTypeOf, ARREST_OUTLINE, PARTNER_AGENCIES, partnersText, parseDraft, serializeDraft, slugify, extractPlaceholders,
    AFFIANT_FIELDS, SUSPECT_ROLES, ageOn, placeholderGroups, templateContext, fillTemplate, templateTitle, stripMarkdown,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVDraft = api;
})(this);
