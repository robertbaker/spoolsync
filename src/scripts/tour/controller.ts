import type { TourStep } from "./steps";

export interface TourNavigation {
  href(): string;
  pathname(): string;
  assign(url: string): void;
  replace(url: string): void;
  update(url: URL): void;
}

export interface TourView {
  render(index: number): void;
  clear(): void;
  focusLauncher(): void;
}

export function currentTourIndex(href: string, count: number): number | null {
  const raw = new URL(href).searchParams.get("tour");
  if (raw === null) return null;
  const index = Number.parseInt(raw, 10);
  return Number.isInteger(index) && index >= 0 && index < count ? index : null;
}

/** Navigation and lifecycle without browser globals; the view owns dialogs and highlighting. */
export class TourController {
  constructor(
    private readonly steps: readonly TourStep[],
    private readonly navigation: TourNavigation,
    private readonly view: TourView,
  ) {}

  start(): void {
    const index = currentTourIndex(this.navigation.href(), this.steps.length);
    if (index === null) return;
    const expected = this.steps[index]!.href;
    if (this.navigation.pathname() !== expected)
      this.navigation.replace(`${expected}?tour=${index}`);
    else this.view.render(index);
  }

  launch(): void {
    this.navigation.assign("/?tour=0");
  }

  clear(): void {
    this.view.clear();
    const url = new URL(this.navigation.href());
    url.searchParams.delete("tour");
    this.navigation.update(url);
    this.view.focusLauncher();
  }

  goTo(index: number): void {
    const step = this.steps[index];
    if (!step) return this.clear();
    if (this.navigation.pathname() !== step.href) {
      this.navigation.assign(`${step.href}?tour=${index}`);
      return;
    }
    const url = new URL(this.navigation.href());
    url.searchParams.set("tour", String(index));
    this.navigation.update(url);
    this.view.render(index);
  }
}
