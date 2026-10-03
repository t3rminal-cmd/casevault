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
    { id: 'ref-find-beat', tab: 'reference', name: 'Find my Beat', url: 'https://operations.chicagopolice.org/FindMyDistrict', icon: 'geo', note: 'Chicago Police: the district and beat for an address.' },
    { id: 'osint-maxmind', tab: 'osint', name: 'MaxMind IP', url: 'https://www.maxmind.com/en/geoip-demo', icon: 'globe2', note: 'Where an IP address is: city, ISP and organisation.' },
    { id: 'osint-fingerprint', tab: 'osint', name: 'Fingerprint', url: 'https://fingerprint.com/demo/', icon: 'fingerprint', note: 'Browser and device fingerprint demo.' },
    { id: 'osint-numlookup', tab: 'osint', name: 'NumLookup', url: 'https://www.numlookup.com/', icon: 'telephone', note: 'Free reverse phone lookup: who a number belongs to.' },
    { id: 'osint-blockchair', tab: 'osint', name: 'Blockchair', url: 'https://blockchair.com/', icon: 'currency-bitcoin', note: 'Blockchain explorer: look up crypto addresses and transactions.' },
    { id: 'osint-mempool', tab: 'osint', name: 'Mempool', url: 'https://mempool.space/', icon: 'currency-bitcoin', note: 'Bitcoin explorer: addresses, transactions and fees.' },
    { id: 'leo-chainalysis', tab: 'osint', name: 'Chainalysis', url: 'https://reactor.chainalysis.com/', icon: 'currency-bitcoin', note: 'Chainalysis Reactor for crypto investigations, with your account.' },
    { id: 'osint-geotime', tab: 'osint', name: 'Geotime LIVE', url: 'https://live.geotime.com/#/login', icon: 'map', note: 'Geotime LIVE: map and analyse call records and location data, with your account.' }, // v1.54, v1.57
    // v1.57
    { id: 'osint-zetx', tab: 'osint', name: 'ZetX', url: 'https://zetx.com/', icon: 'antenna', note: 'ZetX (TransUnion): phone carrier lookup and call-record mapping for law enforcement.' },
    { id: 'osint-bandwidth', tab: 'osint', name: 'Bandwidth', url: 'https://www.bandwidth.com/', icon: 'phone-voip', note: 'Bandwidth: the carrier behind many app and VoIP numbers; where to send legal process for them.' },
    { id: 'osint-textnow', tab: 'osint', name: 'TextNow', url: 'https://www.textnow.com/', icon: 'phone-voip', note: 'TextNow: free app phone numbers; check its law enforcement page for legal requests.' },
    { id: 'osint-blockchainexplorer', tab: 'osint', name: 'Blockchain Explorer', url: 'https://www.blockchainexplorer.com/', icon: 'chain-search', note: 'Look up crypto addresses and transactions.' },
    { id: 'osint-trm', tab: 'osint', name: 'TRM Labs', url: 'https://www.trmlabs.com/', icon: 'chain-search', note: 'TRM Labs: blockchain intelligence for crypto investigations, with your account.' },
    { id: 'osint-tineye', tab: 'osint', name: 'TinEye', url: 'https://tineye.com/', icon: 'image', note: 'Reverse image search: where else a picture appears.' },
    { id: 'osint-google', tab: 'osint', name: 'Google', url: 'https://www.google.com/', icon: 'google', note: 'Google search.' },
    { id: 'osint-google-maps', tab: 'osint', name: 'Google Maps', url: 'https://www.google.com/maps', icon: 'map', note: 'Maps, addresses and Street View.' },
    { id: 'osint-google-images', tab: 'osint', name: 'Google Images', url: 'https://images.google.com/', icon: 'image', note: 'Reverse image search by Google.' },
    { id: 'leo-accurint', tab: 'leo', name: 'Accurint', url: 'https://www.accurint.com/', icon: 'person-lines-fill', note: 'LexisNexis Accurint for law enforcement, with your account.' },
    { id: 'leo-kodex', tab: 'leo', name: 'Kodex Portal', url: 'https://www.kodexglobal.com/', icon: 'send', note: 'Legal process and emergency requests to online platforms, with your account. Change the address to your portal\'s login page if it differs.' },
    // v1.54: fixed: its address can't be changed and it can't be hidden.
    { id: 'leo-chicago-hidta', tab: 'leo', name: 'Chicago HIDTA', url: 'https://www.chicago-hidta.org/submission-form-2', icon: 'building', note: 'Chicago HIDTA submission form.', fixed: true },
    { id: 'leo-snapchat', tab: 'leo', name: 'Snapchat LE Portal', url: 'https://lawenforcement.snapchat.com/', icon: 'snapchat', note: 'Snap\'s Law Enforcement Service Portal: legal process and emergency requests, with your account.' },
    { id: 'leo-meta', tab: 'leo', name: 'Meta LE Portal', url: 'https://www.facebook.com/records/', icon: 'meta', note: 'Meta\'s Law Enforcement Online Request System (Facebook, Instagram, WhatsApp), with your account.' },
    // v1.57
    { id: 'leo-ilcs', tab: 'leo', name: 'Illinois Compiled Statutes', url: 'https://www.ilga.gov/Legislation/ILCS/Chapters', icon: 'bank2', note: 'The Illinois Compiled Statutes (ILCS), by chapter.' },
    { id: 'leo-chicagocop', tab: 'leo', name: 'Chicago Cop', url: 'https://chicagocop.com/', icon: 'police-star', note: 'ChicagoCop.com: news and information for Chicago police officers.' },
    { id: 'leo-nw3c', tab: 'leo', name: 'NW3C', url: 'https://www.nw3c.org/UI/Login.html', icon: 'laptop-shield', note: 'National White Collar Crime Center: training and investigative support, with your account.' },
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
    const base = DEFAULTS.map((d) => ({ ...d, ...(d.hash || d.fixed ? {} : pick(edits[d.id])), hidden: !d.fixed && hidden.has(d.id), custom: false }));
    const custom = (Array.isArray(s.custom) ? s.custom : [])
      .filter((c) => c && c.id && TABS.some((t) => t.key === c.tab) && c.tab !== 'reference')
      .map((c) => ({ id: c.id, tab: c.tab, name: String(c.name || 'Link'), url: cleanUrl(c.url) || '', note: String(c.note || ''), icon: 'link-45deg', hidden: hidden.has(c.id), custom: true }));
    // Your own order (v1.29): order = [id, …], links not in it keep their place after those that are.
    const all = [...base, ...custom];
    const order = Array.isArray(s.order) ? s.order : [];
    const rank = (l) => { const i = order.indexOf(l.id); return i < 0 ? order.length + all.indexOf(l) : i; };
    return all.map((l) => ({ l, r: rank(l) })).sort((a, b) => a.r - b.r).map((x) => x.l);
  }

  /** The order after moving link id by step (-1 left, +1 right) among the links of its tab. */
  function moveLink(saved, id, step) {
    const all = linksOf(saved);
    const l = all.find((x) => x.id === id);
    if (!l) return all.map((x) => x.id);
    const tab = all.filter((x) => x.tab === l.tab).map((x) => x.id);
    const i = tab.indexOf(id);
    const j = Math.max(0, Math.min(tab.length - 1, i + step));
    tab.splice(i, 1); tab.splice(j, 0, id);
    let k = 0;
    return all.map((x) => (x.tab === l.tab ? tab[k++] : x.id));
  }

  /** The order after dropping link id before (or, after = true, after) link target. */
  function dropLink(saved, id, target, after = false) {
    const ids = linksOf(saved).map((x) => x.id).filter((x) => x !== id);
    const t = ids.indexOf(target);
    if (t < 0) return linksOf(saved).map((x) => x.id);
    ids.splice(t + (after ? 1 : 0), 0, id);
    return ids;
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

  const api = { TABS, DEFAULTS, cleanUrl, linksOf, moveLink, dropLink, BUG_REPORT_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVLinks = api;
})(this);
