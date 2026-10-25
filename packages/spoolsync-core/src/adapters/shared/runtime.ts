/** Non-deterministic values needed when creating export records. */
export interface AdapterRuntime {
  now(): number;
  randomUUID(): string;
}

export const systemRuntime: AdapterRuntime = {
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
};
