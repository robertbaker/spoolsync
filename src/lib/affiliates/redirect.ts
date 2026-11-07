import type { AffiliateProgram, BuyQuery } from "./types";

/** Where shop links on the site point; the Worker in `worker/index.ts` answers these. */
export const REDIRECT_PREFIX = "/go/";

const MAX_PART = 200;
const MAX_LANGUAGES = 8;

/** Stands in for an empty brand, material or color in a path; a real `_` is escaped as `%5F`. */
const EMPTY = "_";
const encodePart = (text: string) =>
  text ? encodeURIComponent(text).replaceAll("_", "%5F") : EMPTY;

/**
 * The on-site path for a program's link: `/go/<program>/<brand>/<material>/<color>`, with no query
 * string. The page only ever carries this path, never the shop's address or affiliate parameters,
 * and the Worker builds those when the visitor clicks. The language is not in it either: the Worker
 * reads it from the request.
 */
export function redirectPath(programId: string, query: BuyQuery): string {
  const parts = [query.brand, query.material, query.color].map(encodePart).join("/");
  return `${REDIRECT_PREFIX}${encodeURIComponent(programId)}/${parts}`;
}

/** Language tags from an `Accept-Language` header, most preferred first. */
export function languagesFromHeader(header: string | null | undefined): string[] {
  return (header ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...rest] = part.trim().split(";");
      const q = Number(
        rest
          .find((item) => item.trim().startsWith("q="))
          ?.trim()
          .slice(2) ?? 1,
      );
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((item) => item.tag && item.tag !== "*" && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .slice(0, MAX_LANGUAGES)
    .map((item) => item.tag);
}

/**
 * The shop address a `/go/<program>` request stands for, or `null` when the program is unknown or
 * there is nothing to search for. Pure so it can be tested without a Worker.
 */
export function resolveRedirect(
  url: URL,
  programs: readonly AffiliateProgram[],
  acceptLanguage?: string | null,
): string | null {
  if (!url.pathname.startsWith(REDIRECT_PREFIX)) return null;
  const segments = url.pathname.slice(REDIRECT_PREFIX.length).split("/");
  if (segments.length > 1 && segments.at(-1) === "") segments.pop();
  if (segments.length !== 4) return null;
  let id: string, brand: string, material: string, color: string;
  try {
    [id = "", brand = "", material = "", color = ""] = segments.map((segment) =>
      segment === EMPTY ? "" : decodeURIComponent(segment).slice(0, MAX_PART),
    );
  } catch {
    return null;
  }
  const program = programs.find((candidate) => candidate.id === id);
  if (!program) return null;
  return program.link({ brand, material, color, languages: languagesFromHeader(acceptLanguage) });
}
