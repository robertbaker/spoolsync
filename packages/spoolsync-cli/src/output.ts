import { mkdtemp, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureDirectory } from "./ensure-directory";

function normalize(filename: string, platform: NodeJS.Platform): string {
  // Windows file names are case-insensitive, so two spellings can name the same file.
  return platform === "win32" ? filename.toLowerCase() : filename;
}

const WINDOWS_DEVICE_NAME =
  /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(\..*)?$/i;

const isDisallowedWindowsName = (name: string): boolean => {
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (
      code < 32 ||
      code === 60 /* < */ ||
      code === 62 /* > */ ||
      code === 58 /* : */ ||
      code === 34 /* " */ ||
      code === 124 /* | */ ||
      code === 63 /* ? */ ||
      code === 42 /* * */
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Windows treats some names specially: device names such as NUL or COM1 (even with an extension),
 * `name:stream` alternate data streams, trailing dots or spaces, and reserved characters. Writing
 * to them silently does something other than creating the file, so refuse them up front.
 */
export function assertPortableOutputName(
  filename: string,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "win32") return;
  const name = path.win32.basename(filename);
  if (WINDOWS_DEVICE_NAME.test(name))
    throw new Error(`"${name}" is a reserved Windows device name. Choose another file name.`);
  if (isDisallowedWindowsName(name))
    throw new Error(
      `"${name}" contains a character Windows does not allow in file names (< > : " | ? *). Choose another file name.`,
    );
  if (/[. ]$/.test(name))
    throw new Error(
      `"${name}" ends with a dot or space, which Windows removes. Choose another file name.`,
    );
}

// Resolve existing ancestors too, so a new file inside a junction uses its actual directory.
async function canonicalPath(filename: string, platform: NodeJS.Platform): Promise<string> {
  const absolute = path.resolve(filename);
  try {
    return normalize(await realpath(absolute), platform);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(
      await canonicalPath(parent, platform),
      normalize(path.basename(absolute), platform),
    );
  }
}

async function identity(filename: string): Promise<string | undefined> {
  try {
    const info = await stat(filename, { bigint: true });
    // Some filesystems cannot provide inode identities; canonical paths still protect those.
    return info.ino === 0n ? undefined : `${info.dev}:${info.ino}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Refuses exports that alias an input, including symlinks, junctions, and hard links. */
export async function validateOutputPaths(
  inputs: string[],
  outputs: string[],
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const inputPaths = new Set<string>();
  const inputIds = new Set<string>();
  for (const filename of inputs) {
    inputPaths.add(await canonicalPath(filename, platform));
    const id = await identity(filename);
    if (id) inputIds.add(id);
  }
  for (const filename of outputs) {
    assertPortableOutputName(filename, platform);
    const canonical = await canonicalPath(filename, platform);
    const id = await identity(filename);
    if (inputPaths.has(canonical) || (id && inputIds.has(id)))
      throw new Error(
        `Output would overwrite an input inventory: ${filename}. Choose another output location.`,
      );
  }
}

export interface OutputFile {
  filename: string;
  text: string;
  /** Written as-is instead of `text` for binary exports such as a ZIP. */
  bytes?: Uint8Array;
}

export class ExportCommitError extends Error {
  constructor(
    readonly written: string[],
    cause: unknown,
  ) {
    super(
      `Could not finish writing exports. Files already replaced: ${written.length ? written.join(", ") : "none"}. ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ExportCommitError";
  }
}

export interface StagedOutput {
  cleanup(): Promise<void>;
  commit(): Promise<string[]>;
}

/** Stage complete files on the destination filesystem, then replace each destination by rename. */
export async function stageOutputFiles(
  directory: string,
  files: readonly OutputFile[],
): Promise<StagedOutput> {
  files = files.map((file) => ({ ...file }));
  await ensureDirectory(directory);
  for (const file of files) {
    if (path.resolve(path.dirname(file.filename)) !== path.resolve(directory))
      throw new Error(`Export must be written inside the output directory: ${file.filename}`);
    try {
      const info = await stat(file.filename);
      if (!info.isFile())
        throw new Error(`Export destination is not a regular file: ${file.filename}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const staging = await mkdtemp(path.join(directory, ".spoolsync-"));
  const cleanup = () => rm(staging, { recursive: true, force: true });
  try {
    for (let index = 0; index < files.length; index++)
      await writeFile(
        path.join(staging, String(index)),
        files[index]!.bytes ?? files[index]!.text,
        {
          ...(files[index]!.bytes ? {} : { encoding: "utf8" as const }),
          flag: "wx",
        },
      );
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Could not stage exports: ${error instanceof Error ? error.message : String(error)}. Staging cleanup also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        { cause: error },
      );
    }
    throw error;
  }
  return {
    cleanup,
    async commit(): Promise<string[]> {
      const written: string[] = [];
      try {
        for (let index = 0; index < files.length; index++) {
          const filename = files[index]!.filename;
          await rename(path.join(staging, String(index)), filename);
          written.push(filename);
        }
      } catch (error) {
        throw new ExportCommitError(written, error);
      }
      return written;
    },
  };
}

/** Commits two staged outputs one after the other, reporting every file replaced so far. */
export function combineStaged(
  primary: StagedOutput | undefined,
  secondary: StagedOutput,
): StagedOutput {
  if (!primary) return secondary;
  return {
    async commit(): Promise<string[]> {
      const first = await primary.commit();
      try {
        return [...first, ...(await secondary.commit())];
      } catch (error) {
        throw new ExportCommitError(
          [...first, ...(error instanceof ExportCommitError ? error.written : [])],
          error instanceof ExportCommitError ? error.cause : error,
        );
      }
    },
    async cleanup(): Promise<void> {
      try {
        await primary.cleanup();
      } finally {
        await secondary.cleanup();
      }
    },
  };
}
