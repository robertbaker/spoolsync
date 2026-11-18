import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  select,
  text,
} from "@clack/prompts";
import { compareGroup, formatValue } from "@spoolsync/core/core/compare";
import { recordKey } from "@spoolsync/core/core/match";
import {
  SOURCE_IDS,
  isWritableSource,
  type CommonSpool,
  type ComparableField,
  type LoadResult,
  type SourceId,
  type WritableSourceId,
} from "@spoolsync/core/core/model";
import { listServices } from "@spoolsync/core/core/services";

import type { Options } from "./args";
import { createCliPlan } from "./planning";
import { describeSpool } from "./presentation";
import type { ReferenceOutcome } from "./reference";

export interface PromptChoice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface InteractivePrompts {
  intro(title: string): void;
  outro(message: string): void;
  note(message: string, title?: string): void;
  cancel(message: string): void;
  info(message: string): void;
  select<T extends string>(options: {
    message: string;
    options: PromptChoice<T>[];
  }): Promise<T | symbol>;
  multiselect<T extends string>(options: {
    message: string;
    options: PromptChoice<T>[];
    required?: boolean;
  }): Promise<T[] | symbol>;
  confirm(options: { message: string; initialValue?: boolean }): Promise<boolean | symbol>;
  text(options: {
    message: string;
    placeholder?: string;
    validate?: (value: string | undefined) => string | Error | undefined;
  }): Promise<string | symbol>;
  isCancel(value: unknown): value is symbol;
}

export const clackPrompts: InteractivePrompts = {
  intro: (title) => intro(title),
  outro: (message) => outro(message),
  note: (message, title) => note(message, title),
  cancel: (message) => cancel(message),
  info: (message) => log.info(message),
  select: ((opts) => select(opts as never)) as InteractivePrompts["select"],
  multiselect: ((opts) => multiselect(opts as never)) as InteractivePrompts["multiselect"],
  confirm: (opts) => confirm(opts),
  text: (opts) => text(opts),
  isCancel,
};

export interface InteractiveResult {
  options: Options;
  planning: ReturnType<typeof createCliPlan>;
  cancelled: boolean;
}

export async function runInteractiveChoices(
  initialOptions: Options,
  loaded: ReadonlyMap<SourceId, LoadResult>,
  initialPlanning: ReturnType<typeof createCliPlan>,
  reference?: ReferenceOutcome,
  prompts: InteractivePrompts = clackPrompts,
): Promise<InteractiveResult> {
  const options: Options = {
    ...initialOptions,
    confirm: [...initialOptions.confirm],
    reject: [...initialOptions.reject],
    resolves: [...initialOptions.resolves],
    createIn: [...initialOptions.createIn],
  };
  let planning = initialPlanning;
  let dirty = false;
  const sourceLabels = new Map(
    listServices(SOURCE_IDS).map(({ id, info }) => [id, `${info.name} (${id})`]),
  );
  const label = (source: SourceId) => sourceLabels.get(source) ?? source;

  prompts.intro("SpoolSync Interactive");
  prompts.note(
    SOURCE_IDS.filter((source) => loaded.has(source))
      .map((source) => {
        const count = loaded.get(source)!.spools.length;
        return `${label(source)}  ${count.toLocaleString("en-US")} ${count === 1 ? "spool" : "spools"}`;
      })
      .join("\n"),
    "Loaded inventories",
  );

  // 1. Match suggestions
  if (planning.matches.suggestions.length) {
    const spoolsByKey = new Map<string, CommonSpool>();
    for (const result of loaded.values()) {
      for (const spool of result.spools) {
        spoolsByKey.set(recordKey(spool), spool);
      }
    }
    prompts.info(
      `Found ${planning.matches.suggestions.length} possible match suggestion${planning.matches.suggestions.length === 1 ? "" : "s"}.`,
    );
    for (let i = 0; i < planning.matches.suggestions.length; i++) {
      const suggestion = planning.matches.suggestions[i]!;
      const pair = suggestion.pair.join(",");
      const left = describeSpool(spoolsByKey.get(suggestion.pair[0]), suggestion.pair[0]);
      const right = describeSpool(spoolsByKey.get(suggestion.pair[1]), suggestion.pair[1]);
      const remaining = planning.matches.suggestions.length - i;
      const choice = await prompts.select<"confirm" | "reject" | "skip" | "skip-all">({
        message: `Match (${i + 1}/${planning.matches.suggestions.length}): ${left} ↔ ${right} (score ${suggestion.score})`,
        options: [
          {
            value: "confirm",
            label: "Confirm match",
            hint: suggestion.reasons.join("; ") || "Link these spools together",
          },
          {
            value: "reject",
            label: "Reject match",
            hint: "Keep these spools separate",
          },
          {
            value: "skip",
            label: "Skip for now",
            hint: "Leave undecided",
          },
          ...(remaining > 1
            ? [
                {
                  value: "skip-all" as const,
                  label: "Skip remaining suggestions",
                  hint: `Leave all ${remaining} remaining pairs undecided`,
                },
              ]
            : []),
        ],
      });
      if (prompts.isCancel(choice)) {
        prompts.cancel("Cancelled — no changes were written.");
        return { options, planning, cancelled: true };
      }
      if (choice === "skip-all") break;
      if (choice === "confirm") {
        options.confirm.push(pair);
        dirty = true;
      } else if (choice === "reject") {
        options.reject.push(pair);
        dirty = true;
      }
    }
    if (dirty) {
      planning = createCliPlan(options, loaded, options.reference ? reference : undefined);
      dirty = false;
    }
  }

  // 2. Unresolved field conflicts
  if (planning.summary.unresolved.length) {
    const byField = new Map<ComparableField, Map<SourceId, Set<string>>>();
    const groupCounts = new Map<ComparableField, number>();
    const unresolvedSet = new Set(
      planning.summary.unresolved.map(({ group, field }) => `${group}\0${field}`),
    );
    for (const group of planning.matches.groups) {
      for (const comparison of compareGroup(group)) {
        if (!unresolvedSet.has(`${group.id}\0${comparison.field}`)) continue;
        const field = comparison.field as ComparableField;
        groupCounts.set(field, (groupCounts.get(field) ?? 0) + 1);
        const sourceValues = byField.get(field) ?? new Map<SourceId, Set<string>>();
        for (const opt of comparison.options) {
          const formatted = JSON.stringify(formatValue(comparison.field, opt.value));
          for (const source of opt.sources) {
            const set = sourceValues.get(source) ?? new Set<string>();
            set.add(formatted);
            sourceValues.set(source, set);
          }
        }
        byField.set(field, sourceValues);
      }
    }

    const fieldEntries = [...byField.entries()];
    for (let i = 0; i < fieldEntries.length; i++) {
      const [field, sourceValues] = fieldEntries[i]!;
      const count = groupCounts.get(field) ?? 1;
      const remainingFields = fieldEntries.length - i;
      const choice = await prompts.select<string>({
        message: `Resolve conflicting "${field}" (${count} group${count === 1 ? "" : "s"})`,
        options: [
          ...SOURCE_IDS.filter((source) => sourceValues.has(source)).map((source) => ({
            value: source,
            label: `Use ${label(source)}`,
            hint: `e.g. ${[...sourceValues.get(source)!].slice(0, 2).join(", ")}`,
          })),
          {
            value: "__skip__",
            label: "Skip (leave as-is)",
          },
          ...(remainingFields > 1
            ? [
                {
                  value: "__skip_all__",
                  label: "Skip remaining conflicts",
                  hint: `Leave all ${remainingFields} remaining fields as-is`,
                },
              ]
            : []),
        ],
      });
      if (prompts.isCancel(choice)) {
        prompts.cancel("Cancelled — no changes were written.");
        return { options, planning, cancelled: true };
      }
      if (choice === "__skip_all__") break;
      if (choice !== "__skip__") {
        options.resolves.push([field, choice as SourceId]);
        dirty = true;
      }
    }
    if (dirty) {
      planning = createCliPlan(options, loaded, options.reference ? reference : undefined);
      dirty = false;
    }
  }

  // 3. Create missing spools in writable sources (when not already specified)
  const writableLoaded = SOURCE_IDS.filter(
    (source): source is WritableSourceId => loaded.has(source) && isWritableSource(source),
  );
  const hasUnmatchedForWritable =
    writableLoaded.length > 0 &&
    planning.matches.groups.some((group) =>
      writableLoaded.some((source) => !(source in group.members)),
    );
  if (!options.createIn.length && hasUnmatchedForWritable) {
    const missingCount = (source: WritableSourceId) =>
      planning.matches.groups.filter((group) => !(source in group.members)).length;
    const selected = await prompts.multiselect<WritableSourceId>({
      message:
        "Create missing spools in any loaded writable sources? (Space to select, Enter to continue)",
      options: writableLoaded.map((source) => {
        const missing = missingCount(source);
        const loadedCount = loaded.get(source)!.spools.length;
        return {
          value: source,
          label: label(source),
          hint: `${missing.toLocaleString("en-US")} missing ${missing === 1 ? "spool" : "spools"} · ${loadedCount.toLocaleString("en-US")} loaded`,
        };
      }),
      required: false,
    });
    if (prompts.isCancel(selected)) {
      prompts.cancel("Cancelled — no changes were written.");
      return { options, planning, cancelled: true };
    }
    if (selected.length) {
      options.createIn.push(...selected);
      planning = createCliPlan(options, loaded, options.reference ? reference : undefined);
    }
  }

  // 4. Prompt for --output-dir if writable file targets have planned changes
  const fileTargets = SOURCE_IDS.filter(
    (source) =>
      isWritableSource(source) &&
      loaded.get(source)?.origin !== "api" &&
      (planning.plan.get(source)?.length ?? 0) > 0,
  );
  if (fileTargets.length && !options.outputDir) {
    const fileSummary = fileTargets.map((source) => {
      const counts = planning.summary.changes[source]!;
      return `${label(source)}: ${counts.updates} update${counts.updates === 1 ? "" : "s"}, ${counts.creates} create${counts.creates === 1 ? "" : "s"}`;
    });
    prompts.note(fileSummary.join("\n"), "Planned file exports");
    const shouldExport = await prompts.confirm({
      message: "Write these updated inventory files?",
      initialValue: false,
    });
    if (prompts.isCancel(shouldExport)) {
      prompts.cancel("Cancelled — no changes were written.");
      return { options, planning, cancelled: true };
    }
    if (shouldExport) {
      const dir = await prompts.text({
        message: "Output directory:",
        placeholder: "./updated",
        validate: (value) => (value?.trim() ? undefined : "Enter a directory path."),
      });
      if (prompts.isCancel(dir)) {
        prompts.cancel("Cancelled — no changes were written.");
        return { options, planning, cancelled: true };
      }
      options.outputDir = dir.trim();
    }
  }

  // 5. Confirm remote --apply if remote writable APIs have planned changes
  const apiTargets = SOURCE_IDS.filter(
    (source) =>
      isWritableSource(source) &&
      loaded.get(source)?.origin === "api" &&
      (planning.plan.get(source)?.length ?? 0) > 0,
  );
  if (apiTargets.length) {
    const summaryLines = apiTargets.map((source) => {
      const counts = planning.summary.changes[source]!;
      return `${label(source)}: ${counts.updates} update${counts.updates === 1 ? "" : "s"}, ${counts.creates} create${counts.creates === 1 ? "" : "s"}`;
    });
    prompts.note(summaryLines.join("\n"), "Planned remote writes");
    const shouldApply = await prompts.confirm({
      message: options.apply
        ? `Proceed with applying these changes to ${apiTargets.map(label).join(", ")}?`
        : `Apply these planned changes to ${apiTargets.map(label).join(", ")} now?`,
      initialValue: options.apply,
    });
    if (prompts.isCancel(shouldApply) || (options.apply && !shouldApply)) {
      prompts.cancel("Cancelled — no remote changes were applied.");
      return { options, planning, cancelled: true };
    }
    options.apply = Boolean(shouldApply);
  }

  prompts.outro("Interactive setup complete.");
  return { options, planning, cancelled: false };
}
