/* CaseVault — quick links: the Overview's Reference, OSINT and LEO tabs.
 *
 * The OSINT and LEO links are ordinary web pages that open in a NEW browser tab when you click
 * them: CaseVault itself never contacts them, sends nothing to them (no referrer, no case data),
 * and keeps working offline. Addresses can be changed and links added or hidden in
 * Vault → Quick links; your changes are saved in vault.json on the SSD.
 *
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const TABS = [
    { key: 'reference', label: 'Reference', icon: 'book' },
    { key: 'osint', label: 'OSINT', icon: 'search' },
    { key: 'leo', label: 'LEO', icon: 'shield-lock-fill' },
  ];

  // Built in. Reference links open CaseVault's own pages; the others open a web page in a new tab.
  const DEFAULTS = [
    { id: 'ref-incident', tab: 'reference', name: 'Location Codes', hash: '#/reference/incident', icon: 'geo-alt', note: 'Location codes by place type. Click a code to copy it.' },
    { id: 'ref-ucr', tab: 'reference', name: 'Common UCR', hash: '#/reference/ucr', icon: 'journal-text', note: 'UCR codes by category. Search by code or offense.' },
    { id: 'ref-charges', tab: 'reference', name: 'Charges', hash: '#/reference/charges', icon: 'bank2', note: 'Federal or State (Illinois) statutes.', choices: [['Federal Statute', '#/reference/charges-federal'], ['State Statute', '#/reference/charges-state']] },
    { id: 'ref-narcotics', tab: 'reference', name: 'Narcotic Calculator', hash: '#/reference/narcotics', icon: 'calculator-fill', note: 'Street value calculator and value chart, HIDTA 2022.' },
    { id: 'osint-maxmind', tab: 'osint', name: 'MaxMind IP', url: 'https://www.maxmind.com/en/geoip-demo', icon: 'globe2', note: 'Where an IP address is: city, ISP and organisation.' },
    { id: 'osint-fingerprint', tab: 'osint', name: 'Fingerprint', url: 'https://fingerprint.com/demo/', icon: 'fingerprint', note: 'Browser and device fingerprint demo.' },
    { id: 'osint-numlookup', tab: 'osint', name: 'NumLookup', url: 'https://www.numlookup.com/', icon: 'telephone', note: 'Free reverse phone lookup: who a number belongs to.' },
    { id: 'osint-blockchair', tab: 'osint', name: 'Blockchair', url: 'https://blockchair.com/', icon: 'currency-bitcoin', note: 'Blockchain explorer: look up crypto addresses and transactions.' },
    { id: 'osint-mempool', tab: 'osint', name: 'Mempool', url: 'https://mempool.space/', icon: 'currency-bitcoin', note: 'Bitcoin explorer: addresses, transactions and fees.' },
    { id: 'leo-chainalysis', tab: 'osint', name: 'Chainalysis', url: 'https://reactor.chainalysis.com/', icon: 'currency-bitcoin', note: 'Chainalysis Reactor for crypto investigations, with your account.' },
    { id: 'osint-tineye', tab: 'osint', name: 'TinEye', url: 'https://tineye.com/', icon: 'image', note: 'Reverse image search: where else a picture appears.' },
    { id: 'osint-google', tab: 'osint', name: 'Google', url: 'https://www.google.com/', icon: 'google', note: 'Google search.' },
    { id: 'osint-google-images', tab: 'osint', name: 'Google Images', url: 'https://images.google.com/', icon: 'image', note: 'Reverse image search by Google.' },
    { id: 'leo-accurint', tab: 'leo', name: 'Accurint', url: 'https://www.accurint.com/', icon: 'person-lines-fill', note: 'LexisNexis Accurint for law enforcement, with your account.' },
    { id: 'leo-kodex', tab: 'leo', name: 'Kodex Portal', url: 'https://www.kodexglobal.com/', icon: 'send', note: 'Legal process and emergency requests to online platforms, with your account. Change the address to your portal\'s login page if it differs.' },
    { id: 'leo-chicago-hidta', tab: 'leo', name: 'Chicago HIDTA', url: '', icon: 'building', note: 'Add your Chicago HIDTA portal\'s web address in Vault → Quick links.' },
    { id: 'leo-snapchat', tab: 'leo', name: 'Snapchat LE Portal', url: 'https://lawenforcement.snapchat.com/', icon: 'snapchat', note: 'Snap\'s Law Enforcement Service Portal: legal process and emergency requests, with your account.' },
    { id: 'leo-meta', tab: 'leo', name: 'Meta LE Portal', url: 'https://www.facebook.com/records/', icon: 'meta', note: 'Meta\'s Law Enforcement Online Request System (Facebook, Instagram, WhatsApp), with your account.' },
    { id: 'leo-cpd-directives', tab: 'leo', name: 'Chicago Police Directives', url: 'https://directives.chicagopolice.org/', icon: 'journal-bookmark', note: 'CPD directives: general and special orders.' },
  ];

  /** Only http(s) web addresses; anything else (javascript:, file:) is refused. */
  function cleanUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    let url;
    try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`); } catch { return null; }
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  }

  /**
   * The links to show, from the built-ins and the saved settings ({ hidden: [id], edits: { id: { name, url, note } },
   * custom: [{ id, tab, name, url, note }] }). Each: { id, tab, name, url|hash, icon, note, hidden, custom }.
   */
  function linksOf(saved) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const hidden = new Set(Array.isArray(s.hidden) ? s.hidden : []);
    const edits = s.edits && typeof s.edits === 'object' ? s.edits : {};
    const base = DEFAULTS.map((d) => ({ ...d, ...(d.hash ? {} : pick(edits[d.id])), hidden: hidden.has(d.id), custom: false }));
    const custom = (Array.isArray(s.custom) ? s.custom : [])
      .filter((c) => c && c.id && TABS.some((t) => t.key === c.tab) && c.tab !== 'reference')
      .map((c) => ({ id: c.id, tab: c.tab, name: String(c.name || 'Link'), url: cleanUrl(c.url) || '', note: String(c.note || ''), icon: 'link-45deg', hidden: hidden.has(c.id), custom: true }));
    return [...base, ...custom];
  }
  function pick(e) {
    if (!e) return {};
    const out = {};
    if (e.name) out.name = String(e.name);
    if (e.url !== undefined) out.url = cleanUrl(e.url) || '';
    if (e.note !== undefined) out.note = String(e.note);
    return out;
  }

  // Menu → Contact Dev: where "Open the bug report form" goes unless you set your own form in
  // that dialog. It opens in a new browser tab; CaseVault sends nothing to it.
  const BUG_REPORT_URL = 'https://github.com/t3rminal-cmd/casevault/issues/new';

  const api = { TABS, DEFAULTS, cleanUrl, linksOf, BUG_REPORT_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVLinks = api;
})(this);
