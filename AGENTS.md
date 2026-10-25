# Working in SpoolSync

- Run commands from the repository root with Bun. Read `docs/architecture.md` for boundaries and `CONTRIBUTING.md` for setup and checks.
- Keep inventory rules in `packages/spoolsync-core`; browser DOM/storage belong in `src`, filesystem/process behavior in `packages/spoolsync-cli`.
- Preserve public adapter and core entry-point imports when splitting modules. Internal modules should import each other directly, avoiding cycles through re-export barrels.
- Split by responsibility, not line count. Share mapping/mutation rules between file and API paths; keep format-specific preservation and warnings explicit. Static data, fixtures, and vendored Starwind components do not need arbitrary splitting.
- Use narrow interfaces and constructor/function injection for external IO, clocks, IDs, persistence, and presentation. Follow existing `AdapterRuntime`, transport/client, session, and CLI dependency patterns; add abstract classes or an IoC container only for a concrete need.
- Preserve unknown source fields, null/empty semantics, material notes, cross-service IDs, warning text, deterministic match ordering, and partial-write behavior. Suggestions never merge groups automatically. CLI exports are prepared/staged before remote writes and committed afterward.
- Browser loads use request revisions to reject stale responses, including after unload. Connection changes invalidate API snapshots and match choices while retaining file snapshots; preserve local/session credential behavior and password cleanup.
- Verify relevant changes with `bun run check:packages`, `bun run check`, `bun run lint`, `bun run test`, and `bun run test:cli`. Run `bun run e2e` for browser changes. CLI integration tests build and run under Node; Playwright uses the built site through Wrangler on port 4324. Sandboxed tests may need permission for local servers and temporary file renames; do not weaken assertions to bypass those restrictions.
- Use synthetic/sanitized regression fixtures. Optional `bun tools/check-ref.ts` reads personal `ref/` exports; never commit these, credentials, build output, or QA captures. Format only changed files and update the relevant docs.
