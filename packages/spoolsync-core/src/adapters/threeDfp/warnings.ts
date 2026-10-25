export function csvLossWarnings(
  output: Record<string, unknown>[],
  container: Record<string, unknown> | undefined,
  recordKey: string | undefined,
): string[] {
  const csvWarnings: string[] = [];
  if (container && Object.keys(container).some((key) => key !== recordKey))
    csvWarnings.push(
      "CSV omits top-level backup metadata. Use JSON to preserve the complete export.",
    );
  const knownProperties = new Set([
    "spoolman_id",
    "purchase_date",
    "purchase_price",
    "last_dried_date",
    "preferred_nozzle_temp",
    "preferred_bed_temp",
  ]);
  if (
    output.some((record) => {
      const properties = record["spool_properties"];
      return (
        properties &&
        typeof properties === "object" &&
        Object.keys(properties).some((key) => !knownProperties.has(key))
      );
    })
  )
    csvWarnings.push(
      "CSV omits unrecognized nested spool properties. Use JSON to preserve those fields.",
    );
  if (
    output.some((record) =>
      Object.entries(record).some(
        ([key, value]) => key !== "spool_properties" && value !== null && typeof value === "object",
      ),
    )
  )
    csvWarnings.push(
      "CSV converts structured fields to text. Use JSON to preserve their original structure.",
    );
  return csvWarnings;
}
