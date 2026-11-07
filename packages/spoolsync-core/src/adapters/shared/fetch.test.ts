import { expect, test } from "bun:test";

import { fetchWithHeaderTimeout, type FetchLike } from "./fetch";

test("aborts the request when headers do not arrive in time", () => {
  const stalled: FetchLike = (_input, init) =>
    new Promise((_resolve, reject) =>
      init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
    );
  expect(fetchWithHeaderTimeout(stalled, "http://x.test", {}, 20)).rejects.toThrow("aborted");
});

test("does not limit reading the body once headers have arrived", async () => {
  let signal: AbortSignal | undefined;
  const fetchImpl: FetchLike = async (_input, init) => {
    signal = init!.signal!;
    return new Response("ok");
  };
  const response = await fetchWithHeaderTimeout(fetchImpl, "http://x.test", {}, 20);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(signal?.aborted).toBe(false);
  expect(await response.text()).toBe("ok");
});

test("a caller-supplied signal cannot replace the deadline", async () => {
  let seen: AbortSignal | undefined;
  const fetchImpl: FetchLike = async (_input, init) => {
    seen = init!.signal!;
    return new Response("");
  };
  const own = new AbortController().signal;
  await fetchWithHeaderTimeout(fetchImpl, "http://x.test", { signal: own }, 20);
  expect(seen).not.toBe(own);
});
