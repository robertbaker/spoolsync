/** Edit distance between two short strings, for "did you mean" hints. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return previous[b.length]!;
}

/** The closest known option within a small edit distance, or `undefined` when nothing is close. */
export function closestOption(
  unknown: string,
  known: readonly string[],
  maxDistance = 2,
): string | undefined {
  if (!unknown.startsWith("--")) return undefined;
  let best: { option: string; distance: number } | undefined;
  for (const option of known) {
    const distance = editDistance(unknown, option);
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { option, distance };
  }
  return best?.option;
}
