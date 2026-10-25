import { toText } from "../../core/normalize";
import { JSON_NUMERIC_FIELDS, jsonNumber } from "./map";

export function serializeRows(output: Record<string, unknown>[], format: "csv" | "json") {
  const jsonRows =
    format === "json"
      ? output
      : output.map((record, index) => {
          const {
            spool_spoolman_id,
            spool_purchase_date,
            spool_purchase_price,
            spool_last_dried_date,
            spool_preferred_nozzle_temp,
            spool_preferred_bed_temp,
            ...base
          } = record;
          for (const key of JSON_NUMERIC_FIELDS)
            if (Object.hasOwn(base, key)) base[key] = jsonNumber(base[key], key, index + 1);
          return {
            ...base,
            spool_properties: {
              spoolman_id: toText(spool_spoolman_id) ?? null,
              purchase_date: toText(spool_purchase_date),
              purchase_price: jsonNumber(spool_purchase_price, "spool_purchase_price", index + 1),
              last_dried_date: toText(spool_last_dried_date),
              preferred_nozzle_temp: jsonNumber(
                spool_preferred_nozzle_temp,
                "spool_preferred_nozzle_temp",
                index + 1,
              ),
              preferred_bed_temp: jsonNumber(
                spool_preferred_bed_temp,
                "spool_preferred_bed_temp",
                index + 1,
              ),
            },
          };
        });
  const csvRows = output.map((record) => {
    const properties =
      record["spool_properties"] && typeof record["spool_properties"] === "object"
        ? (record["spool_properties"] as Record<string, unknown>)
        : {};
    const flatRecord = Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "spool_properties"),
    );
    return {
      ...flatRecord,
      spool_spoolman_id: record["spool_spoolman_id"] ?? properties["spoolman_id"] ?? "",
      spool_purchase_date: record["spool_purchase_date"] ?? properties["purchase_date"] ?? "",
      spool_purchase_price: record["spool_purchase_price"] ?? properties["purchase_price"] ?? "",
      spool_last_dried_date: record["spool_last_dried_date"] ?? properties["last_dried_date"] ?? "",
      spool_preferred_nozzle_temp:
        record["spool_preferred_nozzle_temp"] ?? properties["preferred_nozzle_temp"] ?? "",
      spool_preferred_bed_temp:
        record["spool_preferred_bed_temp"] ?? properties["preferred_bed_temp"] ?? "",
    };
  });

  return { jsonRows, csvRows };
}
