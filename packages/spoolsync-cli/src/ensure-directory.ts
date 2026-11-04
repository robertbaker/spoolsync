import { mkdir, stat } from "node:fs/promises";

/**
 * Creates a directory and its parents. Some runtimes report EEXIST for a directory that already
 * exists (for example `.` on Windows) even with `recursive`, so that case is accepted when the path
 * really is a directory.
 */
export async function ensureDirectory(directory: string, mode?: number): Promise<void> {
  try {
    await mkdir(directory, { recursive: true, ...(mode === undefined ? {} : { mode }) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST" && (await stat(directory)).isDirectory())
      return;
    throw error;
  }
}
