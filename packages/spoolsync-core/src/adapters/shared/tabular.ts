import Papa from "papaparse";

/** Reject ambiguous headers before the CSV parser renames them or logs warnings. */
export function strictHeaders(transform: (header: string) => string = (header) => header) {
  const positions = new Map<string, number>();
  return (header: string, index: number): string => {
    const name = transform(header);
    if (!name.trim())
      throw new Error("CSV contains an unnamed column. Give each column a name and export again.");
    const previous = positions.get(name);
    if (previous !== undefined && previous !== index)
      throw new Error(
        "CSV contains duplicate column names. Give each column a unique name and export again.",
      );
    positions.set(name, index);
    return name;
  };
}

/** Spreadsheet exports can declare their delimiter on a separate first line. */
export function csvInput(text: string): { text: string; delimiter: string } {
  text = text.replace(/^\uFEFF/, "");
  const marker = /^sep=([,;\t|])\r?\n/i.exec(text);
  return marker
    ? { text: text.slice(marker[0].length), delimiter: marker[1]! }
    : { text, delimiter: "" };
}

export function parseRows(text: string): Record<string, unknown>[] {
  return parseTable(text).rows;
}

export function parseTable(text: string): { rows: Record<string, unknown>[]; headers: string[] } {
  const input = csvInput(text);
  const parsed = Papa.parse<Record<string, unknown>>(input.text, {
    delimiter: input.delimiter,
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: strictHeaders((header) =>
      header
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
    ),
  });
  validateCsv(parsed);
  return { rows: parsed.data, headers: parsed.meta.fields ?? [] };
}

/** Reject damaged tables before an adapter interprets partially parsed records. */
export function validateCsv(parsed: Pick<Papa.ParseResult<unknown>, "errors" | "meta">): void {
  const error = parsed.errors.find((entry) => entry.code !== "UndetectableDelimiter");
  if (error)
    throw new Error(
      `Could not read CSV${error.row === undefined ? "" : ` at data row ${error.row + 1}`}: ${error.message}`,
    );
  if (Object.keys(parsed.meta.renamedHeaders ?? {}).length)
    throw new Error(
      "CSV contains duplicate column names. Give each column a unique name and export again.",
    );
  if (parsed.meta.fields?.some((name) => !name))
    throw new Error("CSV contains an unnamed column. Give each column a name and export again.");
}

export function csvText(
  rows: Record<string, unknown>[],
  emptyColumns: readonly string[] = [],
): string {
  const rowFields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const fields = rowFields.length ? rowFields : [...emptyColumns];
  return (
    Papa.unparse(
      { fields, data: rows.map((row) => fields.map((key) => row[key])) },
      { newline: "\r\n" },
    ) + "\r\n"
  );
}

export function field(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const key = name.toLowerCase().replace(/[\s-]+/g, "_");
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return undefined;
}
