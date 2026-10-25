import { CliError } from "./errors";
import type { ParsedColor, SpoolmanFilament } from "./types";

export function finiteNonNegative(
  value: unknown,
  fallback: number,
  field: string,
  spoolId: string,
): number {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new CliError(`Spool ${spoolId}: ${field} must be a finite non-negative number`);
  }
  return number;
}

export function parseHexColor(value: unknown): ParsedColor | null {
  const hex = String(value ?? "")
    .trim()
    .replace(/^#/, "");
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const expanded = hex.length === 3 ? [...hex].map((c) => `${c}${c}`).join("") : hex;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) : 255,
    hex: expanded.slice(0, 6).toUpperCase(),
  };
}

export function safeOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeAspect(filament: SpoolmanFilament, name: unknown): number {
  const text =
    `${filament?.name ?? ""} ${name ?? ""} ${filament?.extra?.finish ?? ""}`.toLowerCase();
  const candidates = [
    ["rainbow", 145],
    ["tricolor", 24],
    ["tri color", 24],
    ["bicolor", 252],
    ["bi color", 252],
    ["glow", 91],
    ["glow in the dark", 91],
    ["wood", 123],
    ["marble", 232],
    ["carbon", 238],
    ["silk", 92],
    ["glitter", 64],
    ["metal", 226],
    ["neon", 216],
    ["clear", 21],
    ["translucent", 67],
    ["gloss", 129],
    ["matte", 247],
    ["matt", 247],
    ["satin", 134],
    ["pearl", 126],
    ["fiber", 132],
  ];
  return candidates.find(([needle]) => text.includes(needle))?.[1] ?? 255;
}

export function temp(value: unknown, fallback: number, maximum = 255): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(maximum, Math.round(n)) : fallback;
}
