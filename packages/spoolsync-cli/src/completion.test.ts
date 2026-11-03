import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { COMPLETION_SHELLS, OPTION_SPECS, completionScript, isCompletionShell } from "./completion";
import { KNOWN_OPTIONS } from "./parse-args";

const available = (command: string) =>
  spawnSync(command, ["--version"], { stdio: "ignore" }).status !== null;

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
    if (!available(check[0])) return;
    const result = spawnSync(check[0], [...check[1]], { input: script, encoding: "utf8" });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  });
});

test("bash completes option values, files, and option names", () => {
  if (!available("bash")) return;
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
