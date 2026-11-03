import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { cacheVersion, pageUrl, precacheUrls, renderServiceWorker } from "./service-worker";

const template = readFileSync(path.join(import.meta.dir, "sw.js"), "utf8");
const bytes = (text: string) => new TextEncoder().encode(text);

test("pages are addressed without an extension", () => {
  expect(pageUrl("index.html")).toBe("/");
  expect(pageUrl("load.html")).toBe("/load");
});

test("the precache list holds the shell, build output, fonts and icons, and nothing else", () => {
  const urls = precacheUrls([
    "index.html",
    "load.html",
    "sync.html",
    "404.html",
    "offline.html",
    "resources.html",
    "resources/some-post.html",
    "_astro/app.abc123.js",
    "_astro/app.abc123.js.map",
    "_astro/style.def456.css",
    "_astro/photo.abc.avif",
    "fonts/inter.woff2",
    "fonts/readme.txt",
    "icons/icon-192.png",
    "favicon.svg",
    "manifest.webmanifest",
    "social-card.png",
    "_headers",
    "_redirects",
    "robots.txt",
  ]);
  expect(urls).toEqual([
    "/",
    "/_astro/app.abc123.js",
    "/_astro/style.def456.css",
    "/favicon.svg",
    "/fonts/inter.woff2",
    "/icons/icon-192.png",
    "/load",
    "/manifest.webmanifest",
    "/offline",
    "/sync",
  ]);
});

test("the version changes with any file's name or content, not with order", () => {
  const a = { url: "/a", content: bytes("one") };
  const b = { url: "/b", content: bytes("two") };
  const version = cacheVersion([a, b]);
  expect(version).toMatch(/^[0-9a-f]{12}$/);
  expect(cacheVersion([b, a])).toBe(version);
  expect(cacheVersion([a, { ...b, content: bytes("three") }])).not.toBe(version);
  expect(cacheVersion([a, { ...b, url: "/c" }])).not.toBe(version);
});

test("rendering fills the placeholders and rejects a broken template or version", () => {
  const output = renderServiceWorker(template, "0123456789ab", ["/", "/load"]);
  expect(output).toContain('const VERSION = "0123456789ab"');
  expect(output).toContain('"/load"');
  expect(output).not.toContain("__VERSION__");
  expect(() => renderServiceWorker("nothing here", "0123456789ab", [])).toThrow();
  expect(() => renderServiceWorker(template, "bad version", [])).toThrow();
});

// ---- Running the worker against a fake scope ------------------------------------------------

type Handler = (event: unknown) => void;

class FakeCache {
  readonly store = new Map<string, Response>();
  private key(request: Request | string) {
    const url = new URL(
      typeof request === "string" ? request : request.url,
      "https://spoolsync.test",
    );
    return url.pathname + url.search;
  }
  async put(request: Request | string, response: Response) {
    this.store.set(this.key(request), response);
  }
  async match(request: Request | string, options?: { ignoreSearch?: boolean }) {
    const url = new URL(
      typeof request === "string" ? request : request.url,
      "https://spoolsync.test",
    );
    return this.store.get(options?.ignoreSearch ? url.pathname : this.key(request))?.clone();
  }
}

function boot(
  options: {
    version?: string;
    precache?: string[];
    online?: () => Response | Promise<Response>;
  } = {},
) {
  const source = renderServiceWorker(
    template,
    options.version ?? "aaaaaaaaaaaa",
    options.precache ?? ["/", "/offline"],
  );
  const handlers: Record<string, Handler> = {};
  const caches = new Map<string, FakeCache>();
  const fetched: string[] = [];
  const state = { skipped: false, claimed: false, online: true };
  const scope = {
    location: new URL("https://spoolsync.test/sw.js"),
    addEventListener: (type: string, handler: Handler) => (handlers[type] = handler),
    skipWaiting: () => (state.skipped = true),
    clients: { claim: async () => (state.claimed = true) },
  };
  const cacheStorage = {
    open: async (name: string) => {
      if (!caches.has(name)) caches.set(name, new FakeCache());
      return caches.get(name)!;
    },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  };
  const fakeFetch = async (input: Request | string) => {
    const url = typeof input === "string" ? input : input.url;
    fetched.push(new URL(url).pathname);
    if (!state.online) throw new TypeError("offline");
    return options.online?.() ?? new Response(`body of ${new URL(url).pathname}`, { status: 200 });
  };
  // A real worker resolves relative addresses against its scope; the fake does the same.
  class ScopedRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(
        typeof input === "string" ? new URL(input, "https://spoolsync.test").href : input,
        init,
      );
    }
  }
  new Function("self", "caches", "fetch", "Response", "Request", "URL", "setTimeout", source)(
    scope,
    cacheStorage,
    fakeFetch,
    Response,
    ScopedRequest,
    URL,
    setTimeout,
  );
  const run = async (type: string, event: Record<string, unknown> = {}) => {
    let pending: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    handlers[type]!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => (pending = promise),
      respondWith: (promise: Promise<Response>) => (responded = promise),
    });
    await pending;
    return responded;
  };
  const get = (
    url: string,
    init: { mode?: string; headers?: Record<string, string>; method?: string } = {},
  ) => {
    const request = new Request(url, { method: init.method ?? "GET", headers: init.headers ?? {} });
    if (init.mode) Object.defineProperty(request, "mode", { value: init.mode });
    return run("fetch", { request });
  };
  return { caches, fetched, state, scope, run, get };
}

test("install precaches the list and activate removes only older SpoolSync caches", async () => {
  const worker = boot({ version: "bbbbbbbbbbbb", precache: ["/", "/load"] });
  await worker.run("install");
  expect([...worker.caches.keys()]).toEqual(["spoolsync-bbbbbbbbbbbb"]);
  expect([...worker.caches.get("spoolsync-bbbbbbbbbbbb")!.store.keys()].sort()).toEqual([
    "/",
    "/load",
  ]);

  await worker.scope.clients.claim();
  worker.caches.set("spoolsync-old", new FakeCache());
  worker.caches.set("someone-elses", new FakeCache());
  await worker.run("activate");
  expect([...worker.caches.keys()].sort()).toEqual(["someone-elses", "spoolsync-bbbbbbbbbbbb"]);
  expect(worker.state.claimed).toBe(true);
});

test("a failed precache fetch fails the install so a broken build never activates", async () => {
  const worker = boot({ online: () => new Response("nope", { status: 500 }) });
  expect(worker.run("install")).rejects.toThrow();
});

test("a waiting worker only takes over when the page asks", async () => {
  const worker = boot();
  await worker.run("install");
  expect(worker.state.skipped).toBe(false);
  await worker.run("message", { data: { type: "SOMETHING_ELSE" } });
  expect(worker.state.skipped).toBe(false);
  await worker.run("message", { data: { type: "SKIP_WAITING" } });
  expect(worker.state.skipped).toBe(true);
});

test("cross-origin, non-GET, range and worker requests are never intercepted", async () => {
  const worker = boot();
  await worker.run("install");
  expect(
    await worker.get("https://raw.githubusercontent.com/robertbaker/spoolsync/main/CHANGELOG.md"),
  ).toBeUndefined();
  expect(await worker.get("http://spoolman.local:7912/api/v1/spool")).toBeUndefined();
  expect(await worker.get("https://spoolsync.test/api", { method: "POST" })).toBeUndefined();
  expect(
    await worker.get("https://spoolsync.test/video.mp4", { headers: { range: "bytes=0-1" } }),
  ).toBeUndefined();
  expect(await worker.get("https://spoolsync.test/sw.js")).toBeUndefined();
  expect(await worker.get("https://spoolsync.test/manifest.webmanifest")).toBeUndefined();
});

test("pages go to the network first and fall back to the saved copy, then the offline page", async () => {
  const worker = boot({ precache: ["/", "/load", "/offline"] });
  await worker.run("install");
  const online = await worker.get("https://spoolsync.test/load", { mode: "navigate" });
  expect(await online!.text()).toBe("body of /load");

  worker.state.online = false;
  const offline = await worker.get("https://spoolsync.test/load", { mode: "navigate" });
  expect(await offline!.text()).toBe("body of /load");
  // A page that was never saved shows the offline page instead of a browser error.
  const unknown = await worker.get("https://spoolsync.test/resources/never-visited", {
    mode: "navigate",
  });
  expect(await unknown!.text()).toBe("body of /offline");
});

test("only plain successes are saved: no errors, no-store, or authorized requests", async () => {
  const cacheOf = (worker: ReturnType<typeof boot>) => worker.caches.get("spoolsync-aaaaaaaaaaaa")!;
  const failing = boot({ precache: [], online: () => new Response("missing", { status: 404 }) });
  await failing.get("https://spoolsync.test/missing", { mode: "navigate" });
  expect(cacheOf(failing)?.store.size ?? 0).toBe(0);

  const noStore = boot({
    precache: [],
    online: () =>
      new Response("private", { status: 200, headers: { "cache-control": "no-store" } }),
  });
  await noStore.get("https://spoolsync.test/data.json");
  expect(cacheOf(noStore)?.store.size ?? 0).toBe(0);

  const authorized = boot({ precache: [] });
  await authorized.get("https://spoolsync.test/data.json", {
    headers: { authorization: "Bearer secret" },
  });
  expect(cacheOf(authorized)?.store.size ?? 0).toBe(0);

  const ok = boot({ precache: [] });
  await ok.get("https://spoolsync.test/data.json");
  expect([...cacheOf(ok).store.keys()]).toEqual(["/data.json"]);
});

test("hashed build files are served from the saved copy without asking the network again", async () => {
  const worker = boot({ precache: ["/_astro/app.abc.js"] });
  await worker.run("install");
  worker.fetched.length = 0;
  const response = await worker.get("https://spoolsync.test/_astro/app.abc.js");
  expect(await response!.text()).toBe("body of /_astro/app.abc.js");
  expect(worker.fetched).toEqual([]);
});
