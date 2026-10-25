import path from "node:path";
import { fileURLToPath } from "node:url";

import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { defineConfig, svgoOptimizer } from "astro/config";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";

import { SITE_URL } from "./src/config/site.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_DEV = process.env["NODE_ENV"] === "development";
const DISABLE_TOOLBAR = process.env["DISABLE_ASTRO_TOOLBAR"] === "true";
const targets = browserslistToTargets(browserslist());

/** Guard against plugins forcing an HTML entry during SSR build. */
function stripHtmlInputForSsr() {
  return {
    name: "strip-html-input-for-ssr",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      if (!config.build?.ssr) return;

      const isHtmlInput = (input) => {
        if (!input) return false;
        if (typeof input === "string" && input.endsWith(".html")) return true;
        if (
          Array.isArray(input) &&
          input.some((e) => typeof e === "string" && e.endsWith(".html"))
        ) {
          return true;
        }
        if (typeof input === "object" && !Array.isArray(input)) {
          return Object.values(input).some((e) => typeof e === "string" && e.endsWith(".html"));
        }
        return false;
      };

      if (config.build?.rollupOptions?.input && isHtmlInput(config.build.rollupOptions.input)) {
        delete config.build.rollupOptions.input;
      }
      if (config.build?.rolldownOptions?.input && isHtmlInput(config.build.rolldownOptions.input)) {
        delete config.build.rolldownOptions.input;
      }
    },
  };
}

/** Astro 7 prerendering client-entry check workaround for static builds. */
function skipWindowsAstroClientEntryCheck() {
  return {
    name: "skip-windows-astro-client-entry-check",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        if (!output.fileName.includes("_virtual_astro_middleware")) continue;
        if (!output.code.includes("testCaseInsensitiveFS();")) continue;

        output.code = output.code.replace(
          "testCaseInsensitiveFS();",
          "/* skip Astro client-entry check */",
        );
      }
    },
  };
}

/** Exclude test files and bun runtime imports from Vite / Rolldown pre-bundling scanner. */
function excludeTestsFromOptimizeDeps() {
  return {
    name: "exclude-tests-from-optimizedeps",
    enforce: "post",
    configEnvironment(_environmentName, options) {
      if (options.optimizeDeps?.entries) {
        return {
          optimizeDeps: {
            rolldownOptions: {
              external: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/, "bun:test", /^bun:/],
            },
          },
        };
      }
    },
  };
}

export default defineConfig({
  site: SITE_URL,
  output: "static",
  // Pages build to `connections.html` etc., which Workers assets serve at `/connections` with no
  // trailing-slash redirect.
  trailingSlash: "never",
  build: {
    format: "file",
    inlineStylesheets: "auto",
  },
  devToolbar: { enabled: !DISABLE_TOOLBAR },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
  markdown: {
    syntaxHighlight: "shiki",
    // Emit both themes as CSS variables; global.css picks one by `.dark`.
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    },
  },
  security: {
    checkOrigin: true,
    csp: {
      scriptDirective: {
        resources: [
          { resource: "'self'", kind: "element" },
          { resource: "'unsafe-inline'", kind: "element" },
          { resource: "'none'", kind: "attribute" },
        ],
      },
      styleDirective: {
        resources: [
          { resource: "'self'", kind: "element" },
          { resource: "'unsafe-inline'", kind: "element" },
          { resource: "'unsafe-inline'", kind: "attribute" },
        ],
      },
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        // Spoolman runs on the user's home network, usually over plain http.
        "connect-src 'self' http: https:",
        "frame-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ],
    },
  },
  integrations: [
    mdx(),
    icon({
      iconDir: "src/assets/logos",
    }),
  ],
  vite: {
    plugins: [
      tailwindcss({ optimize: false }),
      stripHtmlInputForSsr(),
      skipWindowsAstroClientEntryCheck(),
      excludeTestsFromOptimizeDeps(),
    ],
    server: {
      fs: {
        strict: true,
        allow: [__dirname],
      },
      watch: {
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.astro/**",
          "**/dist/**",
          "**/coverage/**",
          "**/test-results/**",
          "**/playwright-report/**",
        ],
      },
    },
    optimizeDeps: {
      include: ["astro-icon"],
      exclude: [],
      force: false,
      holdUntilCrawlEnd: true,
    },
    build: {
      target: "esnext",
      sourcemap: IS_DEV,
      assetsInlineLimit: 5 * 1024,
      chunkSizeWarningLimit: 500,
      minify: !IS_DEV,
      cssMinify: "lightningcss",
      cssCodeSplit: !IS_DEV,
      rollupOptions: {
        external: ["fsevents", /\/fsevents(?:\/|$)/, /\.node$/, "@bruits/satteri-wasm32-wasi"],
      },
    },
    esbuild: {
      target: "esnext",
      keepNames: false,
      legalComments: "none",
      drop: IS_DEV ? [] : ["console", "debugger"],
    },
    cacheDir: "node_modules/.vite",
    css: {
      devSourcemap: IS_DEV,
      transformer: "lightningcss",
      lightningcss: {
        targets,
        sourceMap: IS_DEV,
        errorRecovery: true,
        unusedSymbols: [],
        customAtRules: {
          property: { prelude: null, body: "declaration-list" },
          "starting-style": { prelude: null, body: "style-block" },
          theme: { prelude: null, body: "style-block" },
        },
      },
    },
  },
});
