import { expect, test } from "bun:test";

import { deltaE2000 } from "../color";
import { SOURCE_IDS, type CommonSpool } from "../model";
import { makeSpool } from "../testing";
import { Groups } from "./groups";
import { pairKey, recordKey } from "./keys";
import { defaultMatchingPolicy, similarityUpperBound, SUGGEST_THRESHOLD } from "./similarity";
import { suggestMatches } from "./suggestions";
import type { MatchSuggestion, RecordKey } from "./types";

// ---- Oracle: the implementations as they were before the performance work. ----

const oracleNormalize = (value: string | null): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "");

function oracleSimilarity(a: CommonSpool, b: CommonSpool): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  if (a.upc && b.upc) {
    if (oracleNormalize(a.upc) === oracleNormalize(b.upc)) add(50, "same barcode");
    else add(-20, "different barcodes");
  }
  const textField = (
    field: "vendor" | "material" | "name",
    label: string,
    same: number,
    differ: number,
  ) => {
    const x = oracleNormalize(a[field]);
    const y = oracleNormalize(b[field]);
    if (!x || !y) return;
    if (x === y) add(same, `same ${label}`);
    else if (differ) add(differ, `different ${label}`);
  };
  textField("vendor", "brand", 15, -30);
  textField("material", "material", 15, -30);
  textField("name", "name", 15, 0);
  const ca = a.colors[0];
  const cb = b.colors[0];
  if (ca && cb) {
    const distance = ca === cb ? 0 : deltaE2000(ca, cb);
    if (distance < 3) add(20, "same color");
    else if (distance < 10) add(10, "similar color");
    else if (distance > 25) add(-30, "different color");
  }
  if (
    a.initialWeight !== null &&
    b.initialWeight !== null &&
    Math.abs(a.initialWeight - b.initialWeight) <= 5
  )
    add(10, "same spool size");
  if (a.remainingWeight !== null && b.remainingWeight !== null) {
    const larger = Math.max(a.remainingWeight, b.remainingWeight, 1);
    if (Math.abs(a.remainingWeight - b.remainingWeight) / larger <= 0.05)
      add(10, "similar remaining weight");
  }
  if (a.purchasedOn && b.purchasedOn && a.purchasedOn === b.purchasedOn)
    add(10, "same purchase date");
  return { score, reasons };
}

function oracleSuggest(
  current: Array<[RecordKey, CommonSpool[]]>,
  groups: Pick<Groups, "canUnion">,
  rejected: ReadonlySet<string>,
  idByRoot: ReadonlyMap<RecordKey, string>,
): MatchSuggestion[] {
  type Candidate = Omit<MatchSuggestion, "groupIds"> & { roots: [RecordKey, RecordKey] };
  const candidates: Candidate[] = [];
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const [rootA, membersA] = current[i]!;
      const [rootB, membersB] = current[j]!;
      if (!groups.canUnion(rootA, rootB)) continue;
      let best: Candidate | undefined;
      let blocked = false;
      for (const a of membersA) {
        for (const b of membersB) {
          const pair: [RecordKey, RecordKey] = [recordKey(a), recordKey(b)];
          if (rejected.has(pairKey(...pair))) {
            blocked = true;
            break;
          }
          const { score, reasons } = oracleSimilarity(a, b);
          if (!best || score > best.score) best = { pair, score, reasons, roots: [rootA, rootB] };
        }
        if (blocked) break;
      }
      if (!blocked && best && best.score >= SUGGEST_THRESHOLD) candidates.push(best);
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  const suggestions: MatchSuggestion[] = [];
  const used = new Set<RecordKey>();
  for (const {
    roots: [ra, rb],
    ...candidate
  } of candidates) {
    if (used.has(ra) || used.has(rb)) continue;
    used.add(ra);
    used.add(rb);
    suggestions.push({ ...candidate, groupIds: [idByRoot.get(ra)!, idByRoot.get(rb)!] });
  }
  return suggestions;
}

// ---- Randomised inventories. ----

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VENDORS = [null, "", "Prusament", "prusament ", "Polymaker", "eSun", "Bambu Lab"];
const MATERIALS = [null, "PLA", "pla", "PLA+", "PETG", "ABS", "TPU"];
const NAMES = [null, "Galaxy Black", "galaxy-black", "Jet Black", "Red", "Orange"];
const COLORS = ["000000", "010101", "FF0000", "F20000", "FF8800", "0000FF", "00FF00"];
const UPCS = [null, "", "123-456", "123456", "987654"];
const DATES = [null, "2024-01-01", "2024-06-01"];
const WEIGHTS = [null, 0, 100, 103, 250, 1000, 1002];

function inventory(seed: number, size: number): CommonSpool[] {
  const rand = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
  const spools: CommonSpool[] = [];
  for (let index = 0; index < size; index++) {
    const source = pick(SOURCE_IDS);
    spools.push(
      makeSpool(source, `s${index}`, {
        vendor: pick(VENDORS),
        material: pick(MATERIALS),
        name: pick(NAMES),
        colors: rand() < 0.2 ? [] : [pick(COLORS)],
        upc: pick(UPCS),
        purchasedOn: pick(DATES),
        initialWeight: pick(WEIGHTS),
        remainingWeight: pick(WEIGHTS),
      }),
    );
  }
  return spools;
}

function setup(spools: CommonSpool[], rand: () => number) {
  const sorted = [...spools].sort(
    (a, b) =>
      SOURCE_IDS.indexOf(a.source) - SOURCE_IDS.indexOf(b.source) ||
      (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0),
  );
  const groups = new Groups(sorted);
  // Link a few random pairs so some groups have several members.
  for (let i = 0; i < sorted.length / 4; i++) {
    const a = sorted[Math.floor(rand() * sorted.length)]!;
    const b = sorted[Math.floor(rand() * sorted.length)]!;
    groups.union(recordKey(a), recordKey(b));
  }
  const members = new Map<RecordKey, CommonSpool[]>();
  for (const spool of sorted) {
    const root = groups.find(recordKey(spool));
    const list = members.get(root);
    if (list) list.push(spool);
    else members.set(root, [spool]);
  }
  const current = [...members];
  const idByRoot = new Map(current.map(([root]) => [root, `group:${root}`]));
  const rejected = new Set<string>();
  for (let i = 0; i < sorted.length / 6; i++) {
    const a = sorted[Math.floor(rand() * sorted.length)]!;
    const b = sorted[Math.floor(rand() * sorted.length)]!;
    rejected.add(pairKey(recordKey(a), recordKey(b)));
  }
  return { current, groups, idByRoot, rejected };
}

test("new similarity scoring matches the previous implementation exactly", () => {
  const spools = inventory(1, 60);
  for (const a of spools)
    for (const b of spools)
      expect(defaultMatchingPolicy.similarity(a, b)).toEqual(oracleSimilarity(a, b));
});

test("the upper bound is never below the real score", () => {
  const spools = inventory(2, 60);
  for (const a of spools)
    for (const b of spools)
      expect(similarityUpperBound(a, b)).toBeGreaterThanOrEqual(oracleSimilarity(a, b).score);
});

test("a pair that differs in brand and material is bounded below the threshold", () => {
  const a = makeSpool("spoolman", "1", { vendor: "Prusament", material: "PLA" });
  const b = makeSpool("spoolio", "x", { vendor: "Polymaker", material: "PETG" });
  expect(similarityUpperBound(a, b)).toBeLessThan(SUGGEST_THRESHOLD);
});

test("scoring stays exact when more colors are loaded than any shared cache holds", () => {
  const spools = Array.from({ length: 1200 }, (_, index) =>
    makeSpool("spoolman", `c${index}`, {
      colors: [(index * 13_001).toString(16).padStart(6, "0").toUpperCase()],
    }),
  );
  for (let index = 1; index < spools.length; index++) {
    const [a, b] = [spools[index - 1]!, spools[index]!];
    expect(defaultMatchingPolicy.similarity(a, b)).toEqual(oracleSimilarity(a, b));
  }
});

test("suggestMatches returns exactly the previous suggestions on randomised inventories", () => {
  let nonEmpty = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rand = random(seed * 7919);
    const { current, groups, idByRoot, rejected } = setup(
      inventory(seed, 20 + (seed % 5) * 15),
      rand,
    );
    const expected = oracleSuggest(current, groups, rejected, idByRoot);
    const actual = suggestMatches(current, groups, rejected, idByRoot, defaultMatchingPolicy);
    expect(actual).toEqual(expected);
    if (expected.length) nonEmpty++;
  }
  expect(nonEmpty).toBeGreaterThan(20);
});
