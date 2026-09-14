/**
 * Regression for audit F2: empty-state recovery actions.
 * Run: npm run test:empty-state  (from frontend/)
 */
import {
  applyPracticesRecovery,
  practicesEmptyActions,
  practicesEmptyHint,
  practicesFieldClearAction,
} from "./practicesEmptyState"

const searchOnly = practicesEmptyActions({ q: "zzzzzz", city: "" })
if (!searchOnly.showClearSearch || searchOnly.showClearArea) {
  throw new Error("search-only must show Clear search, not Clear area")
}
if (searchOnly.primaryAction !== "clear-search") {
  throw new Error("search-only primary must be clear-search")
}
if (practicesFieldClearAction({ q: "zzzzzz", city: "" }) !== "clear-search") {
  throw new Error("field Clear with search-only must clear-search")
}
if (!practicesEmptyHint({ q: "zzzzzz", city: "" }).includes("Clear search")) {
  throw new Error("search-only hint must mention Clear search")
}

const afterSearch = applyPracticesRecovery("clear-search", {
  q: "zzzzzz",
  city: "",
})
if (afterSearch.q !== "" || afterSearch.city !== "") {
  throw new Error("clear-search must clear q")
}

const areaOnly = practicesEmptyActions({ q: "", city: "Gulshan" })
if (areaOnly.showClearSearch || !areaOnly.showClearArea) {
  throw new Error("area-only must show Clear area only")
}
if (practicesFieldClearAction({ q: "", city: "Gulshan" }) !== "clear-area") {
  throw new Error("field Clear with area-only must clear-area")
}
const afterArea = applyPracticesRecovery("clear-area", {
  q: "",
  city: "Gulshan",
})
if (afterArea.city !== "" || afterArea.q !== "") {
  throw new Error("clear-area must clear city")
}

const both = practicesEmptyActions({ q: "zzzzzz", city: "Gulshan" })
if (!both.showClearSearch || !both.showClearArea || !both.showBrowseAll) {
  throw new Error("both filters must expose search + area recovery")
}
if (both.primaryAction !== "clear-search") {
  throw new Error("with unmatched search, primary recovery is clear-search")
}
const afterAreaWithSearch = applyPracticesRecovery("clear-area", {
  q: "zzzzzz",
  city: "Gulshan",
})
if (afterAreaWithSearch.q !== "zzzzzz" || afterAreaWithSearch.city !== "") {
  throw new Error("clear-area must only clear city, not search")
}
if (practicesFieldClearAction({ q: "zzzzzz", city: "Gulshan" }) !== "browse-all") {
  throw new Error("field Clear with both filters must browse-all")
}

const browse = applyPracticesRecovery("browse-all", {
  q: "zzzzzz",
  city: "Gulshan",
})
if (browse.q !== "" || browse.city !== "") {
  throw new Error("browse-all must clear q and city")
}

const toolbarOnly = practicesEmptyActions({
  q: "",
  city: "",
  view: "solo",
  feeMax: "500",
})
if (toolbarOnly.showClearSearch || toolbarOnly.showClearArea) {
  throw new Error("toolbar-only empty must not show Clear area/search")
}
if (!toolbarOnly.showClearToolbar || toolbarOnly.primaryAction !== "browse-all") {
  throw new Error("toolbar-only empty must offer browse-all recovery")
}

console.log("ok: practices empty-state recovery actions")
