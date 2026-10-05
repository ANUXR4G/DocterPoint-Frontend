/** Common dial codes for patient WhatsApp OTP login. India is default. */
export type CountryDial = {
  iso: string;
  name: string;
  dial: string; // digits only, e.g. "91"
};

export const DEFAULT_COUNTRY: CountryDial = {
  iso: "IN",
  name: "India",
  dial: "91",
};

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
  if (a.iso === "IN") return -1;
  if (b.iso === "IN") return 1;
  return a.name.localeCompare(b.name);
});

export function countryLabel(c: CountryDial): string {
  return `+${c.dial} ${c.name}`;
}

/**
 * Build the phone string for `/auth/otp/*`.
 * India (+91) keeps bare 10 digits for legacy OTP storage; others send full MSISDN.
 */
export function composeLoginPhone(country: CountryDial, national: string): string {
  const cc = country.dial.replace(/\D/g, "");
  let nat = String(national || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!nat) return "";
  // User pasted dial+number into the national field.
  if (nat.startsWith(cc) && nat.length >= cc.length + 7) {
    if (cc === "91" && nat.length === 12) return nat.slice(2);
    return nat;
  }
  if (cc === "91" && nat.length === 10) return nat;
  return `${cc}${nat}`;
}

export function nationalDigitsReady(national: string): boolean {
  const n = String(national || "").replace(/\D/g, "").replace(/^0+/, "");
  return n.length >= 7;
}
