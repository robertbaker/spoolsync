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
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra === rb) return true;
    const sa = this.sources.get(ra)!;
    return [...this.sources.get(rb)!].every((source) => !sa.has(source));
  }

  /** Whether all these records' groups can become one without two records from one service. */
  canUnionAll(keys: RecordKey[]): boolean {
    const roots = [...new Set(keys.map((key) => this.find(key)))];
    const seen = new Set<SourceId>();
    for (const root of roots) {
      for (const source of this.sources.get(root)!) {
        if (seen.has(source)) return false;
        seen.add(source);
      }
    }
    return true;
  }

  /** Joins two groups unless that would put two records from one service together. */
  union(a: RecordKey, b: RecordKey): boolean {
    if (!this.canUnion(a, b)) return false;
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra === rb) return true;
    this.parent.set(rb, ra);
    for (const source of this.sources.get(rb)!) this.sources.get(ra)!.add(source);
    return true;
  }
}
