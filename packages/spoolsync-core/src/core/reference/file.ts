import Papa from "papaparse";

import { GENERIC_MAPPING, readPath, recordsOf, type ReferenceMapping } from "./mapping";
import { normalizeReferenceRecords, type RecordContext } from "./normalize";
import { decodeSnapshot } from "./snapshot";
import type { ReferenceFilament } from "./types";

/** Upper bounds, so a wrong file cannot freeze a tab. */
export const MAX_REFERENCE_RECORDS = 100_000;
export const MAX_REFERENCE_CHARS = 60_000_000;

export interface ReferenceFileOptions {
  mapping?: ReferenceMapping;
  /** Credit line for records whose file does not carry one. */
  attribution?: string;
  license?: string | null;
  providerId?: string;
  providerLabel?: string;
}

export interface ParsedReferenceFile {
  format: "json" | "csv";
  filaments: ReferenceFilament[];
  warnings: string[];
  skipped: number;
  /** Records found in the file before any were skipped. */
  records: number;
  attribution: string;
  license: string | null;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;

function looksLikeJson(name: string, content: string): boolean {
  if (/\.json$/i.test(name)) return true;
  if (/\.(csv|tsv|txt)$/i.test(name)) return false;
  return /^\s*[[{]/.test(content);
}

/**
 * Reads a reference file the person loaded: JSON (a list of records, or an object holding one) or
 * CSV with a header row. Records are read through the mapping, which defaults to the generic
 * preset. A JSON document may carry its own `attribution` and `license`, which stay with every
 * record. Throws with a plain message when the file has no records.
 */
export function parseReferenceFile(
  name: string,
  content: string,
  options: ReferenceFileOptions = {},
): ParsedReferenceFile {
  if (content.length > MAX_REFERENCE_CHARS)
    throw new Error("The reference file is larger than 60 MB. Split it or remove unused columns.");
  const body = content.replace(/^﻿/, "");
  const mapping = options.mapping ?? GENERIC_MAPPING;
  const providerId = options.providerId ?? "file";
  let attribution = options.attribution ?? "";
  let license = options.license ?? null;
  let records: unknown[];
  let format: "json" | "csv";
  let firstPosition = 1;

  if (looksLikeJson(name, body)) {
    format = "json";
    let document: unknown;
    try {
      document = JSON.parse(body);
    } catch (error) {
      throw new Error(
        `"${name}" is not valid JSON (${error instanceof Error ? error.message : String(error)}).`,
      );
    }
    // A snapshot the site publishes (`/reference/<provider>.json`) is read as the catalog it is.
    const snapshot = decodeSnapshot(document);
    if (snapshot)
      return {
        format: "json",
        filaments: snapshot.filaments,
        warnings: [
          `Read as a SpoolSync snapshot of ${snapshot.filaments.length} records from ${new Date(snapshot.generatedAt).toISOString().slice(0, 10)}.`,
        ],
        skipped: snapshot.skipped,
        records: snapshot.filaments.length + snapshot.skipped,
        attribution: snapshot.attribution,
        license: snapshot.license,
      };
    const found = recordsOf(document, mapping);
    if (!found)
      throw new Error(
        `Could not find a list of records in "${name}". Put the records in a list, or set the records path in the mapping.`,
      );
    records = found;
    attribution ||=
      text(readPath(document, "attribution")) ?? text(readPath(document, "source")) ?? "";
    license ??= text(readPath(document, "license"));
  } else {
    format = "csv";
    const marker = /^sep=([,;\t|])\r?\n/i.exec(body);
    const parsed = Papa.parse<Record<string, unknown>>(
      marker ? body.slice(marker[0].length) : body,
      {
        header: true,
        skipEmptyLines: "greedy",
        delimiter: marker ? marker[1]! : "",
        transformHeader: (header) => header.trim(),
      },
    );
    const error = parsed.errors.find((entry) => entry.code !== "UndetectableDelimiter");
    if (error)
      throw new Error(
        `Could not read "${name}" as CSV${error.row === undefined ? "" : ` at data row ${error.row + 1}`}: ${error.message}`,
      );
    if (parsed.meta.fields?.some((field) => !field))
      throw new Error(
        `"${name}" has an unnamed column. Give every column a name and load it again.`,
      );
    records = parsed.data;
    // Row 1 is the header, so the first record is row 2 in a spreadsheet.
    firstPosition = 2;
  }
  if (!records.length) throw new Error(`"${name}" has no records.`);
  if (records.length > MAX_REFERENCE_RECORDS)
    throw new Error(
      `"${name}" has ${records.length.toLocaleString("en-US")} records; the limit is ${MAX_REFERENCE_RECORDS.toLocaleString("en-US")}.`,
    );

  const context: RecordContext = {
    providerId,
    providerLabel: options.providerLabel ?? "Reference file",
    attribution: attribution || `Reference file ${name}`,
    license,
  };
  const batch = normalizeReferenceRecords(records, mapping, context, firstPosition);
  if (!batch.filaments.length)
    throw new Error(
      `None of the ${records.length} records in "${name}" could be read as a filament. Each needs a brand (or barcode) and a color, name or material; check the column names against the reference file format.`,
    );
  return {
    format,
    filaments: batch.filaments,
    warnings: batch.warnings,
    skipped: batch.skipped,
    records: records.length,
    attribution: context.attribution,
    license,
  };
}
