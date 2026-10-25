import { randomUUID } from "node:crypto";
import { writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { CliError } from "./errors";

export async function writeAtomically(destination: string, contents: string): Promise<string> {
  const target = path.resolve(destination);
  if (path.extname(target).toLowerCase() !== ".ttag") {
    throw new CliError("Output filename must end in .ttag", 2);
  }
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  } catch (error: any) {
    await rm(temporary, { force: true }).catch(() => {});
    throw new CliError(`Could not write ${target}: ${error.message}`);
  }
  return target;
}
