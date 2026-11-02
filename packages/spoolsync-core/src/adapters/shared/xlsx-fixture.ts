import { deflateRawSync } from "node:zlib";

/** Test-only builders for synthetic ZIP and XLSX files, so no binary fixtures are committed. */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface FixtureFile {
  name: string;
  content: string;
  /** Store without compression instead of deflating. */
  stored?: boolean;
}

export function buildZip(files: readonly FixtureFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const method = file.stored ? 0 : 8;
    const body = file.stored ? data : new Uint8Array(deflateRawSync(data));
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc32(data), true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(10, method, true);
    entryView.setUint32(16, crc32(data), true);
    entryView.setUint32(20, body.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, body);
    central.push(entry);
    offset += local.length + body.length;
  }
  const directorySize = central.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + 22);
  let position = 0;
  for (const chunk of [...parts, ...central, end]) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

export type FixtureCell = string | number | boolean | null | { inline: string };

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export interface FixtureSheet {
  name: string;
  rows: FixtureCell[][];
}

/** Builds a workbook using shared strings, as Excel and Google Sheets write them. */
export function buildXlsx(sheets: readonly FixtureSheet[], options: { stored?: boolean } = {}) {
  const shared: string[] = [];
  const sharedIndex = (text: string) => {
    const existing = shared.indexOf(text);
    if (existing >= 0) return existing;
    shared.push(text);
    return shared.length - 1;
  };
  const sheetXml = sheets.map((sheet) => {
    const rows = sheet.rows
      .map((row, rowIndex) => {
        const cells = row
          .map((cell, columnIndex) => {
            const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
            if (cell === null) return `<c r="${ref}"/>`;
            if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
            if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
            if (typeof cell === "object")
              return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell.inline)}</t></is></c>`;
            return `<c r="${ref}" t="s"><v>${sharedIndex(cell)}</v></c>`;
          })
          .join("");
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join("");
    return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  const stored = options.stored ?? false;
  return buildZip([
    {
      name: "xl/workbook.xml",
      stored,
      content: `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map(
          (sheet, index) =>
            `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 10}"/>`,
        )
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      stored,
      content: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 10}" Type="worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join("")}</Relationships>`,
    },
    ...sheetXml.map((content, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content,
      stored,
    })),
    {
      name: "xl/sharedStrings.xml",
      stored,
      content: `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
        .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
        .join("")}</sst>`,
    },
  ]);
}
