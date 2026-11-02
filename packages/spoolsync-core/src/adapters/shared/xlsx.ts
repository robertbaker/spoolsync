import { listZipEntries, readZipText, ZipError } from "./zip";

/** A spreadsheet cell value after shared-string and type resolution. */
export type XlsxCell = string | number | boolean | null;

export interface XlsxSheet {
  name: string;
  /** Rows by position; `rowNumbers[i]` is the 1-based sheet row that `rows[i]` came from. */
  rows: XlsxCell[][];
  rowNumbers: number[];
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attributes);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? undefined : decodeXml(value);
}

/** Concatenates the `<t>` runs of a shared or inline string, skipping phonetic hints. */
function stringText(xml: string): string {
  const withoutPhonetics = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetics.matchAll(
    /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g,
  ))
    text += decodeXml(match[1] ?? "");
  return text;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  for (const match of xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g))
    strings.push(stringText(match[1] ?? ""));
  return strings;
}

function columnIndex(reference: string): number {
  const letters = /^[A-Za-z]+/.exec(reference)?.[0].toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function parseCell(
  attributes: string,
  body: string | undefined,
  sharedStrings: readonly string[],
): XlsxCell {
  const type = attribute(attributes, "t");
  const value = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body ?? "")?.[1];
  if (type === "inlineStr")
    return stringText(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(body ?? "")?.[1] ?? "");
  if (value === undefined) return null;
  switch (type) {
    case "s": {
      const text = sharedStrings[Number(value)];
      return text === undefined ? null : text;
    }
    case "str":
    case "d":
      return decodeXml(value);
    case "b":
      return value.trim() === "1";
    case "e":
      return null;
    default: {
      const number = Number(value);
      return value.trim() !== "" && Number.isFinite(number) ? number : decodeXml(value);
    }
  }
}

function parseSheet(name: string, xml: string, sharedStrings: readonly string[]): XlsxSheet {
  const rows: XlsxCell[][] = [];
  const rowNumbers: number[] = [];
  let fallbackRow = 0;
  for (const rowMatch of xml.matchAll(
    /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g,
  )) {
    fallbackRow++;
    const rowNumber = Number(attribute(rowMatch[1] ?? "", "r")) || fallbackRow;
    fallbackRow = rowNumber;
    const cells: XlsxCell[] = [];
    let nextColumn = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const attributes = cellMatch[1] ?? "";
      const reference = attribute(attributes, "r");
      const column = reference ? columnIndex(reference) : nextColumn;
      if (column < 0 || column > 16383) continue;
      nextColumn = column + 1;
      while (cells.length < column) cells.push(null);
      cells[column] = parseCell(attributes, cellMatch[2], sharedStrings);
    }
    rows.push(cells);
    rowNumbers.push(rowNumber);
  }
  return { name, rows, rowNumbers };
}

function resolveTarget(target: string): string {
  const absolute = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const parts: string[] = [];
  for (const part of absolute.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/** Reads every worksheet of an `.xlsx` workbook into plain cell values. */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxWorkbook> {
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new ZipError("This is not an Excel (.xlsx) workbook.");
  const entries = listZipEntries(bytes);
  const workbookXml = await readZipText(bytes, entries, "xl/workbook.xml");
  if (!workbookXml) throw new ZipError("This is not an Excel (.xlsx) workbook.");
  const relsXml = (await readZipText(bytes, entries, "xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attribute(match[1] ?? "", "Id");
    const target = attribute(match[1] ?? "", "Target");
    if (id && target) targets.set(id, resolveTarget(target));
  }
  const sharedStrings = parseSharedStrings(
    await readZipText(bytes, entries, "xl/sharedStrings.xml"),
  );

  const sheets: XlsxSheet[] = [];
  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const attributes = match[1] ?? "";
    if (attribute(attributes, "state") === "veryHidden") continue;
    const name = attribute(attributes, "name");
    const relationship = attribute(attributes, "r:id") ?? attribute(attributes, "id");
    const path = relationship ? targets.get(relationship) : undefined;
    if (!name || !path) continue;
    const sheetXml = await readZipText(bytes, entries, path);
    if (sheetXml === undefined) continue;
    sheets.push(parseSheet(name, sheetXml, sharedStrings));
  }
  return { sheets };
}

/** Converts an Excel date serial (1900 system) to `YYYY-MM-DD`, or `null` when out of range. */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return date.toISOString().slice(0, 10);
}
