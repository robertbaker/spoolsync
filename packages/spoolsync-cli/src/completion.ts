import { COMPARABLE_FIELDS, WRITABLE_SOURCE_IDS } from "@spoolsync/core/core/model";

export const COMPLETION_SHELLS = ["bash", "zsh", "fish"] as const;
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

type Kind = "file" | "directory" | "writable-sources" | "resolution" | "shell" | "text" | "flag";

interface OptionSpec {
  flag: string;
  description: string;
  kind: Kind;
}

/** Every option the CLI accepts, with what its value looks like. Kept in sync by a test. */
export const OPTION_SPECS: readonly OptionSpec[] = [
  { flag: "--spoolman", description: "Spoolman JSON or CSV export", kind: "file" },
  { flag: "--spoolstock", description: "Spoolstock CSV export", kind: "file" },
  { flag: "--spoolio", description: "Spoolio JSON export", kind: "file" },
  { flag: "--tigertag", description: "TigerTag .ttag or JSON export", kind: "file" },
  { flag: "--three-dfp", description: "3DFilamentProfiles CSV or JSON export", kind: "file" },
  { flag: "--3dfp", description: "Alias for --three-dfp", kind: "file" },
  { flag: "--bambuddy", description: "Bambuddy inventory CSV or API JSON", kind: "file" },
  { flag: "--filameter", description: "FilaMeter backup JSON or CSV export", kind: "file" },
  { flag: "--filadex", description: "Filadex JSON or CSV export", kind: "file" },
  { flag: "--filamentdb", description: "FilamentDB spools JSON", kind: "file" },
  { flag: "--spoolmaster", description: "SpoolMaster Excel export", kind: "file" },
  { flag: "--spoolhoarder", description: "Spool Hoarder inventory or HueForge CSV", kind: "file" },
  { flag: "--spool-hoarder", description: "Alias for --spoolhoarder", kind: "file" },
  { flag: "--spool", description: "Spool app JSON backup", kind: "file" },
  { flag: "--spoolkeep", description: "SpoolKeep JSON backup", kind: "file" },
  { flag: "--empty", description: "Start empty writable inventories", kind: "writable-sources" },
  {
    flag: "--create-in",
    description: "Create missing spools in these sources",
    kind: "writable-sources",
  },
  {
    flag: "--resolve",
    description: "Resolve a conflicting field from a source",
    kind: "resolution",
  },
  { flag: "--confirm", description: "Confirm a suggested pair", kind: "text" },
  { flag: "--reject", description: "Reject a suggested pair", kind: "text" },
  { flag: "--output-dir", description: "Write updated import files here", kind: "directory" },
  { flag: "--export-csv", description: "Write every loaded spool to one CSV", kind: "file" },
  { flag: "--config", description: "Read default options from a JSON file", kind: "file" },
  { flag: "--watch", description: "Run again whenever an input file changes", kind: "flag" },
  { flag: "--summary", description: "Print counts instead of planning changes", kind: "flag" },
  { flag: "--apply", description: "Apply changes to a directly loaded service", kind: "flag" },
  { flag: "--json", description: "Print machine-readable output", kind: "flag" },
  { flag: "--spoolman-url", description: "Load Spoolman directly", kind: "text" },
  { flag: "--spoolman-token", description: "Spoolman API token", kind: "text" },
  { flag: "--filamentdb-url", description: "Load FilamentDB directly", kind: "text" },
  { flag: "--filamentdb-token", description: "FilamentDB session token", kind: "text" },
  { flag: "--filadex-url", description: "Load Filadex directly", kind: "text" },
  { flag: "--filadex-user", description: "Filadex username", kind: "text" },
  { flag: "--completion", description: "Print a shell completion script", kind: "shell" },
  { flag: "--help", description: "Show help", kind: "flag" },
  { flag: "--version", description: "Show the installed version", kind: "flag" },
];

const writable = WRITABLE_SOURCE_IDS.join(" ");
const resolutions = COMPARABLE_FIELDS.map((field) => `${field}=`).join(" ");

function bash(): string {
  const byKind = (kind: Kind) =>
    OPTION_SPECS.filter((spec) => spec.kind === kind)
      .map((spec) => spec.flag)
      .join("|");
  return `# bash completion for spoolsync. Load it with: source <(spoolsync --completion bash)
_spoolsync() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  case "$prev" in
    ${byKind("writable-sources")})
      COMPREPLY=($(compgen -W "${writable}" -- "$cur")); return ;;
    --resolve)
      COMPREPLY=($(compgen -W "${resolutions}" -- "$cur")); compopt -o nospace 2>/dev/null; return ;;
    --completion)
      COMPREPLY=($(compgen -W "${COMPLETION_SHELLS.join(" ")}" -- "$cur")); return ;;
    ${byKind("directory")})
      COMPREPLY=($(compgen -d -- "$cur")); return ;;
    ${byKind("file")})
      COMPREPLY=($(compgen -f -- "$cur")); return ;;
    ${byKind("text")})
      return ;;
  esac
  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "${OPTION_SPECS.map((spec) => spec.flag).join(" ")}" -- "$cur"))
  fi
}
complete -o filenames -F _spoolsync spoolsync
`;
}

const quote = (text: string) => text.replaceAll("'", "'\\''");

function zsh(): string {
  const lines = OPTION_SPECS.map((spec) => {
    const text = quote(spec.description.replaceAll("[", "(").replaceAll("]", ")"));
    const value = {
      file: ":file:_files",
      directory: ":directory:_files -/",
      "writable-sources": `:source:_values -s , source ${writable}`,
      resolution: `:field=source:(${resolutions})`,
      shell: `:shell:(${COMPLETION_SHELLS.join(" ")})`,
      text: ":value:",
      flag: "",
    }[spec.kind];
    return `    '${spec.flag}[${text}]${value}'`;
  });
  return `#compdef spoolsync
# zsh completion for spoolsync. Save as _spoolsync in a directory on your $fpath, or run:
#   source <(spoolsync --completion zsh)
_spoolsync() {
  _arguments -s \\
${lines.join(" \\\n")}
}
if [ "$funcstack[1]" = "_spoolsync" ]; then _spoolsync "$@"; else compdef _spoolsync spoolsync; fi
`;
}

function fish(): string {
  const lines = OPTION_SPECS.map((spec) => {
    const name = spec.flag.slice(2);
    const description = `-d '${quote(spec.description)}'`;
    const arg = {
      file: "-r -F",
      // -x means the value is required and files are not offered, so only the listed choices show.
      directory: "-x -a '(__fish_complete_directories)'",
      "writable-sources": `-x -a '${writable}'`,
      resolution: `-x -a '${resolutions}'`,
      shell: `-x -a '${COMPLETION_SHELLS.join(" ")}'`,
      text: "-x",
      flag: "",
    }[spec.kind];
    return `complete -c spoolsync -l ${name} ${arg} ${description}`.replace(/ {2,}/g, " ");
  });
  return `# fish completion for spoolsync. Save as ~/.config/fish/completions/spoolsync.fish, or run:
#   spoolsync --completion fish | source
${lines.join("\n")}
`;
}

/** The completion script for a shell. */
export function completionScript(shell: CompletionShell): string {
  return { bash, zsh, fish }[shell]();
}

export function isCompletionShell(value: string): value is CompletionShell {
  return (COMPLETION_SHELLS as readonly string[]).includes(value);
}
