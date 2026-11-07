import { gunzipSync } from "node:zlib";

import { flattenOpenPrintTag } from "../../packages/spoolsync-core/src/core/reference/openprinttag";
import type { SnapshotSource } from "./build";

const REPOSITORY = "OpenPrintTag/openprinttag-database";
const TABLES = {
  brands: /^data\/brands\/[^/]+\.ya?ml$/,
  materials: /^data\/materials\/[^/]+\/[^/]+\.ya?ml$/,
  packages: /^data\/material-packages\/[^/]+\/[^/]+\.ya?ml$/,
} as const;

/** Regular files of a ustar archive, with the leading `<repo>-<ref>/` directory removed. */
export function* tarFiles(archive: Uint8Array): Generator<{ path: string; text: string }> {
  const decoder = new TextDecoder();
  const field = (offset: number, length: number, header: Uint8Array) =>
    decoder.decode(header.subarray(offset, offset + length)).replace(/\0.*$/s, "");
  let longName: string | null = null;
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return;
    const size = Number.parseInt(field(124, 12, header).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > archive.length)
      throw new Error("Truncated or malformed tar archive");
    const type = field(156, 1, header);
    const prefix = field(345, 155, header);
    const name = longName ?? (prefix ? `${prefix}/` : "") + field(0, 100, header);
    const body = archive.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = decoder.decode(body).replace(/\0.*$/s, "");
      continue;
    }
    if (type === "x") {
      const pax = decoder.decode(body);
      const match = /(?:^|\n)\d+ path=([^\n]+)\n/.exec(pax);
      if (match?.[1]) longName = match[1];
      continue;
    }
    longName = null;
    if (type === "0" || type === "") {
      yield { path: name.split("/").slice(1).join("/"), text: decoder.decode(body) };
    }
  }
}

/** Joins the YAML tables of the repository archive into flat OpenPrintTag records. */
export function recordsFromArchive(archive: Uint8Array, parse: (text: string) => unknown) {
  const tables: Record<keyof typeof TABLES, unknown[]> = {
    brands: [],
    materials: [],
    packages: [],
  };
  for (const file of tarFiles(archive))
    for (const [key, pattern] of Object.entries(TABLES) as [keyof typeof TABLES, RegExp][])
      if (pattern.test(file.path)) tables[key].push(parse(file.text));
  return flattenOpenPrintTag(tables);
}

/**
 * Downloads the default branch (a tarball, since the data has no bulk export), names the commit as
 * the change token, and returns the flattened records. Build-time only: needs Bun's YAML parser.
 */
export function openPrintTagSource(fetchImpl: typeof fetch = fetch): SnapshotSource {
  return async () => {
    const commit = await fetchImpl(`https://api.github.com/repos/${REPOSITORY}/commits/main`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    });
    const token = commit.ok
      ? ((((await commit.json()) as { sha?: unknown }).sha as string | undefined) ?? null)
      : null;
    const response = await fetchImpl(
      `https://codeload.github.com/${REPOSITORY}/tar.gz/refs/heads/main`,
      {
        signal: AbortSignal.timeout(180_000),
      },
    );
    if (!response.ok) throw new Error(`the archive answered ${response.status}`);
    const archive = gunzipSync(new Uint8Array(await response.arrayBuffer()));
    return { records: recordsFromArchive(archive, (text) => Bun.YAML.parse(text)), token };
  };
}
