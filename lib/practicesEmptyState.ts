/** Pure helpers for Find Care empty-state recovery (audit F2). */

export type PracticesRecoveryAction =
  | "clear-search"
  | "clear-area"
  | "browse-all"

export type PracticesEmptyActions = {
  showClearSearch: boolean
  showClearArea: boolean
  showClearToolbar: boolean
  showBrowseAll: boolean
  /** Preferred one-click recovery for the empty state. */
  primaryAction: PracticesRecoveryAction | null
}

export type PracticesEmptyInput = {
  q: string
  city: string
  specialty?: string
  view?: "all" | "solo" | "clinic"
  feeMax?: string
}

function hasSearch(q: string) {
  return Boolean(q.trim())
}

function hasArea(city: string) {
  return Boolean(city.trim())
}

function hasToolbarFilters(input: PracticesEmptyInput) {
  return (
    (input.specialty && input.specialty !== "All") ||
    (input.view && input.view !== "all") ||
    Boolean(input.feeMax)
  )
}

export function practicesEmptyActions(
  input: PracticesEmptyInput,
): PracticesEmptyActions {
  const hasQ = hasSearch(input.q)
  const hasCity = hasArea(input.city)
  const toolbar = hasToolbarFilters(input)

  if (!hasQ && !hasCity && !toolbar) {
    return {
      showClearSearch: false,
      showClearArea: false,
      showClearToolbar: false,
      showBrowseAll: false,
      primaryAction: null,
    }
  }

  if (hasQ && !hasCity) {
    return {
      showClearSearch: true,
      showClearArea: false,
      showClearToolbar: toolbar,
      showBrowseAll: true,
      primaryAction: "clear-search",
    }
  }

  if (!hasQ && hasCity) {
    return {
      showClearSearch: false,
      showClearArea: true,
      showClearToolbar: toolbar,
      showBrowseAll: true,
      primaryAction: "clear-area",
    }
  }

  if (hasQ && hasCity) {
    return {
      showClearSearch: true,
      showClearArea: true,
      showClearToolbar: toolbar,
      showBrowseAll: true,
      primaryAction: "clear-search",
    }
  }

  // Toolbar-only empty (e.g. Clinics tab or fee cap hides the only listing)
  return {
    showClearSearch: false,
    showClearArea: false,
    showClearToolbar: true,
    showBrowseAll: true,
    primaryAction: "browse-all",
  }
}

export function applyPracticesRecovery(
  action: PracticesRecoveryAction,
  state: { q: string; city: string },
): { q: string; city: string } {
  switch (action) {
    case "clear-search":
      return { q: "", city: state.city }
    case "clear-area":
      return { q: state.q, city: "" }
    case "browse-all":
      return { q: "", city: "" }
  }
}

export function practicesEmptyHint(input: PracticesEmptyInput): string {
  const actions = practicesEmptyActions(input)
  if (actions.primaryAction === "clear-search") {
    return "No match for that search. Use Clear search to see all clinics."
  }
  if (actions.primaryAction === "clear-area") {
    return "No clinics in that area. Use Clear area or Browse all."
  }
  if (actions.showClearToolbar) {
    return "Toolbar filters are hiding results. Clear filters or Browse all."
  }
  return "Try another city, specialty, or clear filters."
}

/** Inline “Clear” in the search bar — must match the active filters. */
export function practicesFieldClearAction(
  input: PracticesEmptyInput,
): PracticesRecoveryAction {
  const hasQ = hasSearch(input.q)
  const hasCity = hasArea(input.city)
  if (hasQ && !hasCity) return "clear-search"
  if (!hasQ && hasCity) return "clear-area"
  return "browse-all"
}
