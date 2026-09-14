/** Turn backend upload paths into absolute URLs for Next/Image and <img>. */
export function resolveUploadUrl(src?: string | null): string {
  if (!src) return ""
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return src
  }

  const api = process.env.NEXT_PUBLIC_API || "http://127.0.0.1:3001/api/v1"
  const origin = api.replace(/\/api\/v1\/?$/, "")
  return `${origin}${src.startsWith("/") ? src : `/${src}`}`
}
