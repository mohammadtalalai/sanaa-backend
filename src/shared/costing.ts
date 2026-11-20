/** Cost / delivery calculation (port of CostCalculator). unit price = base x size x wood x finish + colour extra. */
import { Catalog, getCatalog } from "./catalog";

export type ItemSpec = {
  product_type: string;
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  wood: string;
  finish: string;
  color: string;
  quantity: number;
  city?: string | null;
};

export type Pricing = {
  currency: string;
  breakdown: {
    base_price: number;
    size_factor: number;
    wood_multiplier: number;
    finish_multiplier: number;
    color_extra: number;
  };
  unit_price: number;
  quantity: number;
  subtotal: number;
  delivery_cost: number;
  vat_pct: number;
  vat_amount: number;
  total: number;
  production_days: number;
  delivery_days: number;
  estimated_delivery_date: string;
};

export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export class CostCalculator {
  constructor(readonly catalog: Catalog = getCatalog()) {}

  sizeFactor(productKey: string, width: number, depth: number, height: number): number {
    const [dw, dd, dh] = this.catalog.product(productKey).default_dims;
    const ratio = (width * depth * height) / (dw * dd * dh);
    return roundTo(0.35 + 0.65 * ratio, 4);
  }

  quote(spec: ItemSpec, today: Date = new Date()): Pricing {
    const catalog = this.catalog;
    const product = catalog.product(spec.product_type);
    const wood = catalog.options("wood")[spec.wood] as { multiplier: number } | undefined;
    const finish = catalog.options("finish")[spec.finish] as { multiplier: number } | undefined;
    const color = catalog.options("color")[spec.color] as { extra: number } | undefined;
    if (!wood || !finish || !color) throw new Error("Unknown wood, finish or colour");
    const quantity = Math.trunc(Number(spec.quantity));
    const size = this.sizeFactor(spec.product_type, spec.width_cm, spec.depth_cm, spec.height_cm);

    const base = Number(product.base_price);
    const unitPrice = roundTo(base * size * wood.multiplier * finish.multiplier + color.extra);
    const subtotal = roundTo(unitPrice * quantity);
    const delivery = catalog.delivery(spec.city);
    const deliveryCost = roundTo(delivery.base + delivery.per_extra_unit * (quantity - 1));
    const vat = roundTo(((subtotal + deliveryCost) * catalog.vatPct) / 100);
    const total = roundTo(subtotal + deliveryCost + vat);

    const productionDays = Number(product.production_days) + Math.max(0, quantity - 1) * 2;
    const deliveryDays = Number(delivery.days);
    return {
      currency: catalog.currency,
      breakdown: {
        base_price: base,
        size_factor: size,
        wood_multiplier: wood.multiplier,
        finish_multiplier: finish.multiplier,
        color_extra: color.extra,
      },
      unit_price: unitPrice,
      quantity,
      subtotal,
      delivery_cost: deliveryCost,
      vat_pct: catalog.vatPct,
      vat_amount: vat,
      total,
      production_days: productionDays,
      delivery_days: deliveryDays,
      estimated_delivery_date: isoDate(addDays(today, productionDays + deliveryDays)),
    };
  }
}

/** Problems with the requested size / quantity (same limits as the chatbot). */
export function validateItem(spec: Partial<ItemSpec>, catalog: Catalog = getCatalog()): Record<string, string> {
  const problems: Record<string, string> = {};
  const product = spec.product_type;
  if (product && spec.width_cm && spec.depth_cm && spec.height_cm) {
    const info = catalog.product(product);
    const keys = ["width_cm", "depth_cm", "height_cm"] as const;
    for (let i = 0; i < keys.length; i++) {
      const low = info.min_dims[i];
      const high = info.max_dims[i];
      const value = Number(spec[keys[i]]);
      if (!(low <= value && value <= high)) {
        problems.dimensions = `${keys[i]}:${low}-${high}`;
        break;
      }
    }
  }
  if (spec.quantity !== undefined && spec.quantity !== null && !(1 <= Number(spec.quantity) && Number(spec.quantity) <= 50)) {
    problems.quantity = "1-50";
  }
  return problems;
}
