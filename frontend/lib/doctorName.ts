/** "Priya Nair", "Dr Priya Nair", "dr. dr. Priya Nair" → "Dr. Priya Nair" (empty when no name). */
export function withDrTitle(name?: string | null): string {
  const bare = String(name ?? "")
    .trim()
    .replace(/^(?:dr\.\s*|dr\s+)+/i, "")
  return bare ? `Dr. ${bare}` : ""
}
