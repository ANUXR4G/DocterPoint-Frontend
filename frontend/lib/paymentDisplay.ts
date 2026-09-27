export const PAYMENT_STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  PAID: {
    label: "Paid",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  PENDING: {
    label: "Payment pending",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
  },
  DECLINED: {
    label: "Pay at clinic",
    className:
      "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200",
  },
  EXPIRED: {
    label: "Link expired",
    className:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
  },
  CANCELLED: {
    label: "Link cancelled",
    className:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
  },
}

export const PAYMENT_NOT_REQUESTED = {
  label: "Not requested",
  className:
    "border-neutral-300 bg-white text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300",
}

export function paymentStatusStyle(status: string | null | undefined) {
  return (status && PAYMENT_STATUS_STYLES[status]) || PAYMENT_NOT_REQUESTED
}

/** Paise → "₹1,500" / "₹499.50". */
export function formatRupees(paise: number | null | undefined): string {
  if (paise == null) return "—"
  const r = paise / 100
  return `₹${
    Number.isInteger(r)
      ? r.toLocaleString("en-IN")
      : r.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  }`
}

export const PAYMENT_KIND_LABEL: Record<string, string> = {
  ADVANCE: "Advance",
  CONSULTATION: "Consultation",
  CUSTOM: "Custom",
}
