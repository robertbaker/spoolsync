/**
 * A sticky bar that tells you how many changes are ready and jumps to the Apply section. It hides
 * itself while Apply is on screen, so it only appears when it is useful.
 */
export function createJumpBar(): { update(changes: number, services: number): void } {
  const bar = document.getElementById("sync-bar");
  const summary = document.getElementById("sync-bar-summary");
  const apply = document.getElementById("tour-apply");
  let changes = 0;
  let applyVisible = false;

  function render(): void {
    if (bar) bar.hidden = changes === 0 || applyVisible;
  }

  if (apply && "IntersectionObserver" in window)
    new IntersectionObserver((entries) => {
      applyVisible = entries.some((entry) => entry.isIntersecting);
      render();
    }).observe(apply);

  return {
    update(nextChanges, services) {
      changes = nextChanges;
      if (summary)
        summary.textContent = `${nextChanges} ${nextChanges === 1 ? "change" : "changes"} ready across ${services} ${services === 1 ? "service" : "services"}`;
      render();
    },
  };
}
