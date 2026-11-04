import { cleanInline } from "./text";

/** Polymers the material rule understands, by the lowercase token people type. */
const BASES: Readonly<Record<string, string>> = {
  pla: "PLA",
  petg: "PETG",
  pet: "PET",
  pctg: "PCTG",
  abs: "ABS",
  asa: "ASA",
  tpu: "TPU",
  tpe: "TPE",
  pc: "PC",
  pp: "PP",
  ppa: "PPA",
  pps: "PPS",
  pva: "PVA",
  pvb: "PVB",
  bvoh: "BVOH",
  hips: "HIPS",
  peek: "PEEK",
  pei: "PEI",
  pbt: "PBT",
  pom: "POM",
  cpe: "CPE",
};

/** Words that mean polyamide; they all canonicalize to `PA`. */
const POLYAMIDE = new Set(["pa", "nylon", "polyamide"]);
const POLYAMIDE_GRADES = new Set(["6", "11", "12", "46", "66", "610", "612"]);

/**
 * Surface finishes and looks. They describe the colour, not the polymer, so the variant rule moves
 * them from the material into the name. Values are how they are written in a name.
 */
const VARIANTS: Readonly<Record<string, string>> = {
  silk: "Silk",
  matte: "Matte",
  marble: "Marble",
  glow: "Glow",
  sparkle: "Sparkle",
  glitter: "Glitter",
  galaxy: "Galaxy",
  wood: "Wood",
  metallic: "Metallic",
  translucent: "Translucent",
  transparent: "Transparent",
  rainbow: "Rainbow",
  tough: "Tough",
  basic: "Basic",
  lite: "Lite",
  highspeed: "High Speed",
};

const FIBERS: Readonly<Record<string, string>> = { cf: "CF", gf: "GF" };

export interface ParsedMaterial {
  /** `PLA`, `PETG`, `PA6`, ...: the polymer with its grade, without any modifier. */
  base: string;
  /** `PLA+` style: "plus" or a trailing plus sign. */
  plus: boolean;
  fiber: "CF" | "GF" | null;
  /** Shore hardness such as `95A`. */
  shore: string | null;
  /** Finishes in the order written, title cased. */
  variants: string[];
  /** The base was a synonym ("nylon", "polyamide") rather than the canonical `PA`. */
  synonym: boolean;
}

/**
 * Reads a free-text material. Returns `null` when any word is not understood (a product name, a
 * blend such as `PC-ABS`, a second polymer) so unknown materials are never rewritten.
 */
export function parseMaterial(text: string): ParsedMaterial | null {
  const lowered = cleanInline(text)
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/pet[\s-]+g\b/g, "petg")
    .replace(/carbon[\s-]*fi(?:ber|bre)s?/g, "cf")
    .replace(/glass[\s-]*fi(?:ber|bre)s?/g, "gf")
    .replace(/high[\s-]+speed/g, "highspeed");
  const tokens = lowered.split(/[\s_\-/,]+/).filter(Boolean);
  if (!tokens.length) return null;

  let base: string | null = null;
  let synonym = false;
  let plus = false;
  let fiber: ParsedMaterial["fiber"] = null;
  let shore: string | null = null;
  const variants: string[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const polyamide = /^(pa|nylon|polyamide)(\d{1,3})?$/.exec(token);
    if (polyamide && POLYAMIDE.has(polyamide[1]!)) {
      if (base !== null) return null;
      let grade = polyamide[2] ?? "";
      if (!grade && POLYAMIDE_GRADES.has(tokens[index + 1] ?? "")) grade = tokens[++index]!;
      if (grade && !POLYAMIDE_GRADES.has(grade)) return null;
      base = `PA${grade}`;
      synonym = polyamide[1] !== "pa";
    } else if (Object.hasOwn(BASES, token)) {
      if (base !== null) return null;
      base = BASES[token]!;
    } else if (token === "plus") {
      if (plus) return null;
      plus = true;
    } else if (Object.hasOwn(FIBERS, token) || token === "carbon") {
      if (fiber) return null;
      fiber = token === "carbon" ? "CF" : (FIBERS[token] as "CF" | "GF");
    } else if (/^\d{2,3}[ad]$/.test(token)) {
      if (shore) return null;
      shore = token.toUpperCase();
    } else if (Object.hasOwn(VARIANTS, token)) {
      const variant = VARIANTS[token]!;
      if (!variants.includes(variant)) variants.push(variant);
    } else return null;
  }
  if (base === null) return null;
  return { base, plus, fiber, shore, variants, synonym };
}

/** The canonical spelling: `PLA+`, `PETG-CF`, `PA12-GF`, `TPU 95A`, with finishes optional. */
export function formatMaterial(parsed: ParsedMaterial, keepVariants: boolean): string {
  const core =
    parsed.base +
    (parsed.plus ? "+" : "") +
    (parsed.fiber ? `-${parsed.fiber}` : "") +
    (parsed.shore ? ` ${parsed.shore}` : "");
  return keepVariants && parsed.variants.length ? `${core} ${parsed.variants.join(" ")}` : core;
}

/**
 * Whether two material spellings differ only in case, spacing and punctuation (with "plus" and "+"
 * the same). Such a change is cosmetic; anything else (nylon to PA) is a judgement call.
 */
export function sameMaterialLetters(a: string, b: string): boolean {
  const flatten = (text: string) =>
    text
      .toLowerCase()
      .replace(/plus/g, "+")
      .replace(/[^a-z0-9+]/g, "");
  return flatten(a) === flatten(b);
}

/** Whether `name` already mentions a finish as a whole word (any case). */
export function nameMentions(name: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(name);
}
