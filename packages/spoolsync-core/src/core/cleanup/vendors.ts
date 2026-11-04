import { plainKey } from "./text";
import type { VendorAlias } from "./types";

/**
 * Canonical vendor names and the spellings people use for them. Matching ignores case, accents,
 * punctuation and spacing, and also ignores a trailing legal suffix (`Inc`, `GmbH`, `Co., Ltd`), so
 * each entry only needs the spellings that differ in letters. Extend it with `vendorAliases` in the
 * cleanup options; those entries are checked last and win over these.
 */
export const VENDOR_ALIASES: readonly VendorAlias[] = [
  { canonical: "Prusament", aliases: ["Prusa Polymers", "Prusa Filament"] },
  { canonical: "Polymaker", aliases: ["Poly Maker", "Polymaker 3D"] },
  { canonical: "eSUN", aliases: ["E-Sun", "eSun 3D", "Shenzhen eSUN", "eSUN Filament"] },
  { canonical: "Elegoo", aliases: ["Elegoo 3D"] },
  { canonical: "Bambu Lab", aliases: ["Bambulab", "Bambu", "Bambu Labs"] },
  { canonical: "Hatchbox", aliases: ["Hatchbox 3D", "Hatch Box"] },
  { canonical: "Overture", aliases: ["Overture 3D", "Overture Filament"] },
  { canonical: "Sunlu", aliases: ["Sun Lu"] },
  { canonical: "Creality", aliases: ["Creality3D", "Creality 3D", "Creality Official"] },
  { canonical: "Anycubic", aliases: ["Any Cubic"] },
  { canonical: "Eryone", aliases: ["Eryone 3D", "Eryone Technology"] },
  { canonical: "Kingroon", aliases: ["King Roon"] },
  { canonical: "Geeetech", aliases: ["Geeetech 3D"] },
  { canonical: "Fillamentum", aliases: ["Fillamentum Manufacturing"] },
  { canonical: "Fiberlogy", aliases: ["Fiberlogy SA"] },
  { canonical: "Filamentive", aliases: [] },
  { canonical: "colorFabb", aliases: ["Color Fabb"] },
  { canonical: "Das Filament", aliases: ["DasFilament"] },
  { canonical: "extrudr", aliases: ["Extrudr 3D", "FD3D"] },
  { canonical: "3DJake", aliases: ["3D Jake", "3DJake Niceshops"] },
  { canonical: "MatterHackers", aliases: ["Matter Hackers"] },
  { canonical: "Proto-pasta", aliases: ["Protopasta", "Proto Pasta"] },
  { canonical: "Push Plastic", aliases: ["PushPlastic"] },
  { canonical: "Atomic Filament", aliases: ["Atomic"] },
  { canonical: "Add:North", aliases: ["AddNorth", "Add North"] },
  { canonical: "Recreus", aliases: ["Recreus Industries"] },
  { canonical: "Spectrum Filaments", aliases: ["Spectrum", "Spectrum Filament"] },
  { canonical: "Rosa3D", aliases: ["Rosa 3D", "Rosa3D Filaments"] },
  { canonical: "Jayo", aliases: ["Jayo 3D"] },
  { canonical: "Siraya Tech", aliases: ["Siraya", "SirayaTech"] },
  { canonical: "Printed Solid", aliases: ["PrintedSolid"] },
  { canonical: "Amolen", aliases: ["Amolen 3D"] },
  { canonical: "Flashforge", aliases: ["Flash Forge"] },
  { canonical: "Voxelab", aliases: ["Voxelab 3D"] },
  { canonical: "NinjaTek", aliases: ["Ninja Tek"] },
  { canonical: "Inland", aliases: ["Inland 3D", "Micro Center Inland"] },
  { canonical: "Tinmorry", aliases: ["Tinmorry 3D"] },
];

/** Trailing words that name a legal form rather than the brand. */
const LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "gmbh",
  "ag",
  "co",
  "corp",
  "corporation",
  "company",
  "sro",
  "sa",
  "bv",
  "oy",
  "ab",
  "srl",
  "spa",
  "kg",
  "plc",
  "pty",
  "sp",
  "zoo",
]);

/**
 * The comparison key for a vendor: accents, case, punctuation and spacing gone, and trailing legal
 * suffixes dropped (at least one word always stays).
 */
export function vendorKey(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return plainKey(words.join(""));
}

/** Maps every known spelling's key to its canonical name; later tables win over earlier ones. */
export function buildVendorIndex(extra: readonly VendorAlias[] = []): Map<string, string> {
  const index = new Map<string, string>();
  for (const table of [VENDOR_ALIASES, extra])
    for (const { canonical, aliases } of table)
      for (const spelling of [canonical, ...aliases]) {
        const key = vendorKey(spelling);
        if (key) index.set(key, canonical);
      }
  return index;
}

/** The canonical name for a vendor spelling, or `null` when it is not in the table. */
export function canonicalVendor(text: string, index: ReadonlyMap<string, string>): string | null {
  const key = vendorKey(text);
  return key ? (index.get(key) ?? null) : null;
}
