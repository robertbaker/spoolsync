import { COMPARABLE_FIELDS } from "../model";
import type { FieldValue } from "../comparison/types";
import { DEFAULT_TTL_HOURS, MAX_TTL_HOURS } from "./cache";
import { checkEndpointUrl, FETCH_LIMITS, type Pagination, type ReferenceFetchConfig } from "./fetch";
import { mappingOverrides, parseMapping, parsePath } from "./mapping";
import { isProviderId, providerById, PROVIDERS, type ReferenceProviderId } from "./providers";
import {
  DEFAULT_REFERENCE_POLICY,
  REFERENCE_FIELDS,
  type ReferenceField,
  type ReferencePolicy,
} from "./types";
import type { AcceptedReference } from "./analyze";

/** What a person entered for one remote provider. Held as data so it can be saved and exported. */
export interface ProviderSettings {
  urlTemplate: string;
  /** The parts of the mapping that differ from the generic one (see `parseMapping`). */
  mapping: Record<string, unknown>;
  pagination: Pagination;
  ttlHours: number;
  minIntervalMs: number;
  /** Overrides the provider's default credit line, for data whose terms ask for specific wording. */
  attribution: string;
}

export interface ReferenceSettings {
  providerId: ReferenceProviderId;
  policy: ReferencePolicy;
  providers: Partial<Record<ReferenceProviderId, ProviderSettings>>;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  urlTemplate: "",
  mapping: {},
  pagination: { kind: "none" },
  ttlHours: DEFAULT_TTL_HOURS,
  minIntervalMs: FETCH_LIMITS.minIntervalMs.default,
  attribution: "",
};

export const DEFAULT_REFERENCE_SETTINGS: ReferenceSettings = {
  providerId: "file",
  policy: DEFAULT_REFERENCE_POLICY,
  providers: {},
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const paramName = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9_.\-[\]]{1,60}$/.test(value) ? value : null;

export function sanitizePagination(raw: unknown): Pagination {
  if (!isObject(raw)) return { kind: "none" };
  const size = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value)
      ? Math.min(FETCH_LIMITS.pageSize.max, Math.max(FETCH_LIMITS.pageSize.min, value))
      : null;
  switch (raw["kind"]) {
    case "next-link": {
      const path = typeof raw["path"] === "string" ? raw["path"] : "";
      return parsePath(path) ? { kind: "next-link", path } : { kind: "none" };
    }
    case "offset": {
      const [offsetParam, limitParam, pageSize] = [
        paramName(raw["offsetParam"]),
        paramName(raw["limitParam"]),
        size(raw["pageSize"]),
      ];
      return offsetParam && limitParam && pageSize
        ? { kind: "offset", offsetParam, limitParam, pageSize }
        : { kind: "none" };
    }
    case "page": {
      const pageParam = paramName(raw["pageParam"]);
      const first = raw["firstPage"];
      if (!pageParam || typeof first !== "number" || !Number.isInteger(first) || first < 0 || first > 1)
        return { kind: "none" };
      const limitParam = paramName(raw["limitParam"]);
      const pageSize = size(raw["pageSize"]);
      return {
        kind: "page",
        pageParam,
        firstPage: first,
        ...(limitParam && pageSize ? { limitParam, pageSize } : {}),
      };
    }
    default:
      return { kind: "none" };
  }
}

export function sanitizeReferencePolicy(raw: unknown): ReferencePolicy {
  if (!isObject(raw)) return DEFAULT_REFERENCE_POLICY;
  const list = (value: unknown): ReferenceField[] | null =>
    Array.isArray(value)
      ? REFERENCE_FIELDS.filter((field) => value.includes(field))
      : null;
  const fields = list(raw["fields"]) ?? [...DEFAULT_REFERENCE_POLICY.fields];
  // Overwriting a field the policy does not touch would be meaningless; keep the two consistent.
  const overwrite = (list(raw["overwrite"]) ?? []).filter((field) => fields.includes(field));
  return { fields, overwrite };
}

function sanitizeProviderSettings(raw: unknown): ProviderSettings | null {
  if (!isObject(raw)) return null;
  const parsed = parseMapping(isObject(raw["mapping"]) ? raw["mapping"] : {});
  const ttl = raw["ttlHours"];
  const interval = raw["minIntervalMs"];
  return {
    urlTemplate: typeof raw["urlTemplate"] === "string" ? raw["urlTemplate"].trim().slice(0, 2000) : "",
    mapping: parsed.ok ? mappingOverrides(parsed.mapping) : {},
    pagination: sanitizePagination(raw["pagination"]),
    ttlHours:
      typeof ttl === "number" && Number.isFinite(ttl)
        ? Math.min(MAX_TTL_HOURS, Math.max(0, ttl))
        : DEFAULT_TTL_HOURS,
    minIntervalMs:
      typeof interval === "number" && Number.isFinite(interval)
        ? Math.min(FETCH_LIMITS.minIntervalMs.max, Math.max(0, Math.round(interval)))
        : FETCH_LIMITS.minIntervalMs.default,
    attribution: typeof raw["attribution"] === "string" ? raw["attribution"].trim().slice(0, 300) : "",
  };
}

/** Validates saved settings; damaged storage falls back to the defaults field by field. */
export function sanitizeReferenceSettings(raw: unknown): ReferenceSettings {
  if (!isObject(raw)) return { ...DEFAULT_REFERENCE_SETTINGS };
  const providers: Partial<Record<ReferenceProviderId, ProviderSettings>> = {};
  if (isObject(raw["providers"]))
    for (const provider of PROVIDERS) {
      if (provider.info.kind !== "remote") continue;
      const settings = sanitizeProviderSettings(raw["providers"][provider.info.id]);
      if (settings) providers[provider.info.id] = settings;
    }
  return {
    providerId: isProviderId(raw["providerId"]) ? raw["providerId"] : "file",
    policy: sanitizeReferencePolicy(raw["policy"]),
    providers,
  };
}

export type FetchConfigResult =
  | { ok: true; config: ReferenceFetchConfig }
  | { ok: false; errors: string[] };

/** Turns what a person entered for a provider into a fetch configuration, or says what is wrong. */
export function buildFetchConfig(
  providerId: ReferenceProviderId,
  settings: ProviderSettings | undefined,
): FetchConfigResult {
  const provider = providerById(providerId);
  if (!provider || provider.info.kind !== "remote")
    return { ok: false, errors: ["That source is loaded from a file, not fetched."] };
  const current = settings ?? DEFAULT_PROVIDER_SETTINGS;
  const errors: string[] = [];
  const url = checkEndpointUrl(current.urlTemplate);
  if (!url.ok) errors.push(url.error);
  const mapping = parseMapping(current.mapping);
  if (!mapping.ok) errors.push(...mapping.errors);
  if (errors.length || !mapping.ok) return { ok: false, errors };
  return {
    ok: true,
    config: {
      urlTemplate: current.urlTemplate.trim(),
      mapping: mapping.mapping,
      pagination: current.pagination,
      minIntervalMs: current.minIntervalMs,
      maxRetries: FETCH_LIMITS.maxRetries.default,
      maxPages: FETCH_LIMITS.maxPages.default,
      attribution: current.attribution || provider.info.attribution,
      license: provider.info.license,
    },
  };
}

// ---- Accepted proposals and choices -------------------------------------------------------

export const MAX_ACCEPTED_REFERENCES = 20_000;

const isFieldValue = (value: unknown): value is FieldValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

/** Validates stored accepted reference changes; anything malformed is dropped. */
export function sanitizeAcceptedReferences(raw: unknown): AcceptedReference[] {
  if (!Array.isArray(raw)) return [];
  const out: AcceptedReference[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isObject(item)) continue;
    const { spoolKey, field, before, after, providerId, referenceId } = item;
    if (typeof spoolKey !== "string" || !spoolKey) continue;
    if (!(REFERENCE_FIELDS as readonly string[]).includes(field as string)) continue;
    if (!(COMPARABLE_FIELDS as readonly string[]).includes(field as string)) continue;
    if (!isFieldValue(before) || !isFieldValue(after)) continue;
    if (typeof providerId !== "string" || typeof referenceId !== "string" || !referenceId) continue;
    const id = `${spoolKey}#${field as string}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ spoolKey, field: field as ReferenceField, before, after, providerId, referenceId });
    if (out.length >= MAX_ACCEPTED_REFERENCES) break;
  }
  return out;
}

/** spool key to the reference a person picked (or "none"). */
export function sanitizeReferenceChoices(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!isObject(raw)) return out;
  for (const [spoolKey, referenceId] of Object.entries(raw)) {
    if (spoolKey && typeof referenceId === "string" && referenceId && referenceId.length <= 300)
      out.set(spoolKey, referenceId);
    if (out.size >= MAX_ACCEPTED_REFERENCES) break;
  }
  return out;
}
