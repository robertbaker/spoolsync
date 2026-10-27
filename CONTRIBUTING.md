# Contributing to SpoolSync

Thanks for considering a contribution. For a large change, open an issue first so we can agree on the approach. For a focused fix or improvement, open a pull request with a clear summary and any relevant screenshots or examples.

## Development setup

SpoolSync uses Bun (version 1.2 or later), Astro, TypeScript, and Tailwind. Starwind UI components are vendored in `src/components/starwind/`; dependencies install from the package manifests without a GitHub Packages token.

```sh
bun install
bun run dev
```

Run commands from the repository root so Bun resolves both workspace packages. Use Node.js 20
or later for the built CLI and its integration tests. Dependency versions are recorded in
`bun.lock`; use `bun install --frozen-lockfile` to reproduce the locked installation.

The development site runs at `http://localhost:4321`. For the built site, run `bun run build`
followed by `bun run preview`, which serves through Wrangler at `http://127.0.0.1:4324`.
Deployment targets the maintainer's Cloudflare domain (`wrangler.jsonc`) and needs
`CLOUDFLARE_ACCOUNT_ID` or a Wrangler login; contributors do not need to deploy to verify a change.

## Checks

Run the checks relevant to your change before opening a pull request:

```sh
bun run check
bun run check:packages
bun run lint
bun run test
bun run test:cli
```

For changes to browser flows, run the end-to-end suite as well:

```sh
bunx playwright install chromium
bun run e2e
```

The end-to-end suite builds the site and starts the Wrangler preview server automatically.
With the current Bun runtime, `expect(promise).rejects` matchers wait internally and return
`void`; omit an extra `await` on those assertions. Continue awaiting asynchronous operations
and Playwright assertions normally.
On Linux, CI installs Chromium with `bunx playwright install --with-deps chromium`.
`bun run ci` runs package and app type checks, lint, unit tests, built CLI integration tests,
and end-to-end tests. It requires the browser installation above.

For documentation-only changes, verify commands against the package scripts and check relative
links. For adapter changes, include round-trip and loss-warning coverage using synthetic or
sanitized fixtures. If you have local reference exports in `ref/`, `bun tools/check-ref.ts`
performs additional read-only round-trip checks; personal exports are not required to contribute.

## Project structure

- `src/` contains the Astro website and browser-only UI.
- `packages/spoolsync-core/` contains the shared inventory model, matching, planning, and service adapters.
- `packages/spoolsync-cli/` contains the command-line interface.
- `e2e/` contains Playwright browser flow tests.

Keep shared inventory behavior in `packages/spoolsync-core/` when it applies to both the website and CLI. Keep browser-specific behavior in `src/`.

See [the architecture guide](docs/architecture.md) for the inventory lifecycle and
[the documentation index](docs/README.md) for package and converter guides.

## Formatting

`bun run format` formats `src`, `tests`, `tools`, and `packages`. For individual documentation
files, use `bunx oxfmt --write README.md CONTRIBUTING.md docs` with the paths you changed.
The optional Git hooks in `lefthook.yml` format and lint staged files and stage their fixes;
install them with `bunx lefthook install`. Review any automatic changes before committing.

## Pull requests

- Explain the user-visible behavior or bug being addressed.
- Keep changes focused and update documentation when behavior or setup changes.
- Include steps to reproduce and verify bug fixes. Include screenshots for visible UI changes.
- Do not include credentials, personal inventory exports, or generated build output.
- Contributions are distributed under the repository's GNU AGPL version 3 license. By submitting a contribution, you agree that it may be distributed under those terms.

See [LICENSE](LICENSE) for the full license text.
