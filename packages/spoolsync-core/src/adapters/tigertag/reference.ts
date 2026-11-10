import { finishWord, finishWords } from "../shared/finish";
import brands from "./reference-data/id_brand.json" with { type: "json" };
import materials from "./reference-data/id_material.json" with { type: "json" };

/**
 * TigerTag's reference ids for brands and materials (the same files `tools/tigertag` uses). Records
 * store ids; the labels are for display and matching. The tables list only the fields read here,
 * taken from TigerTag's public reference data (TigerTag-Studio-Manager, MIT). "TigerTag" is a
 * trademark of the TigerTag Project, used only to describe compatibility.
 */

export const GENERIC_ID = 65535;

/** Diameter ids in chip slot `data1`. */
const DIAMETER_BY_ID: Record<number, number> = { 56: 1.75, 221: 2.85 };

const key = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "PLA+" and "PLA" are different materials, so "+" survives as a word.
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const brandById = new Map(brands.map((brand) => [brand.id, brand.name]));
const materialById = new Map(materials.map((material) => [material.id, material.label]));

export function brandName(id: unknown): string | null {
  return typeof id === "number" && id !== GENERIC_ID ? (brandById.get(id) ?? null) : null;
}

export function materialLabel(id: unknown): string | null {
  return typeof id === "number" && id !== GENERIC_ID ? (materialById.get(id) ?? null) : null;
}

/** Exact label match first, then a label containing the value as a word; Generic otherwise. */
export function brandId(name: string | null): number {
  const needle = key(name);
  if (!needle) return GENERIC_ID;
  const exact = brands.find((brand) => key(brand.name) === needle);
  if (exact) return exact.id;
  return brands.find((brand) => key(brand.name).split(" ").includes(needle))?.id ?? GENERIC_ID;
}

/** Matches the full label ("PLA Silk" for "PLA-Silk"), then the base material type ("PLA"). */
export function materialId(label: string | null): number {
  const needle = key(label);
  if (!needle) return GENERIC_ID;
  const exact = materials.find((material) => key(material.label) === needle);
  if (exact) return exact.id;
  const base = needle.split(" ")[0];
  return (
    materials.find(
      (material) => key(material.material_type) === base && key(material.label) === base,
    )?.id ?? GENERIC_ID
  );
}

export function diameterFromId(id: unknown): number | null {
  return typeof id === "number" ? (DIAMETER_BY_ID[id] ?? null) : null;
}

export function diameterId(diameter: number | null): number {
  return (diameter ?? 1.75) < 2.3 ? 56 : 221;
}

/**
 * Aspect ids (`id_aspect1` / `id_aspect2`, the finish or special look of a filament) the app
 * writes, as a two-way table against the common finish words (Spoolstock's vocabulary), so loading
 * and writing are inverse. 255 means no aspect; 104 ("Basic") is TigerTag's plain filament and is
 * read as no finish. Ids outside this table are shown through the label of a linked catalogue
 * product when there is one.
 */
export const NO_ASPECT = 255;
const BASIC_ASPECT = 104;
interface AspectEntry {
  id: number;
  /** The common finish word, or null for the plain "Basic" aspect. */
  finish: string | null;
  /** TigerTag's own label and other spellings accepted when writing. */
  aliases: string[];
}
const ASPECTS: AspectEntry[] = [
  { id: BASIC_ASPECT, finish: null, aliases: ["Basic", "Standard"] },
  { id: 145, finish: "Rainbow", aliases: [] },
  { id: 24, finish: "Tricolor", aliases: ["Tri Color", "Tricolour"] },
  { id: 252, finish: "Dual Color", aliases: ["Bicolor", "Bi Color", "Bicolour", "Dual Colour"] },
  { id: 91, finish: "Glow In the Dark", aliases: ["Glow"] },
  { id: 123, finish: "Wood", aliases: [] },
  { id: 232, finish: "Marble", aliases: [] },
  { id: 238, finish: "Carbon Fiber", aliases: ["Carbon", "Carbon Fibre"] },
  { id: 92, finish: "Silk", aliases: [] },
  { id: 64, finish: "Glitter", aliases: [] },
  { id: 226, finish: "Metallic", aliases: ["Metal"] },
  { id: 216, finish: "Neon", aliases: [] },
  { id: 21, finish: "Transparent", aliases: ["Clear"] },
  { id: 67, finish: "Translucent", aliases: [] },
  { id: 129, finish: "Glossy", aliases: ["Gloss"] },
  { id: 247, finish: "Matte", aliases: ["Matt"] },
  { id: 134, finish: "Satin", aliases: [] },
  { id: 126, finish: "Pearl", aliases: [] },
  { id: 132, finish: "Fiber", aliases: [] },
];
const finishById = new Map(ASPECTS.map((entry) => [entry.id, entry.finish]));
const aspectByKey = new Map<string, number>(
  ASPECTS.flatMap((entry) =>
    [...(entry.finish ? [entry.finish] : []), ...entry.aliases].map(
      (label) => [key(label), entry.id] as const,
    ),
  ),
);

/**
 * The common finish word of an aspect id; null for 255 / absent, undefined for an id this table
 * does not know.
 */
export function aspectLabel(id: unknown): string | null | undefined {
  if (typeof id !== "number" || id === NO_ASPECT) return null;
  return finishById.get(id);
}

/** The aspect id for a finish label, or null when TigerTag has no such aspect. */
export function aspectId(label: string): number | null {
  const word = finishWord(label);
  return aspectByKey.get(key(label)) ?? (word ? aspectByKey.get(key(word)) : undefined) ?? null;
}

/** Splits a finish such as "Matte, Silk" into its labels (at most two fit in a record). */
export function finishLabels(finish: string | null | undefined): string[] {
  return finishWords(finish, { slash: true, keepOrder: true });
}
