import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

export default defineConfig({
  ...base,
  reporter: [["line"]],
  projects: base.projects!.map((project) => ({
    ...project,
    use: {
      ...project.use,
      launchOptions: { ...project.use?.launchOptions, executablePath: "/opt/pw-browsers/chromium" },
    },
  })),
});
