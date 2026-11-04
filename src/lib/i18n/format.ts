/**
 * ICU-lite message formatting. A message is plain text with three constructs:
 *
 * - `{name}` inserts a parameter (numbers are formatted for the locale with `Intl.NumberFormat`).
 * - `{count, plural, one {# spool} other {# spools}}` picks a branch with `Intl.PluralRules`.
 *   `=0`, `=1`, ... select an exact number first. `other` is required. `#` is the formatted number.
 * - Everything else is literal. Braces are reserved, so a message cannot contain a literal one.
 *
 * Messages are parsed once and cached. Parsing throws on malformed input, which the catalogue test
 * uses to reject a broken translation before it ships.
 */

export type MessageParams = Record<string, string | number>;

type Node =
  | { kind: "text"; text: string }
  | { kind: "hash" }
  | { kind: "arg"; name: string }
  | { kind: "plural"; name: string; options: Array<{ selector: string; body: Node[] }> };

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}" && --depth === 0) return index;
  }
  throw new Error(`Unbalanced "{" in message: ${text}`);
}

function parseNodes(text: string, insidePlural: boolean): Node[] {
  const nodes: Node[] = [];
  let literal = "";
  const flush = () => {
    if (literal) nodes.push({ kind: "text", text: literal });
    literal = "";
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === "}") throw new Error(`Unbalanced "}" in message: ${text}`);
    if (char === "#" && insidePlural) {
      flush();
      nodes.push({ kind: "hash" });
      continue;
    }
    if (char !== "{") {
      literal += char;
      continue;
    }
    flush();
    const end = closingBrace(text, index);
    nodes.push(parseArgument(text.slice(index + 1, end)));
    index = end;
  }
  flush();
  return nodes;
}

function parseArgument(inner: string): Node {
  const comma = inner.indexOf(",");
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid placeholder "{${inner}}".`);
  if (comma < 0) return { kind: "arg", name };
  const rest = inner.slice(comma + 1);
  const second = rest.indexOf(",");
  if (second < 0 || rest.slice(0, second).trim() !== "plural")
    throw new Error(`Only {name} and {name, plural, ...} are supported: "{${inner}}".`);
  const optionsText = rest.slice(second + 1);
  const options: Array<{ selector: string; body: Node[] }> = [];
  let cursor = 0;
  while (cursor < optionsText.length) {
    const open = optionsText.indexOf("{", cursor);
    if (open < 0) {
      if (optionsText.slice(cursor).trim()) throw new Error(`Stray text in plural: "${inner}".`);
      break;
    }
    const selector = optionsText.slice(cursor, open).trim();
    if (!PLURAL_CATEGORIES.has(selector) && !/^=\d+$/.test(selector))
      throw new Error(`Unknown plural selector "${selector}" in "{${inner}}".`);
    const close = closingBrace(optionsText, open);
    options.push({ selector, body: parseNodes(optionsText.slice(open + 1, close), true) });
    cursor = close + 1;
  }
  if (!options.some((option) => option.selector === "other"))
    throw new Error(`Plural needs an "other" branch: "{${inner}}".`);
  return { kind: "plural", name, options };
}

const parsed = new Map<string, Node[]>();

function parseMessage(template: string): Node[] {
  let nodes = parsed.get(template);
  if (!nodes) {
    nodes = parseNodes(template, false);
    parsed.set(template, nodes);
  }
  return nodes;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

/** A cached `Intl.NumberFormat`; falls back to the default locale for a tag the runtime rejects. */
export function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, options);
    } catch {
      format = new Intl.NumberFormat(undefined, options);
    }
    numberFormats.set(key, format);
  }
  return format;
}

function pluralCategory(locale: string, value: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules("en");
    }
    pluralRules.set(locale, rules);
  }
  return rules.select(value);
}

function render(nodes: Node[], params: MessageParams, locale: string, hash?: number): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.text;
        break;
      case "hash":
        out += hash === undefined ? "#" : numberFormat(locale).format(hash);
        break;
      case "arg": {
        const value = params[node.name];
        out +=
          value === undefined
            ? `{${node.name}}`
            : typeof value === "number"
              ? numberFormat(locale).format(value)
              : value;
        break;
      }
      case "plural": {
        const raw = params[node.name];
        const value = typeof raw === "number" ? raw : Number(raw);
        if (raw === undefined || !Number.isFinite(value)) {
          out += `{${node.name}}`;
          break;
        }
        const option =
          node.options.find((candidate) => candidate.selector === `=${value}`) ??
          node.options.find((candidate) => candidate.selector === pluralCategory(locale, value)) ??
          node.options.find((candidate) => candidate.selector === "other")!;
        out += render(option.body, params, locale, value);
        break;
      }
    }
  }
  return out;
}

/** Formats a message for a locale. Throws when the template is malformed. */
export function formatMessage(template: string, params: MessageParams, locale: string): string {
  return render(parseMessage(template), params, locale);
}

function collectNames(nodes: Node[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === "arg") into.add(node.name);
    else if (node.kind === "plural") {
      into.add(node.name);
      for (const option of node.options) collectNames(option.body, into);
    }
  }
}

/** The parameter names a message uses, sorted. A translation must use the same ones as English. */
export function placeholderNames(template: string): string[] {
  const names = new Set<string>();
  collectNames(parseMessage(template), names);
  return [...names].sort();
}
