import { expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SOURCE_IDS } from "./core/model";

test("Node resolves declared package subpaths without repository aliases", () => {
  const entries = [
    ["", "src/index.ts"],
    ["/workflow", "src/workflow.ts"],
    ["/planner", "src/planner.ts"],
    ["/apply", "src/apply.ts"],
    ...SOURCE_IDS.map((source) => [`/adapters/${source}`, `src/adapters/${source}/index.ts`]),
    ...[
      "shared/tabular",
      "shared/weights",
      "spoolstock/csv",
      "spoolstock/map",
      "spoolman/client",
      "tigertag/cloud",
      "spoolio/index",
      "threeDfp/index",
      "bambuddy/index",
      "filameter/index",
      "filadex/index",
      "filamentdb/index",
    ].map((module) => [`/adapters/${module}`, `src/adapters/${module}.ts`]),
    ["/core/model", "src/core/model.ts"],
  ];
  const manifest = new URL("../package.json", import.meta.url);
  const code = `import { createRequire } from 'node:module';
    const resolve = createRequire(new URL(${JSON.stringify(manifest.href)})).resolve;
    console.log(JSON.stringify(${JSON.stringify(entries.map(([subpath]) => `@spoolsync/core${subpath}`))}.map((specifier) => resolve(specifier))));`;
  const result = Bun.spawnSync(["node", "--input-type=module", "--eval", code]);
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual(
    entries.map(([, relative]) => path.resolve(path.dirname(fileURLToPath(manifest)), relative!)),
  );
});
