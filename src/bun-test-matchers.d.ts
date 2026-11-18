// bun-types types `expect(promise).rejects.toThrow()` as `void`, but Bun returns a
// promise that must be awaited. Declare that so `await` is accepted (and meaningful).
import "bun:test";

declare module "bun:test" {
  interface Matchers<T> {
    toThrow(expected?: unknown): Promise<void>;
  }
}
