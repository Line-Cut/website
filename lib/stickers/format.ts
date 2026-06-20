/**
 * Format a money amount (in minor units / agorot) to a locale-aware string.
 *
 * Uses `Intl.NumberFormat` with `he-IL` for Hebrew, `en-IL` for English,
 * so the currency symbol and digit grouping follow local conventions.
 *
 * @param minorUnits - amount in minor units (e.g. agorot for ILS)
 * @param currency   - ISO 4217 currency code (e.g. "ILS")
 * @param locale     - "he" for Hebrew UI, "en" for English UI
 */
export function formatMoney(
  minorUnits: number,
  currency: string,
  locale: "he" | "en",
): string {
  const bcp47 = locale === "he" ? "he-IL" : "en-IL";
  return new Intl.NumberFormat(bcp47, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/**
 * Replace `{name}` placeholders in `template` with values from `vars`.
 * Unknown placeholders (no matching key) are left as-is.
 * Number values are coerced to strings.
 *
 * @example
 *   interpolate("{n}/{max} left", { n: 3, max: 200 }) // "3/200 left"
 *   interpolate("hi {x}", {})                         // "hi {x}"
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key]);
    }
    return match;
  });
}
