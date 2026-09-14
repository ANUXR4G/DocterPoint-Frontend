/** Parse fetch body as JSON; return fallback when the server sent HTML/empty. */
export async function readJson<T = unknown>(
  response: Response,
  fallback?: T,
): Promise<T> {
  const text = await response.text()
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    if (fallback !== undefined) return fallback
    throw new Error(
      response.ok
        ? "Empty or non-JSON response from API"
        : `API error ${response.status}: non-JSON response`,
    )
  }
  try {
    return JSON.parse(trimmed) as T
  } catch {
    if (fallback !== undefined) return fallback
    throw new Error("Invalid JSON from API")
  }
}
