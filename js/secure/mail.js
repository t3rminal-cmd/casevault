/* CaseVault — department mail: address checks and the Outlook draft (.eml) builder.
 *
 * A browser can't send email by itself, and CaseVault never holds mail passwords. So CaseVault
 * prepares the message with its safeguards, then hands it to the mail program:
 *   - an .eml file with "X-Unsent: 1", saved in the case's Email folder. Outlook (classic) opens it as a
 *     new message with the attachments already in it; the user presses Send there, so the
 *     department's own mail system (encryption, DLP, retention) handles the actual sending.
 *   - or a mailto: link (text only, no attachments) for any mail app.
 *
 * Plain logic with no DOM, so the tests run it under Node.
 */
'use strict';

(function (root) {
  const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

  /** "Jane Doe <jane@agency.gov>; bob@agency.gov" -> [{ name, email }] (invalid ones get email: null) */
  function parseAddresses(s) {
    return String(s || '').split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean).map((part) => {
      const m = /^(.*?)<([^>]+)>$/.exec(part);
      const name = m ? m[1].trim().replace(/^"|"$/g, '') : '';
      const email = (m ? m[2] : part).trim();
      return { name, email: EMAIL_RE.test(email) ? email.toLowerCase() : null, raw: part };
    });
  }

  /** Allowed domain list from settings text: "agency.gov, *.county.gov" -> ['agency.gov', '*.county.gov'] */
  function parseDomains(s) {
    return [...new Set(String(s || '').split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter((d) => /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)))];
  }

  /** agency.gov allows exactly @agency.gov; *.agency.gov allows @agency.gov and every sub-domain. */
  function domainAllowed(email, domains) {
    const at = String(email || '').toLowerCase().split('@');
    if (at.length !== 2) return false;
    const d = at[1];
    return (domains || []).some((rule) => {
      if (rule.startsWith('*.')) { const base = rule.slice(2); return d === base || d.endsWith(`.${base}`); }
      return d === rule;
    });
  }

  /** { ok, invalid: [raw], blocked: [email], allowed: [email] } */
  function checkRecipients(list, domains) {
    const invalid = list.filter((r) => !r.email).map((r) => r.raw);
    const valid = list.filter((r) => r.email);
    const blocked = valid.filter((r) => !domainAllowed(r.email, domains)).map((r) => r.email);
    return { ok: !!valid.length && !invalid.length && !blocked.length, invalid, blocked, allowed: valid.filter((r) => domainAllowed(r.email, domains)).map((r) => r.email) };
  }

  /** Attachments whose conventional name carries a different case number than this case. */
  function otherCaseFiles(names, prefix, prefixInName) {
    if (!prefix) return [];
    return names.filter((n) => {
      const base = String(n).split('/').pop();
      const low = base.toLowerCase();
      if (low.startsWith(`${prefix.toLowerCase()}-`) || low.startsWith(`${prefix.toLowerCase()} `)) return false;
      const p = prefixInName(base);
      return p && p.toLowerCase() !== prefix.toLowerCase() && !p.toLowerCase().startsWith(`${prefix.toLowerCase()}-`);
    });
  }

  /* ---------- MIME ---------- */

  const b64 = (bytes) => {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const utf8 = (s) => new TextEncoder().encode(String(s));
  const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');

  // RFC 2047 encoded-word for headers that aren't plain ASCII.
  function encodeHeader(s) {
    const v = String(s || '').replace(/[\r\n]+/g, ' ');
    if (/^[\x20-\x7e]*$/.test(v)) return v;
    // Split into chunks so each encoded-word stays under 75 characters.
    const out = [];
    let chunk = '';
    for (const ch of v) {
      if (utf8(chunk + ch).length > 45) { out.push(chunk); chunk = ''; }
      chunk += ch;
    }
    if (chunk) out.push(chunk);
    return out.map((c) => `=?UTF-8?B?${b64(utf8(c))}?=`).join('\r\n ');
  }

  // Attachment file names: RFC 2231 for non-ASCII, quoted otherwise.
  function fileParam(key, name) {
    const n = String(name).replace(/[\r\n"\\]/g, '_');
    if (/^[\x20-\x7e]*$/.test(n)) return `${key}="${n}"`;
    return `${key}*=UTF-8''${encodeURIComponent(n).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
  }

  const addrList = (list) => list.map((r) => (r.name ? `${encodeHeader(r.name.replace(/[<>"]/g, ''))} <${r.email}>` : r.email)).join(', ');

  function rfc2822Date(d) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p = (n) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return `${days[d.getDay()]}, ${p(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${sign}${p(Math.floor(Math.abs(off) / 60))}${p(Math.abs(off) % 60)}`;
  }

  /**
   * Build an unsent message (.eml) that Outlook opens as a new, editable email.
   * { to, cc: [{ name, email }], subject, body (plain text), attachments: [{ name, type, bytes: Uint8Array }],
   *   date: Date, boundary }  ->  string with CRLF line endings.
   */
  function buildEml({ to = [], cc = [], subject = '', body = '', attachments = [], date = new Date(), boundary = null, importance = '' }) {
    const bnd = boundary || `----=_CaseVault_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const head = [
      `To: ${addrList(to)}`,
      cc.length ? `Cc: ${addrList(cc)}` : null,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${rfc2822Date(date)}`,
      'X-Unsent: 1',
      'X-Mailer: CaseVault',
      importance === 'high' ? 'Importance: High' : null,
      'MIME-Version: 1.0',
    ].filter(Boolean);
    const text = String(body).replace(/\r?\n/g, '\r\n');
    const textPart = ['Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', wrap76(b64(utf8(text)))].join('\r\n');
    if (!attachments.length) return `${head.join('\r\n')}\r\n${textPart}`;
    const parts = [textPart, ...attachments.map((a) => [
      `Content-Type: ${a.type || 'application/octet-stream'}; ${fileParam('name', a.name)}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${fileParam('filename', a.name)}`,
      '',
      wrap76(b64(a.bytes)),
    ].join('\r\n'))];
    return `${head.join('\r\n')}\r\nContent-Type: multipart/mixed; boundary="${bnd}"\r\n\r\nThis is a multi-part message in MIME format.\r\n\r\n`
      + parts.map((p) => `--${bnd}\r\n${p}`).join('\r\n') + `\r\n--${bnd}--\r\n`;
  }

  /** mailto: link (text only). Returns null when it would be too long for Windows to hand over. */
  function mailtoUrl({ to = [], cc = [], subject = '', body = '' }) {
    const q = [];
    if (cc.length) q.push(`cc=${encodeURIComponent(cc.map((r) => r.email).join(','))}`);
    if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
    if (body) q.push(`body=${encodeURIComponent(String(body).replace(/\r?\n/g, '\r\n'))}`);
    const url = `mailto:${to.map((r) => encodeURIComponent(r.email).replace(/%40/g, '@')).join(',')}${q.length ? `?${q.join('&')}` : ''}`;
    return url.length > 2000 ? null : url;
  }

  // Filled in until you set your own (v1.26): Chicago Police, DEA and the Postal Inspection Service.
  const PRELOADED_DOMAINS = ['chicagopolice.org', 'dea.gov', 'uspis.gov'];
  const PRELOAD_ROUND = 2; // saved as settings.mail.preloaded
  const DEFAULTS = {
    domains: PRELOADED_DOMAINS,
    signature: '',          // put above the footer of every new message (v1.26)
    addressBook: [],        // [{ name, email }]
    marking: '',            // e.g. "[LES]" put in front of every subject
    footer: 'CONFIDENTIALITY NOTICE: This email and any attachments are for the sole use of the intended recipient(s) and may contain law enforcement sensitive information. If you received this in error, notify the sender and delete it.',
    maxMB: 20,
    requireMarking: false,
  };

  /** The mail settings in use: saved ones over the defaults; an empty domain list gets the preloaded ones. */
  function settingsOf(saved) {
    const st = { ...DEFAULTS, ...(saved || {}) };
    if (!Array.isArray(st.domains) || !st.domains.length) st.domains = [...PRELOADED_DOMAINS];
    // A list saved before the preloaded domains existed gets them added once (v1.27), and once more
    // in v1.28 for chicagopolice.org. After that, removing one from the list sticks.
    else if ((Number(st.preloaded) || 0) < PRELOAD_ROUND) st.domains = [...new Set([...PRELOADED_DOMAINS, ...st.domains])];
    return st;
  }
  /** The end of a new message: the signature, then the footer after "--". */
  function closing(st) {
    const sig = String(st.signature || '').trim();
    return `${sig ? `${sig}\n\n` : ''}${st.footer ? `--\n${st.footer}` : ''}`;
  }
  /** A signature from My Profile (name, title, agency, phone, email). */
  function signatureFrom(p) {
    const a = p || {};
    return [a.name, a.title, a.agency, a.phone && `Phone: ${a.phone}`, a.email].map((x) => String(x || '').trim()).filter(Boolean).join('\n');
  }

  const api = { EMAIL_RE, DEFAULTS, PRELOADED_DOMAINS, PRELOAD_ROUND, settingsOf, closing, signatureFrom, parseAddresses, parseDomains, domainAllowed, checkRecipients, otherCaseFiles, buildEml, mailtoUrl, encodeHeader, rfc2822Date };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVMail = api;
})(this);
