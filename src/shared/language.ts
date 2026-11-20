/** Arabic / English text helpers (port of app/ai/language.py). Browser and server safe. */
const ARABIC = /[\u0600-\u06FF]/g;
const LATIN = /[A-Za-z]/g;
const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;
const DIGITS: Record<string, string> = {};
"٠١٢٣٤٥٦٧٨٩".split("").forEach((d, i) => (DIGITS[d] = String(i)));
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((d, i) => (DIGITS[d] = String(i)));

export type Language = "ar" | "en";

export function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text || "");
}

/** 'ar' if Arabic letters dominate, else 'en'. */
export function detectLanguage(text: string): Language {
  const arabic = (text || "").match(ARABIC)?.length ?? 0;
  const latin = (text || "").match(LATIN)?.length ?? 0;
  return arabic && arabic >= latin * 0.3 ? "ar" : "en";
}

export function toWesternDigits(text: string): string {
  return (text || "")
    .replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d] ?? d)
    .replace(/٫/g, ".")
    .replace(/،/g, ",");
}

/** Lower-case, Western digits, unified Arabic letters, no diacritics. */
export function normalize(text: string): string {
  let value = toWesternDigits(text).toLowerCase();
  value = value.replace(DIACRITICS, "");
  value = value.replace(/[إأآا]/g, "ا");
  value = value.replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  return value.replace(/\s+/g, " ").trim();
}

export function containsAny(text: string, words: readonly string[]): boolean {
  const clean = normalize(text);
  return words.some((word) => clean.includes(normalize(word)));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Unicode-aware "not a word character" used instead of \b (JS \b is ASCII only). */
export const W = "[\\p{L}\\p{N}_]";
