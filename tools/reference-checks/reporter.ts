export interface ReferenceOutput {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

/** Counts each completed check immediately, including those before a later file audit fails. */
export class ReferenceReporter {
  private checks = 0;
  private failures = 0;

  constructor(private readonly output: ReferenceOutput) {}

  passed(): void {
    this.checks++;
  }

  failed(...values: unknown[]): void {
    this.failures++;
    this.output.error(...values);
  }

  complete(): { checks: number; failures: number } {
    this.output.log(`${this.checks} reference checks completed; ${this.failures} failures.`);
    if (!this.checks) throw new Error("No supported reference inventories were found in ref/.");
    return { checks: this.checks, failures: this.failures };
  }
}
