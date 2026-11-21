import { wireSlashFocus } from "./shortcuts";

const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-install-tab]")];
const select = (id: string, focus = false) => {
  for (const tab of tabs) {
    const on = tab.dataset["installTab"] === id;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const panel of document.querySelectorAll<HTMLElement>("[data-install-panel]")) {
    const isCurrent = panel.dataset["installPanel"] === id;
    panel.hidden = !isCurrent;
    panel.tabIndex = isCurrent ? 0 : -1;
  }
};
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => select(tab.dataset["installTab"]!));
  tab.addEventListener("keydown", (event) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    select(tabs[nextIndex]!.dataset["installTab"]!, true);
  });
}

const optionsSearch = document.getElementById("options-search") as HTMLInputElement | null;
const noMatchNotice = document.getElementById("no-options-match");
const optionsStatus = document.getElementById("options-search-status");
const clearOptionsSearch = document.getElementById("options-search-clear");
if (optionsSearch) {
  const applyOptionsFilter = () => {
    const q = optionsSearch.value.trim().toLowerCase();
    let totalVisible = 0;
    let totalRows = 0;
    for (const group of document.querySelectorAll<HTMLElement>("[data-option-group]")) {
      let visibleCount = 0;
      for (const row of group.querySelectorAll<HTMLElement>("[data-option-row]")) {
        totalRows++;
        const text = (row.textContent || "").toLowerCase();
        const match = text.includes(q);
        row.hidden = !match;
        if (match) visibleCount++;
      }
      group.hidden = visibleCount === 0;
      totalVisible += visibleCount;
    }
    if (noMatchNotice) {
      noMatchNotice.hidden = totalVisible > 0 || q.length === 0;
    }
    if (optionsStatus) {
      optionsStatus.textContent = !q
        ? `Showing all ${totalRows} options.`
        : totalVisible === 0
          ? "No options match."
          : `Showing ${totalVisible} of ${totalRows} options.`;
    }
  };

  optionsSearch.addEventListener("input", applyOptionsFilter);
  clearOptionsSearch?.addEventListener("click", () => {
    optionsSearch.value = "";
    applyOptionsFilter();
    optionsSearch.focus();
  });

  wireSlashFocus(optionsSearch);
}
