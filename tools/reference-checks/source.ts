import type { SourceId } from "../../packages/spoolsync-core/src/core/model";

export function sourceFromFilename(name: string): SourceId | null {
  const normalized = name.toLowerCase();
  return normalized.startsWith("3dfilament") || normalized.startsWith("my-spools")
    ? "threeDfp"
    : normalized.startsWith("spoolio")
      ? "spoolio"
      : normalized.startsWith("spoolman")
        ? "spoolman"
        : normalized.startsWith("spoolstock")
          ? "spoolstock"
          : normalized.startsWith("tigertag")
            ? "tigertag"
            : normalized.startsWith("bambuddy")
              ? "bambuddy"
              : normalized.startsWith("filameter")
                ? "filameter"
                : null;
}
