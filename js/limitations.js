/*
 * CaseVault statute of limitations (v1.67): narcotic charges must be brought within 3 years of the
 * Date of Occurrence. Works out, from the Draft (report-fields.json) and the Arrest details
 * (arrest.json), whether a case has a narcotic charge, the date it happened, and when the 3 years
 * run out. The Overview warns 5 days before that (Needs Attention).
 *
 * Plain functions, no storage: vault.js keeps the result in the case index as `sol`.
 */
(function (root) {
  'use strict';

  const YEARS = 3;
  const WARN_DAYS = 5;

  const clean = (v) => String(v == null ? '' : v).trim();
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(clean(s));

  /** A charge is a narcotic charge when its statute is a drug law (Illinois Controlled
   * Substances, Cannabis, Methamphetamine; federal Title 21) or its words say so. */
  function isNarcoticCharge(ch) {
    if (!ch) return false;
    const statute = clean(ch.statute || ch.code);
    const words = `${clean(ch.description || ch.desc)} ${clean(ch.title)}`;
    if (/720\s*ILCS\s*(570|550|646|600|635)\b/i.test(statute)) return true;
    if (/\b21\s*U\.?\s*S\.?\s*C\b/i.test(statute)) return true;
    return /controlled substance|cannabis|marijuana|methamphetamine|heroin|cocaine|fentanyl|narcotic|\bdrug/i.test(words);
  }

  /** "YYYY-MM-DD" plus whole years (29 February becomes 1 March in a non-leap year). */
  function addYears(day, years) {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(Date.UTC(y + years, m - 1, d));
    return t.toISOString().slice(0, 10);
  }

  /**
   * From the Draft fields and the Arrest details: { occurred, expires } or null when the case has
   * no narcotic charge or no date. The Date of Occurrence comes from the Draft; without one, the
   * earliest arrest date.
   */
  function compute(fields, arrest) {
    const rfCharges = (fields && Array.isArray(fields.charges)) ? fields.charges : [];
    const arrestees = (arrest && Array.isArray(arrest.arrestees)) ? arrest.arrestees : [];
    const arrestCharges = arrestees.flatMap((a) => (Array.isArray(a.charges) ? a.charges : []));
    if (![...rfCharges, ...arrestCharges].some(isNarcoticCharge)) return null;
    let occurred = fields && isDate(fields.date) ? clean(fields.date) : '';
    if (!occurred) occurred = arrestees.map((a) => clean(a.date)).filter(isDate).sort()[0] || '';
    if (!occurred) return null;
    return { occurred, expires: addYears(occurred, YEARS) };
  }

  /** Whole days from `today` to the expiry day (negative once it has passed). */
  function daysLeft(sol, today) {
    if (!sol || !isDate(sol.expires)) return null;
    const a = Date.UTC(...today.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
    const b = Date.UTC(...sol.expires.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
    return Math.round((b - a) / 86400000);
  }

  /** 'warn' (5 days or less to go), 'expired' (passed) or '' (nothing to show). */
  function state(sol, today) {
    const n = daysLeft(sol, today);
    if (n == null) return '';
    if (n < 0) return 'expired';
    return n <= WARN_DAYS ? 'warn' : '';
  }

  /** The count-down words for a time left in milliseconds: "4 Days 06:12:30 Left", "Expired". */
  function countdown(ms) {
    if (ms <= 0) return 'Expired';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${d ? `${d} Day${d === 1 ? '' : 's'} ` : ''}${hh}:${mm}:${ss} Left`;
  }

  const api = { YEARS, WARN_DAYS, isNarcoticCharge, addYears, compute, daysLeft, state, countdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVLimits = api;
})(this);
