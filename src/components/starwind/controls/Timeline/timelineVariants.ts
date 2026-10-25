import { twMerge } from "tailwind-merge";
export function getTimelineClasses(
  vertical: boolean = true,
  compact: boolean = false,
  className?: string,
  responsive: boolean = false,
): string {
  // Logic: if vertical is false, assume horizontal.
  // If responsive is true, use horizontal on desktop, vertical on mobile (standard helpful pattern)
  // Layout classes are defined in _shared/styles/TimelineStyles.astro:
  // timeline-vertical (default), timeline-horizontal, timeline-responsive, timeline-compact

  let directionClass = vertical ? "timeline-vertical" : "timeline-horizontal";

  if (responsive) {
    // Mobile vertical, Desktop horizontal
    directionClass = "timeline-vertical timeline-responsive";
  }

  const baseClasses = "timeline";
  const compactClass = compact ? "timeline-compact" : "";

  return twMerge([baseClasses, directionClass, compactClass, className].filter(Boolean).join(" "));
}
