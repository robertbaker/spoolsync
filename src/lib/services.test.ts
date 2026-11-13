import { expect, test } from "bun:test";

import { SOURCE_IDS } from "@spoolsync/core/core/model";

import {
  READ_ONLY_VIEWS,
  SERVICE_COUNT,
  SERVICE_VIEWS,
  SERVICE_WEB,
  WRITABLE_VIEWS,
  acceptAllFiles,
  acceptFor,
  allServiceNames,
  extensionList,
  joinNames,
  matchesMatrixFilter,
  matchesMatrixQuery,
  serviceNamesShort,
  serviceView,
} from "./services";
import { SOURCE_GUIDES } from "./source-guides";

test("web presentation covers every source id", () => {
  expect(Object.keys(SERVICE_WEB).sort()).toEqual([...SOURCE_IDS].sort());
  expect(SERVICE_VIEWS.map((service) => service.id)).toEqual([...SOURCE_IDS]);
  expect(SERVICE_VIEWS).toHaveLength(SERVICE_COUNT);
  expect(Object.keys(SOURCE_GUIDES).sort()).toEqual([...SOURCE_IDS].sort());
});

test("file input accept lists come from the read formats", () => {
  expect(serviceView("spoolio").accept).toBe(".json,application/json");
  expect(serviceView("tigertag").accept).toBe(".ttag,.json,application/json");
  expect(serviceView("spoolman").accept).toBe(".json,.csv,application/json,text/csv");
  expect(serviceView("spoolmaster").accept).toContain(".xlsx");
  expect(acceptFor([])).toBe("");
  expect(acceptAllFiles()).toContain(".ttag");
  expect(extensionList()).toBe(".json, .csv, .xlsx, .ttag, .zip");
});

test("the Load kind badge names every format a tool reads", () => {
  for (const service of SERVICE_VIEWS) {
    for (const format of service.formats) {
      const needle = format === "xlsx" ? "xlsx" : format === "ttag" ? "ttag" : format.toUpperCase();
      expect(service.kind.toLowerCase()).toContain(needle.toLowerCase());
    }
  }
});

test("API claims name where the integration lives", () => {
  expect(serviceView("filadex").apiCliOnly).toBe(true);
  expect(serviceView("filadex").read).toContain("API in the CLI only");
  expect(serviceView("spoolman").apiInBrowser).toBe(true);
  expect(serviceView("spoolman").apiCliOnly).toBe(false);
  expect(serviceView("spoolio").hasApi).toBe(false);
  expect(serviceView("bambuddy").apiWriteInBrowser).toBe(true);
  expect(serviceView("tigertag").connectionName).toBe("TigerTag cloud");
  expect(serviceView("spoolman").connectionName).toBe("Spoolman");
});

test("read-only and writable views partition the tools", () => {
  expect(READ_ONLY_VIEWS.length + WRITABLE_VIEWS.length).toBe(SERVICE_COUNT);
  expect(READ_ONLY_VIEWS.every((service) => service.write === "Not supported (read-only)")).toBe(
    true,
  );
});

test("matrix filters", () => {
  const spoolman = serviceView("spoolman");
  const spoolstock = serviceView("spoolstock");
  const filadex = serviceView("filadex");
  expect(matchesMatrixFilter(spoolman, "write")).toBe(true);
  expect(matchesMatrixFilter(spoolstock, "write")).toBe(false);
  expect(matchesMatrixFilter(spoolman, "api")).toBe(true);
  expect(matchesMatrixFilter(filadex, "api")).toBe(true);
  expect(matchesMatrixFilter(spoolstock, "file")).toBe(true);
  expect(matchesMatrixFilter(spoolman, "file")).toBe(false);
  expect(matchesMatrixFilter(spoolman, "all")).toBe(true);
});

test("matrix search matches names, formats, and platforms across words", () => {
  const spoolman = serviceView("spoolman");
  expect(matchesMatrixQuery(spoolman, "")).toBe(true);
  expect(matchesMatrixQuery(spoolman, "SPOOLMAN")).toBe(true);
  expect(matchesMatrixQuery(spoolman, "self-hosted csv")).toBe(true);
  expect(matchesMatrixQuery(spoolman, "xlsx")).toBe(false);
  expect(matchesMatrixQuery(serviceView("spoolmaster"), "excel mobile")).toBe(true);
});

test("name lists read as sentences", () => {
  expect(joinNames(["a"])).toBe("a");
  expect(joinNames(["a", "b"])).toBe("a and b");
  expect(joinNames(["a", "b", "c"], "or")).toBe("a, b, or c");
  expect(allServiceNames()).toContain("and PrintStudio");
  expect(allServiceNames(undefined, "or", ["Bambu Lab"]).endsWith("or Bambu Lab")).toBe(true);
  expect(serviceNamesShort(3)).toBe(`Spoolman, Spoolstock, Spoolio, and ${SERVICE_COUNT - 3} more`);
});
