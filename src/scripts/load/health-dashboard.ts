import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import {
  readHealthHistory,
  recordHealthPoint,
  healthTrend,
  type HealthPoint,
} from "~/lib/browser/storage/health-history";
import {
  computeHealthScore,
  type HealthFactorId,
  type HealthInputs,
  type HealthScore,
} from "~/lib/health-score";
import { formatDate, t, type MessageKey } from "~/lib/i18n";
import { formatWeight } from "~/lib/units";

import { h } from "../dom";
import type { InsightFilter, LoadInsights } from "./insights";

/** The slice of the page's insights the dashboard reads, so tests can supply their own. */
export type HealthSource = Pick<
  LoadInsights,
  | "health"
  | "duplicateSpoolKeys"
  | "missingPrice"
  | "spoolCount"
  | "activeFilter"
  | "setFilter"
  | "onFilterChange"
>;

export interface HealthHistoryStore {
  read(): HealthPoint[];
  record(point: HealthPoint): HealthPoint[];
}

export interface HealthDashboardDeps {
  results: ReadonlyMap<SourceId, LoadResult>;
  insights: HealthSource;
  /** Spools with a cleanup suggestion that could be accepted. */
  cleanupSpools(): number;
  history?: HealthHistoryStore;
  now?: () => Date;
}

const browserHistory: HealthHistoryStore = { read: readHealthHistory, record: recordHealthPoint };

const BUTTON =
  "rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground";

/** The counts the score is made of, read from the page's insights. */
export function healthInputs(insights: HealthSource, cleanupSpools: number): HealthInputs {
  return {
    spools: insights.spoolCount,
    counts: insights.health.counts,
    missingPrice: insights.missingPrice.size,
    duplicateSpools: insights.duplicateSpoolKeys.size,
    cleanupSpools,
  };
}

/** Chart coordinates for scores on a fixed 0 to 100 scale, so a slope is never exaggerated. */
export function trendCoordinates(
  scores: readonly number[],
  width: number,
  height: number,
  padding = 3,
): Array<[number, number]> {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  return scores.map((score, index) => {
    const x = scores.length === 1 ? width / 2 : padding + (usableWidth * index) / (scores.length - 1);
    const clamped = Math.min(100, Math.max(0, score));
    return [Number(x.toFixed(2)), Number((padding + usableHeight * (1 - clamped / 100)).toFixed(2))];
  });
}

const factorLabel = (id: HealthFactorId) => t(`health.factor.${id}` as MessageKey);

function openCleanupPanel(): void {
  const details = document.querySelector<HTMLDetailsElement>('details[data-panel="cleanup"]');
  if (!details) return;
  details.hidden = false;
  details.open = true;
  details.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
}

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function totalKnownGrams(results: ReadonlyMap<SourceId, LoadResult>): { grams: number; spools: number } {
  let grams = 0;
  let spools = 0;
  for (const result of results.values())
    for (const spool of result.spools)
      if (spool.remainingWeight !== null && Number.isFinite(spool.remainingWeight)) {
        grams += spool.remainingWeight;
        spools += 1;
      }
  return { grams, spools };
}

function meter(score: number, grade: NonNullable<HealthScore["grade"]>): HTMLElement {
  const gradeText = t(`health.grade.${grade}` as MessageKey);
  const fill = h("span", { class: "health-meter__fill" });
  fill.style.setProperty("--health-score", `${score}%`);
  return h(
    "div",
    { class: "health-meter mt-3", "data-grade": grade },
    h(
      "p",
      { class: "health-meter__score" },
      h("span", { class: "health-meter__number", "aria-hidden": "true" }, String(score)),
      h("span", { class: "health-meter__max", "aria-hidden": "true" }, "/ 100"),
    ),
    h(
      "div",
      {
        class: "health-meter__track",
        role: "meter",
        "aria-label": t("health.meterLabel"),
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(score),
        "aria-valuetext": t("health.valueText", { score, grade: gradeText }),
      },
      fill,
    ),
    h("p", { class: "health-meter__grade" }, gradeText),
  );
}

function trendView(history: readonly HealthPoint[]): HTMLElement {
  const wrapper = h("div", { class: "health-trend" });
  wrapper.append(h("h3", { class: "text-sm font-semibold" }, t("health.trend.title")));
  const trend = healthTrend(history);
  if (!trend) {
    const only = history[0];
    wrapper.append(
      h(
        "p",
        { class: "mt-1 text-sm text-muted-foreground" },
        only ? t("health.trend.first", { date: formatDate(only.at) }) : "",
      ),
    );
    return wrapper;
  }
  const width = 200;
  const height = 40;
  const coordinates = trendCoordinates(
    history.map((point) => point.score),
    width,
    height,
  );
  const SVG = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "health-trend__chart mt-2");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    t("health.trend.aria", {
      first: trend.first.score,
      last: trend.last.score,
      count: trend.count,
    }),
  );
  const line = document.createElementNS(SVG, "polyline");
  line.setAttribute("class", "health-trend__line");
  line.setAttribute("points", coordinates.map(([x, y]) => `${x},${y}`).join(" "));
  const end = coordinates.at(-1)!;
  const dot = document.createElementNS(SVG, "circle");
  dot.setAttribute("class", "health-trend__dot");
  dot.setAttribute("cx", String(end[0]));
  dot.setAttribute("cy", String(end[1]));
  dot.setAttribute("r", "3");
  svg.append(line, dot);
  const message =
    trend.delta > 0
      ? t("health.trend.up", { points: trend.delta, date: formatDate(trend.first.at) })
      : trend.delta < 0
        ? t("health.trend.down", { points: -trend.delta, date: formatDate(trend.first.at) })
        : t("health.trend.same", { date: formatDate(trend.first.at) });
  wrapper.append(svg, h("p", { class: "mt-1 text-sm text-muted-foreground" }, message));
  return wrapper;
}

/**
 * The data health dashboard on the Load page: a 0 to 100 score with an accessible meter, a to-do
 * list ranked by how many points each fix is worth, and the score's trend across loads. Each item
 * filters the inventory table with one click (or opens the cleanup panel). It changes no data.
 */
export function wireHealthDashboard(root: HTMLElement, deps: HealthDashboardDeps) {
  const history = deps.history ?? browserHistory;
  const now = deps.now ?? (() => new Date());
  const content = h("div");
  // Kept outside `content` so it survives redraws; it speaks only when the score changes.
  const status = h("p", {
    class: "sr-only",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  root.replaceChildren(content, status);
  let announced = "";
  let recordedSignature = "";
  let points: HealthPoint[] | null = null;

  function syncPressed(): void {
    for (const button of content.querySelectorAll<HTMLButtonElement>("[data-health-filter]")) {
      const pressed = deps.insights.activeFilter === button.dataset["healthFilter"];
      button.setAttribute("aria-pressed", String(pressed));
      button.textContent = t(pressed ? "health.todo.showing" : "health.todo.show");
    }
  }
  deps.insights.onFilterChange(syncPressed);

  function todoItem(factor: HealthScore["factors"][number]): HTMLElement {
    const label = factorLabel(factor.id);
    const action = h("button", { type: "button", class: BUTTON });
    if (factor.id === "cleanup") {
      action.textContent = t("health.todo.review");
      action.setAttribute("aria-label", t("health.todo.reviewAria", { label }));
      action.addEventListener("click", openCleanupPanel);
    } else {
      const filter: InsightFilter = factor.id;
      action.dataset["healthFilter"] = filter;
      action.setAttribute("aria-label", t("health.todo.showAria", { label }));
      action.addEventListener("click", () => {
        const turningOn = deps.insights.activeFilter !== filter;
        deps.insights.setFilter(turningOn ? filter : null);
        if (turningOn)
          document
            .getElementById("loaded-table")
            ?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      });
    }
    return h(
      "li",
      { class: "health-todo__item" },
      h("span", { class: "health-todo__label" }, label),
      h(
        "span",
        { class: "health-todo__detail" },
        `${t("health.todo.count", { count: factor.count })} · ${t("health.todo.worth", { points: factor.points })}`,
      ),
      action,
    );
  }

  function update(): void {
    const { insights } = deps;
    const result = computeHealthScore(healthInputs(insights, deps.cleanupSpools()));
    root.hidden = deps.results.size === 0 || result.score === null;
    if (root.hidden || result.score === null || result.grade === null) {
      content.replaceChildren();
      status.textContent = "";
      announced = "";
      return;
    }

    // One point per distinct set of loaded files and result, so redraws never add history.
    const signature = [
      result.score,
      result.spools,
      ...[...deps.results.values()].map((loaded) => `${loaded.source}@${loaded.loadedAt}`),
    ].join("|");
    if (signature !== recordedSignature) {
      recordedSignature = signature;
      points = history.record({ at: now().toISOString(), score: result.score, spools: result.spools });
    }
    points ??= history.read();

    const known = totalKnownGrams(deps.results);
    const grade = t(`health.grade.${result.grade}` as MessageKey);
    content.replaceChildren(
      h("h2", { id: "health-dashboard-heading", class: "text-lg font-semibold" }, t("health.title")),
      meter(result.score, result.grade),
      h(
        "p",
        { class: "mt-3 text-sm text-muted-foreground" },
        t("health.summary", { count: result.spools }),
        known.spools
          ? ` ${t("health.tracked", { weight: formatWeight(known.grams), count: known.spools })}`
          : "",
      ),
      h("h3", { class: "mt-4 text-sm font-semibold" }, t("health.todo.title")),
      result.factors.length
        ? h("ul", { class: "health-todo" }, ...result.factors.map(todoItem))
        : h("p", { class: "mt-1 text-sm text-success-text" }, t("health.todo.none")),
      trendView(points),
    );
    syncPressed();

    const message = t("health.announce", { score: result.score, grade });
    if (announced && message !== announced) status.textContent = message;
    announced = message;
  }

  return { update };
}
