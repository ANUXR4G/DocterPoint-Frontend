/** Dial codes for desk walk-in phones. India is the default. */
export type CountryDial = {
  iso: string
  name: string
  dial: string
}

export const DEFAULT_COUNTRY: CountryDial = {
  iso: "IN",
  name: "India",
  dial: "91",
}

export const COUNTRY_DIALS: CountryDial[] = [
  DEFAULT_COUNTRY,
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "KW", name: "Kuwait", dial: "965" },
  { iso: "BH", name: "Bahrain", dial: "973" },
  { iso: "OM", name: "Oman", dial: "968" },
  { iso: "US", name: "United States", dial: "1" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "NP", name: "Nepal", dial: "977" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "LK", name: "Sri Lanka", dial: "94" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "TH", name: "Thailand", dial: "66" },
  { iso: "NZ", name: "New Zealand", dial: "64" },
  { iso: "IE", name: "Ireland", dial: "353" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "EG", name: "Egypt", dial: "20" },
].sort((a, b) => {
  if (a.iso === "IN") return -1
  if (b.iso === "IN") return 1
  return a.name.localeCompare(b.name)
})

/**
 * Country code + national number, digits only (WhatsApp MSISDN).
 * India is stored as 91 plus 10 digits. A 10-digit Indian mobile that
 * starts with 91 is still a national number, not a country code.
 */
export function composeWhatsAppMsisdn(
  country: CountryDial,
  national: string,
): string | null {
  const cc = country.dial.replace(/\D/g, "")
  const nat = String(national || "").replace(/\D/g, "").replace(/^0+/, "")
  if (!nat) return null

  if (cc === "91") {
    const local = nat.startsWith("91") && nat.length === 12 ? nat.slice(2) : nat
    if (!/^[6-9]\d{9}$/.test(local)) return null
    return `91${local}`
  }

  if (nat.startsWith(cc) && nat.length > cc.length + 6 && nat.length <= 15) {
    return nat
  }
  const full = `${cc}${nat}`
  if (full.length < 10 || full.length > 15) return null
  return full
}
