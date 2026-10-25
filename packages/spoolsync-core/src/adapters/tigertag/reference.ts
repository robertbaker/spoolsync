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
