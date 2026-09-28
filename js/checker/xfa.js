/* CaseVault — XFA forms (Adobe LiveCycle Designer PDFs).
 *
 * An XFA PDF keeps its real content as XML inside the file: a "template" (the form's layout,
 * field names and captions) and "datasets" (the values that were filled in). Its ordinary text
 * layer usually only says "Please wait... upgrade to the latest version of Adobe Reader". So
 * CaseVault reads the XML itself and turns it into checker paragraphs:
 *
 *   one paragraph per filled field     "Reporting officer: Alex Sample"
 *   one paragraph per repeated row     "Events row 2: Date=03/14/2026; Type=Arrival; Narrative=..."
 *
 * Captions come from the template; values from the data. Image fields (base64) are skipped.
 * Each paragraph keeps its field path as its location, for click-to-jump.
 *
 * Pure JavaScript: a small PDF object reader (plain and compressed object streams, Flate) and a
 * small XML parser, so it also runs under Node for the tests. Encrypted PDFs can't be read this way;
 * extract.js then falls back to pdf.js's own XFA text.
 */
'use strict';

(function (root) {
  const PLACEHOLDER_RE = /please wait|upgrade to the latest version of adobe reader|if this message is not eventually replaced/i;

  /* ---------------- bytes and inflate ---------------- */

  const latin1 = (bytes, a = 0, b = bytes.length) => {
    let s = '';
    for (let i = a; i < b; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(b, i + 0x8000)));
    return s;
  };

  async function inflate(bytes) {
    // PDF FlateDecode is zlib format ("deflate" in the Compression Streams API).
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* ---------------- tiny PDF object reader ---------------- */

  function dictValue(dict, key) {
    const m = new RegExp(`/${key}\\s*(\\d+\\s+\\d+\\s+R|\\d+|/[A-Za-z0-9]+|\\[[^\\]]*\\])`).exec(dict);
    return m ? m[1] : null;
  }

  /** Index of every "N G obj" in the file, with its body text and (for streams) the raw data. */
  function scanObjects(bytes) {
    const s = latin1(bytes);
    const objs = new Map();
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(s))) {
      const num = Number(m[1]);
      const start = m.index + m[0].length;
      const end = s.indexOf('endobj', start);
      if (end < 0) break;
      const streamAt = s.indexOf('stream', start);
      if (streamAt >= 0 && streamAt < end) {
        const dict = s.slice(start, streamAt);
        let dataStart = streamAt + 6;
        if (s[dataStart] === '\r') dataStart++;
        if (s[dataStart] === '\n') dataStart++;
        objs.set(num, { dict, dataStart, s, stream: true });
        const endStream = s.indexOf('endstream', dataStart);
        re.lastIndex = endStream > 0 ? endStream : end;
      } else {
        objs.set(num, { dict: s.slice(start, end), stream: false });
        re.lastIndex = end;
      }
    }
    return { s, objs };
  }

  async function streamData(bytes, pdf, num) {
    const o = pdf.objs.get(num);
    if (!o || !o.stream) return null;
    let len = dictValue(o.dict, 'Length');
    if (len && /R$/.test(len)) {
      const ref = pdf.objs.get(Number(len.split(/\s+/)[0]));
      len = ref ? ref.dict.trim() : null;
    }
    let end = len && /^\d+$/.test(len) ? o.dataStart + Number(len) : o.s.indexOf('endstream', o.dataStart);
    if (end > bytes.length) end = o.s.indexOf('endstream', o.dataStart);
    let data = bytes.subarray(o.dataStart, end);
    const filter = dictValue(o.dict, 'Filter') || '';
    if (/FlateDecode/.test(filter)) data = await inflate(data);
    else if (filter && !/^\s*$/.test(filter)) throw new Error(`Unsupported PDF stream filter ${filter}`);
    return data;
  }

  /** Objects packed inside compressed object streams (/Type /ObjStm): num -> body text. */
  async function objectStreamBodies(bytes, pdf) {
    const out = new Map();
    for (const [num, o] of pdf.objs) {
      if (!o.stream || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
      try {
        const data = latin1(await streamData(bytes, pdf, num));
        const n = Number(dictValue(o.dict, 'N'));
        const first = Number(dictValue(o.dict, 'First'));
        const head = data.slice(0, first).trim().split(/\s+/).map(Number);
        for (let i = 0; i < n; i++) {
          const id = head[2 * i];
          const off = first + head[2 * i + 1];
          const next = i + 1 < n ? first + head[2 * i + 3] : data.length;
          out.set(id, data.slice(off, next));
        }
      } catch { /* damaged object stream: skip */ }
    }
    return out;
  }

  /**
   * The XFA XML packets from a PDF: { template, datasets, xml } or null when the file isn't XFA.
   * Throws { name: 'XfaEncryptedError' } for encrypted files.
   */
  async function readPackets(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const pdf = scanObjects(bytes);
    let xfaEntry = null;
    for (const [, o] of pdf.objs) {
      const m = /\/XFA\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(o.dict);
      if (m) { xfaEntry = m[1]; break; }
    }
    if (!xfaEntry && /\/Type\s*\/ObjStm/.test(pdf.s)) {
      for (const [, body] of await objectStreamBodies(bytes, pdf)) {
        const m = /\/XFA\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(body);
        if (m) { xfaEntry = m[1]; break; }
      }
    }
    if (!xfaEntry) return null;
    if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(pdf.s)) {
      const err = new Error('This XFA form is encrypted.');
      err.name = 'XfaEncryptedError';
      throw err;
    }
    const refs = [...xfaEntry.matchAll(/(\d+)\s+\d+\s+R/g)].map((r) => Number(r[1]));
    const dec = new TextDecoder('utf-8');
    let xml = '';
    for (const num of refs) {
      const data = await streamData(bytes, pdf, num);
      if (data) xml += dec.decode(data);
    }
    const grab = (tag) => {
      const re = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tag}\\b[\\s\\S]*?</(?:[A-Za-z0-9_-]+:)?${tag}>`);
      const m = re.exec(xml);
      return m ? m[0] : '';
    };
    return { template: grab('template'), datasets: grab('datasets'), xml };
  }

  /* ---------------- tiny XML parser ---------------- */

  const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
  const decodeEntities = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENT[e.toLowerCase()] ?? all;
  });

  /** Parse XML into { name, local, attrs, children: [node | string] }. Tolerant, no DTDs. */
  function parseXml(src) {
    const rootNode = { name: '#root', local: '#root', attrs: {}, children: [] };
    const stack = [rootNode];
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(src))) {
      const top = stack[stack.length - 1];
      if (m[1] != null) top.children.push(m[1]);
      else if (m[2]) {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === m[2]) { stack.length = i; break; }
        }
      } else if (m[3]) {
        const attrs = {};
        for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
        const node = { name: m[3], local: m[3].split(':').pop(), attrs, children: [] };
        top.children.push(node);
        if (!m[5]) stack.push(node);
      } else if (m[6] != null) {
        if (m[6].trim() || top.children.length) top.children.push(decodeEntities(m[6]));
      }
    }
    return rootNode;
  }

  const elements = (n) => (n && n.children ? n.children.filter((c) => typeof c !== 'string') : []);
  const child = (n, local) => elements(n).find((c) => c.local === local);
  function textOf(n) {
    if (typeof n === 'string') return n;
    if (!n) return '';
    const block = /^(p|div|br|li)$/.test(n.local);
    const inner = n.children.map(textOf).join('');
    return block ? ` ${inner} ` : inner;
  }
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  /* ---------------- template: captions ---------------- */

  // Map "sub.sub.field" (named ancestors only) and plain "field" -> caption text; plus which
  // subforms repeat and which fields hold images.
  function readTemplate(templateXml) {
    const captions = new Map();
    const byName = new Map();
    const repeats = new Set();
    const images = new Set();
    const subformCaptions = new Map();
    if (!templateXml) return { captions, byName, repeats, images, subformCaptions };
    const walk = (node, path) => {
      for (const c of elements(node)) {
        if (c.local === 'subform' || c.local === 'subformSet' || c.local === 'area' || c.local === 'exclGroup') {
          const name = c.attrs.name;
          const p = name ? [...path, name] : path;
          const occur = child(c, 'occur');
          if (name && occur && (occur.attrs.max === '-1' || Number(occur.attrs.max) > 1)) repeats.add(p.join('.'));
          if (name) {
            const cap = captionOf(c);
            if (cap) subformCaptions.set(p.join('.'), cap);
          }
          walk(c, p);
        } else if (c.local === 'field') {
          const name = c.attrs.name;
          if (!name) continue;
          const key = [...path, name].join('.');
          const cap = captionOf(c);
          const ui = child(c, 'ui');
          if (ui && child(ui, 'imageEdit')) { images.add(key); images.add(name); }
          if (cap) { captions.set(key, cap); if (!byName.has(name)) byName.set(name, cap); }
        } else if (c.local !== 'pageSet') {
          walk(c, path);
        }
      }
    };
    walk(parseXml(templateXml), []);
    return { captions, byName, repeats, images, subformCaptions };
  }

  function captionOf(node) {
    const cap = child(node, 'caption');
    let t = cap ? clean(textOf(child(cap, 'value') || cap)) : '';
    if (!t) {
      const assist = child(node, 'assist');
      const tip = assist && (child(assist, 'toolTip') || child(assist, 'speak'));
      t = tip ? clean(textOf(tip)) : '';
    }
    return t.replace(/[:\s]+$/, '');
  }

  /* ---------------- data -> paragraphs ---------------- */

  const isBase64Blob = (v) => v.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(v) && !/\s{2,}\S+\s{2,}/.test(v.slice(0, 200));
  const titleCase = (s) => String(s).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

  /**
   * Turn the XFA packets into checker paragraphs, in the order the data appears in the form.
   * Returns [{ index, page: 1, field, text }]
   */
  function toParagraphs({ template, datasets }) {
    const tpl = readTemplate(template);
    const dsRoot = parseXml(datasets || '');
    const datasetsNode = elements(dsRoot)[0];
    const dataNode = datasetsNode && (child(datasetsNode, 'data') || datasetsNode);
    const out = [];
    if (!dataNode) return out;

    const caption = (path, name) => tpl.captions.get(path.concat(name).join('.')) || tpl.byName.get(name) || titleCase(name);
    const isImage = (path, el, value) => tpl.images.has(path.concat(el.local).join('.')) || tpl.images.has(el.local)
      || /^image\//i.test(el.attrs.contentType || '') || isBase64Blob(value);
    const leafValue = (el) => clean(textOf(el));
    const isLeaf = (el) => !elements(el).length || elements(el).every((c) => /^(p|span|body|html|b|i|u|br|div)$/.test(c.local));

    const push = (field, text) => out.push({ index: out.length, page: 1, field, text });
    // A repeated row subform ("row") usually has no caption of its own; its table ("events") does.
    const sectionOf = (p, local) => tpl.subformCaptions.get(p.join('.'))
      || (p.length > 2 && tpl.subformCaptions.get(p.slice(0, -1).join('.'))) || titleCase(local);

    const walk = (node, path, label) => {
      const kids = elements(node).filter((k) => !/^(dataDescription|dd)$/i.test(k.local));
      const counts = new Map();
      for (const k of kids) counts.set(k.local, (counts.get(k.local) || 0) + 1);
      const seen = new Map();
      for (const k of kids) {
        const n = (seen.get(k.local) || 0) + 1;
        seen.set(k.local, n);
        const p = path.concat(k.local);
        if (isLeaf(k)) {
          const v = leafValue(k);
          if (!v || isImage(path, k, v)) continue;
          push(`${label ? `${label} · ` : ''}${caption(path, k.local)}`, `${caption(path, k.local)}: ${v}`);
          continue;
        }
        const repeated = counts.get(k.local) > 1 || tpl.repeats.has(p.join('.'));
        const leafKids = elements(k).filter(isLeaf);
        if (repeated && leafKids.length && leafKids.length === elements(k).length) {
          // A repeated row (e.g. one line of a timeline table): one paragraph with all its cells.
          const pairs = leafKids.map((c) => [caption(p, c.local), leafValue(c), c])
            .filter(([, v, c]) => v && !isImage(p, c, v)).map(([c, v]) => `${c}=${v}`);
          if (!pairs.length) continue;
          const section = sectionOf(p, k.local);
          push(`${section} row ${n}`, `${section} row ${n}: ${pairs.join('; ')}`);
        } else {
          const sectionLabel = repeated ? `${sectionOf(p, k.local)} ${n}` : label;
          walk(k, p, sectionLabel);
        }
      }
    };
    // Start below the form's root data group.
    for (const top of elements(dataNode)) walk(top, [top.local], '');
    return out;
  }

  /** Is this text layer just Adobe's "Please wait..." placeholder? */
  function isPlaceholderText(text) {
    const t = clean(text);
    return !t || (PLACEHOLDER_RE.test(t) && t.length < 1500);
  }

  /** Quick check on raw bytes: does the file declare an XFA form? */
  async function isXfa(bytes) {
    try { return !!(await readPackets(bytes)); } catch (err) { return err.name === 'XfaEncryptedError'; }
  }

  const api = { readPackets, parseXml, toParagraphs, readTemplate, isPlaceholderText, isXfa, PLACEHOLDER_RE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVXfa = api;
})(this);
