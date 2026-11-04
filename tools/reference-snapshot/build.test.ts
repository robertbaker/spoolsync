import { describe, expect, test } from "bun:test";

import {
  decodeSnapshot,
  providerById,
  type ReferenceIO,
  type ReferenceResponse,
} from "../../packages/spoolsync-core/src/core/reference";
import { buildSnapshots } from "./build";

const swatch = (id: number) => ({
  id,
  manufacturer: { name: "Acme" },
  color_name: `Color ${id}`,
  filament_type: { name: "PLA" },
  hex_color: "FF0000",
});

function reply(body: unknown): ReferenceResponse {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
}

interface State {
  fail?: boolean;
  probes: number;
  downloads: number;
}

/** A FilamentColors-shaped service with `total` swatches on one page. */
function service(total: number, state: State): ReferenceIO {
  return {
    now: () => 0,
    sleep: async () => {},
    async fetch(url) {
      if (state.fail) throw new TypeError("offline");
      if (url.includes("page_size=1&") || url.endsWith("page_size=1")) {
        state.probes += 1;
        return reply({ count: total, results: [swatch(total)] });
      }
      state.downloads += 1;
      return reply({
        count: total,
        next: null,
        results: Array.from({ length: total }, (_, i) => swatch(i + 1)),
      });
    },
  };
}

function disk() {
  const files = new Map<string, string>();
  return {
    files,
    readText: async (path: string) => files.get(path) ?? null,
    writeText: async (path: string, text: string) => void files.set(path, text),
  };
}

const providers = [providerById("filamentcolors")!];
const PATH = "public/reference/filamentcolors.json";

describe("buildSnapshots", () => {
  test("writes a snapshot, then leaves it alone while the service reports no change", async () => {
    const fs = disk();
    const state: State = { probes: 0, downloads: 0 };
    const deps = { io: service(3, state), ...fs, now: () => 5000, log: () => {} };

    const first = await buildSnapshots(deps, { outDir: "public", providers });
    expect(first[0]).toMatchObject({ status: "written", records: 3 });
    const snap = decodeSnapshot(JSON.parse(fs.files.get(PATH)!))!;
    expect(snap.generatedAt).toBe(5000);
    expect(snap.sourceToken).toBe("3:3:");

    const second = await buildSnapshots(deps, { outDir: "public", providers });
    expect(second[0]!.status).toBe("unchanged");
    expect(state.downloads).toBe(1);

    const forced = await buildSnapshots(deps, { outDir: "public", providers, force: true });
    expect(forced[0]!.status).toBe("written");
    expect(state.downloads).toBe(2);
  });

  test("a service that is down keeps the old snapshot, or reports failure without throwing", async () => {
    const fs = disk();
    const base = { ...fs, now: () => 1, log: () => {} };
    await buildSnapshots(
      { ...base, io: service(3, { probes: 0, downloads: 0 }) },
      { outDir: "public", providers },
    );
    const before = fs.files.get(PATH);

    const down = await buildSnapshots(
      { ...base, io: service(3, { probes: 0, downloads: 0, fail: true }) },
      { outDir: "public", providers },
    );
    expect(down[0]!.status).toBe("kept-old");
    expect(fs.files.get(PATH)).toBe(before);

    const empty = disk();
    const none = await buildSnapshots(
      {
        ...empty,
        now: () => 1,
        log: () => {},
        io: service(3, { probes: 0, downloads: 0, fail: true }),
      },
      { outDir: "public", providers },
    );
    expect(none[0]!.status).toBe("failed");
    expect(empty.files.size).toBe(0);
  });

  test("a response far smaller than the snapshot on disk is not trusted without --force", async () => {
    const fs = disk();
    const base = { ...fs, now: () => 1, log: () => {} };
    const state: State = { probes: 0, downloads: 0 };
    await buildSnapshots({ ...base, io: service(10, state) }, { outDir: "public", providers });
    const shrunk = await buildSnapshots(
      { ...base, io: service(2, state) },
      { outDir: "public", providers },
    );
    expect(shrunk[0]!.status).toBe("kept-old");
    const accepted = await buildSnapshots(
      { ...base, io: service(2, state) },
      { outDir: "public", providers, force: true },
    );
    expect(accepted[0]).toMatchObject({ status: "written", records: 2 });
  });
});
