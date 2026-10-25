// CIEDE2000 colour difference, ported from printstudio/packages/integrations/src/filament-lookup.ts.

const labCache = new Map<string, [number, number, number]>();
const MAX_CACHED_COLORS = 512;

/** SRGB hex ("RRGGBB") to CIELAB (D65). */
function hexToLab(hex: string): [number, number, number] {
  const cached = labCache.get(hex);
  if (cached) return cached;
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [channel(0), channel(2), channel(4)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  const lab: [number, number, number] = [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  if (labCache.size >= MAX_CACHED_COLORS) labCache.delete(labCache.keys().next().value!);
  labCache.set(hex, lab);
  return lab;
}

/** CIEDE2000 between two "RRGGBB" colours. About 2 is a just-noticeable step. */
export function deltaE2000(hexA: string, hexB: string): number {
  return deltaE2000Lab(hexToLab(hexA), hexToLab(hexB));
}

/** CIEDE2000 on CIELAB values (Sharma, Wu & Dalal 2005). */
export function deltaE2000Lab(
  [L1, a1, b1]: [number, number, number],
  [L2, a2, b2]: [number, number, number],
): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => {
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = C1p === 0 ? 0 : hue(b1, a1p);
  const h2p = C2p === 0 ? 0 : hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    hbarp = Math.abs(h1p - h2p) <= 180 ? hbarp / 2 : (hbarp + (hbarp < 360 ? 360 : -360)) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const Cbarp7 = Cbarp ** 7;
  const RT =
    -2 *
    Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hbarp - 275) / 25) ** 2)) * rad);
  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH),
  );
}
