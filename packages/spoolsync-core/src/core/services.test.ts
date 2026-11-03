import { expect, test } from "bun:test";

import {
  SOURCE_IDS,
  SERVICE_CAPABILITIES,
  SOURCE_LABELS,
  WRITABLE_SOURCE_IDS,
  isWritableSource,
} from "./model";
import {
  SERVICES,
  SERVICE_COUNT,
  SERVICE_COUNT_WORD,
  SERVICE_IDS,
  canReadViaApi,
  canWrite,
  canWriteViaApi,
  countWord,
  formatPhrase,
  readSummary,
  writeSummary,
  type ServiceInfo,
} from "./services";

test("the registry has exactly one entry per source id, in the same order", () => {
  expect(SERVICE_IDS).toEqual([...SOURCE_IDS]);
  expect(SERVICE_COUNT).toBe(SOURCE_IDS.length);
  expect(new Set(SERVICE_IDS).size).toBe(SERVICE_COUNT);
});

test("model exports derive from the registry", () => {
  for (const id of SOURCE_IDS) {
    expect(SERVICE_CAPABILITIES[id]).toEqual(SERVICES[id].capabilities);
    expect(SOURCE_LABELS[id]).toBe(SERVICES[id].name);
  }
  expect(WRITABLE_SOURCE_IDS).toEqual(SOURCE_IDS.filter((id) => canWrite(id)));
  for (const id of SOURCE_IDS) expect(isWritableSource(id)).toBe(canWrite(id));
});

test("capabilities agree with the formats and API clients declared for each tool", () => {
  for (const id of SOURCE_IDS) {
    const service: ServiceInfo = SERVICES[id];
    const capabilities = service.capabilities as readonly string[];
    expect(service.readFormats.length > 0).toBe(capabilities.includes("file-export"));
    expect(service.writeFormats.length > 0).toBe(capabilities.includes("file-import"));
    const hasApi = capabilities.includes("api-export") || capabilities.includes("api-import");
    expect(service.apiClients.length > 0).toBe(hasApi);
    expect(service.cliFlag.startsWith("--")).toBe(true);
    if (service.cliApiFlag) expect(service.apiClients).toContain("cli");
    if (service.apiClients.includes("cli")) expect(service.cliApiFlag).toBeDefined();
  }
});

test("names and flags are unique", () => {
  const names = SOURCE_IDS.map((id) => SERVICES[id].name);
  expect(new Set(names).size).toBe(names.length);
  const flags = SOURCE_IDS.map((id) => SERVICES[id].cliFlag);
  expect(new Set(flags).size).toBe(flags.length);
});

test("read and write summaries describe API, file, and read-only tools", () => {
  expect(readSummary("spoolman")).toBe("API or JSON/CSV file");
  expect(writeSummary("spoolman")).toBe("API or JSON file");
  expect(readSummary("tigertag")).toBe("Cloud or .ttag/JSON file");
  expect(writeSummary("tigertag")).toBe("Cloud or .ttag file");
  expect(readSummary("bambuddy")).toBe("API or CSV/JSON file");
  expect(writeSummary("bambuddy")).toBe("CSV file");
  expect(readSummary("spoolmaster")).toBe("Excel file");
  expect(writeSummary("spoolstock")).toBe("Not supported (read-only)");
});

test("read-only tools are exactly those without import capabilities", () => {
  const readOnly = SOURCE_IDS.filter((id) => !canWrite(id));
  expect(readOnly).toEqual(["spoolstock", "spoolmaster", "spoolhoarder", "spoolapp", "spoolkeep"]);
  expect(canWriteViaApi("bambuddy")).toBe(false);
  expect(canReadViaApi("bambuddy")).toBe(true);
  expect(canWriteViaApi("filamentdb")).toBe(true);
});

test("counts are spelled out up to twenty and digits after", () => {
  expect(countWord(13)).toBe("thirteen");
  expect(countWord(20)).toBe("twenty");
  expect(countWord(21)).toBe("21");
  expect(SERVICE_COUNT_WORD).toBe(countWord(SERVICE_COUNT));
});

test("format phrases read as sentences", () => {
  expect(formatPhrase(["json"])).toBe("JSON");
  expect(formatPhrase(["json", "csv"])).toBe("JSON or CSV");
  expect(formatPhrase(["ttag", "json", "csv"])).toBe(".ttag, JSON or CSV");
  expect(formatPhrase(["xlsx"])).toBe("Excel (.xlsx)");
});
