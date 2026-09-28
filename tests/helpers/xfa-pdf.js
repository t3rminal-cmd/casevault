// Builds small synthetic XFA PDFs for tests. Everything here is made up: the repository is public,
// so no real names, numbers or agency documents are ever used.
'use strict';
const zlib = require('node:zlib');

const TEMPLATE = `<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/">
  <subform name="form1" layout="tb" locale="en_US">
    <pageSet><pageArea name="Page1" id="Page1"><contentArea x="0.25in" y="0.25in" w="8in" h="10.5in"/><medium stock="letter" short="8.5in" long="11in"/></pageArea></pageSet>
    <subform name="header" layout="tb" w="8in">
      <field name="ReportNumber" w="4in" h="9mm"><caption reserve="40mm"><value><text>Report number</text></value></caption><ui><textEdit/></ui></field>
      <field name="Officer" w="4in" h="9mm"><caption reserve="40mm"><value><text>Reporting officer:</text></value></caption><ui><textEdit/></ui></field>
      <field name="IncidentDate" w="4in" h="9mm"><caption reserve="40mm"><value><text>Date of incident</text></value></caption><ui><dateTimeEdit/></ui></field>
      <field name="Plate" w="4in" h="9mm"><assist><toolTip>Vehicle licence plate</toolTip></assist><ui><textEdit/></ui></field>
      <field name="Empty" w="4in" h="9mm"><caption><value><text>Unused field</text></value></caption><ui><textEdit/></ui></field>
    </subform>
    <subform name="events" layout="tb" w="8in">
      <caption><value><text>Timeline</text></value></caption>
      <subform name="row" layout="lr-tb" w="8in">
        <occur min="0" max="-1"/>
        <field name="Date" w="1.5in" h="9mm"><caption><value><text>Date</text></value></caption><ui><textEdit/></ui></field>
        <field name="Type" w="1.5in" h="9mm"><caption><value><text>Type</text></value></caption><ui><textEdit/></ui></field>
        <field name="Narrative" w="5in" h="9mm"><caption><value><text>Narrative</text></value></caption><ui><textEdit multiLine="1"/></ui></field>
      </subform>
    </subform>
    <field name="Photo" w="3in" h="2in"><caption><value><text>Scene photo</text></value></caption><ui><imageEdit/></ui></field>
    <field name="Notes" w="8in" h="30mm"><caption><value><text>Additional notes</text></value></caption><ui><textEdit multiLine="1"/></ui></field>
  </subform>
</template>`;

const IMAGE = 'iVBORw0KGgo' + 'A'.repeat(400);

const DATASETS = `<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data>
<form1>
  <header><ReportNumber>TEST-0001</ReportNumber><Officer>Officer Alex Sample</Officer><IncidentDate>03/14/2026</IncidentDate><Plate>ZZZ-0000</Plate><Empty/></header>
  <events>
    <row><Date>03/14/2026</Date><Type>Arrival</Type><Narrative>Officer Alex Sample arrived at 100 Example Street at 21:40.</Narrative></row>
    <row><Date>03/14/2026</Date><Type>Interview</Type><Narrative>Witness Jordan Placeholder said they heard two shots &amp; saw a person run north.</Narrative></row>
  </events>
  <Photo contentType="image/png">${IMAGE}</Photo>
  <Notes><body xmlns="http://www.w3.org/1999/xhtml"><p>First line.</p><p>Second line.</p></body></Notes>
</form1>
</xfa:data></xfa:datasets>`;

const PLACEHOLDER = 'Please wait... If this message is not eventually replaced by the proper contents of the document, your PDF viewer may not be able to display this type of document. You can upgrade to the latest version of Adobe Reader.';

/**
 * layout: 'packets'  - /XFA [ (template) n 0 R (datasets) m 0 R ]  (common)
 *         'single'   - /XFA n 0 R  (one stream with the whole XDP)
 *         'objstm'   - AcroForm dictionary inside a compressed object stream (PDF 1.5+)
 * encrypt: add an /Encrypt entry to the trailer (content isn't really encrypted; tests detection)
 */
function buildXfaPdf({ layout = 'packets', encrypt = false, template = TEMPLATE, datasets = DATASETS } = {}) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const stream = (dict, data, compress = true) => {
    const bytes = compress ? zlib.deflateSync(Buffer.from(data, 'utf8')) : Buffer.from(data, 'latin1');
    return { dict: `<< ${dict} ${compress ? '/Filter /FlateDecode ' : ''}/Length ${bytes.length} >>`, bytes };
  };

  const content = `BT /F1 11 Tf 40 740 Td (${PLACEHOLDER.slice(0, 90)}) Tj 0 -14 Td (${PLACEHOLDER.slice(90, 180)}) Tj 0 -14 Td (${PLACEHOLDER.slice(180)}) Tj ET`;
  const catalogId = 1;
  add(null); // catalog, filled below
  const pagesId = add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`);
  add(stream('', content, false));
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let xfa;
  if (layout === 'single') {
    const xdp = `<?xml version="1.0" encoding="UTF-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">${template}${datasets}</xdp:xdp>`;
    xfa = `${add(stream('', xdp))} 0 R`;
  } else {
    const pre = add(stream('', '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">'));
    const t = add(stream('', template));
    const d = add(stream('', datasets));
    const post = add(stream('', '</xdp:xdp>'));
    xfa = `[(preamble) ${pre} 0 R (template) ${t} 0 R (datasets) ${d} 0 R (postamble) ${post} 0 R]`;
  }
  // Real LiveCycle forms list their fonts in /DR; pdf.js needs them to lay the form out.
  const acroForm = `<< /Fields [] /DR << /Font << /Helv 5 0 R >> >> /XFA ${xfa} >>`;
  if (layout === 'objstm') {
    const acroId = objs.length + 1;
    const body = acroForm;
    const header = `${acroId} 0 `;
    const objstm = stream(`/Type /ObjStm /N 1 /First ${header.length}`, header + body);
    add(null); // placeholder id for the object living inside the object stream
    add(objstm);
    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /AcroForm ${acroId} 0 R /NeedsRendering true >>`;
    objs[acroId - 1] = undefined; // not written as a top-level object
  } else {
    const acroId = add(acroForm);
    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /AcroForm ${acroId} 0 R /NeedsRendering true >>`;
  }
  const encId = encrypt ? add('<< /Filter /Standard /V 1 /R 2 /O (x) /U (y) /P -4 >>') : 0;

  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let pos = parts[0].length;
  const offsets = [];
  objs.forEach((o, i) => {
    if (o === undefined) { offsets.push(null); return; }
    offsets.push(pos);
    const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
    let body;
    if (o && typeof o === 'object') body = Buffer.concat([Buffer.from(`${o.dict}\nstream\n`, 'latin1'), o.bytes, Buffer.from('\nendstream', 'latin1')]);
    else body = Buffer.from(String(o), 'latin1');
    const chunk = Buffer.concat([head, body, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(chunk);
    pos += chunk.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => (o == null ? '0000000000 65535 f \n' : `${String(o).padStart(10, '0')} 00000 n \n`))].join('');
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R${encrypt ? ` /Encrypt ${encId} 0 R` : ''} >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(Buffer.from(xref + trailer, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

module.exports = { buildXfaPdf, TEMPLATE, DATASETS, PLACEHOLDER };
