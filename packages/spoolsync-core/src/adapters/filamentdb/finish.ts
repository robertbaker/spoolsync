import { toText } from "../../core/normalize";

/** FilamentDB stores `finish` as a small enum; SpoolSync compares it as free text. */
const READ: Record<string, string | null> = {
  plain: "Basic",
  glossy: "Glossy",
  matte: "Matte",
  silk: "Silk",
  textured: "Textured",
  "n/a": null,
};

const WRITE: Record<string, string> = {
  plain: "plain",
  basic: "plain",
  standard: "plain",
  glossy: "glossy",
  gloss: "glossy",
  matte: "matte",
  silk: "silk",
  textured: "textured",
  "n/a": "n/a",
  na: "n/a",
};

/** The finish as free text. A value outside FilamentDB's enum is kept as written, not dropped. */
export function readFinish(value: unknown): string | null {
  const text = toText(value);
  if (text === null) return null;
  const key = text.toLowerCase();
  return Object.hasOwn(READ, key) ? READ[key]! : text;
}

/** The FilamentDB enum value for a finish, or `null` when it has no equivalent. */
export function writeFinish(value: unknown): string | null {
  const text = toText(value);
  return text === null ? null : (WRITE[text.toLowerCase()] ?? null);
}
