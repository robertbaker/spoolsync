import { normalizeBarcode } from "@spoolsync/core/core/cleanup/numbers";
import { SOURCE_IDS, type CommonSpool } from "@spoolsync/core/core/model";

import { parseQrPayload } from "./labels";

export type ScanResult =
  | { kind: "spool"; spool: CommonSpool }
  /** The code reads as one of ours or as a barcode, but no loaded spool has it. */
  | { kind: "not-loaded"; code: string }
  /** A barcode several loaded spools share, so it cannot name one. */
  | { kind: "ambiguous"; code: string; spools: CommonSpool[] }
  /** Not a label code or a barcode: ordinary filter text. */
  | { kind: "text" };

/** UPC-A is an EAN-13 with a leading zero, and GTIN-14 adds a packaging digit, so compare 13 digits. */
const gtin = (digits: string): string => digits.replace(/^0+/, "").padStart(13, "0");

/**
 * Reads what a scanner (or a paste) put into the filter box. A SpoolSync label holds `service:id`
 * (for example `spoolman:12`); a product barcode is a UPC or EAN number. A label finds the one
 * spool it names; a barcode finds the spools carrying it. Anything else is plain filter text.
 */
export function readScan(text: string, spools: readonly CommonSpool[]): ScanResult {
  const code = text.trim();
  if (!code) return { kind: "text" };
  const label = parseQrPayload(code);
  // Only our own services' names count; "pla:black" is filter text, not a label.
  if (
    label &&
    !/\s/.test(code) &&
    SOURCE_IDS.some((id) => id.toLowerCase() === label.source.toLowerCase())
  ) {
    const spool = spools.find(
      (candidate) =>
        candidate.source.toLowerCase() === label.source.toLowerCase() &&
        candidate.sourceId === label.sourceId,
    );
    return spool ? { kind: "spool", spool } : { kind: "not-loaded", code };
  }
  const barcode = normalizeBarcode(code);
  if (!barcode) return { kind: "text" };
  const wanted = gtin(barcode);
  const found = spools.filter((spool) => {
    const own = spool.upc ? normalizeBarcode(spool.upc) : null;
    return own !== null && gtin(own) === wanted;
  });
  if (found.length === 1) return { kind: "spool", spool: found[0]! };
  if (found.length > 1) return { kind: "ambiguous", code: barcode, spools: found };
  return { kind: "not-loaded", code: barcode };
}
