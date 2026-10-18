/** Extract the complete documentary test contract without interpreting its content. */
export function documentAnnex(text: string, marker: string): string {
  const normalized = text.replaceAll("\r\n", "\n");
  const offset = normalized.indexOf(marker);
  if (offset < 0) throw new Error("document annex marker is missing");
  return normalized.slice(offset);
}
