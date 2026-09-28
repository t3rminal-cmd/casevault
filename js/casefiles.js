/* CaseVault — case folder layout and the file naming convention.
 *
 * Every case's files/ folder is split into the same document folders:
 *
 *   files/Affidavits, files/Arrest Report, files/Supplementary Report, ... files/Other
 *
 * The case folder is named <year>-<case number>, e.g. 2026-00123 (year of the Opened date), and
 * every file saved into a case is named after it and its document type:
 *
 *   2026-00123 Arrest Report.pdf, 2026-00123 Arrest Report (2).pdf, 2026-00123 Recording.mp3
 *
 * Plain logic with no DOM, so the tests run it under Node.
 */
'use strict';

(function (root) {
  // folder: the sub-folder of files/ · label: the document type in the file name
  const CATEGORIES = [
    { folder: 'Affidavits', label: 'Affidavit' },
    { folder: 'Arrest Report', label: 'Arrest Report' },
    { folder: 'Supplementary Report', label: 'Supplementary Report' },
    { folder: 'Case Report', label: 'Case Report' },
    { folder: 'Deconfliction', label: 'Deconfliction' },
    { folder: 'Drug Exhibits', label: 'Drug Exhibit' },
    { folder: 'Email', label: 'Email' },
    { folder: 'Ops Plan', label: 'Ops Plan' },
    { folder: 'Subpoena Response', label: 'Subpoena Response' },
    { folder: 'Subject Information', label: 'Subject Information' },
    { folder: 'Recordings', label: 'Recording' },
    { folder: 'Vehicle Information', label: 'Vehicle Information' },
    { folder: 'Maps', label: 'Map' },
    { folder: 'Other', label: 'Other' },
  ];
  const FOLDERS = CATEGORIES.map((c) => c.folder);
  // Files from older versions sit directly in files/, outside every category.
  const UNSORTED = '';
  const REPORT_FOLDERS = new Set(['Arrest Report', 'Supplementary Report', 'Case Report']);

  const byFolder = (folder) => CATEGORIES.find((c) => c.folder === folder) || null;
  const isCategory = (folder) => FOLDERS.includes(folder);

  // Windows-safe piece of a file name (same rules as FS.safeName, without the length handling).
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/, '')
      .trim();
  }

  function yearOf(c) {
    const opened = c && c.dates && c.dates.opened;
    const m = /^(\d{4})-/.exec(opened || '');
    return m ? m[1] : String(new Date().getFullYear());
  }

  /** "2026-00123" for a case numbered 00123 opened in 2026; null when the case has no number. */
  function casePrefix(c) {
    const num = clean(c && c.number).replace(/\s+/g, '-');
    if (!num) return null;
    const year = yearOf(c);
    // Numbers that already start with the year ("2026-00123", "26-00123" stays as typed) aren't doubled.
    if (num.startsWith(`${year}-`) || num === year) return num;
    return `${year}-${num}`;
  }

  /** The folder name for a new case: its prefix, or null when there's no case number yet. */
  function caseFolderName(c) {
    const p = casePrefix(c);
    return p && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(p) ? p.slice(0, 120) : null;
  }

  const extOf = (name) => {
    const n = String(name || '');
    const dot = n.lastIndexOf('.');
    return dot > 0 && n.length - dot <= 10 ? n.slice(dot).toLowerCase() : '';
  };

  /**
   * The conventional file name, before any "(2)" for repeats:
   *   "2026-00123 Arrest Report.pdf", or with a description "2026-00123 Arrest Report - Smith.pdf".
   * A case without a number uses "<year>-NOCASENO" so the file still sorts and shows its type.
   */
  function fileName(c, folder, originalName, description = '') {
    const cat = byFolder(folder) || byFolder('Other');
    const prefix = casePrefix(c) || `${yearOf(c)}-NOCASENO`;
    const desc = clean(description).slice(0, 80);
    return `${prefix} ${cat.label}${desc ? ` - ${desc}` : ''}${extOf(originalName)}`;
  }

  /** Does this file name already follow the convention for this case and folder? */
  function followsConvention(c, folder, name) {
    const cat = byFolder(folder);
    const prefix = casePrefix(c);
    if (!cat || !prefix) return false;
    const stem = `${prefix} ${cat.label}`;
    return name === stem || name.startsWith(`${stem} `) || name.startsWith(`${stem}.`);
  }

  // Best guess of the document type from the original file name. Returns a folder, or 'Other'.
  const GUESSES = [
    [/affidavit|affid\b|\bpc[ _-]?aff|probable[ _-]?cause|declaration/i, 'Affidavits'],
    [/supp(lement(al|ary)?)?[ _-]?(rpt|report)?\b|\bsupp\b/i, 'Supplementary Report'],
    [/arrest/i, 'Arrest Report'],
    [/deconflict/i, 'Deconfliction'],
    [/subpoena/i, 'Subpoena Response'],
    [/ops?[ _-]?plan|operations?[ _-]?plan|op[ _-]?order/i, 'Ops Plan'],
    [/drug|exhibit|evidence|lab[ _-]?(report|result)|narcotic/i, 'Drug Exhibits'],
    [/vehicle|\bvin\b|registration|\bplate\b|\btag\b|\bdmv\b|\bmvr\b/i, 'Vehicle Information'],
    [/subject|suspect|criminal[ _-]?history|rap[ _-]?sheet|\bncic\b|\bdl\b|booking|mugshot|photo[ _-]?line/i, 'Subject Information'],
    [/\bmap\b|maps|\.kmz?$|\.gpx$|aerial|satellite/i, 'Maps'],
    [/\.(eml|msg)$|e-?mail/i, 'Email'],
    [/\.(mp3|wav|m4a|wma|aac|ogg|flac|mp4|mov|avi|wmv|mkv|webm|3gp)$|recording|interview|audio|video|bodycam|bwc|jail[ _-]?call/i, 'Recordings'],
    [/case[ _-]?(report|rpt)|incident[ _-]?report|offense[ _-]?report|\bir\b|report/i, 'Case Report'],
  ];

  function guessFolder(originalName) {
    const n = String(originalName || '');
    for (const [re, folder] of GUESSES) if (re.test(n)) return folder;
    return 'Other';
  }

  /** "Arrest Report/2026-00123 Arrest Report.pdf" -> { folder: 'Arrest Report', base: '2026-00123 Arrest Report.pdf' } */
  function splitPath(path) {
    const s = String(path || '');
    const i = s.indexOf('/');
    return i < 0 ? { folder: UNSORTED, base: s } : { folder: s.slice(0, i), base: s.slice(i + 1) };
  }
  const joinPath = (folder, base) => (folder ? `${folder}/${base}` : base);

  /** The case number found in a conventional file name ("2026-00123 Arrest Report.pdf" -> "2026-00123"). */
  function prefixInName(name) {
    const m = /^(\d{4}-[^ ]+) /.exec(String(name || ''));
    return m ? m[1] : null;
  }

  const api = {
    CATEGORIES, FOLDERS, UNSORTED, REPORT_FOLDERS,
    byFolder, isCategory, casePrefix, caseFolderName, fileName, followsConvention, guessFolder,
    splitPath, joinPath, prefixInName, clean, extOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVCaseFiles = api;
})(this);
