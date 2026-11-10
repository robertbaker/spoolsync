import { toText } from "../../core/normalize";
import { commonFinish, finishWord, finishWords } from "../shared/finish";

/**
 * 3DFilamentProfiles splits what Spoolstock and the common model call the material across two
 * columns: `material` is the base type (PLA, PETG) and `material_type` is either a product line
 * (Basic, High Speed, Ultra) or a finish (Matte, Silk). The common material is the compound form
 * (HSPLA, PLA-Ultra) and the common finish holds only true finish words, so both columns can be
 * rebuilt from the common values and the two stay comparable with other services.
 */

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
/** The product lines 3DFP names; "Basic" is the plain line and adds nothing to the material. */
const BASIC = "Basic";
const HIGH_SPEED = "High Speed";
const KNOWN_LINES = [HIGH_SPEED, "Ultra"];
const lineByKey = new Map(KNOWN_LINES.map((line) => [normalize(line), line] as const));

const same = (a: string | null | undefined, b: string | null | undefined) =>
  normalize(a ?? "") === normalize(b ?? "");

const isBasic = (text: string | null | undefined) =>
  ["basic", "standard"].includes(normalize(text ?? ""));

/** The base type with a product line: `HS` prefix for High Speed, `-Line` otherwise. */
function withLine(base: string, line: string): string {
  if (line === HIGH_SPEED) return /^HS(?=[A-Z])/.test(base) ? base : `HS${base}`;
  return base.endsWith(`-${line}`) ? base : `${base}-${line}`;
}

/** The common material and finish for a row's `material` and `material_type` columns. */
export function commonMaterialAndFinish(
  material: string | null,
  materialType: string | null,
): { material: string | null; finish: string | null } {
  const type = toText(materialType);
  if (!type) return { material, finish: null };
  const finish = finishWord(type);
  if (finish) return { material, finish };
  if (isBasic(type) || !material) return { material, finish: null };
  // A product line the common model has no place for stays visible in the compound material.
  return { material: withLine(material, lineByKey.get(normalize(type)) ?? type), finish: null };
}

export interface ParsedMaterial {
  base: string;
  line?: string;
  finish?: string;
}

/** Splits a common material such as `HSPETG-Matte` or `PLA-Ultra-Matte` into its parts. */
export function parseMaterial(material: string): ParsedMaterial {
  let rest = material.trim();
  let line: string | undefined;
  const highSpeed = /^HS(?=[A-Z])/.exec(rest);
  if (highSpeed) {
    line = HIGH_SPEED;
    rest = rest.slice(2);
  }
  const [base = rest, ...extras] = rest.split("-");
  let finish: string | undefined;
  const unknown: string[] = [];
  for (const extra of extras) {
    const word = finishWord(extra);
    const known = lineByKey.get(normalize(extra));
    if (word && !finish) finish = word;
    else if (known && !line) line = known;
    else unknown.push(extra);
  }
  // Anything else after a dash (for example `-CF`) is part of the base type.
  return { base: [base, ...unknown].join("-"), line, finish };
}

/** The finish word that fits `material_type`: the first one this vocabulary knows. */
export const storedFinish = (text: string | null | undefined): string | undefined =>
  finishWords(text, { slash: true }).find((word) => finishWord(word) !== undefined);

export interface RowMaterial {
  /** The `material` column; undefined to leave it as it is. */
  material: string | null | undefined;
  materialType: string;
  /** Set when a product line was dropped because a finish already fills the single `material_type`. */
  droppedLine?: string;
  /** Finish words the single `material_type` could not hold next to the one it stores. */
  droppedFinish?: string[];
}

/**
 * The `material` and `material_type` columns for common values; `undefined` means the value is not
 * being changed and the row's own is used. A finish word takes `material_type` over a product line
 * (it holds only one); a line without a finish is written as the line; neither writes "Basic".
 */
export function rowMaterial(
  values: { material?: string | null; finish?: string | null },
  current: { materialType: string | null },
): RowMaterial {
  const currentType = toText(current.materialType);
  const parsed = values.material ? parseMaterial(values.material) : undefined;
  // An unchanged material keeps the row's own product line, even one this table does not know.
  const line =
    values.material === undefined
      ? currentType && !finishWord(currentType) && !isBasic(currentType)
        ? (lineByKey.get(normalize(currentType)) ?? currentType)
        : undefined
      : parsed?.line;
  const finishText =
    values.finish === undefined ? (finishWord(currentType) ?? "") : (values.finish ?? "");
  // "PLA-Matte" without a finish of its own says the finish in the material.
  const finish = storedFinish(finishText) ?? (finishText ? undefined : parsed?.finish);
  const droppedFinish = finishWords(finishText, { slash: true }).filter((word) => word !== finish);
  return {
    material: values.material === undefined ? undefined : (parsed?.base ?? values.material),
    materialType: finish ?? line ?? BASIC,
    ...(finish && line ? { droppedLine: line } : {}),
    ...(droppedFinish.length ? { droppedFinish } : {}),
  };
}

/** Rebuilds a compound material with another finish (or none), keeping the base and product line. */
export function withMaterialFinish(material: string, finish: string | undefined): string {
  const parsed = parseMaterial(material);
  const line = parsed.line;
  let compound = parsed.base;
  if (line) compound = withLine(compound, line);
  return finish ? `${compound}-${finish}` : compound;
}

/**
 * What the single `material_type` column and the base `material` cannot hold, kept as lines in the
 * notes so a spool reloads as the same compound material and the same finish words.
 */
export interface MaterialTags {
  material?: string;
  finish?: string;
}

/** The common material and finish of a row, with the notes tags that restore what its columns lose. */
export function taggedMaterialAndFinish(
  material: string | null,
  materialType: string | null,
  tags: MaterialTags,
): { material: string | null; finish: string | null; applied: Array<keyof MaterialTags> } {
  const columns = commonMaterialAndFinish(material, materialType);
  const applied: Array<keyof MaterialTags> = [];
  let finish = columns.finish;
  // Only words the single column would hold as the row's own finish; anything else is stale.
  if (tags.finish && same(storedFinish(tags.finish), columns.finish ?? undefined)) {
    finish = commonFinish(tags.finish, { slash: true }) ?? columns.finish;
    applied.push("finish");
  }
  let common = columns.material;
  if (tags.material && material) {
    // Valid only when writing the tagged compound would give back exactly these columns.
    const rebuilt = rowMaterial({ material: tags.material, finish }, { materialType: null });
    const back = commonMaterialAndFinish(rebuilt.material ?? null, rebuilt.materialType);
    if (
      same(rebuilt.material, material) &&
      same(back.material, columns.material) &&
      same(back.finish, columns.finish)
    ) {
      common = tags.material;
      applied.push("material");
    }
  }
  return { material: common, finish, applied };
}

/** The notes tags a row needs so that `material` and `finish` reload unchanged from its columns. */
export function materialTags(
  values: { material?: string | null; finish?: string | null },
  rebuilt: RowMaterial,
  columnMaterial: string | null,
): MaterialTags {
  const loaded = commonMaterialAndFinish(rebuilt.material ?? columnMaterial, rebuilt.materialType);
  const finish = commonFinish(values.finish, { slash: true });
  return {
    ...(values.material && !same(loaded.material, values.material)
      ? { material: values.material }
      : {}),
    ...(finish && !same(finish, loaded.finish) ? { finish } : {}),
  };
}
