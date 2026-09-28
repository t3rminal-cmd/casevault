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
    summary: {
      label: 'Case summary',
      guide: 'A case summary: an overview paragraph, the parties involved, a dated chronology of key events, the evidence and documents, and open questions.',
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
    other: { label: 'Other', guide: 'A clear, well-structured document.' },
  };

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

  function longDate(d) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** Values available to {{placeholders}} for one case. */
  function templateContext(caseObj, now = new Date()) {
    const c = caseObj || {};
    const d = c.dates || {};
    return {
      'case.title': c.title, 'case.number': c.number, 'case.client': c.client, 'case.status': c.status,
      'case.tags': (c.tags || []).join(', '), 'case.opened': d.opened, 'case.closed': d.closed,
      today: longDate(now), 'today.iso': isoDate(now),
    };
  }

  /**
   * Fill {{placeholders}}. Known but empty values and unknown names become [CONFIRM: name], so
   * nothing missing slips through. {{confirm: Badge number}} is a shortcut for [CONFIRM: Badge number].
   */
  function fillTemplate(template, ctx) {
    return String(template || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (all, key) => {
      const confirm = /^confirm\s*:\s*(.+)$/i.exec(key);
      if (confirm) return `[CONFIRM: ${confirm[1].trim()}]`;
      const k = key.trim();
      const v = ctx[k] ?? ctx[k.toLowerCase()];
      return v != null && String(v).trim() !== '' ? String(v) : `[CONFIRM: ${k}]`;
    });
  }

  function templateTitle(text, fileName) {
    const m = /^#\s+(.+)$/m.exec(String(text || ''));
    return (m ? m[1] : String(fileName || '').replace(/\.md$/i, '')).trim();
  }

  const GENERIC_NOTE = '> **Generic example, not a legal form.** Replace this template with your agency\'s approved format before use. Delete this line in your own copy.';

  // Shipped with the app; copied into CaseVault-Data/templates/ when the user asks for them.
  const STARTER_TEMPLATES = {
    'generic-affidavit.md': `# Affidavit (generic example)

${GENERIC_NOTE}

**{{confirm: Court name}}**
**{{confirm: State}}, County of {{confirm: County}}**

Case No. {{case.number}}

## AFFIDAVIT IN SUPPORT OF {{confirm: type of application, e.g. SEARCH WARRANT}}

I, {{confirm: affiant full name and rank}}, being first duly sworn, depose and state as follows:

1. I am employed by {{confirm: agency}} and have been so employed for {{confirm: years}} years. My duties include {{confirm: duties}}.
2. On {{confirm: date}}, at approximately {{confirm: time}}, ...
3. ...

## Probable cause

...

Based on the facts above, I respectfully request that the Court {{confirm: relief requested}}.

______________________________
{{confirm: affiant name}}, {{confirm: badge number}}

Sworn to and subscribed before me on {{confirm: date}}.

______________________________
{{confirm: judge or notary name and title}}
`,
    'generic-subpoena.md': `# Subpoena (generic example)

${GENERIC_NOTE}

**{{confirm: Court name}}**

{{case.title}}
Case No. {{case.number}}

## SUBPOENA {{confirm: TO APPEAR / DUCES TECUM (to produce records)}}

**To:** {{confirm: name and address of the person or records custodian}}

YOU ARE COMMANDED to {{confirm: appear and testify / produce the following records}}:

- {{confirm: description of records or testimony}}

**Date and time:** {{confirm: date and time}}
**Place:** {{confirm: address}}

Issued on {{today}} by {{confirm: issuing attorney or clerk, with contact details}}.
`,
    'generic-case-summary.md': `# Case summary (generic example)

${GENERIC_NOTE}

**Case:** {{case.title}}
**Number:** {{case.number}}
**Client:** {{case.client}}
**Status:** {{case.status}}
**Opened:** {{case.opened}}
**Prepared:** {{today}}

## Overview

...

## Parties

- ...

## Key dates

- ...

## Evidence and documents

- ...

## Open questions

- ...
`,
  };

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
      .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1$2')
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const api = {
    DOC_TYPES, STARTER_TEMPLATES, parseDraft, serializeDraft, slugify, extractPlaceholders,
    templateContext, fillTemplate, templateTitle, stripMarkdown,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVDraft = api;
})(this);
