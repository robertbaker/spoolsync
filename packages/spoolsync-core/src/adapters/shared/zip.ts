/**
 * Minimal read-only ZIP reader for spreadsheet exports. It supports stored and deflated entries
 * through the platform's `DecompressionStream`, so it runs unchanged in browsers, Bun, and Node.
 * ZIP64 archives, encryption, and multi-disk archives are rejected with a clear message.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 4096;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  crc32: number;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= earliest; offset--)
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  throw new ZipError("This file is not a valid spreadsheet: no ZIP directory was found.");
}

/** Lists the entries in the archive's central directory. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  if (bytes.byteLength < 22) throw new ZipError("This file is too small to be a spreadsheet.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const disk = view.getUint16(eocd + 4, true);
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || view.getUint16(eocd + 6, true) !== 0)
    throw new ZipError("Multi-part ZIP archives are not supported.");
  if (count === 0xffff || directorySize === 0xffffffff || offset === 0xffffffff)
    throw new ZipError("ZIP64 archives are not supported.");
  if (count > MAX_ENTRIES) throw new ZipError("This spreadsheet contains too many internal files.");

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE)
      throw new ZipError("This file is not a valid spreadsheet: the ZIP directory is damaged.");
    const flags = view.getUint16(offset + 8, true);
    if (flags & 0x1) throw new ZipError("Password-protected spreadsheets are not supported.");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    if (nameStart + nameLength > bytes.byteLength)
      throw new ZipError("This file is not a valid spreadsheet: the ZIP directory is damaged.");
    entries.push({
      name: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
      method: view.getUint16(offset + 10, true),
      crc32: view.getUint32(offset + 16, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined")
    throw new ZipError("This browser cannot decompress spreadsheets. Use a current browser.");
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ENTRY_BYTES) {
        await reader.cancel();
        throw new ZipError("A file inside this spreadsheet is too large to read.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ZipError) throw error;
    throw new ZipError("This file is not a valid spreadsheet: its contents are damaged.");
  }
  if (total !== expectedSize)
    throw new ZipError("This file is not a valid spreadsheet: its contents are damaged.");
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.byteLength;
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Returns the decompressed bytes of one entry, verified against its stored CRC-32. */
export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const data = await readZipEntryUnchecked(bytes, entry);
  if (crc32(data) !== entry.crc32)
    throw new ZipError("This file is not a valid spreadsheet: its contents are damaged.");
  return data;
}

async function readZipEntryUnchecked(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES)
    throw new ZipError("A file inside this spreadsheet is too large to read.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;
  if (header + 30 > bytes.byteLength || view.getUint32(header, true) !== LOCAL_SIGNATURE)
    throw new ZipError("This file is not a valid spreadsheet: the ZIP contents are damaged.");
  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.byteLength)
    throw new ZipError("This file is not a valid spreadsheet: the ZIP contents are truncated.");
  const data = bytes.subarray(start, end);
  if (entry.method === 0) return data.slice();
  if (entry.method === 8) return inflateRaw(data, entry.uncompressedSize);
  throw new ZipError(`Unsupported ZIP compression method ${entry.method}.`);
}

/** Reads a UTF-8 text entry by name, or `undefined` when the archive does not contain it. */
export async function readZipText(
  bytes: Uint8Array,
  entries: readonly ZipEntry[],
  name: string,
): Promise<string | undefined> {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) return undefined;
  return new TextDecoder().decode(await readZipEntry(bytes, entry)).replace(/^﻿/, "");
}
