/* CaseVault — the Rolodex (v1.175): the people you call on case after case (ASAs, AUSAs, officers
 * of other departments, anyone else) with their office, email and phone, kept once in vault.json
 * on the SSD. Their names are suggested in a case's Contacts and in the Draft tab's ASA and AUSA
 * lines; picking one fills in the rest.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const clean = (v) => String(v == null ? '' : v).trim();
  const KINDS = ['ASA', 'AUSA', 'Other Police', 'Other'];
  const FIELDS = [['name', 'Name'], ['agency', 'Office / Agency'], ['title', 'Title / Unit'], ['email', 'Email'], ['phone', 'Phone'], ['notes', 'Notes']];

  /** One card, tidied: a known kind, the text fields trimmed. */
  function normalize(x) {
    const o = { id: clean(x && x.id) || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: KINDS.includes(x && x.kind) ? x.kind : 'Other' };
    for (const [k] of FIELDS) o[k] = clean(x && x[k]);
    return o;
  }
  /** The cards with a name, by kind (ASA, AUSA, Other Police, Other) then name. */
  function sorted(list) {
    return (list || []).map(normalize).filter((x) => x.name)
      .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
  }
  /** The cards with every word typed (in the name, office, title, email or phone), of the kinds given. */
  function find(list, q = '', kinds = null) {
    const words = clean(q).toLowerCase().split(/\s+/).filter(Boolean);
    return sorted(list).filter((x) => (!kinds || kinds.includes(x.kind))
      && words.every((w) => [x.name, x.agency, x.title, x.email, x.phone, x.kind].join(' ').toLowerCase().includes(w)));
  }
  /** Suggestions for a name box (CVCombo items): the name, with the kind and office beside it. */
  function comboItems(list, kinds = null) {
    return find(list, '', kinds).map((x) => ({ value: x.name, label: x.name, hint: [x.kind, x.agency].filter(Boolean).join(' · '), card: x }));
  }
  /** Adds a contact typed on a case to the Rolodex, or fills in the card with the same name (only
   * what it lacks). -> { list, added: true | false, changed: number of fields filled } */
  function remember(list, card) {
    const c = normalize(card);
    const out = sorted(list);
    if (!c.name) return { list: out, added: false, changed: 0 };
    const same = out.find((x) => x.name.toLowerCase() === c.name.toLowerCase() && x.kind === c.kind);
    if (!same) return { list: sorted([...out, c]), added: true, changed: 0 };
    let changed = 0;
    for (const [k] of FIELDS) if (!same[k] && c[k]) { same[k] = c[k]; changed++; }
    return { list: out, added: false, changed };
  }

  /* ---------- browser ---------- */
  const listNow = () => sorted((typeof Vault !== 'undefined' && Vault.data && Vault.data.settings && Vault.data.settings.rolodex) || []);
  const store = (list) => Vault.updateSettings({ rolodex: sorted(list) });

  /** Remembers a contact (a case's prosecutor or other contact) in the Rolodex. -> 'added' | 'updated' | '' */
  async function keep(card) {
    const r = remember(listNow(), card);
    if (!r.added && !r.changed) return '';
    await store(r.list);
    return r.added ? 'added' : 'updated';
  }

  /** The Rolodex window: every card, by kind, to add, change, search or remove. */
  async function open(ui) {
    const { h, openDialog, toast } = ui;
    const I = ui.icon;
    let list = listNow();
    let dirty = false;
    await openDialog((done) => {
      const q = h('input', { type: 'search', placeholder: 'Search by name, office, email or phone', 'aria-label': 'Search the Rolodex', autocomplete: 'off' });
      const kindSel = h('select', { 'aria-label': 'Show' }, h('option', { value: '' }, 'All'), ...KINDS.map((k) => h('option', { value: k }, k)));
      const body = h('div', { class: 'rolo-list' });
      const save = () => { dirty = true; store(list).catch((err) => toast(`The Rolodex was not saved: ${err.message}`, 'error')); };
      const draw = (focusId = '') => {
        const shown = new Set(find(list, q.value, kindSel.value ? [kindSel.value] : null).map((x) => x.id));
        const blanks = list.filter((x) => !x.name); // a card just added, still empty
        const cards = [...blanks, ...sorted(list)].filter((x) => !x.name || shown.has(x.id));
        body.replaceChildren(...(cards.length ? cards.map((x) => {
          const card = list.find((y) => y.id === x.id) || x;
          const kind = h('select', { 'aria-label': 'Kind' }, ...KINDS.map((k) => h('option', { value: k, selected: k === card.kind }, k)));
          kind.addEventListener('change', () => { card.kind = kind.value; save(); });
          const inputs = FIELDS.map(([k, label]) => {
            const el = h('input', { type: k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text', value: card[k] || '', maxlength: k === 'notes' ? 400 : 160, autocomplete: 'off', 'aria-label': label, 'data-key': k });
            el.addEventListener('input', () => { card[k] = el.value.trim(); save(); });
            return h('label', { class: `field rolo-${k}` }, h('span', {}, label), el);
          });
          const del = h('button', { class: 'icon-btn danger-icon', type: 'button', onclick: () => { list = list.filter((y) => y.id !== card.id); save(); draw(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove ${card.name || 'this card'}`));
          return h('div', { class: 'rolo-card', 'data-id': card.id }, h('label', { class: 'field rolo-kind' }, h('span', {}, 'Kind'), kind), ...inputs, del);
        }) : [h('p', { class: 'muted empty-note' }, I('person-rolodex'), h('span', {}, list.length ? 'No one matches.' : 'No one yet. Add Contact makes a card; a case\'s prosecutor or contact can also be saved here from its Details tab.'))]));
        if (focusId) { const el = body.querySelector(`[data-id="${focusId}"] input`); if (el) el.focus(); }
      };
      q.addEventListener('input', () => draw());
      kindSel.addEventListener('change', () => draw());
      const add = h('button', { class: 'btn primary small', type: 'button', icon: 'person-plus', onclick: () => {
        const card = normalize({ kind: kindSel.value || 'ASA' });
        list.push(card);
        q.value = '';
        draw(card.id);
      } }, 'Add Contact');
      draw();
      return h('div', { class: 'rolodex-form' },
        h('h2', { icon: 'person-rolodex' }, 'Rolodex'),
        h('p', { class: 'muted small' }, 'Prosecutors, other departments and anyone else you work with, kept on the SSD. Their names are offered in a case\'s Contacts and on the Draft tab, and fill in the email and phone.'),
        h('div', { class: 'rolo-tools' }, q, kindSel, add),
        body,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done')));
    });
    if (dirty) { list = sorted(list); await store(list).catch(() => {}); }
  }

  const api = { KINDS, FIELDS, normalize, sorted, find, comboItems, remember, list: listNow, keep, open };
  if (isNode) module.exports = api;
  else root.CVRolodex = api;
})(this);
