/** Strips a leading UTF-8 byte order mark that some editors and exporters add to text files. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
