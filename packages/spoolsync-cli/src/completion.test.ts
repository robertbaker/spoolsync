import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { COMPLETION_SHELLS, OPTION_SPECS, completionScript, isCompletionShell } from "./completion";
import { KNOWN_OPTIONS } from "./parse-args";

const available = (command: string) =>
  spawnSync(command, ["--version"], { stdio: "ignore" }).status !== null;

/** CI installs every shell and sets this, so a missing shell fails there instead of skipping. */
const requireShells = process.env["REQUIRE_COMPLETION_SHELLS"] === "1";
function shellOrSkip(command: string): boolean {
  if (available(command)) return true;
  if (requireShells) throw new Error(`${command} is required for completion tests but is missing.`);
  return false;
}

test("the completion list covers exactly the options the parser knows", () => {
  expect(new Set(OPTION_SPECS.map((spec) => spec.flag))).toEqual(new Set(KNOWN_OPTIONS));
});

describe.each(COMPLETION_SHELLS)("%s script", (shell) => {
  const script = completionScript(shell);

  test("mentions every option and the writable sources", () => {
    for (const spec of OPTION_SPECS)
      expect(script).toContain(shell === "fish" ? `-l ${spec.flag.slice(2)} ` : spec.flag);
    expect(script).toContain("spoolio");
    expect(script).toContain("material=");
  });

  test("is syntactically valid in the real shell when one is installed", () => {
    const check = {
      bash: ["bash", ["-n"]],
      zsh: ["zsh", ["-n"]],
      fish: ["fish", ["--no-execute"]],
    }[shell] as [string, string[]];
    if (!shellOrSkip(check[0])) return;
    const result = spawnSync(check[0], [...check[1]], { input: script, encoding: "utf8" });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  });
});

test("bash completes option values, files, and option names", () => {
  if (!shellOrSkip("bash")) return;
  const run = (words: string[], cword: number) =>
    spawnSync(
      "bash",
      [
        "-c",
        `${completionScript("bash")}\nCOMP_WORDS=(${words.map((word) => `'${word}'`).join(" ")}); COMP_CWORD=${cword}; _spoolsync; printf '%s\\n' "\${COMPREPLY[@]}"`,
      ],
      { encoding: "utf8" },
    )
      .stdout.trim()
      .split("\n");
  expect(run(["spoolsync", "--create-in", "spool"], 2)).toEqual(["spoolman", "spoolio"]);
  expect(run(["spoolsync", "--resolve", "mat"], 2)).toEqual(["material="]);
  expect(run(["spoolsync", "--completion", ""], 2)).toEqual(["bash", "zsh", "fish"]);
  expect(run(["spoolsync", "--sum"], 1)).toEqual(["--summary"]);
});

test("shell names are validated", () => {
  expect(isCompletionShell("zsh")).toBe(true);
  expect(isCompletionShell("powershell")).toBe(false);
});

function withScript<T>(shell: "zsh" | "fish", use: (file: string) => T): T {
  const directory = mkdtempSync(path.join(tmpdir(), "spoolsync-completion-"));
  try {
    const file = path.join(directory, `spoolsync.${shell}`);
    writeFileSync(file, completionScript(shell));
    return use(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("fish offers source names, fields, and option names", () => {
  if (!shellOrSkip("fish")) return;
  const complete = (line: string) =>
    withScript("fish", (file) =>
      spawnSync("fish", ["--no-config", "-c", `source ${file}; complete -C '${line}'`], {
        encoding: "utf8",
      })
        .stdout.trim()
        .split("\n")
        .map((entry) => entry.split("\t")[0])
        .sort(),
    );
  expect(complete("spoolsync --create-in spool")).toEqual(["spoolio", "spoolman"]);
  expect(complete("spoolsync --resolve mat")).toEqual(["material="]);
  expect(complete("spoolsync --completion ")).toEqual(["bash", "fish", "zsh"]);
  expect(complete("spoolsync --export-c")).toEqual(["--export-csv"]);
});

test("zsh loads the completion function and registers it for spoolsync", () => {
  if (!shellOrSkip("zsh")) return;
  const result = withScript("zsh", (file) =>
    spawnSync(
      "zsh",
      [
        "-f",
        "-c",
        `autoload -Uz compinit && compinit -u -d "$(mktemp)" && source ${file} && print -r -- "$_comps[spoolsync]"`,
      ],
      { encoding: "utf8" },
    ),
  );
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  expect(result.stdout.trim()).toBe("_spoolsync");
});
