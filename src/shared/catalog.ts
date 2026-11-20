/** Product catalogue (port of app/customer_services/costing.py Catalog). Browser and server safe. */
import data from "./product_catalog.json";
import { W, escapeRegExp, normalize, type Language } from "./language";

export type OptionField = "product_type" | "wood" | "finish" | "color" | "city";
export type CatalogOption = {
  name_ar?: string;
  name_en?: string;
  synonyms?: string[];
  [key: string]: unknown;
};
export type ProductInfo = CatalogOption & {
  base_price: number;
  default_dims: [number, number, number];
  min_dims: [number, number, number];
  max_dims: [number, number, number];
  production_days: number;
};
export type CatalogData = typeof data;
export type Match = { key: string; synonym: string };

const KINDS = { product_type: "product_types", wood: "woods", finish: "finishes", color: "colors" } as const;

export class Catalog {
  readonly data: CatalogData;
  readonly currency: string;
  readonly vatPct: number;
  readonly cities: Record<string, CatalogOption & { base: number; per_extra_unit: number; days: number }>;

  constructor(raw: CatalogData = data) {
    this.data = raw;
    this.currency = raw.currency ?? "EGP";
    this.vatPct = Number(raw.vat_pct ?? 14);
    this.cities = raw.delivery.cities as Catalog["cities"];
  }

  options(field: OptionField): Record<string, CatalogOption> {
    if (field === "city") return this.cities;
    return this.data[KINDS[field]] as unknown as Record<string, CatalogOption>;
  }

  /** Best option whose name or synonym appears in the text (longest match wins). */
  find(field: OptionField, text: string): Match | null {
    const clean = ` ${normalize(text)} `;
    let best: Match | null = null;
    for (const [key, option] of Object.entries(this.options(field))) {
      const names = [key, option.name_en ?? "", option.name_ar ?? "", ...(option.synonyms ?? [])];
      for (const name of names.filter(Boolean)) {
        const word = normalize(name);
        if (!word) continue;
        const found =
          word.length > 3
            ? clean.includes(word)
            : new RegExp(`(?<!${W})(?:ال|بال|وال|لل|ب)?${escapeRegExp(word)}(?!${W})`, "u").test(clean);
        if (found && (best === null || word.length > normalize(best.synonym).length)) {
          best = { key, synonym: name };
        }
      }
    }
    return best;
  }

  label(field: OptionField, key: string, language: Language): string {
    const option = this.options(field)[key] ?? {};
    if (field === "city") return language === "ar" ? (option.name_ar ?? key) : key;
    return (language === "ar" ? option.name_ar : option.name_en) || option.name_en || key;
  }

  choices(field: OptionField, language: Language): string[] {
    return Object.keys(this.options(field)).map((key) => this.label(field, key, language));
  }

  product(key: string): ProductInfo {
    const product = (this.data.product_types as unknown as Record<string, ProductInfo>)[key];
    if (!product) throw new Error(`Unknown product type: ${key}`);
    return product;
  }

  delivery(city: string | null | undefined): { base: number; per_extra_unit: number; days: number } {
    return this.cities[city ?? ""] ?? this.data.delivery.other;
  }
}

let cached: Catalog | null = null;
export function getCatalog(): Catalog {
  cached ??= new Catalog();
  return cached;
}
