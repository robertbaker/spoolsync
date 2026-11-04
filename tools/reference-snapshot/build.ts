import {
  REMOTE_PROVIDERS,
  buildFetchConfig,
  decodeSnapshot,
  encodeSnapshot,
  fetchReferenceCatalog,
  normalizeReferenceRecords,
  probeFreshness,
  snapshotPath,
  type ReferenceIO,
  type ReferenceProvider,
} from "../../packages/spoolsync-core/src/core/reference";

/** Everything the builder touches outside itself, so tests run without a network or disk. */
export interface SnapshotDeps {
  io: ReferenceIO;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  now(): number;
  log(message: string): void;
}

/**
 * Flat records and a change token for a provider that has no endpoint to fetch (see
 * `snapshotOnly`).
 */
export type SnapshotSource = () => Promise<{ records: unknown[]; token: string | null }>;

export interface SnapshotOptions {
  /** Loaders for snapshot-only providers, by provider id. A provider without one is skipped. */
  sources?: Readonly<Record<string, SnapshotSource>>;
  /** The directory the site serves as its root (`public`); snapshots go under `reference/`. */
  outDir: string;
  /** Fetch even when the service says nothing changed, and accept a much smaller catalog. */
  force?: boolean;
  /** Pause between a paged service's requests. */
  minIntervalMs?: number;
  providers?: readonly ReferenceProvider[];
}

export type SnapshotStatus = "written" | "unchanged" | "kept-old" | "failed";

export interface SnapshotResult {
  providerId: string;
  status: SnapshotStatus;
  records: number;
  message: string;
}

/** A new catalog smaller than this share of the one on disk is treated as a damaged response. */
const SHRINK_LIMIT = 0.5;

async function readExisting(deps: SnapshotDeps, path: string) {
  const text = await deps.readText(path);
  if (!text) return null;
  try {
    return decodeSnapshot(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Writes `reference/<provider>.json` for each remote provider with a built-in endpoint. A build
 * never fails because a reference service is down: the snapshot already on disk is kept, and a site
 * built without one simply fetches live (the page handles a missing snapshot).
 */
export async function buildSnapshots(
  deps: SnapshotDeps,
  options: SnapshotOptions,
): Promise<SnapshotResult[]> {
  const results: SnapshotResult[] = [];
  for (const provider of options.providers ?? REMOTE_PROVIDERS) {
    const id = provider.info.id;
    if (!provider.defaults) continue;
    const path = `${options.outDir}/${snapshotPath(id)}`;
    const done = (status: SnapshotStatus, records: number, message: string) => {
      deps.log(`${provider.info.label}: ${message}`);
      results.push({ providerId: id, status, records, message });
    };
    const existing = await readExisting(deps, path);
    if (provider.snapshotOnly) {
      const source = options.sources?.[id];
      if (!source) {
        done(
          existing ? "kept-old" : "failed",
          existing?.filaments.length ?? 0,
          "no source configured.",
        );
        continue;
      }
      try {
        const { records, token } = await source();
        if (!options.force && existing && token !== null && token === existing.sourceToken) {
          done(
            "unchanged",
            existing.filaments.length,
            `unchanged since the last snapshot (${existing.filaments.length} records).`,
          );
          continue;
        }
        const catalog = normalizeReferenceRecords(records, provider.defaults.mapping, {
          providerId: id,
          providerLabel: provider.info.label,
          attribution: provider.info.attribution,
          license: provider.info.license,
        });
        if (
          !options.force &&
          existing &&
          catalog.filaments.length < existing.filaments.length * SHRINK_LIMIT
        ) {
          done(
            "kept-old",
            existing.filaments.length,
            `the source gave ${catalog.filaments.length} records against ${existing.filaments.length} before; kept the old snapshot (use --force to accept).`,
          );
          continue;
        }
        await deps.writeText(
          path,
          encodeSnapshot({
            providerId: id,
            generatedAt: deps.now(),
            sourceToken: token,
            source: provider.defaults.urlTemplate,
            attribution: provider.info.attribution,
            license: provider.info.license,
            skipped: catalog.skipped,
            filaments: catalog.filaments,
          }),
        );
        done(
          "written",
          catalog.filaments.length,
          `wrote ${catalog.filaments.length} records to ${path}.`,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        done(
          existing ? "kept-old" : "failed",
          existing?.filaments.length ?? 0,
          `could not build (${reason}).`,
        );
      }
      continue;
    }
    // Taken before the download: if the service changes while it runs, the next check differs.
    const token = await probeFreshness(provider, deps.io);
    if (!options.force && existing && token !== null && token === existing.sourceToken) {
      done(
        "unchanged",
        existing.filaments.length,
        `unchanged since the last snapshot (${existing.filaments.length} records).`,
      );
      continue;
    }
    const built = buildFetchConfig(id, undefined);
    if (!built.ok) {
      done("failed", 0, `settings are not usable: ${built.errors.join(" ")}`);
      continue;
    }
    try {
      const catalog = await fetchReferenceCatalog(
        provider,
        { ...built.config, minIntervalMs: options.minIntervalMs ?? built.config.minIntervalMs },
        deps.io,
      );
      if (
        !options.force &&
        existing &&
        catalog.filaments.length < existing.filaments.length * SHRINK_LIMIT
      ) {
        done(
          "kept-old",
          existing.filaments.length,
          `the service returned ${catalog.filaments.length} records against ${existing.filaments.length} before; kept the old snapshot (use --force to accept).`,
        );
        continue;
      }
      await deps.writeText(
        path,
        encodeSnapshot({
          providerId: id,
          generatedAt: deps.now(),
          sourceToken: token,
          source: built.config.urlTemplate,
          attribution: catalog.attribution,
          license: catalog.license,
          skipped: catalog.skipped,
          filaments: catalog.filaments,
        }),
      );
      done(
        "written",
        catalog.filaments.length,
        `wrote ${catalog.filaments.length} records to ${path}.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (existing)
        done(
          "kept-old",
          existing.filaments.length,
          `could not fetch (${reason}); kept the old snapshot.`,
        );
      else done("failed", 0, `could not fetch (${reason}); the site will fetch live instead.`);
    }
  }
  return results;
}
