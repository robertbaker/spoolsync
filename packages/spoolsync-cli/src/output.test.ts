import { afterEach, beforeEach, expect, test } from "bun:test";
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { stageOutputFiles, validateOutputPaths } from "./output";

async function supportsLink(kind: "hard" | "directory"): Promise<boolean> {
  const probe = await mkdtemp(path.join(tmpdir(), "spoolsync-link-probe-"));
  try {
    const original = path.join(probe, "original");
    const alias = path.join(probe, "alias");
    if (kind === "hard") {
      await writeFile(original, "probe");
      await link(original, alias);
    } else {
      await mkdir(original);
      await symlink(original, alias, process.platform === "win32" ? "junction" : "dir");
    }
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? ""))
      return false;
    throw error;
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
}

const hardLinks = await supportsLink("hard");
const directoryLinks = await supportsLink("directory");

let directory: string;
let input: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "spoolsync-paths-"));
  input = path.join(directory, "input.json");
  await writeFile(input, "original");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

test.skipIf(!hardLinks)("rejects a hard link to an input", async () => {
  const output = path.join(directory, "output.json");
  await link(input, output);
  expect(validateOutputPaths([input], [output])).rejects.toThrow("would overwrite an input");
});

test.skipIf(!directoryLinks)("rejects inputs reached through a directory junction", async () => {
  const actual = path.join(directory, "actual");
  const alias = path.join(directory, "alias");
  await mkdir(actual);
  await writeFile(path.join(actual, "inventory.json"), "original");
  await symlink(actual, alias, process.platform === "win32" ? "junction" : "dir");
  expect(
    validateOutputPaths(
      [path.join(actual, "inventory.json")],
      [path.join(alias, "inventory.json")],
    ),
  ).rejects.toThrow("would overwrite an input");
});

test("accepts new output files under directories that do not exist yet", async () => {
  await validateOutputPaths([input], [path.join(directory, "new", "nested", "output.json")]);
});

test("accepts distinct existing files", async () => {
  const output = path.join(directory, "output.json");
  await writeFile(output, "old export");
  await validateOutputPaths([input], [output]);
});

test("staged exports leave previous files intact until commit and clean up afterward", async () => {
  const output = path.join(directory, "output.json");
  await writeFile(output, "previous export");
  const staged = await stageOutputFiles(directory, [
    { filename: output, text: "complete new export" },
  ]);
  try {
    expect(await readFile(output, "utf8")).toBe("previous export");
    expect(await staged.commit()).toEqual([output]);
    expect(await readFile(output, "utf8")).toBe("complete new export");
  } finally {
    await staged.cleanup();
  }
  expect((await readdir(directory)).some((name) => name.startsWith(".spoolsync-"))).toBe(false);
});

test("invalid destinations fail before any export is replaced", async () => {
  const output = path.join(directory, "output.json");
  const blocked = path.join(directory, "blocked.json");
  await writeFile(output, "previous export");
  await mkdir(blocked);
  expect(
    stageOutputFiles(directory, [
      { filename: output, text: "new export" },
      { filename: blocked, text: "new export" },
    ]),
  ).rejects.toThrow("not a regular file");
  expect(await readFile(output, "utf8")).toBe("previous export");
});

test("abandoning staged exports preserves existing files", async () => {
  const staged = await stageOutputFiles(directory, [{ filename: input, text: "replacement" }]);
  await staged.cleanup();
  expect(await readFile(input, "utf8")).toBe("original");
  expect((await readdir(directory)).some((name) => name.startsWith(".spoolsync-"))).toBe(false);
});

test("staging write failures preserve destinations and remove temporary files", async () => {
  const files = [{ filename: input, text: undefined as unknown as string }];
  expect(stageOutputFiles(directory, files)).rejects.toBeInstanceOf(TypeError);
  expect(await readFile(input, "utf8")).toBe("original");
  expect((await readdir(directory)).some((name) => name.startsWith(".spoolsync-"))).toBe(false);
});

test("changing caller filenames after staging cannot redirect the commit", async () => {
  const output = path.join(directory, "output.json");
  const files = [{ filename: output, text: "prepared export" }];
  const staged = await stageOutputFiles(directory, files);
  files[0]!.filename = input;
  files[0]!.text = "changed";
  try {
    expect(await staged.commit()).toEqual([output]);
    expect(await readFile(output, "utf8")).toBe("prepared export");
    expect(await readFile(input, "utf8")).toBe("original");
  } finally {
    await staged.cleanup();
  }
});

test("commit failures identify exports already replaced", async () => {
  const first = path.join(directory, "first.json");
  const second = path.join(directory, "second.json");
  const staged = await stageOutputFiles(directory, [
    { filename: first, text: "first" },
    { filename: second, text: "second" },
  ]);
  try {
    await mkdir(second);
    expect(staged.commit()).rejects.toMatchObject({
      name: "ExportCommitError",
      written: [first],
    });
    expect(await readFile(first, "utf8")).toBe("first");
  } finally {
    await staged.cleanup();
  }
});
