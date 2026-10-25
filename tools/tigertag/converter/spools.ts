import { readFile } from "node:fs/promises";
import path from "node:path";

import { CliError } from "./errors";
import { log } from "./log";
import type { CliOptions, JsonRecord, SpoolmanSpool } from "./types";

const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const SPOOL_PAGE_SIZE = 1000;

export interface SpoolInputDependencies {
  readText(filename: string): Promise<string>;
  fetch(input: URL, init?: RequestInit): Promise<Response>;
  log: typeof log;
}
const defaultSpoolInputDependencies: SpoolInputDependencies = {
  readText: (filename) => readFile(filename, "utf8"),
  fetch: (input, init) => fetch(input, init),
  log,
};

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError("--url must be a valid absolute HTTP(S) URL", 2);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError("--url must use HTTP or HTTPS", 2);
  }
  if (url.username || url.password)
    throw new CliError("Do not put credentials in --url; use --token", 2);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function loadSpools(
  options: CliOptions,
  dependencies: SpoolInputDependencies = defaultSpoolInputDependencies,
): Promise<SpoolmanSpool[]> {
  if (options.input) {
    let text;
    try {
      text = await dependencies.readText(path.resolve(options.input));
    } catch (error: any) {
      throw new CliError(`Cannot read input file: ${error.message}`);
    }
    return parseSpoolPayload(text, options.input);
  }

  const base = normalizeBaseUrl(options.url ?? "");
  const endpoint = `${base}/api/v1/spool`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout);
  try {
    dependencies.log("info", `Reading inventory from ${base}`);
    const spools: SpoolmanSpool[] = [];
    let totalBytes = 0;
    for (let offset = 0; ; offset += SPOOL_PAGE_SIZE) {
      const pageUrl = new URL(endpoint);
      pageUrl.searchParams.set("limit", String(SPOOL_PAGE_SIZE));
      pageUrl.searchParams.set("offset", String(offset));
      const response = await dependencies.fetch(pageUrl, {
        headers: {
          accept: "application/json",
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        const statusText = response.statusText ? ` ${response.statusText}` : "";
        throw new CliError(`Spoolman returned HTTP ${response.status}${statusText} for ${pageUrl}`);
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength + totalBytes > MAX_RESPONSE_BYTES) {
        throw new CliError(`Spoolman response exceeds the ${MAX_RESPONSE_BYTES} byte safety limit`);
      }
      const body = await response.text();
      totalBytes += Buffer.byteLength(body, "utf8");
      if (totalBytes > MAX_RESPONSE_BYTES) {
        throw new CliError(`Spoolman response exceeds the ${MAX_RESPONSE_BYTES} byte safety limit`);
      }
      const page = parseSpoolPayload(body, pageUrl.toString());
      spools.push(...page);
      if (page.length < SPOOL_PAGE_SIZE) break;
    }
    return spools;
  } catch (error: any) {
    if (error instanceof CliError) throw error;
    if (error.name === "AbortError")
      throw new CliError(`Spoolman request timed out after ${options.timeout} ms`);
    throw new CliError(`Could not fetch Spoolman inventory: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export function parseSpoolPayload(text: string, source: string): SpoolmanSpool[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: any) {
    throw new CliError(`${source} is not valid JSON: ${error.message}`);
  }
  const object =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { spools?: unknown })
      : undefined;
  const spools = Array.isArray(parsed) ? parsed : object?.spools;
  if (!Array.isArray(spools)) {
    throw new CliError(
      `${source} must contain a Spoolman spool array or an object with a "spools" array`,
    );
  }
  return spools.map(nestFlatSpool) as SpoolmanSpool[];
}

/**
 * Spoolman's file export flattens nested objects into dotted keys (`filament.vendor.name`,
 * `extra.x`). Rebuilds the API shape; a spool that already has a `filament` object is returned as
 * is.
 */
function nestFlatSpool(spool: unknown): unknown {
  if (!spool || typeof spool !== "object" || Array.isArray(spool)) return spool;
  const source = spool as JsonRecord;
  if (source.filament || !Object.keys(source).some((key) => key.startsWith("filament."))) {
    return spool;
  }
  const nested: JsonRecord = {};
  for (const [key, value] of Object.entries(source)) {
    const parts = key.split(".");
    let target = nested;
    for (const part of parts.slice(0, -1)) {
      if (typeof target[part] !== "object" || target[part] === null) target[part] = {};
      target = target[part];
    }
    target[parts[parts.length - 1] as string] = value;
  }
  return nested;
}
