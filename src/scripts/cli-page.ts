export {};

const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-install-tab]")];
const select = (id: string, focus = false) => {
  for (const tab of tabs) {
    const on = tab.dataset["installTab"] === id;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const panel of document.querySelectorAll<HTMLElement>("[data-install-panel]")) {
    panel.hidden = panel.dataset["installPanel"] !== id;
  }
};
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => select(tab.dataset["installTab"]!));
  tab.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    select(tabs[(index + step + tabs.length) % tabs.length]!.dataset["installTab"]!, true);
  });
}

const optionsSearch = document.getElementById("options-search") as HTMLInputElement | null;
const noMatchNotice = document.getElementById("no-options-match");
if (optionsSearch) {
  optionsSearch.addEventListener("input", () => {
    const q = optionsSearch.value.trim().toLowerCase();
    let anyVisible = false;
    for (const group of document.querySelectorAll<HTMLElement>("[data-option-group]")) {
      let visibleCount = 0;
      for (const row of group.querySelectorAll<HTMLElement>("[data-option-row]")) {
        const text = (row.textContent || "").toLowerCase();
        const match = text.includes(q);
        row.hidden = !match;
        if (match) visibleCount++;
      }
      group.hidden = visibleCount === 0;
      if (visibleCount > 0) anyVisible = true;
    }
    if (noMatchNotice) {
      noMatchNotice.hidden = anyVisible || q.length === 0;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      document.activeElement !== optionsSearch &&
      !(
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      )
    ) {
      e.preventDefault();
      optionsSearch.focus();
      optionsSearch.select();
    }
  });
}
