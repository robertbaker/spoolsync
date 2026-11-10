import { toText } from "../../core/normalize";

/**
 * 3DFilamentProfiles splits what Spoolstock and the common model call the material across two
 * columns: `material` is the base type (PLA, PETG) and `material_type` is either a product line
 * (Basic, High Speed, Ultra) or a finish (Matte, Silk). The common material is the compound form
 * (HSPLA, PLA-Ultra) and the common finish holds only true finish words, so both columns can be
 * rebuilt from the common values and the two stay comparable with other services.
 */

/** True finish words, as the common finish spells them, with the spellings read as the same word. */
const FINISH_WORDS: Array<[word: string, aliases: string[]]> = [
  ["Matte", ["Matt"]],
  ["Silk", []],
  ["Glossy", ["Gloss"]],
  ["Satin", []],
  ["Glitter", []],
  ["Metallic", ["Metal"]],
  ["Marble", []],
  ["Wood", []],
  ["Translucent", []],
  ["Transparent", ["Clear"]],
  ["Glow In the Dark", ["Glow"]],
  ["Carbon Fiber", ["Carbon Fibre"]],
  ["Rainbow", []],
  ["Neon", []],
  ["Pearl", []],
];
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const finishByKey = new Map(
  FINISH_WORDS.flatMap(([word, aliases]) =>
    [word, ...aliases].map((label) => [normalize(label), word] as const),
  ),
);

/** The product lines 3DFP names; "Basic" is the plain line and adds nothing to the material. */
const BASIC = "Basic";
const HIGH_SPEED = "High Speed";
const KNOWN_LINES = [HIGH_SPEED, "Ultra"];
const lineByKey = new Map(KNOWN_LINES.map((line) => [normalize(line), line] as const));

export const finishWord = (text: string | null | undefined): string | undefined =>
  finishByKey.get(normalize(text ?? ""));

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

interface ParsedMaterial {
  base: string;
  line?: string;
  finish?: string;
}

/** Splits a common material such as `HSPETG-Matte` or `PLA-Ultra-Matte` into its parts. */
function parseMaterial(material: string): ParsedMaterial {
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

export interface RowMaterial {
  /** The `material` column; undefined to leave it as it is. */
  material: string | null | undefined;
  materialType: string;
  /** Set when a product line was dropped because a finish already fills the single `material_type`. */
  droppedLine?: string;
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
  const finish =
    finishText
      .split(/[,/]/)
      .map((word) => finishWord(word))
      .find((word) => word !== undefined) ??
    // "PLA-Matte" without a finish of its own says the finish in the material.
    (finishText ? undefined : parsed?.finish);
  return {
    material: values.material === undefined ? undefined : (parsed?.base ?? values.material),
    materialType: finish ?? line ?? BASIC,
    ...(finish && line ? { droppedLine: line } : {}),
  };
}
