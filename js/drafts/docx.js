/* CaseVault drafts — export Markdown to a Word .docx file, with no library.
 *
 * A .docx is a zip of a few XML files. This writes the minimum Word needs: headings, paragraphs,
 * bold/italic/code runs, bullet and numbered lists, block quotes, and line breaks. [CONFIRM: ...]
 * placeholders are highlighted yellow so they stand out in Word. The zip uses "stored" (no
 * compression), which every zip reader accepts and keeps this file short.
 *
 * buildDocx(markdown, { title }) -> Uint8Array
 */
'use strict';

(function (root) {
  const enc = new TextEncoder();

  /* ---------------- zip (stored) ---------------- */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files, date = new Date()) {
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, content] of files) {
      const nameBytes = enc.encode(name);
      const data = typeof content === 'string' ? enc.encode(content) : content;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);        // version needed
      local.setUint16(6, 0x0800, true);    // UTF-8 names
      local.setUint16(8, 0, true);         // stored
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      locals.push(new Uint8Array(local.buffer), nameBytes, data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, dosTime, true);
      central.setUint16(14, dosDate, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint32(42, offset, true);
      centrals.push(new Uint8Array(central.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
    let p = 0;
    for (const b of parts) { out.set(b, p); p += b.length; }
    return out;
  }

  /* ---------------- Markdown -> blocks ---------------- */

  function blocks(md) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = null;
    let list = null; // { type: 'bullet'|'number', id }
    let listCount = 0;
    const endPara = () => { if (para) out.push(para); para = null; };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if (!line.trim()) { endPara(); list = null; continue; }
      if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { endPara(); list = null; out.push({ kind: 'rule' }); continue; }
      if ((m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line))) { endPara(); list = null; out.push({ kind: 'heading', level: Math.min(m[1].length, 3), text: m[2] }); continue; }
      if ((m = /^(\s*)[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line))) {
        endPara();
        if (!list || list.type !== 'bullet') list = { type: 'bullet', id: ++listCount };
        out.push({ kind: 'item', list: list.type, id: list.id, level: Math.min(Math.floor(m[1].length / 2), 2), text: m[2] });
        continue;
      }
      if ((m = /^(\s*)\d+[.)]\s+(.*)$/.exec(line))) {
        endPara();
        if (!list || list.type !== 'number') list = { type: 'number', id: ++listCount };
        out.push({ kind: 'item', list: list.type, id: list.id, level: Math.min(Math.floor(m[1].length / 2), 2), text: m[2] });
        continue;
      }
      if ((m = /^\s{0,3}>\s?(.*)$/.exec(line))) { endPara(); list = null; out.push({ kind: 'quote', text: m[1] }); continue; }
      list = null;
      if (para) para.lines.push(line.trim()); else para = { kind: 'para', lines: [line.trim()] };
    }
    endPara();
    return out;
  }

  /* ---------------- inline runs ---------------- */

  const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  // Split into runs: ***both***, **bold**, *italic* / _italic_, `code`, and [CONFIRM: ...].
  function runs(text) {
    const out = [];
    const re = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|(?<![\w])_[^_\s][^_]*_(?![\w])|`[^`]+`|\[CONFIRM:[^\]\n]*\])/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index) });
      const tok = m[0];
      if (tok.startsWith('***')) out.push({ t: tok.slice(3, -3), b: true, i: true });
      else if (tok.startsWith('**')) out.push({ t: tok.slice(2, -2), b: true });
      else if (tok.startsWith('`')) out.push({ t: tok.slice(1, -1), code: true });
      else if (tok.startsWith('[CONFIRM:')) out.push({ t: tok, confirm: true });
      else out.push({ t: tok.slice(1, -1), i: true });
      last = m.index + tok.length;
    }
    if (last < text.length) out.push({ t: text.slice(last) });
    return out;
  }

  function runXml(r, extra = '') {
    const props = [
      r.b ? '<w:b/>' : '', r.i ? '<w:i/>' : '',
      r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '',
      r.confirm ? '<w:highlight w:val="yellow"/>' : '', extra,
    ].join('');
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(r.t)}</w:t></w:r>`;
  }

  function paragraphXml(lines, pPr = '', extraRun = '') {
    const body = lines.map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + runs(l).map((r) => runXml(r, extraRun)).join('')).join('');
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${body}</w:p>`;
  }

  /* ---------------- document parts ---------------- */

  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  function documentXml(bs) {
    const body = bs.map((b) => {
      if (b.kind === 'heading') return paragraphXml([b.text], `<w:pStyle w:val="Heading${b.level}"/>`);
      if (b.kind === 'item') return paragraphXml([b.text], `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${b.level}"/><w:numId w:val="${b.id}"/></w:numPr>`);
      if (b.kind === 'quote') return paragraphXml([b.text], '<w:pStyle w:val="Quote"/>');
      if (b.kind === 'rule') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>';
      return paragraphXml(b.lines);
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body || '<w:p/>'}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  function stylesXml() {
    const heading = (n, size) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading(1, 32)}${heading(2, 28)}${heading(3, 24)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style></w:styles>`;
  }

  function numberingXml(bs) {
    const lvls = (bullet) => [0, 1, 2].map((l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${bullet ? 'bullet' : ['decimal', 'lowerLetter', 'lowerRoman'][l]}"/><w:lvlText w:val="${bullet ? ['•', '◦', '▪'][l] : `%${l + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
    // One numbering instance per list, so every numbered list starts at 1.
    const lists = new Map();
    for (const b of bs) if (b.kind === 'item') lists.set(b.id, b.list);
    const nums = [...lists].map(([id, type]) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${type === 'bullet' ? 1 : 2}"/></w:num>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W_NS}><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(true)}</w:abstractNum><w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(false)}</w:abstractNum>${nums}</w:numbering>`;
  }

  function coreXml(title, date) {
    const iso = date.toISOString().replace(/\.\d+Z$/, 'Z');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title || '')}</dc:title><dc:creator>CaseVault</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
  }

  function buildDocx(markdown, { title = '', date = new Date() } = {}) {
    const bs = blocks(markdown);
    return zip([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`],
      ['word/document.xml', documentXml(bs)],
      ['word/styles.xml', stylesXml()],
      ['word/numbering.xml', numberingXml(bs)],
      ['docProps/core.xml', coreXml(title, date)],
    ], date);
  }

  const api = { buildDocx, blocks, runs, crc32, zip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVDocx = api;
})(this);
