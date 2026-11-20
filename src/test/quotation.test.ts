import { describe, expect, it } from "vitest";
import { getCatalog } from "@/shared/catalog";
import { CostCalculator, type ItemSpec } from "@/shared/costing";
import { extractMentions, isNo, isYes, parseDimensions, parsePhone, parseQuantity } from "@/shared/question-workflow";

const catalog = getCatalog();

describe("customer order understanding", () => {
  it.each([
    ["product_type", "عايز دولاب للأوضة", "wardrobe"],
    ["product_type", "I need a dining table", "dining_table"],
    ["product_type", "وحدة تلفزيون", "tv_unit"],
    ["wood", "خشب أرو لو سمحت", "oak"],
    ["wood", "MDF", "mdf"],
    ["finish", "دوكو", "lacquer"],
    ["color", "أبيض", "white"],
    ["city", "التوصيل التجمع", "Cairo"],
    ["city", "alex", "Alexandria"],
  ] as const)("matches %s from %s", (field, text, key) => {
    expect(catalog.find(field, text)?.key).toBe(key);
  });

  it.each([
    ["200x60x220", [200, 60, 220]],
    ["٢٠٠×٦٠×٢٢٠", [200, 60, 220]],
    ["2 x 0.6 x 2.2 متر", [200, 60, 220]],
    ["عرض 180 عمق 90 ارتفاع 75", [180, 90, 75]],
    ["width 140, depth 70, height 75", [140, 70, 75]],
    ["200 في 100 في 75", [200, 100, 75]],
  ])("reads dimensions from %s", (text, dims) => {
    const v = parseDimensions(text);
    expect([v.width_cm, v.depth_cm, v.height_cm]).toEqual(dims);
  });

  it("standard wardrobe size is 200×60×220", () => {
    const v = parseDimensions("مقاس عادي", catalog, "wardrobe");
    expect([v.width_cm, v.depth_cm, v.height_cm]).toEqual([200, 60, 220]);
  });

  it("reads quantities but never mistakes dimensions for a quantity", () => {
    expect(parseQuantity("عايز 3 قطع")).toEqual({ quantity: 3 });
    expect(parseQuantity("quantity: 4")).toEqual({ quantity: 4 });
    expect(parseQuantity("2", true)).toEqual({ quantity: 2 });
    expect(parseQuantity("اتنين", true)).toEqual({ quantity: 2 });
    expect(parseQuantity("200x60x220")).toEqual({});
    expect(extractMentions("عايز 2 دولاب", catalog).quantity).toBe(2);
  });

  it("normalises Egyptian phone numbers", () => {
    expect(parsePhone("موبايلي ٠١٠١٢٣٤٥٦٧٨")).toEqual({ customer_phone: "01012345678" });
    expect(parsePhone("+20 112 345 6789")).toEqual({ customer_phone: "01123456789" });
    expect(parsePhone("12345")).toEqual({});
  });

  it("understands yes / no", () => {
    expect(isYes("نعم أكد") && isYes("ok") && !isYes("لا")).toBe(true);
    expect(isNo("لا شكرا") && !isNo("لازم")).toBe(true);
  });

  it("uses an ambiguous word only for the question being asked", () => {
    expect("color" in extractMentions("طبيعي", catalog, "finish")).toBe(false);
    expect(extractMentions("طبيعي", catalog, "color").color).toBe("natural");
  });
});

describe("quotation price", () => {
  it("prices 2 white lacquered oak wardrobes delivered to Cairo", () => {
    const q = new CostCalculator(catalog).quote({
      product_type: "wardrobe", width_cm: 200, depth_cm: 60, height_cm: 220, wood: "oak",
      finish: "lacquer", color: "white", quantity: 2, city: "Cairo",
    } as ItemSpec, new Date("2026-01-01T00:00:00Z"));
    expect(q.unit_price).toBe(44070);
    expect(q.subtotal).toBe(88140);
    expect(q.delivery_cost).toBe(750);
    expect(q.vat_amount).toBe(12444.6);
    expect(q.total).toBe(101334.6);
    expect(q.estimated_delivery_date).toBe("2026-01-26");
  });

  it("a wider bed costs more", () => {
    const calc = new CostCalculator(catalog);
    const base = { product_type: "bed", wood: "beech", finish: "natural", color: "natural", quantity: 1,
      city: "Giza", depth_cm: 210, height_cm: 110 };
    expect(calc.quote({ ...base, width_cm: 200 } as ItemSpec).unit_price)
      .toBeGreaterThan(calc.quote({ ...base, width_cm: 160 } as ItemSpec).unit_price);
  });
});
