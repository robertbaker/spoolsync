import type { GitHooksConfig } from "bun-git-hooks";

const config: GitHooksConfig = {
  "pre-commit": {
    stagedLint: {
      "{*,**/*}.{js,jsx,ts,tsx,mjs,cjs,mts,cts,vue,svelte,html,css,scss,less,pcss,postcss,md,mdx,graphql,gql,graphqls,yaml,yml,toml,json,jsonc,json5,hbs}":
        "bunx oxfmt --no-error-on-unmatched-pattern",
      "{*,**/*}.{js,jsx,ts,tsx,mjs,cjs,mts,cts,vue,svelte,astro}":
        "bunx oxlint --fix --no-error-on-unmatched-pattern",
    },
  },
};

export default config;
