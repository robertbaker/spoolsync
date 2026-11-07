import { AFFILIATE_PROGRAMS, REDIRECT_PREFIX, resolveRedirect } from "../src/lib/affiliates";

/**
 * Shop links point at `/go/<program>?…` on this site instead of at the shops, so the affiliate
 * parameters live here and the pages never carry them. Everything else is served from the static
 * assets (`run_worker_first` in `wrangler.jsonc` sends only `/go/*` here).
 */
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(REDIRECT_PREFIX))
      return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const target = resolveRedirect(url, AFFILIATE_PROGRAMS, request.headers.get("accept-language"));
    const headers = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    };
    // Unknown program or nothing to search for: send the visitor to the site, not an error page.
    if (!target) return new Response(null, { status: 302, headers: { ...headers, Location: "/" } });
    return new Response(null, { status: 302, headers: { ...headers, Location: target } });
  },
};
