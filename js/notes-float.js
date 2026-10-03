/* CaseVault — Field Notes in a floating box (v1.24).
 *
 * A round Notes button sits at the bottom right of every screen. It opens the case's Field Notes
 * (notes.md, the same notes as Reports → Field Notes) in a box like Ask AI: it can be dragged by
 * its title bar, resized from the corner, made bigger or minimized, and stays open while you move
 * around the case. The case follows the one you have open; another can be picked from the list.
 *
 * Saving is the same as on the Field Notes page: a moment after typing stops, or Save / Ctrl+S.
 * When the notes page of the same case is on screen, the two stay in step (cv-notes-changed).
 */
'use strict';

(function (root) {
  let ui = null;
  let els = null;
  const mem = { open: false, caseId: '', loaded: '', size: 'normal', pos: null, userSize: null };

  const activeCases = () => (Vault.data.cases || []).filter((c) => c.status !== 'Archived' && !Vault.isArchived(c.id)).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const caseLabel = (c) => `${c.title || 'Untitled case'}${c.number ? ` · ${c.number}` : ''}`;
  const key = (id) => `notes:${id}`;

  function build() {
    const { h, icon: I } = ui;
    const caseSel = h('select', { 'aria-label': 'Case', title: 'Whose Field Notes. Follows the case you have open.' });
    const ta = h('textarea', { class: 'notes-float-editor', spellcheck: 'true', 'aria-label': 'Field Notes', placeholder: 'Write notes here. They save to the case on the SSD.' });
    const status = h('span', { class: 'note-save-status small muted', role: 'status', 'aria-live': 'polite' });
    const counter = h('span', { class: 'muted small' });
    const iconBtn = (name, label, onclick) => h('button', { class: 'icon-btn', type: 'button', title: label, onclick }, I(name), h('span', { class: 'sr-only' }, label));
    const openPage = iconBtn('box-arrow-up-right', 'Open the Field Notes page of this case', () => { if (mem.caseId) { ui.Save.flushAll(); location.hash = `#/case/${encodeURIComponent(mem.caseId)}/reports/.notes`; } });
    const sizeBtn = iconBtn('arrows-angle-expand', 'Bigger', () => setSize(mem.size === 'big' ? 'normal' : 'big'));
    const minBtn = iconBtn('dash-lg', 'Minimize: keep the notes, out of the way', () => setSize(mem.size === 'min' ? 'normal' : 'min'));
    const closeBtn = iconBtn('x-lg', 'Close. Everything typed is saved.', () => toggle(false));
    const saveBtn = h('button', { class: 'btn small primary', type: 'button', title: 'Save now (Ctrl+S). Notes also save by themselves.' }, 'Save');
    const head = h('div', { class: 'chat-float-head', title: 'Drag to move' },
      h('div', { class: 'chat-float-title' }, I('journal-text'), h('strong', {}, 'Field Notes')), h('div', { class: 'spacer' }), openPage, sizeBtn, minBtn, closeBtn);

    const rich = root.CVRichEditor ? CVRichEditor.create(ta, { h, icon: I, label: 'Field Notes' }) : null;
    const bar = root.CVFormatBar ? CVFormatBar.attach(ta, { h, icon: I, rich }) : null;
    const empty = h('p', { class: 'muted small notes-float-empty', hidden: true }, 'Open a case, or pick one above, to write its Field Notes.');
    const box = h('section', { class: 'chat-float notes-float', id: 'notes-float', role: 'dialog', 'aria-label': 'Field Notes', hidden: true },
      head,
      h('div', { class: 'chat-float-body' },
        h('div', { class: 'notes-float-top' }, ui.field('Case', caseSel)),
        empty,
        h('div', { class: 'notes-float-edit' }, bar, rich ? rich.el : null, ta),
        h('div', { class: 'notes-float-foot' }, counter, h('div', { class: 'spacer' }), status, saveBtn)));
    document.body.append(box);

    const count = () => { const n = (ta.value.match(/\S+/g) || []).length; counter.textContent = `${n} word${n === 1 ? '' : 's'}`; };
    const markSaved = () => { status.className = 'note-save-status small ok-text'; status.textContent = `✓ Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };
    const saver = (id, value) => async () => {
      await Vault.saveNotes(id, value);
      if (mem.caseId === id && ta.value === value) markSaved();
      root.dispatchEvent(new CustomEvent('cv-notes-changed', { detail: { caseId: id, text: value, from: 'float' } }));
    };
    ta.addEventListener('input', () => {
      if (!mem.caseId) return;
      count();
      status.className = 'note-save-status small warn-text';
      status.textContent = 'Not saved yet…';
      ui.Save.schedule(key(mem.caseId), saver(mem.caseId, ta.value), 700);
    });
    saveBtn.addEventListener('click', async () => {
      if (!mem.caseId) return;
      const k = key(mem.caseId);
      const pending = ui.Save.timers.get(k);
      if (pending) { clearTimeout(pending.timer); ui.Save.timers.delete(k); }
      saveBtn.disabled = true;
      try { await ui.Save.run(k, saver(mem.caseId, ta.value)); } catch { /* shown by the header indicator */ } finally { saveBtn.disabled = false; }
    });
    caseSel.addEventListener('change', () => { ui.Save.flushAll(); load(caseSel.value, true); });

    // The Field Notes page saved: show it here too, unless you're typing here.
    root.addEventListener('cv-notes-changed', (e) => {
      const d = e.detail || {};
      if (d.from === 'float' || d.caseId !== mem.caseId || box.contains(document.activeElement)) return;
      ta.value = d.text; mem.loaded = d.caseId; count();
    });

    // Drag by the title bar (as Ask AI).
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button') || mem.size === 'big') return;
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left; const dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      box.classList.add('moving');
      const move = (ev) => { mem.pos = { x: Math.max(4, Math.min(ev.clientX - dx, innerWidth - r.width - 4)), y: Math.max(4, Math.min(ev.clientY - dy, innerHeight - 40)) }; place(); };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); box.classList.remove('moving'); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setSize('min'); } });
    root.addEventListener('hashchange', () => { if (mem.open) follow(); });

    els = { box, caseSel, ta, status, counter, empty, sizeBtn, minBtn, rich, edit: box.querySelector('.notes-float-edit') };
  }

  function place() {
    const { box } = els;
    if (mem.pos && mem.size !== 'big') {
      box.style.left = `${Math.round(Math.min(mem.pos.x, innerWidth - 120))}px`;
      box.style.top = `${Math.round(Math.min(mem.pos.y, innerHeight - 40))}px`;
      box.style.right = 'auto'; box.style.bottom = 'auto';
    } else { box.style.left = ''; box.style.top = ''; box.style.right = ''; box.style.bottom = ''; }
  }

  function setSize(size) {
    const { box, sizeBtn, minBtn } = els;
    if (mem.size === 'normal') mem.userSize = { w: box.style.width, h: box.style.height };
    mem.size = size;
    box.style.width = size === 'normal' && mem.userSize ? mem.userSize.w : '';
    box.style.height = size === 'normal' && mem.userSize ? mem.userSize.h : '';
    box.classList.toggle('big', size === 'big');
    box.classList.toggle('min', size === 'min');
    sizeBtn.replaceChildren(ui.icon(size === 'big' ? 'arrows-angle-contract' : 'arrows-angle-expand'), ui.h('span', { class: 'sr-only' }, size === 'big' ? 'Smaller' : 'Bigger'));
    sizeBtn.title = size === 'big' ? 'Smaller' : 'Bigger';
    minBtn.title = size === 'min' ? 'Show the notes again' : 'Minimize: keep the notes, out of the way';
    place();
  }

  function fillCases() {
    const { h } = ui;
    const cases = activeCases();
    els.caseSel.replaceChildren(h('option', { value: '' }, '— Pick a case —'), ...cases.map((c) => h('option', { value: c.id }, caseLabel(c))));
    els.caseSel.value = cases.some((c) => c.id === mem.caseId) ? mem.caseId : '';
  }

  /** The notes of a case into the box (the case you have open, unless you picked another). */
  async function load(id, picked = false) {
    mem.caseId = id || '';
    if (picked) mem.picked = true;
    els.caseSel.value = mem.caseId;
    els.empty.hidden = !!mem.caseId;
    els.edit.hidden = !mem.caseId;
    els.status.textContent = '';
    if (!mem.caseId) { els.ta.value = ''; els.counter.textContent = ''; return; }
    let text = '';
    try { text = await Vault.getNotes(mem.caseId); } catch (err) { ui.toast(`Couldn't read the notes: ${err.message || err}`, 'error'); }
    if (mem.caseId !== id) return;
    els.ta.value = text; mem.loaded = id;
    const n = (text.match(/\S+/g) || []).length;
    els.counter.textContent = `${n} word${n === 1 ? '' : 's'}`;
    els.status.className = 'note-save-status small muted';
    els.status.textContent = text ? '✓ Saved on the SSD' : '';
  }

  function follow() {
    const open = ui.state.caseId && activeCases().some((c) => c.id === ui.state.caseId) ? ui.state.caseId : '';
    fillCases();
    if (open && open !== mem.caseId && !mem.picked) { ui.Save.flushAll(); load(open); }
  }

  /** Open (true), close (false) or switch. */
  async function toggle(want) {
    if (!ui.state.connected) return;
    if (!els) build();
    const open = want == null ? !mem.open || mem.size === 'min' : want;
    mem.open = open;
    els.box.hidden = !open;
    document.body.classList.toggle('notes-open', open);
    const fab = document.getElementById('btn-notes-fab');
    if (fab) fab.setAttribute('aria-expanded', String(open));
    if (!open) { ui.Save.flushAll(); mem.picked = false; return; }
    if (mem.size === 'min') setSize('normal');
    place();
    mem.picked = false;
    fillCases();
    const want2 = ui.state.caseId && activeCases().some((c) => c.id === ui.state.caseId) ? ui.state.caseId : mem.caseId;
    await load(want2);
    (els.rich && els.rich.el && !els.rich.el.hidden && els.rich.el.getClientRects().length ? els.rich.el : els.ta).focus();
  }

  /** The SSD was disconnected or the vault closed. */
  function reset() {
    mem.open = false; mem.caseId = ''; mem.picked = false;
    if (els) { els.box.hidden = true; els.ta.value = ''; }
    document.body.classList.remove('notes-open');
  }

  function init(kit) {
    ui = kit;
    const fab = ui.h('button', { id: 'btn-notes-fab', class: 'fab notes-fab', type: 'button', 'aria-controls': 'notes-float', 'aria-expanded': 'false', title: 'Field Notes', 'data-tip-side': 'left' }, ui.icon('journal-text'), ui.h('span', { class: 'sr-only' }, 'Field Notes'));
    fab.addEventListener('click', () => toggle());
    // v1.26: Ask AI moves from the header to sit beside the Notes button, bottom right.
    const dock = ui.h('div', { id: 'fab-dock', class: 'fab-dock' });
    const chat = document.getElementById('btn-chat');
    if (chat) {
      chat.className = 'fab chat-fab';
      chat.removeAttribute('data-tip');
      chat.title = 'Ask AI';
      chat.dataset.tipSide = 'left';
      dock.append(chat);
    }
    dock.append(fab);
    // v1.70: Back to Top, beside Ask AI (v1.71: always shown, an up caret).
    const top = ui.h('button', { id: 'btn-top-fab', class: 'fab top-fab', type: 'button', title: 'Back to top', 'data-tip-side': 'left' }, ui.icon('chevron-up'), ui.h('span', { class: 'sr-only' }, 'Back to top'));
    const scroller = () => document.getElementById('main');
    top.addEventListener('click', () => { const m = scroller(); if (m) m.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const sync = () => { const m = scroller(); top.classList.toggle('on', ((m && m.scrollTop) || 0) > 300 || window.scrollY > 300); };
    document.addEventListener('scroll', sync, { capture: true, passive: true });
    window.addEventListener('hashchange', () => setTimeout(sync, 50));
    dock.prepend(top);
    sync();
    document.body.append(dock);
  }

  root.CVNotesFloat = { init, toggle, reset, isOpen: () => mem.open };
})(typeof window !== 'undefined' ? window : globalThis);
