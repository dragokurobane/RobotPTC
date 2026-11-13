/**
 * Minimal offline .xlsx writer (no libraries, works without internet).
 * Builds a real Excel workbook (zip of XML files, stored without compression).
 *
 * XlsxLite.build([{ name, header: [...], rows: [[...]], widths: [...], colStyles: [...] }]) -> Blob
 * A cell is a string, a number, or { v: value, s: styleIndex }.
 * Style indexes: 0 normal | 1 header | 2 centered | 3 left | 4 bold | 5 blue team | 6 red team
 */
const XlsxLite = (() => {
  const enc = new TextEncoder();

  // ---------- CRC32 + ZIP (store) ----------
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const dosTime = 0;
    const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

    files.forEach(f => {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // UTF-8 names
      lh.setUint16(8, 0, true);      // stored
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + size;
    });

    const centralSize = central.reduce((a, c) => a + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  // ---------- XML helpers ----------
  const xmlEsc = (v) => String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function colName(i) { // 0 -> A, 26 -> AA
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function cellXml(ref, cell, defaultStyle) {
    let v = cell, s = defaultStyle;
    if (cell !== null && typeof cell === 'object') { v = cell.v; if (cell.s !== undefined) s = cell.s; }
    if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  }

  function sheetXml(sheet, selected) {
    const cols = (sheet.widths || []).map((w, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const rowsXml = [];
    let r = 1;
    if (sheet.header) {
      rowsXml.push(`<row r="${r}" ht="30" customHeight="1">` +
        sheet.header.map((h, c) => cellXml(colName(c) + r, h, 1)).join('') + '</row>');
      r++;
    }
    (sheet.rows || []).forEach(row => {
      rowsXml.push(`<row r="${r}">` +
        row.map((cell, c) => cellXml(colName(c) + r, cell, (sheet.colStyles || [])[c] ?? 0)).join('') + '</row>');
      r++;
    });
    const pane = sheet.header
      ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>` +
      '<sheetFormatPr defaultRowHeight="20"/>' +
      (cols ? `<cols>${cols}</cols>` : '') +
      `<sheetData>${rowsXml.join('')}</sheetData></worksheet>`;
  }

  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
      '<font><sz val="11"/><name val="Tahoma"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font>' +
      '<font><b/><sz val="11"/><name val="Tahoma"/></font>' +
    '</fonts>' +
    '<fills count="5">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD6EAFF"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFD9D9"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFB0B8C4"/></left><right style="thin"><color rgb="FFB0B8C4"/></right>' +
      '<top style="thin"><color rgb="FFB0B8C4"/></top><bottom style="thin"><color rgb="FFB0B8C4"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function safeSheetName(name, used) {
    let n = String(name).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let base = n, i = 2;
    while (used.has(n.toLowerCase())) n = base.slice(0, 28) + ' ' + (i++);
    used.add(n.toLowerCase());
    return n;
  }

  function build(sheets) {
    const used = new Set();
    const names = sheets.map(s => safeSheetName(s.name, used));
    const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

    const contentTypes = head +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';

    const rootRels = head +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

    const workbook = head +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheets>` +
      names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>';

    const wbRels = head +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`;

    const files = [
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rootRels) },
      { name: 'xl/workbook.xml', data: enc.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
      { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s, i === 0)) }))
    ];
    return zipStore(files);
  }

  return { build };
})();
