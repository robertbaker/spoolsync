import { expect, test } from "bun:test";

import { SOURCE_IDS } from "@spoolsync/core/core/model";
import { listServices } from "@spoolsync/core/core/services";

import { helpText } from "./help";

test("help wraps prose while preserving copyable commands and option syntax", () => {
  for (const width of [40, 60, 80, 100]) {
    const help = helpText(width);
    for (const line of help.split("\n")) {
      if (line.trimStart().startsWith("spoolsync ")) continue;
      expect(line.length).toBeLessThanOrEqual(width);
    }
    expect(help).toContain("  --resolve <field=source>\n");
    expect(help).toContain("  -i, --interactive\n      Prompt interactively");
    expect(help).toContain("  --cleanup[=<rules>]\n");
    expect(help).toContain("  -h, --help\n");
    expect(help.startsWith("SpoolSync CLI\nCompare inventory exports")).toBe(true);
    expect(help).toContain(
      "spoolsync --spoolman inventory.json --spoolio backup.json --output-dir ./updated",
    );
  }
});

test("help lists registered file options, aliases, and CLI API inputs", () => {
  const help = helpText();
  for (const { info } of listServices(SOURCE_IDS)) {
    expect(help).toContain(`  ${info.cliFlag} <file>\n`);
    for (const alias of info.cliAliases ?? []) expect(help).toContain(alias);
    if (info.cliApiFlag && info.apiClients.includes("cli"))
      expect(help).toContain(`  ${info.cliApiFlag} <url>\n`);
  }
  expect(help).toContain("API credentials:");
  expect(help).toContain("FILADEX_PASSWORD");
  expect(help).toContain("read-only source");
});
