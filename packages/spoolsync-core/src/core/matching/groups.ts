import type { CommonSpool, SourceId } from "../model";
import { recordKey } from "./keys";
import type { RecordKey } from "./types";

export class Groups {
  private readonly parent = new Map<RecordKey, RecordKey>();
  private readonly sources = new Map<RecordKey, Set<SourceId>>();

  constructor(spools: CommonSpool[]) {
    for (const spool of spools) {
      const key = recordKey(spool);
      this.parent.set(key, key);
      this.sources.set(key, new Set([spool.source]));
    }
  }

  find(key: RecordKey): RecordKey {
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(key, root);
    return root;
  }

  canUnion(a: RecordKey, b: RecordKey): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return true;
    const sa = this.sources.get(ra)!;
    const sb = this.sources.get(rb)!;
    for (const source of sb) {
      if (sa.has(source)) return false;
    }
    return true;
  }

  /** Whether all these records' groups can become one without two records from one service. */
  canUnionAll(keys: RecordKey[]): boolean {
    const seenRoots = new Set<RecordKey>();
    const seen = new Set<SourceId>();
    for (const key of keys) {
      const root = this.find(key);
      if (seenRoots.has(root)) continue;
      seenRoots.add(root);
      for (const source of this.sources.get(root)!) {
        if (seen.has(source)) return false;
        seen.add(source);
      }
    }
    return true;
  }

  /** Joins two groups unless that would put two records from one service together. */
  union(a: RecordKey, b: RecordKey): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return true;
    const sa = this.sources.get(ra)!;
    const sb = this.sources.get(rb)!;
    for (const source of sb) {
      if (sa.has(source)) return false;
    }
    this.parent.set(rb, ra);
    for (const source of sb) sa.add(source);
    return true;
  }
}
