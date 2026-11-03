import { expect, test } from "bun:test";

import {
  MAX_QR_BYTES,
  byteCapacity,
  encodeQr,
  formatBits,
  qrSvgPath,
  rawDataModules,
  reedSolomonRemainder,
  smallestVersion,
  type QrCode,
} from "./qr";

/** Reads the data codewords back out of a finished symbol, checking format and error correction. */
function decode(code: QrCode): { text: string; maskFromFormat: number } {
  const { size, modules, functionModules } = code;
  // Format information: read the copy next to the top-left finder and match it to a mask.
  let read = 0;
  const positions: Array<[number, number]> = [
    ...[0, 1, 2, 3, 4, 5].map((i): [number, number] => [8, i]),
    [8, 7],
    [8, 8],
    [7, 8],
    ...[9, 10, 11, 12, 13, 14].map((i): [number, number] => [14 - i, 8]),
  ];
  positions.forEach(([x, y], i) => {
    if (modules[y]![x]) read |= 1 << i;
  });
  const maskFromFormat = [0, 1, 2, 3, 4, 5, 6, 7].find((mask) => formatBits(mask) === read);
  if (maskFromFormat === undefined) throw new Error("format bits do not match any mask");

  const applies = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_x: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ][maskFromFormat]!;

  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
        if (functionModules[y]![x]) continue;
        bits.push(Number(modules[y]![x]! !== applies(x, y)));
      }
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    words.push(bits.slice(i, i + 8).reduce((word, bit) => (word << 1) | bit, 0));

  // De-interleave using the same block layout, then require every block to leave a zero remainder.
  const total = Math.floor(rawDataModules(code.version) / 8);
  const [blocks, ecc] = [
    [1, 10],
    [1, 16],
    [1, 26],
    [2, 18],
    [2, 24],
    [4, 16],
    [4, 18],
    [4, 22],
    [5, 22],
    [5, 26],
  ][code.version - 1]!;
  const shortBlocks = blocks! - (total % blocks!);
  const shortLength = Math.floor(total / blocks!);
  const lengths = Array.from(
    { length: blocks! },
    (_, i) => shortLength - ecc! + (i < shortBlocks ? 0 : 1),
  );
  const data: number[][] = lengths.map(() => []);
  const check: number[][] = lengths.map(() => []);
  let cursor = 0;
  for (let i = 0; i < Math.max(...lengths); i++)
    lengths.forEach((length, block) => {
      if (i < length) data[block]!.push(words[cursor++]!);
    });
  for (let i = 0; i < ecc!; i++)
    lengths.forEach((_, block) => check[block]!.push(words[cursor++]!));
  data.forEach((block, index) => {
    expect(reedSolomonRemainder(block, ecc!)).toEqual(check[index]!);
  });

  const stream = data.flat();
  const bitString = stream.map((word) => word.toString(2).padStart(8, "0")).join("");
  expect(bitString.slice(0, 4)).toBe("0100");
  const countBits = code.version >= 10 ? 16 : 8;
  const count = parseInt(bitString.slice(4, 4 + countBits), 2);
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++)
    bytes[i] = parseInt(bitString.slice(4 + countBits + i * 8, 4 + countBits + i * 8 + 8), 2);
  return { text: new TextDecoder().decode(bytes), maskFromFormat };
}

test("format information matches the published value for level M with mask 0", () => {
  expect(formatBits(0).toString(2).padStart(15, "0")).toBe("101010000010010");
  expect(formatBits(1).toString(2).padStart(15, "0")).toBe("101000100100101");
});

test("symbol sizes and raw capacities follow the standard", () => {
  expect(rawDataModules(1)).toBe(208);
  expect(rawDataModules(2)).toBe(359);
  expect(rawDataModules(7)).toBe(1568);
  expect(rawDataModules(10)).toBe(2768);
  // Byte capacities at level M.
  expect([1, 2, 3, 4, 5, 10].map(byteCapacity)).toEqual([14, 26, 42, 62, 84, 213]);
  expect(MAX_QR_BYTES).toBe(213);
  expect(smallestVersion(14)).toBe(1);
  expect(smallestVersion(15)).toBe(2);
  expect(smallestVersion(214)).toBeNull();
  expect(encodeQr("x".repeat(214))).toBeNull();
});

test("Reed-Solomon remainders match a published vector", () => {
  // "HELLO WORLD" at version 1-Q: thirteen data codewords and thirteen error correction codewords.
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
  expect(reedSolomonRemainder(data, 13)).toEqual([
    168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16,
  ]);
});

test("encodes and decodes text across versions, with valid error correction", () => {
  const samples = [
    "spoolman:12",
    "tigertag:04A1B2C3D4E5F6",
    "spoolio:3f2b8f2e-9c1d-4e6a-8c55-0a8d3b6f7e11",
    "filamentdb:" + "ß☃".repeat(12),
    "a".repeat(100),
    "b".repeat(150),
    "c".repeat(213),
  ];
  for (const text of samples) {
    const code = encodeQr(text)!;
    expect(code).not.toBeNull();
    expect(code.size).toBe(code.version * 4 + 17);
    expect(decode(code).text).toBe(text);
  }
});

test("every version from 1 to 10 round-trips at its capacity", () => {
  for (let version = 1; version <= 10; version++) {
    const text = "z".repeat(byteCapacity(version));
    const code = encodeQr(text)!;
    expect(code.version).toBe(version);
    expect(decode(code).text).toBe(text);
  }
});

test("the three finder patterns and timing line are in place", () => {
  const { modules, size } = encodeQr("spoolman:1")!;
  for (const [ox, oy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ] as const) {
    expect(modules[oy]![ox]).toBe(true);
    expect(modules[oy + 3]![ox + 3]).toBe(true);
    expect(modules[oy + 1]![ox + 1]).toBe(false);
    expect(modules[oy + 6]![ox + 6]).toBe(true);
  }
  for (let i = 8; i < size - 8; i++) expect(modules[6]![i]).toBe(i % 2 === 0);
});

test("encoding is deterministic and the SVG path covers each dark module once", () => {
  const first = encodeQr("spoolman:7")!;
  expect(encodeQr("spoolman:7")!.modules).toEqual(first.modules);
  const { path, viewBox } = qrSvgPath(first);
  expect(viewBox).toBe(first.size + 8);
  const dark = first.modules.flat().filter(Boolean).length;
  expect(path.split("z").length - 1).toBe(dark);
});
