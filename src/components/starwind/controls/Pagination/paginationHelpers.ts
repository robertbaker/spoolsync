import type { Page } from "astro";

export type PaginationPage = Pick<Page, "currentPage" | "lastPage" | "url">;
const integer = (value: number, fallback: number, minimum: number) =>
  Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(minimum, Math.floor(value)))
    : fallback;

export function normalizePagination(page: PaginationPage) {
  const lastPage = integer(page.lastPage, 1, 1);
  return { lastPage, currentPage: Math.min(lastPage, integer(page.currentPage, 1, 1)) };
}

/** Bounded work even for very large collections or invalid configuration. */
export function generatePageNumbers(
  page: PaginationPage,
  siblingCount = 1,
  boundaryCount = 1,
): (number | "ellipsis")[] {
  const { currentPage, lastPage } = normalizePagination(page);
  const siblings = Math.min(integer(siblingCount, 1, 0), 100);
  const boundaries = Math.min(integer(boundaryCount, 1, 0), 100);
  const visible = new Set<number>([currentPage]);
  for (let n = 1; n <= Math.min(boundaries, lastPage); n++) {
    visible.add(n);
    visible.add(lastPage - n + 1);
  }
  for (
    let n = Math.max(1, currentPage - siblings);
    n <= Math.min(lastPage, currentPage + siblings);
    n++
  )
    visible.add(n);
  const result: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const n of [...visible].sort((a, b) => a - b)) {
    if (previous && n - previous === 2) result.push(previous + 1);
    else if (previous && n - previous > 2) result.push("ellipsis");
    result.push(n);
    previous = n;
  }
  return result;
}

/** Preserve known Astro URLs; infer missing numbered paths without duplicating /N/. */
export function resolvePageHref(page: PaginationPage, pageNumber: number): string {
  const url = page.url;
  if (pageNumber === page.currentPage && url.current) return url.current;
  if (pageNumber === 1 && url.first) return url.first;
  if (pageNumber === page.lastPage && url.last) return url.last;
  if (pageNumber === page.currentPage - 1 && url.prev) return url.prev;
  if (pageNumber === page.currentPage + 1 && url.next) return url.next;
  const generator = (url as typeof url & { page?: (n: number) => string | undefined }).page;
  if (typeof generator === "function") {
    const generated = generator.call(url, pageNumber);
    if (generated) return generated;
  }
  const source = url.current || url.first || "/";
  const match = source.match(/^([^?#]*)([?#].*)?$/)!;
  let path = match[1] ?? "";
  const suffix = match[2] ?? "";
  const trailing = path.endsWith("/");
  const numbered = page.currentPage >= 1 && new RegExp(`/${page.currentPage}/?$`).test(path);
  if (numbered) path = path.replace(new RegExp(`/${page.currentPage}/?$`), "/");
  else if (url.first) path = url.first.split(/[?#]/)[0] ?? "";
  path = path.replace(/\/$/, "");
  return `${path}${pageNumber === 1 ? "" : `/${pageNumber}`}${trailing || path === "" ? "/" : ""}${suffix}`;
}
