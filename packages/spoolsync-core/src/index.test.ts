import { expect, test } from "bun:test";

import { bambuddy, filameter, threeDfp } from "./index";

test("all newer inventory adapters are available from the package root", () => {
  expect(typeof bambuddy.loadBambuddyFile).toBe("function");
  expect(typeof bambuddy.exportBambuddyCsv).toBe("function");
  expect(typeof filameter.loadFilameterFile).toBe("function");
  expect(typeof filameter.exportFilameter).toBe("function");
  expect(typeof threeDfp.loadThreeDfpFile).toBe("function");
  expect(typeof threeDfp.exportThreeDfp).toBe("function");
});
