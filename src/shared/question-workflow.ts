/** Deterministic parsing of customer answers (port of question_workflow.py). */
import type { Catalog, OptionField } from "./catalog";
import { W, escapeRegExp, normalize, toWesternDigits } from "./language";
import { validateItem } from "./costing";

export const FIELDS = [
  "product_type", "dimensions", "wood", "finish", "color", "quantity", "city", "customer_name", "customer_phone",
] as const;
export type Field = (typeof FIELDS)[number];
export const OPTION_FIELDS: OptionField[] = ["product_type", "wood", "finish", "color", "city"];

export type Collected = Record<string, string | number>;

const NUMBER = "(\\d+(?:\\.\\d+)?)";
const SEP = "\\s*(?:x|×|\\*|في|ف)\\s*";
const DIMENSION_TRIPLE = new RegExp(NUMBER + SEP + NUMBER + SEP + NUMBER, "u");
const LABELS: Record<string, string> = {
  width_cm: "(?:العرض|عرض|الطول|طول|width|length)",
  depth_cm: "(?:العمق|عمق|depth)",
  height_cm: "(?:الارتفاع|ارتفاع|height)",
};
const PHONE = /(?:\+?20|0)?(1[0125]\d{8})/;
const COUNT_BEFORE_WORD = new RegExp(
  `(\\d+)\\s*(?:قطعه|قطع|حته|حتت|وحده|وحدات|pieces?|pcs|units?|items?)(?!${W})`, "u");
const COUNT_AFTER_WORD = new RegExp(`(?:العدد|عدد|الكميه|كميه|quantity|qty)\\s*:?\\s*(\\d+)(?!${W})`, "u");
const WORD_NUMBERS: Record<string, number> = {
  واحد: 1, واحده: 1, اتنين: 2, اثنين: 2, اثنان: 2, تلاته: 3, ثلاثه: 3, اربعه: 4, خمسه: 5,
  سته: 6, سبعه: 7, تمانيه: 8, ثمانيه: 8, تسعه: 9, عشره: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const DEFAULT_WORDS = ["مقاس عادي", "المقاس العادي", "مقاس قياسي", "القياسي", "standard", "default", "عادي"];
export const YES_WORDS = ["نعم", "ايوه", "أيوه", "اه", "آه", "تمام", "موافق", "اكيد", "أكيد", "ماشي", "اوك", "yes", "yeah", "ok",
  "okay", "sure", "confirm", "approve", "approved", "agree"];
export const NO_WORDS = ["لا", "مش موافق", "no", "nope", "cancel", "change", "غير", "تعديل", "عدل"];
const NAME_PREFIX = /^(?:اسمي|انا اسمي|أنا اسمي|انا|أنا|الاسم|my name is|i am|i'm|name)\s*:?\s*/i;

/** Values under 10 are metres (e.g. 2.2 -> 220 cm). */
function toCm(value: number): number {
  return value < 10 ? Math.round(value * 100 * 10) / 10 : Math.round(value * 10) / 10;
}

export function parseDimensions(text: string, catalog?: Catalog, productType?: string | null): Collected {
  const clean = normalize(text);
  if (catalog && productType && DEFAULT_WORDS.some((w) => clean.includes(normalize(w)))) {
    const [w, d, h] = catalog.product(productType).default_dims;
    return { width_cm: w, depth_cm: d, height_cm: h };
  }
  const match = DIMENSION_TRIPLE.exec(clean);
  if (match) {
    return { width_cm: toCm(Number(match[1])), depth_cm: toCm(Number(match[2])), height_cm: toCm(Number(match[3])) };
  }
  const values: Collected = {};
  for (const [key, label] of Object.entries(LABELS)) {
    const found = new RegExp(label + "\\s*:?\\s*(?:=\\s*)?" + NUMBER, "u").exec(clean);
    if (found) values[key] = toCm(Number(found[1]));
  }
  return values;
}

export function parseQuantity(text: string, bareNumber = false): Collected {
  const clean = normalize(text);
  for (const pattern of [COUNT_BEFORE_WORD, COUNT_AFTER_WORD]) {
    const match = pattern.exec(clean);
    if (match) return { quantity: Number.parseInt(match[1], 10) };
  }
  if (bareNumber) {
    const match = /^\s*(\d+)\s*$/.exec(clean);
    if (match) return { quantity: Number.parseInt(match[1], 10) };
    for (const [word, value] of Object.entries(WORD_NUMBERS)) {
      if (new RegExp(`(?:^|\\s)${word}(?:$|\\s)`, "u").test(clean)) return { quantity: value };
    }
  }
  return {};
}

export function parsePhone(text: string): Collected {
  const match = PHONE.exec(toWesternDigits(text).replace(/[ -]/g, ""));
  return match ? { customer_phone: "0" + match[1] } : {};
}

export function parseName(text: string): Collected {
  const name = text.trim().replace(NAME_PREFIX, "").trim().replace(/^[ .،,]+|[ .،,]+$/g, "");
  if (name.length >= 2 && name.length <= 60 && !/\d/.test(name)) return { customer_name: name };
  return {};
}

function hasWord(text: string, words: string[]): boolean {
  const clean = normalize(text);
  return words.some((w) => new RegExp(`(?:^|\\s)${escapeRegExp(normalize(w))}(?:$|\\s|[.!،,])`, "u").test(clean));
}
export const isYes = (text: string) => hasWord(text, YES_WORDS);
export const isNo = (text: string) => hasWord(text, NO_WORDS);

/** Every order detail found in a free-text message. */
export function extractMentions(text: string, catalog: Catalog, awaiting: string | null = null,
                                productType: string | null = null): Collected {
  const values: Collected = {};
  const matches = Object.fromEntries(OPTION_FIELDS.map((f) => [f, catalog.find(f, text)])) as Record<
    OptionField, ReturnType<Catalog["find"]>>;
  for (const field of OPTION_FIELDS) {
    const match = matches[field];
    if (!match) continue;
    const shared = OPTION_FIELDS.filter(
      (other) => other !== field && matches[other] && normalize(matches[other]!.synonym) === normalize(match.synonym));
    if (shared.length && awaiting !== field) continue; // "natural" is both a finish and a colour
    values[field] = match.key;
  }
  Object.assign(values, parseDimensions(text, catalog, productType ?? (values.product_type as string | undefined) ?? null));
  Object.assign(values, parseQuantity(text, awaiting === "quantity"));
  const productMatch = matches.product_type;
  if (!("quantity" in values) && productMatch) {
    const count = new RegExp(`(\\d+)\\s*${escapeRegExp(normalize(productMatch.synonym))}`, "u").exec(normalize(text));
    if (count && Number(count[1]) <= 50) values.quantity = Number(count[1]);
  }
  Object.assign(values, parsePhone(text));
  if (awaiting === "customer_name" && !("customer_phone" in values)) Object.assign(values, parseName(text));
  return values;
}

export function missingFields(data: Collected): Field[] {
  const missing: Field[] = [];
  for (const name of FIELDS) {
    if (name === "dimensions") {
      if (!["width_cm", "depth_cm", "height_cm"].every((k) => data[k])) missing.push(name);
    } else if (!data[name]) {
      missing.push(name);
    }
  }
  return missing;
}

export function validate(data: Collected, catalog: Catalog): Record<string, string> {
  return validateItem(data as never, catalog);
}
