/* CaseVault — the Case Overview on the Details tab: suspects, Mission timeline line, case tiles, LEO partners, contacts, deconfliction and Case History.
 * Moved out of app.js in v1.98 (same code): app.js hands over the shared helpers with init(kit). */
'use strict';

(function (root) {
  function init(kit) {
    const { h, field, dnaCombo, I, today, fmtDate, dueLabel, opOf, Save, newCase, openDialog,
      fmtDateTime } = kit;

    /* Suspects on the Details tab: name, date of birth (the age is worked out), residence and role
     * (Main, Secondary, Other). Kept in case.json as c.suspects; {{suspect.*}} fills templates with
     * the main suspect and {{suspects}} lists them all. */
    function suspectsSection(c, save) {
      if (!Array.isArray(c.suspects)) c.suspects = [];
      const rows = h('div', { class: 'suspect-rows' });
      // v1.93: Primary first, then Secondary, then Other (in the order added within each role).
      const RANK = { Primary: 0, Main: 0, Secondary: 1 };
      const rank = (s) => (s && s.role in RANK ? RANK[s.role] : s && s.role ? 2 : 0);
      const sortSuspects = () => {
        const sorted = c.suspects.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
        const moved = sorted.some((s, i) => s !== c.suspects[i]);
        if (moved) c.suspects.splice(0, c.suspects.length, ...sorted);
        return moved;
      };
      const cardOf = (s) => rows.children[c.suspects.indexOf(s)];
      const draw = () => {
        sortSuspects();
        rows.replaceChildren(...(c.suspects.length ? c.suspects.map((s, i) => {
          const who = `Suspect ${i + 1}`;
          const input = (key, attrs) => { const el = h('input', { value: s[key] || '', autocomplete: 'off', ...attrs }); el.addEventListener('input', () => { s[key] = el.value.trim(); save(); }); return el; };
          const age = h('output', { class: 'suspect-age', 'aria-label': `${who} age` });
          const showAge = () => { const a = CVDraft.ageOn(s.dob); age.textContent = a == null ? '—' : String(a); };
          const dob = input('dob', { type: 'date', 'aria-label': `${who} date of birth` });
          dob.addEventListener('input', showAge);
          showAge();
          const role = h('select', { 'aria-label': `${who} role` }, CVDraft.SUSPECT_ROLES.map((r) => h('option', { value: r, selected: r === (s.role || 'Primary') }, r)));
          role.addEventListener('change', () => {
            s.role = role.value;
            if (sortSuspects()) { draw(); const card0 = cardOf(s); const sel = card0 && card0.querySelector(`select[aria-label$="role"]`); if (sel) { sel.focus(); card0.scrollIntoView({ block: 'nearest' }); } }
            save();
          });
          if (!s.role || s.role === 'Main') s.role = 'Primary'; // "Main" before v1.36
          // Demographics (v1.34), kept in s.info: Add From Suspects on the Draft tab copies them into Offenders.
          if (!s.info || typeof s.info !== 'object') s.info = {};
          const PERSON = (k) => CVReportFields.SUSPECT_INFO.find(([key]) => key === k);
          const infoInput = (k, attrs = {}) => {
            // v1.39: the record numbers and a phone, besides the description.
            const EXTRA = { phone: 'Phone Number', moniker: 'Moniker / Social Media' };
            const [, label, kind, opts] = PERSON(k) || [k, EXTRA[k] || k, k === 'phone' ? 'phone' : 'text'];
            let el;
            if (kind === 'select') el = h('select', { 'aria-label': `${who} ${label}` }, opts.map((o) => h('option', { value: o, selected: o === (s.info[k] || '') }, o || '—')));
            else el = h('input', { value: s.info[k] || '', autocomplete: 'off', maxlength: 200, 'aria-label': `${who} ${label}`, type: kind === 'phone' ? 'tel' : 'text', list: kind === 'hair' ? 'suspect-hair' : kind === 'hairStyle' ? 'suspect-hairstyle' : kind === 'eyes' ? 'suspect-eyes' : null, placeholder: kind === 'height' ? '5 ft 10 in' : kind === 'weight' ? '160 Pounds' : '', ...attrs });
            el.addEventListener(kind === 'select' ? 'change' : 'input', () => { s.info[k] = el.value.trim(); save(); });
            return field(label, ['irNumber', 'fbiNumber', 'idocNumber'].includes(k) ? dnaCombo(el) : el, kind === 'wide' ? 'suspect-wide' : '');
          };
          const demo = h('div', { class: 'suspect-demo' },
            // v1.69: the same fields as an offender on the Draft (all but Clothing Description).
            ['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran', 'relation', 'irNumber', 'fbiNumber', 'idocNumber', 'phone', 'moniker', 'marks'].map((k) => infoInput(k)));
          // v1.67: Not Identified: the name box is set aside (kept, in case it's filled later).
          const nameIn = input('name', { maxlength: 120, 'aria-label': `${who} name` });
          const notId = h('input', { type: 'checkbox', checked: !!s.notIdentified, 'aria-label': `${who} not identified` });
          const showNotId = () => { nameIn.disabled = notId.checked; nameIn.placeholder = notId.checked ? 'Not Identified' : ''; card.classList.toggle('not-identified', notId.checked); };
          notId.addEventListener('change', () => { s.notIdentified = notId.checked; showNotId(); save(); });
          const card = h('div', { class: 'suspect-card' }, h('div', { class: 'suspect-row' },
            h('div', { class: 'field suspect-name-field' }, h('span', { class: 'suspect-name-label' }, 'Name', h('label', { class: 'suspect-notid', title: 'The suspect has not been identified yet. Templates and the Draft show "Not Identified".' }, notId, h('span', {}, 'Not Identified'))), nameIn),
            field('DOB', dob),
            h('div', { class: 'field' }, h('span', {}, 'Age'), age),
            field('Residence', input('residence', { maxlength: 200, 'aria-label': `${who} residence`, title: s.residence || '' })),
            field('Role', role),
            h('button', { class: 'icon-btn danger-icon contact-remove', type: 'button', title: 'Remove this suspect', onclick: () => { c.suspects.splice(i, 1); draw(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove ${who}`))),
            demo);
          showNotId();
          return card;
        }) : [h('p', { class: 'muted small suspect-empty empty-note' }, I('person-vcard'), h('span', {}, 'No suspects yet. Add suspect makes one.'))]));
      };
      draw();
      return h('section', { class: 'contacts suspects cv-boxed', 'aria-labelledby': 'suspects-title' },
        h('h3', { id: 'suspects-title', icon: 'person-exclamation', title: 'The people this case is about. The age is worked out from the date of birth. The main suspect fills {{suspect.name}}, {{suspect.dob}}, {{suspect.age}} and so on in templates; {{suspects}} lists them all.' }, 'Suspects'),
        h('datalist', { id: 'suspect-hair' }, CVReportFields.PICKS.hair.map((x) => h('option', { value: x }))),
        h('datalist', { id: 'suspect-hairstyle' }, CVReportFields.PICKS.hairStyle.map((x) => h('option', { value: x }))),
        h('datalist', { id: 'suspect-eyes' }, CVReportFields.PICKS.eyes.map((x) => h('option', { value: x }))),
        rows,
        h('div', { class: 'contact-add' }, h('button', { class: 'btn small', type: 'button', icon: 'person-plus', onclick: () => {
          const added = { name: '', dob: '', residence: '', info: {}, role: c.suspects.some((x) => x.role === 'Primary' || x.role === 'Main') ? 'Secondary' : 'Primary' };
          c.suspects.push(added);
          draw();
          // The new card sits in its role's place (a Secondary goes before the Others).
          const card0 = cardOf(added);
          const first = card0 && (card0.querySelector('input[aria-label$=" name"]') || card0.querySelector('input'));
          if (first) { first.focus(); card0.scrollIntoView({ block: 'nearest' }); }
        } }, 'Add suspect')));
    }

    /* A slim timeline on the Details tab (v1.37): a line with a small dot for each event of the
     * operation (every case number), in date order, and a Today mark. Point at a dot for its date,
     * title and note; click it to open that case's Timeline tab. */
    function miniTimeline(c, members) {
      const box = h('section', { class: 'mini-tl', 'aria-label': 'Timeline' });
      (async () => {
        const tls = [];
        for (const m of members) { try { tls.push({ caseId: m.id, number: m.number || '', events: ((await Vault.getTimeline(m.id)) || {}).events || [] }); } catch { /* moved */ } }
        const rows = CVOperation.mergeEvents(tls).filter((r) => r.ev && r.ev.date);
        if (!rows.length) { box.replaceChildren(h('div', { class: 'mini-tl-head' }, h('span', { class: 'mini-tl-title' }, 'Timeline'), h('a', { class: 'muted small', href: `#/case/${encodeURIComponent(c.id)}/timeline` }, 'No events yet. Add them on the Timeline tab.'))); return; }
        const t = (d) => new Date(`${d}T12:00:00`).getTime();
        const todayIso = today();
        const first = Math.min(t(rows[0].ev.date), t(todayIso));
        const last = Math.max(t(rows[rows.length - 1].ev.date), t(todayIso));
        const span = Math.max(last - first, 864e5);
        const pos = (d) => `${(3 + 94 * (t(d) - first) / span).toFixed(2)}%`;
        const line = h('div', { class: 'mini-tl-line' });
        const tip = (ev, number) => [`${fmtDate(ev.date)}${ev.time ? ` ${ev.time}` : ''}`, ev.title || (ev.kind === 'deadline' ? 'Deadline' : 'Event'),
          ev.kind === 'deadline' ? (ev.done ? 'Deadline: done' : `Deadline: ${dueLabel(ev.date).text}`) : '', number && members.length > 1 ? `Case ${number}` : '', ev.note || ''].filter(Boolean).join('\n');
        // v1.97: events too close to tell apart (the same day, or a day or two on a long line) share
        // one marker with their count; pointing at it lists them all. Worked out again on resize.
        const pct = (d) => 3 + 94 * (t(d) - first) / span;
        const marker = (group) => {
          const evs = group.items.map((r) => r.ev);
          const dues = evs.map((ev) => (ev.kind === 'deadline' && !ev.done ? dueLabel(ev.date) : null));
          const due = dues.find((d) => d && d.cls === 'overdue') || dues.find(Boolean);
          const deadline = evs.some((ev) => ev.kind === 'deadline');
          const done = evs.every((ev) => ev.done);
          const many = evs.length > 1;
          const text = many ? [`${evs.length} events`, ...group.items.map(({ ev, number }) => `${fmtDate(ev.date)}${ev.time ? ` ${ev.time}` : ''} · ${ev.title || (ev.kind === 'deadline' ? 'Deadline' : 'Event')}${ev.kind === 'deadline' ? (ev.done ? ' (done)' : ` (${dueLabel(ev.date).text})`) : ''}${number && members.length > 1 ? ` · ${number}` : ''}`)].join('\n')
            : tip(evs[0], group.items[0].number);
          const dot = h('a', { class: `mini-tl-dot${many ? ' mini-tl-group' : ''}${deadline ? ' deadline' : ''}${done ? ' done' : ''}${due ? ` ${due.cls}` : ''}`, href: `#/case/${encodeURIComponent(group.items[0].caseId)}/timeline`, 'data-tip': text, 'aria-label': text.replace(/\n/g, ', ') }, many ? String(evs.length) : null);
          dot.style.setProperty('left', `${group.x.toFixed(2)}%`);
          return dot;
        };
        const place = () => {
          const gap = (18 / (line.clientWidth || 900)) * 100;
          let groups = [];
          for (const r of rows) {
            const x = pct(r.ev.date);
            const g = groups[groups.length - 1];
            if (g && x - g.x0 < gap) { g.items.push(r); g.xs.push(x); } else groups.push({ x0: x, items: [r], xs: [x] });
          }
          groups.forEach((g) => { g.x = g.xs.reduce((a, b) => a + b, 0) / g.xs.length; });
          for (let i = 1; i < groups.length; i += 1) {
            if (groups[i].x - groups[i - 1].x < gap) {
              const a = groups[i - 1]; const b = groups[i];
              a.items.push(...b.items); a.xs.push(...b.xs); a.x = a.xs.reduce((m, n) => m + n, 0) / a.xs.length;
              groups.splice(i, 1); i = Math.max(0, i - 2);
            }
          }
          groups = groups.map(marker);
          line.querySelectorAll('.mini-tl-dot').forEach((d) => d.remove());
          line.prepend(...groups);
        };
        let width = 0;
        new ResizeObserver(() => { if (line.clientWidth && line.clientWidth !== width) { width = line.clientWidth; place(); } }).observe(line);
        place();
        const now = h('span', { class: 'mini-tl-today', 'data-tip': `Today, ${fmtDate(todayIso)}`, 'aria-label': 'Today' });
        now.style.setProperty('left', pos(todayIso));
        line.append(now);
        box.replaceChildren(
          h('div', { class: 'mini-tl-head' }, h('span', { class: 'mini-tl-title' }, 'Timeline'), h('span', { class: 'muted small' }, `${rows.length} event${rows.length === 1 ? '' : 's'}`), h('div', { class: 'spacer' }),
            h('span', { class: 'muted small' }, `${fmtDate(new Date(first).toISOString().slice(0, 10))} – ${fmtDate(new Date(last).toISOString().slice(0, 10))}`)),
          line);
      })();
      return box;
    }

    /* The operation's case numbers (v1.27): a folder for each, its number under it; the one on
     * screen is highlighted. Click one to open it; + adds a case number to the operation. */
    function caseTiles(c, members, archived) {
      const sorted = [...members].sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }));
      if (!opOf(c)) return null; // v1.46: an independent case has no Operation to show
      return h('div', { class: 'case-tiles', role: 'list', 'aria-label': 'Case numbers in this Mission' },
        sorted.map((x) => {
          const cur = x.id === c.id;
          // v1.37: every case number's folder opens that case's Reports tab (this one's too).
          return h('a', { class: `case-tile${cur ? ' current' : ''} status-${String(x.status).toLowerCase()}`, role: 'listitem', href: `#/case/${encodeURIComponent(x.id)}/reports`, title: `${x.number || 'No case number'} · ${x.status}${cur ? ' (this one)' : ''}: open its Reports` },
            I(cur ? 'folder2-open' : 'folder-fill'), h('span', { class: 'case-tile-num' }, x.number || 'No number'), h('span', { class: 'case-tile-status' }, x.status));
        }),
        archived ? null : h('button', { class: 'case-tile add', type: 'button', title: 'Add a case number to this Mission: a new case in General Files, linked to it, with the same file number, federal jacket number and client', onclick: () => { Save.flushAll(); newCase({ operationId: c.operationId }); } },
          I('plus-lg'), h('span', { class: 'case-tile-num' }, 'Add Case Number')));
    }

    /* LEO partners on the Details tab (v1.26): the agencies working the case with you. Local PD and
     * Sheriff Dept ask which department. Kept in case.json as c.partners [{ agency, name }];
     * {{case.partners}} fills templates. */
    const DEPT_QUESTION = { 'State PD': 'Which state police?', 'Local PD': 'Which police department?', 'Sheriff Dept': 'Which sheriff\'s department?', Other: 'Which agency?' };
    function askDepartment(agency, current = '') {
      return openDialog((close) => {
        const inp = h('input', { type: 'text', value: current, autofocus: true, maxlength: 300, placeholder: agency === 'State PD' ? 'Illinois State Police' : agency === 'Local PD' ? 'Evanston Police Department' : agency === 'Other' ? 'Postal Service OIG; Amtrak Police' : 'Cook County Sheriff\'s Office', 'aria-label': DEPT_QUESTION[agency] });
        return h('form', { class: 'partner-form', onsubmit: (e) => { e.preventDefault(); close(inp.value.trim()); } },
          h('h2', { icon: 'building' }, DEPT_QUESTION[agency]),
          h('p', { class: 'muted small' }, 'More than one? Separate them with a semicolon (;).'),
          field(agency, inp),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'OK')));
      });
    }
    /* LEO Partners as badges (v1.33; v1.51: CaseVault's own colour badge for each agency, not a seal),
     * the Chicago six-pointed star for Local PD and a police shield for the Sheriff. */
    const CHICAGO_STAR = 'M12.00 1.00 L9.70 8.02 L2.47 6.50 L7.40 12.00 L2.47 17.50 L9.70 15.98 L12.00 23.00 L14.30 15.98 L21.53 17.50 L16.60 12.00 L21.53 6.50 L14.30 8.02 Z';
    const emblem = (d) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'bi'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'currentColor'); svg.append(p); return svg; };
    const PARTNER_BADGES = {
      DEA: { name: 'Drug Enforcement Administration', icon: 'capsule-pill', badge: 'badge-dea', color: '#1f6f43' },
      FBI: { name: 'Federal Bureau of Investigation', icon: 'fingerprint', badge: 'badge-fbi', color: '#1f3a6b' },
      ATF: { name: 'Alcohol, Tobacco, Firearms and Explosives', icon: 'fire', badge: 'badge-atf', color: '#8a2d1c' },
      USMS: { name: 'U.S. Marshals Service', icon: 'marshal-star', badge: 'badge-usms', color: '#5a4a1a' },
      IRS: { name: 'IRS Criminal Investigation', icon: 'cash-coin', badge: 'badge-irs', color: '#22636b' },
      CBP: { name: 'Customs and Border Protection', icon: 'globe-americas', badge: 'badge-cbp', color: '#1d4f91' },
      HSI: { name: 'Homeland Security Investigations', icon: 'shield-fill-check', badge: 'badge-hsi', color: '#2d4b73' },
      ICE: { name: 'Immigration and Customs Enforcement', icon: 'shield-shaded', badge: 'badge-ice', color: '#3b4f63' },
      USSS: { name: 'U.S. Secret Service', icon: 'star-fill', badge: 'badge-usss', color: '#7a5a12' },
      USPIS: { name: 'U.S. Postal Inspection Service', icon: 'envelope-paper', badge: 'badge-uspis', color: '#2b5aa6' },
      'State PD': { name: 'State Police', icon: 'patch-check-fill', badge: 'badge-state-pd', color: '#33507a' },
      'Local PD': { name: 'Police Department', svg: CHICAGO_STAR, badge: 'badge-local-pd', color: '#1b74c5' },
      'Sheriff Dept': { name: 'Sheriff\'s Office', icon: 'shield-fill', badge: 'badge-sheriff', color: '#6b4f1d' },
      Other: { name: 'Another agency', icon: 'building', color: '#5c6670' },
    };
    function partnersSection(c, save) {
      if (!Array.isArray(c.partners)) c.partners = [];
      const box = h('div', { class: 'partner-chips' });
      const setNames = (agency, text) => {
        c.partners = c.partners.filter((p) => p.agency !== agency);
        const names = String(text || '').split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
        for (const name of names) c.partners.push({ agency, name });
        return names.length;
      };
      // v1.54: only the agencies working this case show; "Show All Agencies" brings the rest back to
      // pick from. With none picked, all show.
      let showAll = false;
      const toggle = h('button', { class: 'btn small ghost partner-toggle', type: 'button' });
      toggle.addEventListener('click', () => { showAll = !showAll; draw(); });
      const draw = () => {
        const picked = new Set(c.partners.map((p) => p.agency));
        const all = showAll || !picked.size;
        toggle.hidden = !picked.size;
        toggle.replaceChildren(I(all ? 'eye-slash' : 'eye'), all ? ' Show Only Working This Case' : ` Show All Agencies (${CVDraft.PARTNER_AGENCIES.length - picked.size} more)`);
        box.replaceChildren(...CVDraft.PARTNER_AGENCIES.filter((agency) => all || picked.has(agency)).map((agency) => {
        const mine = c.partners.filter((p) => p.agency === agency);
        const on = mine.length > 0;
        const names = mine.map((p) => p.name).filter(Boolean).join('; ');
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': agency });
        cb.addEventListener('change', async () => {
          if (cb.checked && DEPT_QUESTION[agency]) {
            const text = await askDepartment(agency);
            if (!text || !setNames(agency, text)) { cb.checked = false; return; }
          } else if (cb.checked) c.partners.push({ agency });
          else c.partners = c.partners.filter((p) => p.agency !== agency);
          draw(); save();
        });
        const edit = on && DEPT_QUESTION[agency] ? h('button', { class: 'icon-btn partner-edit', type: 'button', title: `Change the ${agency === 'State PD' ? 'state police' : agency === 'Local PD' ? 'police department' : agency === 'Other' ? 'agency' : 'sheriff\'s department'}`, onclick: async () => {
          const text = await askDepartment(agency, names);
          if (text == null) return;
          if (!setNames(agency, text)) c.partners = c.partners.filter((p) => p.agency !== agency);
          draw(); save();
        } }, I('pencil'), h('span', { class: 'sr-only' }, `Change ${agency}`)) : null;
        const b = PARTNER_BADGES[agency] || PARTNER_BADGES.Other;
        const tile = h('div', { class: `partner-chip partner-badge${on ? ' on' : ''}` },
          h('label', { class: 'partner-pick', title: on ? `${b.name}: working this case. Click to take it off.` : `${b.name}: click if working this case.` }, cb,
            h('span', { class: `partner-emblem${b.badge ? ' partner-art' : ''}`, 'aria-hidden': 'true' }, b.badge ? I(b.badge) : b.svg ? emblem(b.svg) : I(b.icon)),
            h('span', { class: 'partner-words' }, h('strong', {}, agency === 'Sheriff Dept' ? 'Sheriff' : agency), h('span', { class: 'partner-full' }, names || b.name))),
          edit);
        tile.style.setProperty('--agency', b.color); // set from script: the page's CSP allows no inline style attributes
        return tile;
      }));
      };
      draw();
      return h('section', { class: 'contacts partners', 'aria-labelledby': 'partners-title' },
        h('h3', { id: 'partners-title', icon: 'shield-check', title: 'The agencies working this case with you. Templates can use {{case.partners}}.' }, 'LEO Partners'),
        box, h('div', { class: 'partner-tools' }, toggle));
    }

    /* Contacts on the Details tab: the case officer, the prosecutor (ASA or AUSA) and anyone else
     * the case needs (finance, asset forfeiture, the narcotic team supervisor…). Kept in case.json
     * as c.contacts; {{case.officer.*}} and {{case.prosecutor.*}} fill templates. */
    const CONTACT_ROLES = ['Team Supervisor', 'Team Member', 'Finance', 'Asset Forfeiture', 'Task Force Officer', 'Analyst', 'Lab', 'Victim Advocate'];
    function contactsSection(c, save) {
      const k = c.contacts = Object.assign({ officer: {}, prosecutor: {}, others: [] }, c.contacts || {});
      k.officer = k.officer || {}; k.prosecutor = k.prosecutor || {}; k.others = Array.isArray(k.others) ? k.others : [];
      if (!k.prosecutor.title) k.prosecutor.title = 'ASA';
      const input = (obj, key, attrs) => {
        const el = h('input', { value: obj[key] || '', ...attrs });
        el.addEventListener('input', () => { obj[key] = el.value.trim(); save(); });
        return el;
      };
      const person = (obj, who) => [
        field('Name', input(obj, 'name', { maxlength: 120, autocomplete: 'off', 'aria-label': `${who} name` })),
        field('Email', input(obj, 'email', { type: 'email', maxlength: 200, autocomplete: 'off', 'aria-label': `${who} email` })),
        field('Phone', input(obj, 'phone', { type: 'tel', maxlength: 40, autocomplete: 'off', 'aria-label': `${who} phone` })),
      ];
      const proTitle = h('select', { 'aria-label': 'Prosecutor title', title: 'ASA: Assistant State\'s Attorney. AUSA: Assistant United States Attorney.' },
        ['ASA', 'AUSA'].map((t) => h('option', { value: t, selected: t === k.prosecutor.title }, t)));
      proTitle.addEventListener('change', () => { k.prosecutor.title = proTitle.value; save(); });

      const roles = h('datalist', { id: 'contact-roles' }, CONTACT_ROLES.map((r) => h('option', { value: r })));
      const others = h('div', { class: 'contact-others' });
      const drawOthers = () => {
        others.replaceChildren(...k.others.map((o, i) => h('div', { class: 'contact-row' },
          field('Role', input(o, 'role', { maxlength: 80, list: 'contact-roles', placeholder: 'Finance', 'aria-label': `Contact ${i + 1} role` })),
          ...person(o, `Contact ${i + 1}`),
          h('button', { class: 'icon-btn danger-icon contact-remove', type: 'button', title: 'Remove this contact', onclick: () => { k.others.splice(i, 1); drawOthers(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove contact ${i + 1}`)))));
      };
      drawOthers();
      const add = h('button', { class: 'btn small', type: 'button', icon: 'person-plus', title: 'Add someone else on the case: the team supervisor, a team member, finance, asset forfeiture…', onclick: () => {
        k.others.push({ role: '', name: '', email: '', phone: '' });
        drawOthers();
        const last = others.lastElementChild && others.lastElementChild.querySelector('input');
        if (last) last.focus();
      } }, 'Add contact');

      return h('section', { class: 'contacts cv-boxed', 'aria-labelledby': 'contacts-title' },
        h('h3', { id: 'contacts-title', icon: 'people', title: 'Who to reach on this case. The case officer and prosecutor fill {{case.officer.name}}, {{case.prosecutor.email}} and so on in templates.' }, 'Contacts'),
        roles,
        h('div', { class: 'contact-row' }, h('div', { class: 'field contact-role' }, h('span', {}, 'Role'), h('strong', { class: 'contact-fixed' }, 'Case Officer')), ...person(k.officer, 'Case officer')),
        h('div', { class: 'contact-row' }, h('label', { class: 'field contact-role' }, h('span', {}, 'Role'), proTitle), ...person(k.prosecutor, 'Prosecutor')),
        others,
        h('div', { class: 'contact-add' }, add));
    }

    /* Deconfliction (v1.21): a table of each deconfliction check before an operation: date, event
     * or location, the system checked, its deconfliction number, and whether there was a conflict
     * (Yes / No). Kept in case.json as c.deconfliction. */
    const DECON_SYSTEMS = ['RISSafe', 'HIDTA Deconfliction', 'DICE', 'Case Explorer', 'SAFETNet', 'Department Deconfliction'];
    function deconflictionSection(c, save) {
      c.deconfliction = Array.isArray(c.deconfliction) ? c.deconfliction : [];
      // v1.33: a card per check, the boxes in rows that wrap, so nothing is cut off (long dates too).
      const rows = h('div', { class: 'decon-list' });
      const cellInput = (row, key, attrs) => {
        const el = h('input', { value: row[key] || '', autocomplete: 'off', ...attrs });
        el.addEventListener('input', () => { row[key] = el.value.trim(); save(); });
        el.addEventListener('change', () => { row[key] = String(el.value).trim(); save(); });
        return el;
      };
      const dateBox = (r, i) => {
        const el = cellInput(r, 'date', { type: 'date', 'aria-label': `Check ${i + 1} date` });
        el.addEventListener('change', () => { resort = true; setTimeout(settle, 0); });
        return el;
      };
      // System (v1.34): a drop-down of the deconfliction systems; Other asks for its name.
      const systemPick = (r, i) => {
        const known = DECON_SYSTEMS.includes(r.system || '');
        const other = h('input', { class: 'decon-other', value: known ? '' : (r.system || ''), autocomplete: 'off', maxlength: 100, placeholder: 'Which system?', 'aria-label': `Check ${i + 1} other system`, hidden: known || !r.system });
        const sel = h('select', { 'aria-label': `Check ${i + 1} system` },
          ['', ...DECON_SYSTEMS, 'Other'].map((o) => h('option', { value: o, selected: o === 'Other' ? (!known && !!r.system) : o === (r.system || '') }, o || '—')));
        sel.addEventListener('change', () => {
          other.hidden = sel.value !== 'Other';
          r.system = sel.value === 'Other' ? other.value.trim() : sel.value;
          save();
          if (!other.hidden) other.focus();
        });
        other.addEventListener('input', () => { r.system = other.value.trim(); save(); });
        return h('div', { class: 'decon-system' }, sel, other);
      };
      // v1.96: checks in date order, oldest first; no date goes last. A changed date re-sorts once
      // the cursor leaves the list, so a card doesn't jump while its date is being typed.
      const dateKey = (r) => (/^\d{4}-\d{2}-\d{2}$/.test((r && r.date) || '') ? r.date : '9999-99-99');
      const sortChecks = () => {
        const sorted = c.deconfliction.map((r, i) => [r, i]).sort((a, b) => dateKey(a[0]).localeCompare(dateKey(b[0])) || a[1] - b[1]).map(([r]) => r);
        const moved = sorted.some((r, i) => r !== c.deconfliction[i]);
        if (moved) c.deconfliction.splice(0, c.deconfliction.length, ...sorted);
        return moved;
      };
      let resort = false;
      const settle = () => {
        if (!resort || rows.contains(document.activeElement)) return;
        resort = false;
        if (sortChecks()) { draw(); save(); }
      };
      rows.addEventListener('focusout', () => setTimeout(settle, 0));
      const draw = () => {
        sortChecks();
        rows.replaceChildren(...(c.deconfliction.length ? c.deconfliction.map((r, i) => {
          const conflict = h('select', { 'aria-label': `Check ${i + 1} conflict`, class: r.conflict === 'Yes' ? 'decon-yes' : '' }, ['', 'No', 'Yes'].map((o) => h('option', { value: o, selected: o === (r.conflict || '') }, o || '—')));
          const card = h('div', { class: `decon-card${r.conflict === 'Yes' ? ' conflict' : ''}` });
          conflict.addEventListener('change', () => { r.conflict = conflict.value; conflict.className = r.conflict === 'Yes' ? 'decon-yes' : ''; card.classList.toggle('conflict', r.conflict === 'Yes'); save(); });
          card.append(
            h('div', { class: 'decon-card-head' }, h('strong', {}, `Check ${i + 1}`), h('div', { class: 'spacer' }),
              h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete this check', onclick: () => { c.deconfliction.splice(i, 1); draw(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete check ${i + 1}`))),
            h('div', { class: 'decon-grid' },
              field('Date', dateBox(r, i)),
              field('Event / Location', cellInput(r, 'event', { 'aria-label': `Check ${i + 1} event or location` }), 'decon-wide'),
              field('System', systemPick(r, i)),
              field('Deconfliction Number', cellInput(r, 'number', { 'aria-label': `Check ${i + 1} deconfliction number` })),
              field('Conflict', conflict),
              field('Notes', cellInput(r, 'notes', { 'aria-label': `Check ${i + 1} notes` }), 'decon-wide')));
          return card;
        }) : [h('p', { class: 'muted small empty-note' }, I('shield-check'), h('span', {}, 'No deconfliction yet.'))]));
      };
      draw();
      const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
        const row = { date: today(), event: '', system: '', number: '', conflict: '', notes: '' };
        c.deconfliction.push(row);
        draw(); save();
        const card = rows.children[c.deconfliction.indexOf(row)];
        const first = card && card.querySelector('.decon-wide input');
        if (first) { first.focus(); card.scrollIntoView({ block: 'nearest' }); }
      } }, 'Add Deconfliction');
      return h('section', { class: 'contacts deconfliction cv-boxed', 'aria-labelledby': 'decon-title' },
        h('h3', { id: 'decon-title', icon: 'shield-exclamation', title: 'Each deconfliction check for this case, and whether it showed a conflict.' }, 'Deconfliction'),
        rows,
        h('div', { class: 'contact-add' }, add));
    }

    /* v1.85: Case History: each status change and move, newest first. Cases from before v1.85 show
     * what their dates and closing history tell. */
    function historyOf(c) {
      const act = Array.isArray(c.activity) ? c.activity : [];
      // v1.89: "Opened as Open" was the day the case was put in CaseVault: it says so now. Your own
      // notes (a case migrated from before CaseVault, a transfer…) carry the day you give them.
      const rows = act.map((a, i) => {
        const m = /^Opened as (.+)$/.exec(a.what || '');
        return { at: a.day ? null : a.at, day: a.day || null, what: m ? `Added to CaseVault (${m[1]})` : a.what, note: !!a.note, index: i };
      });
      if (rows.length) {
        const added = act.find((a) => /^Opened as /.test(a.what || ''));
        const addedDay = added && added.at ? Vault.localDay(new Date(added.at)) : '';
        if (c.dates && c.dates.opened && c.dates.opened !== addedDay) rows.push({ day: c.dates.opened, what: 'Case opened (the Opened date on this tab)', derived: true });
      } else {
        if (c.dates && c.dates.opened) rows.push({ day: c.dates.opened, what: 'Opened' });
        for (const x of c.closureHistory || []) {
          const d = CVClosing.disposition(x.disposition);
          if (x.date || x.at) rows.push({ day: x.date, at: x.date ? null : x.at, what: `Closed: ${d ? d.label : x.disposition || ''}` });
          if (x.reopened) rows.push({ at: x.reopened, what: 'Reopened' });
        }
        if (c.closure) { const d = CVClosing.disposition(c.closure.disposition); rows.push({ day: c.closure.date, at: c.closure.date ? null : c.closure.at, what: `Closed: ${d ? d.label : ''}` }); }
        if (c.dates && c.dates.archived) rows.push({ day: c.dates.archived, what: `Archived${c.archiveReason ? `: ${c.archiveReason}` : ''}` });
      }
      const key = (r) => (r.at ? new Date(r.at).toISOString() : `${r.day}T12:00:00`);
      return rows.sort((a, b) => key(b).localeCompare(key(a)));
    }
    function caseHistorySection(c, save = null) {
      const list = h('ol', { class: 'history-list' });
      // v1.90: a note can be changed (its date and its words) with the pencil, or deleted with ×.
      const editRow = (r) => {
        const a = c.activity[r.index];
        const day = h('input', { type: 'date', value: a.day || today(), 'aria-label': 'Note date' });
        const text = h('input', { type: 'text', maxlength: 200, value: a.what || '', 'aria-label': 'Note' });
        const done = () => {
          const what = text.value.trim();
          if (!what) { text.focus(); return; }
          c.activity[r.index] = { ...a, day: day.value || a.day || today(), what, edited: new Date().toISOString() };
          save();
          draw();
        };
        text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); draw(); } });
        const li = h('li', { class: 'history-note history-editing' },
          h('div', { class: 'history-add' }, field('Date', day), field('Note', text),
            h('span', { class: 'history-edit-actions' },
              h('button', { class: 'btn small', type: 'button', onclick: () => draw() }, 'Cancel'),
              h('button', { class: 'btn small primary', type: 'button', icon: 'check-circle-fill', onclick: done }, 'Save'))));
        setTimeout(() => text.focus(), 0);
        return li;
      };
      const draw = (editing = -1) => {
        const rows = historyOf(c);
        list.replaceChildren(...(rows.length ? rows.map((r) => (r.note && save && r.index === editing ? editRow(r) : h('li', { class: r.note ? 'history-note' : r.derived ? 'history-derived' : '' },
          h('span', { class: 'history-when' }, r.at ? fmtDateTime(Date.parse(r.at)) : r.day ? fmtDate(r.day) : ''),
          h('span', { class: 'history-what' }, r.note ? h('span', { class: 'history-tag' }, 'Note') : null, r.what),
          r.note && save ? h('span', { class: 'history-btns' },
            h('button', { class: 'icon-btn history-edit', type: 'button', title: 'Change this note', onclick: () => draw(r.index) }, I('pencil-fill'), h('span', { class: 'sr-only' }, 'Change note')),
            h('button', { class: 'icon-btn history-del', type: 'button', title: 'Delete this note', onclick: () => {
              c.activity.splice(r.index, 1);
              save();
              draw();
            } }, I('x-lg'), h('span', { class: 'sr-only' }, 'Delete note'))) : h('span')))) : [h('li', { class: 'muted small' }, 'Nothing yet.')]));
      };
      draw();
      // v1.89: add a note with its own date, e.g. "Case opened on paper; migrated to CaseVault".
      const day = h('input', { type: 'date', value: (c.dates && c.dates.opened) || today(), 'aria-label': 'Note date' });
      const text = h('input', { type: 'text', maxlength: 200, placeholder: 'e.g. Case opened before CaseVault', 'aria-label': 'Note' });
      const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
        const what = text.value.trim();
        if (!what) { text.focus(); return; }
        const d = day.value || today();
        c.activity = [...(Array.isArray(c.activity) ? c.activity : []), { day: d, what, note: true, added: new Date().toISOString() }];
        text.value = '';
        save();
        draw();
      } }, 'Add Note');
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } });
      return h('section', { class: 'contacts case-history cv-boxed', 'aria-labelledby': 'history-title' },
        h('h3', { id: 'history-title', icon: 'clock-history', title: 'Each change of status, closing, reopening, archiving and Mission move, newest first, and your own dated notes.' }, 'Case History'),
        list,
        save ? h('div', { class: 'history-add' }, field('Date', day), field('Note', text), add) : null);
    }

    return { suspectsSection, miniTimeline, caseTiles, partnersSection, contactsSection, deconflictionSection, historyOf, caseHistorySection };
  }

  root.CVCaseOverview = { init };
})(this);
