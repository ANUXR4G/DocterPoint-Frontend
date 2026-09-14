export function isAdminNavActive(pathname: string, dest?: string | null) {
  if (!dest || dest === "#") return false
  if (pathname === dest) return true
  return pathname.startsWith(`${dest}/`)
}
