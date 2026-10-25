import { mkdir, mkdtemp, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function normalize(filename: string): string {
  return process.platform === "win32" ? filename.toLowerCase() : filename;
}

// Resolve existing ancestors too, so a new file inside a junction uses its actual directory.
async function canonicalPath(filename: string): Promise<string> {
  const absolute = path.resolve(filename);
  try {
    return normalize(await realpath(absolute));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await canonicalPath(parent), normalize(path.basename(absolute)));
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
export async function validateOutputPaths(inputs: string[], outputs: string[]): Promise<void> {
  const inputPaths = new Set<string>();
  const inputIds = new Set<string>();
  for (const filename of inputs) {
    inputPaths.add(await canonicalPath(filename));
    const id = await identity(filename);
    if (id) inputIds.add(id);
  }
  for (const filename of outputs) {
    const canonical = await canonicalPath(filename);
    const id = await identity(filename);
    if (inputPaths.has(canonical) || (id && inputIds.has(id)))
      throw new Error(
        `Output would overwrite an input inventory: ${filename}. Choose another --output-dir.`,
      );
  }
}

export interface OutputFile {
  filename: string;
  text: string;
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
  await mkdir(directory, { recursive: true });
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
      await writeFile(path.join(staging, String(index)), files[index]!.text, {
        encoding: "utf8",
        flag: "wx",
      });
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
