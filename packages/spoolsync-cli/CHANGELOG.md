# Changelog

## [0.4.0](https://github.com/robertbaker/spoolsync/compare/spoolsync-cli-v0.3.0...spoolsync-cli-v0.4.0) (2026-11-04)

### Features

- **adapters:** maximize supported fields and features per provider ([009c527](https://github.com/robertbaker/spoolsync/commit/009c527cf59f8b58fd70a27fc7fa4b15e8671fa4))
- add shared display units module ([57ad918](https://github.com/robertbaker/spoolsync/commit/57ad918ace2926b9fa6cb82acfd0f082976cc25f))
- **affiliates:** implement structured affiliate program registry ([e08a923](https://github.com/robertbaker/spoolsync/commit/e08a923e46e7afb6e66f0f9a4479e82dc0775295))
- **cleanup:** data normalization engine, Load panel, plan integration, and CLI options ([f4e120f](https://github.com/robertbaker/spoolsync/commit/f4e120fbe7a45830a3f69e706f9c06c2bbab7506))
- **cli:** add --filament-db and --filament-db-url ([1c93b26](https://github.com/robertbaker/spoolsync/commit/1c93b2673229ea488abc9604ced33b5e6a1d7933))
- **core:** add Filament DB adapter ([54d8801](https://github.com/robertbaker/spoolsync/commit/54d88012e7140907ab4a248753fcbe9266dc635f))
- **load:** spool detail drawer, saved table views, and smart reorder list ([2fcddec](https://github.com/robertbaker/spoolsync/commit/2fcddec0a524d812be8cb4c026685f254e382136))
- **load:** tile picker with a shared detail pane and Spoolman connect in the guide ([8882c4f](https://github.com/robertbaker/spoolsync/commit/8882c4fe2b9bbd2401dabb020193a94e43c999cc))
- reference snapshots, rollback files, drying guide, color finder and CLI checks ([1bd1c52](https://github.com/robertbaker/spoolsync/commit/1bd1c52a915254fdfe0a0cedfbca6b0737c8e4e5))
- **reference-data:** implement catalog matching and resilient caching ([56df4f0](https://github.com/robertbaker/spoolsync/commit/56df4f09839fafc679f621aeba03206268535bf9))
- **reference:** add OpenPrintTag as a snapshot-only provider ([a3c648f](https://github.com/robertbaker/spoolsync/commit/a3c648f5ef6524595f7c2f51af6a3bedd7cbc980))
- **reference:** add OpenPrintTag database preset and converter ([6f2e1f9](https://github.com/robertbaker/spoolsync/commit/6f2e1f93d3f791fb94e0a5b5eca8a34cd438072d))
- **sidebar:** merge theme and accent controls, logo expands the rail ([585d198](https://github.com/robertbaker/spoolsync/commit/585d19880c486a296c80f709c15c438144962f5e))
- **spoolman:** enable direct server connection ([688d497](https://github.com/robertbaker/spoolsync/commit/688d4970d3d549e36aeef539fa4e7bf3eccfdf6f))
- **ui:** accent palettes, styled dropdowns, saved-settings layout, credits fix ([c153aae](https://github.com/robertbaker/spoolsync/commit/c153aaeb34319d66c4e9b58f73f63bc73a9f5b84))
- **ui:** add Spool, SpoolHoarder, SpoolMaster and SpoolKeep service logos ([79528cd](https://github.com/robertbaker/spoolsync/commit/79528cd358b4cd4e7aa87f31b2c16580db0df023))
- **ui:** show sidebar scrollbar only while scrolling ([931d6ac](https://github.com/robertbaker/spoolsync/commit/931d6ac4848cfc59df6661673fbdf574a944f0eb))
- **web:** list Filament DB with its logo ([2631eef](https://github.com/robertbaker/spoolsync/commit/2631eef07f9b5e3cdbb9452ce3105f0d107968cf))

### Bug Fixes

- clear type errors and skip fields a CSV origin cannot carry ([55cd0ce](https://github.com/robertbaker/spoolsync/commit/55cd0ce9fdd51c0059f92d21babf6825d10b9ec1))
- **cli:** treat --filament-db-url as a connection for --watch and --restore-rollback ([576fb09](https://github.com/robertbaker/spoolsync/commit/576fb098e60514e7d917e6dbd8e2775eba3db070))
- **docs:** emit blank lines around the services table so formatting keeps it stable ([be645be](https://github.com/robertbaker/spoolsync/commit/be645be2894173cc1d56a63e35f439d235938b15))

## [0.3.0](https://github.com/robertbaker/spoolsync/compare/spoolsync-cli-v0.2.0...spoolsync-cli-v0.3.0) (2026-11-03)

### Features

- add SpoolMaster, Spool Hoarder, Spool, and SpoolKeep sources ([351dac8](https://github.com/robertbaker/spoolsync/commit/351dac8a80e9ae9f7edc8163d7058a31c89cb710))
- chart by material, remembered chart settings, and watch --quiet ([5ae19f3](https://github.com/robertbaker/spoolsync/commit/5ae19f37b8ac91a95315e9f7d246fcc85f84ac22))
- **cli:** add --export-csv to write every loaded spool to one CSV ([349f59e](https://github.com/robertbaker/spoolsync/commit/349f59e3d234b60cae181b24b4ee6c542102af41))
- **cli:** add --summary, friendlier errors, and Windows output safeguards ([12bbc4e](https://github.com/robertbaker/spoolsync/commit/12bbc4ef6ba16aea2e9e0c74309ba46d95510ca5))
- combined CSV export, recent-first services, and sample data ([c556658](https://github.com/robertbaker/spoolsync/commit/c556658abe91680ec7a51af473a9833026396874))
- connection settings in Load panels, download-all, windowed differences ([83dc277](https://github.com/robertbaker/spoolsync/commit/83dc27708e08c1a7212588c78749c4edcec58ef7))
- **load:** duplicate finder, change tracking with watchlist, and health checks ([061904b](https://github.com/robertbaker/spoolsync/commit/061904b8de46b0aba7c0bbc8041bca931fd9b562))
- **load:** import previews and a shareable sample link ([fc5cf30](https://github.com/robertbaker/spoolsync/commit/fc5cf30b0457a352e674b5269eeaaec9c533f356))
- **load:** print spool labels, add trend and cost charts, and make the site installable ([df70529](https://github.com/robertbaker/spoolsync/commit/df70529804141c23a9db0bc237fc24a1ce68fb71))
- **load:** single drop zone, collapsible services, and Continue bar ([546b595](https://github.com/robertbaker/spoolsync/commit/546b595255fbb830e2f0b3fffc3494e1f2aaff8e))
- move settings between browsers, opt-in auto-fetch, and --show-config ([aacd1db](https://github.com/robertbaker/spoolsync/commit/aacd1db7181ad42be3a54c1a6bcc78790a6ea316))
- per-service totals on Load, plus CLI --config and --completion ([8e8057f](https://github.com/robertbaker/spoolsync/commit/8e8057fa09eb1bbd204c1e864ac227fcb4eee44f))
- remaining-filament chart, CLI --watch, and real-shell completion tests ([93663bf](https://github.com/robertbaker/spoolsync/commit/93663bf984f464cf5af9d5463b6fe1530cf874a9))
- remember settings in the browser and in an optional CLI settings file ([1b41795](https://github.com/robertbaker/spoolsync/commit/1b4179541ef87142a2cb0eda0a7ac49ab60a4813))
- remove the Connections page and rewrite the guided tour ([aa6c20f](https://github.com/robertbaker/spoolsync/commit/aa6c20fea7989846a653aa3730e1e103ff2255e7))
- running-low stock, sortable table, color chart, reorder list, --reorder ([f1eaaee](https://github.com/robertbaker/spoolsync/commit/f1eaaeef3d28e54dc69384310b9ede2104a8fd24))
- **spoolsync-cli:** add --format json reports and a --watch change diff ([8b1c5d3](https://github.com/robertbaker/spoolsync/commit/8b1c5d3d74646fae6bf5ed9f0f4129ceb1c1dc95))
- **spoolsync-cli:** save --format json with --save-config ([db761a2](https://github.com/robertbaker/spoolsync/commit/db761a28a100477b086267c31871939dec268f53))
- **sync:** answer possible matches in bulk and mark Connect optional ([51e74e3](https://github.com/robertbaker/spoolsync/commit/51e74e39c6c7a625e8ac1c79174786b38d85d65c))
- **sync:** keep keyboard focus in the matches list after answering ([5c2d0e1](https://github.com/robertbaker/spoolsync/commit/5c2d0e1899aaa98aed34d2573b361ca323352d4d))
- **sync:** match review queue, pair comparison, and plan preview with CLI command ([5fb4d8e](https://github.com/robertbaker/spoolsync/commit/5fb4d8e079caef5f771ba9960708e8008f53c036))
- **sync:** show pending matches in the sticky bar ([82ea628](https://github.com/robertbaker/spoolsync/commit/82ea6283a4f64422a7686f45b4e8b5530de2c290))
- **sync:** sticky "changes ready" bar with a jump to Apply ([9659329](https://github.com/robertbaker/spoolsync/commit/96593293cba1945c6ac0adcdea2df254d45c8d02))
- **sync:** undo and redo answers to possible matches ([327ea09](https://github.com/robertbaker/spoolsync/commit/327ea09bc92f3b8d08100af3a6b52f884331dbe3))
- **ui:** brand chart, Sync overview, print, shortcuts help, plan summary ([9c6f7e0](https://github.com/robertbaker/spoolsync/commit/9c6f7e07f57d8a7e17d208ff3bb3f9aa8464f8b2))
- **ui:** lead with Load on the home page and compact the Continue bar ([1d12d18](https://github.com/robertbaker/spoolsync/commit/1d12d18c48d04379c3b0a493d21cf2bc548a859a))
- **ui:** reset saved match answers and unload all services ([41522f7](https://github.com/robertbaker/spoolsync/commit/41522f713d74e76c14b6beb56872d1c4adebf20b))
- **ui:** slash shortcuts, remembered panels, and a leaner page weight ([2aaf1ec](https://github.com/robertbaker/spoolsync/commit/2aaf1ec4404d8e66dfeb04333c1063a92072a66b))
- version and changelog in the footer, Sync undo, CLI settings export ([35cd614](https://github.com/robertbaker/spoolsync/commit/35cd614af23cf798512db1a6bc57b4edb3b484c4))

### Bug Fixes

- **a11y:** move Unload out of panel summaries and add axe checks ([780c165](https://github.com/robertbaker/spoolsync/commit/780c1652d9670093910f51fc506358a3821f46ab))

## [0.2.0](https://github.com/robertbaker/spoolsync/compare/spoolsync-cli-v0.1.2...spoolsync-cli-v0.2.0) (2026-10-28)

### Bug Fixes

- **sync:** retain completed write logs across apply failures ([3aa6df2](https://github.com/robertbaker/spoolsync/commit/3aa6df2bb5c7a9202515f61798aaf530b554f30f))
