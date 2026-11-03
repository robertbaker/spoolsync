/**
 * A small QR Code encoder: byte mode, error correction level M, versions 1 to 10 (up to 213 bytes).
 * It follows ISO/IEC 18004: Reed-Solomon codes over GF(256), the eight data masks, and the standard
 * penalty rules for picking one. Pure and synchronous, so labels never depend on a network or a
 * bundled library.
 */

export interface QrCode {
  version: number;
  /** Modules per side. */
  size: number;
  /** The data mask applied, 0 to 7. */
  mask: number;
  /** `modules[y][x]` is true for a dark module. */
  modules: boolean[][];
  /** Finder, timing, alignment, format and version modules, which the data mask never touches. */
  functionModules: boolean[][];
}

export const MAX_QR_VERSION = 10;
/** [blocks, error-correction codewords per block] for versions 1 to 10 at level M. */
const BLOCKS_M: ReadonlyArray<readonly [number, number]> = [
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
];

/** Modules available for data and error correction in a version, after function patterns. */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const rawCodewords = (version: number) => Math.floor(rawDataModules(version) / 8);

function blockInfo(version: number): { blocks: number; ecc: number; data: number } {
  const [blocks, ecc] = BLOCKS_M[version - 1]!;
  return { blocks, ecc, data: rawCodewords(version) - blocks * ecc };
}

/** The most bytes a version can carry. */
export function byteCapacity(version: number): number {
  const bits = blockInfo(version).data * 8 - 4 - (version >= 10 ? 16 : 8);
  return Math.floor(bits / 8);
}

export const MAX_QR_BYTES = byteCapacity(MAX_QR_VERSION);

// ---- Reed-Solomon over GF(256) with polynomial 0x11D ------------------------------------

const EXP: number[] = [];
const LOG: number[] = Array.from<number>({ length: 256 }).fill(0);
{
  let value = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

const gfMultiply = (a: number, b: number) => (a && b ? EXP[LOG[a]! + LOG[b]!]! : 0);

/** Generator polynomial coefficients of the given degree, highest power first, without the leading 1. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = Array.from<number>({ length: poly.length + 1 }).fill(0);
    poly.forEach((coefficient, index) => {
      next[index] = (next[index] ?? 0) ^ coefficient;
      next[index + 1] = (next[index + 1] ?? 0) ^ gfMultiply(coefficient, EXP[i]!);
    });
    poly = next;
  }
  return poly.slice(1);
}

export function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const divisor = generator(degree);
  const result = Array.from<number>({ length: degree }).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] = result[index]! ^ gfMultiply(coefficient, factor);
    });
  }
  return result;
}

// ---- Codewords ---------------------------------------------------------------------------

function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version >= 10 ? 16 : 8);
  for (const byte of bytes) push(byte, 8);
  const capacity = blockInfo(version).data * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((word, bit) => (word << 1) | bit, 0));
  }
  for (let pad = 0xec; words.length < capacity / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** Splits data into blocks, appends each block's error correction, and interleaves them. */
export function interleavedCodewords(data: readonly number[], version: number): number[] {
  const { blocks, ecc } = blockInfo(version);
  const total = rawCodewords(version);
  const shortBlocks = blocks - (total % blocks);
  const shortLength = Math.floor(total / blocks);
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blocks; i++) {
    const length = shortLength - ecc + (i < shortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(reedSolomonRemainder(block, ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < shortLength - ecc + 1; i++)
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]!);
  for (let i = 0; i < ecc; i++) for (const block of eccBlocks) result.push(block[i]!);
  return result;
}

// ---- Matrix ------------------------------------------------------------------------------

const ALIGNMENT: ReadonlyArray<readonly number[]> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const bit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** The 15 format bits for level M and a mask, with their BCH error correction and fixed mask. */
export function formatBits(mask: number): number {
  let remainder = mask;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((mask << 10) | remainder) ^ 0x5412;
}

class Matrix {
  readonly size: number;
  readonly modules: boolean[][];
  readonly functionModules: boolean[][];

  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    const grid = () =>
      Array.from({ length: this.size }, () =>
        Array.from<boolean>({ length: this.size }).fill(false),
      );
    this.modules = grid();
    this.functionModules = grid();
    this.drawFunctionPatterns();
  }

  private set(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.functionModules[y]![x] = true;
  }

  private drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size)
          this.set(x, y, distance !== 2 && distance !== 4);
      }
  }

  private drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);
    const positions = ALIGNMENT[this.version - 1]!;
    const last = positions.length - 1;
    positions.forEach((cy, row) =>
      positions.forEach((cx, column) => {
        const overlapsFinder =
          (row === 0 && column === 0) ||
          (row === 0 && column === last) ||
          (row === last && column === 0);
        if (!overlapsFinder) this.drawAlignment(cx, cy);
      }),
    );
    this.drawFormat(0);
    this.drawVersion();
  }

  drawFormat(mask: number): void {
    const bits = formatBits(mask);
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i));
    this.set(8, 7, bit(bits, 6));
    this.set(8, 8, bit(bits, 7));
    this.set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(bits, i));
    this.set(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let remainder = this.version;
    for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (this.version << 12) | remainder;
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, bit(bits, i));
      this.set(b, a, bit(bits, i));
    }
  }

  drawCodewords(words: readonly number[]): void {
    let index = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < this.size; vertical++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (!this.functionModules[y]![x] && index < words.length * 8) {
            this.modules[y]![x] = bit(words[index >>> 3]!, 7 - (index & 7));
            index++;
          }
        }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++)
        if (!this.functionModules[y]![x] && maskApplies(mask, x, y))
          this.modules[y]![x] = !this.modules[y]![x];
  }

  /** The standard penalty score: runs, 2x2 blocks, finder-like patterns, and dark/light balance. */
  penalty(): number {
    const { size, modules } = this;
    let score = 0;
    const FINDER_A = "10111010000";
    const FINDER_B = "00001011101";
    const scan = (get: (i: number) => boolean) => {
      let run = 1;
      let text = get(0) ? "1" : "0";
      for (let i = 1; i < size; i++) {
        text += get(i) ? "1" : "0";
        if (get(i) === get(i - 1)) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
      for (let i = 0; i + 11 <= size; i++) {
        const window = text.slice(i, i + 11);
        if (window === FINDER_A || window === FINDER_B) score += 40;
      }
    };
    for (let y = 0; y < size; y++) scan((i) => modules[y]![i]!);
    for (let x = 0; x < size; x++) scan((i) => modules[i]![x]!);
    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++) {
        const value = modules[y]![x]!;
        if (
          value === modules[y]![x + 1] &&
          value === modules[y + 1]![x] &&
          value === modules[y + 1]![x + 1]
        )
          score += 3;
      }
    const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    const percent = (dark * 100) / (size * size);
    return score + Math.floor(Math.abs(percent - 50) / 5) * 10;
  }
}

/** The smallest version that fits, or `null` when the text is longer than version 10 allows. */
export function smallestVersion(byteLength: number): number | null {
  for (let version = 1; version <= MAX_QR_VERSION; version++)
    if (byteLength <= byteCapacity(version)) return version;
  return null;
}

/** Encodes text as UTF-8 bytes in a QR code. Returns `null` when it is too long for version 10. */
export function encodeQr(text: string): QrCode | null {
  const bytes = new TextEncoder().encode(text);
  const version = smallestVersion(bytes.length);
  if (version === null) return null;
  const words = interleavedCodewords(dataCodewords(bytes, version), version);
  let best: { matrix: Matrix; mask: number } | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const matrix = new Matrix(version);
    matrix.drawCodewords(words);
    matrix.applyMask(mask);
    matrix.drawFormat(mask);
    const score = matrix.penalty();
    if (score < bestScore) {
      bestScore = score;
      best = { matrix, mask };
    }
  }
  const { matrix, mask } = best!;
  return {
    version,
    size: matrix.size,
    mask,
    modules: matrix.modules,
    functionModules: matrix.functionModules,
  };
}

/** The QR code as an SVG path (one square per dark module) with a four-module quiet zone. */
export function qrSvgPath(code: QrCode): { path: string; viewBox: number } {
  const quiet = 4;
  const parts: string[] = [];
  code.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }),
  );
  return { path: parts.join(""), viewBox: code.size + quiet * 2 };
}
