import { afterEach, expect, test } from "bun:test";

import { BambuddyClient } from "../bambuddy/client";
import { FilamentDbClient } from "../filamentdb/client";
import { localNetworkInit } from "./local-network";

const original = Object.getOwnPropertyDescriptor(globalThis, "location");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "location", original);
  else delete (globalThis as { location?: unknown }).location;
});
const onPage = (protocol: string) =>
  Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol } });

test("only an https page calling a plain-http server needs the exemption", () => {
  expect(localNetworkInit("http://192.168.1.20:3000", "https:")).toEqual({
    targetAddressSpace: "local",
  });
  expect(localNetworkInit("https://inventory.example", "https:")).toEqual({});
  expect(localNetworkInit("http://192.168.1.20:3000", "http:")).toEqual({});
  expect(localNetworkInit("http://localhost:3000", "https:")).toEqual({});
  expect(localNetworkInit("http://192.168.1.20:3000", undefined)).toEqual({});
});

test("FilamentDB and Bambuddy requests from the https site are flagged", async () => {
  onPage("https:");
  const seen: Array<RequestInit & { targetAddressSpace?: string }> = [];
  const respond = async (_input: unknown, init?: RequestInit) => {
    seen.push(init ?? {});
    return Response.json([]);
  };
  await new FilamentDbClient({
    baseUrl: "http://filamentdb.local:3000",
    fetchImpl: respond,
  }).listSpools();
  await new BambuddyClient(
    { baseUrl: "http://bambuddy.local:8000", apiKey: "k" },
    respond,
  ).listSpools();
  expect(seen.length).toBeGreaterThan(1);
  expect(seen.every((init) => init.targetAddressSpace === "local")).toBe(true);
});
