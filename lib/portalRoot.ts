/**
 * Modal portal target: the dashboard shell (keeps `.dark .dashboard-app` theming).
 * A streamed-but-not-yet-revealed copy of the shell can sit hidden before the
 * live one, so prefer the visible shell.
 */
export function dashboardPortalRoot(): HTMLElement {
  const roots = [...document.querySelectorAll<HTMLElement>(".dashboard-app")]
  return (
    roots.find((el) => el.getClientRects().length > 0) ??
    roots[roots.length - 1] ??
    document.body
  )
}
