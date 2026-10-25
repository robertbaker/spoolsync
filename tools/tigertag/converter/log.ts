export function log(level: "info" | "warn" | "error", message: string): void {
  const timestamp = new Date().toISOString();
  (level === "info" ? console.log : console.error)(
    `${timestamp} ${level.toUpperCase()} ${message}`,
  );
}
