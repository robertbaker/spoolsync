import { readdir, readFile } from "node:fs/promises";

import { runReferenceChecks } from "./reference-checks/run";

const { failures } = await runReferenceChecks({
  listFiles: () => readdir("ref"),
  readText: (name) => readFile(`ref/${name}`, "utf8"),
  log: (...values) => console.log(...values),
  error: (...values) => console.error(...values),
});
if (failures) process.exitCode = 1;
