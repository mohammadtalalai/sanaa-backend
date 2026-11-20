/** Monthly time-series helpers + Ridge forecasting (port of feature_engineering.py and forecasting.py). */
export type Series = { months: string[]; values: number[] }; // months as YYYY-MM-01

export const monthKey = (value: unknown) => `${String(value).slice(0, 7)}-01`;
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
/** The reference month is partial, so the last complete month is the one before it. */
export const lastCompleteMonth = (referenceDate: string) => addMonths(monthStart(referenceDate), -1);

/** Continuous monthly series (missing months = 0), optionally cut at `until` (inclusive). */
export function monthlySeries(rows: Record<string, unknown>[], dateColumn: string, valueColumn: string, until?: string): Series {
  if (!rows.length) return { months: [], values: [] };
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(row[dateColumn]);
    sums.set(key, (sums.get(key) ?? 0) + Number(row[valueColumn] ?? 0));
  }
  const keys = [...sums.keys()].sort();
  const end = until ?? keys[keys.length - 1]!;
  const months: string[] = [];
  const values: number[] = [];
  for (let m = keys[0]!; m <= end; m = addMonths(m, 1)) {
    months.push(m);
    values.push(sums.get(m) ?? 0);
  }
  return { months, values };
}

export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0 || Number.isNaN(previous)) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100 * 100) / 100;
}

/** Sum of `value` in the last `months` complete months vs the `months` before, per `key`. */
export function recentVsPrevious(rows: Record<string, unknown>[], key: string, value: string, until: string, months = 3) {
  const recentStart = addMonths(until, -(months - 1));
  const previousStart = addMonths(recentStart, -months);
  const recent = new Map<string, number>(), previous = new Map<string, number>();
  for (const row of rows) {
    const date = monthKey(row["sale_month"] ?? row["month_start"]);
    const k = String(row[key]);
    const v = Number(row[value] ?? 0);
    if (date >= recentStart && date <= until) recent.set(k, (recent.get(k) ?? 0) + v);
    else if (date >= previousStart && date < recentStart) previous.set(k, (previous.get(k) ?? 0) + v);
  }
  const keys = [...new Set([...recent.keys(), ...previous.keys()])].sort();
  return keys.map((k) => {
    const r = recent.get(k) ?? 0, p = previous.get(k) ?? 0;
    return { key: k, recent: r, previous: p, growth_pct: pctChange(r, p) };
  });
}

// ---------------- features + Ridge ----------------
export const FEATURE_COLUMNS = ["lag_1", "lag_2", "lag_3", "rolling_3", "month_sin", "month_cos", "t"] as const;

/** Lags, rolling mean, seasonality and trend for each month. NaN where history is missing. */
export function buildFeatures(months: string[], values: number[]): { x: number[][]; y: number[] } {
  const x: number[][] = [];
  for (let i = 0; i < months.length; i++) {
    const lag = (k: number) => (i - k >= 0 ? values[i - k]! : Number.NaN);
    const rolling = i >= 3 ? (values[i - 1]! + values[i - 2]! + values[i - 3]!) / 3 : Number.NaN;
    const month = Number(months[i]!.slice(5, 7));
    x.push([lag(1), lag(2), lag(3), rolling, Math.sin((2 * Math.PI * month) / 12), Math.cos((2 * Math.PI * month) / 12), i]);
  }
  return { x, y: values };
}

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / p;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
      m[r]![col] = 0;
    }
  }
  return m.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/** StandardScaler + Ridge(alpha=1) — same pipeline as the Python model. */
export class RidgeModel {
  mean: number[] = [];
  scale: number[] = [];
  coef: number[] = [];
  intercept = 0;
  constructor(readonly alpha = 1) {}

  fit(x: number[][], y: number[]): this {
    const n = x.length, k = x[0]!.length;
    this.mean = Array.from({ length: k }, (_, j) => x.reduce((s, r) => s + r[j]!, 0) / n);
    this.scale = Array.from({ length: k }, (_, j) => {
      const sd = Math.sqrt(x.reduce((s, r) => s + (r[j]! - this.mean[j]!) ** 2, 0) / n);
      return sd > 1e-12 ? sd : 1;
    });
    const z = x.map((r) => r.map((v, j) => (v - this.mean[j]!) / this.scale[j]!));
    const zMean = Array.from({ length: k }, (_, j) => z.reduce((s, r) => s + r[j]!, 0) / n);
    const yMean = y.reduce((a, b) => a + b, 0) / n;
    const a: number[][] = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) =>
      z.reduce((s, r) => s + (r[i]! - zMean[i]!) * (r[j]! - zMean[j]!), 0) + (i === j ? this.alpha : 0)));
    const b = Array.from({ length: k }, (_, i) => z.reduce((s, r, idx) => s + (r[i]! - zMean[i]!) * (y[idx]! - yMean), 0));
    this.coef = solve(a, b);
    this.intercept = yMean - zMean.reduce((s, m, i) => s + m * this.coef[i]!, 0);
    return this;
  }

  predict(row: number[]): number {
    return this.intercept + row.reduce((s, v, j) => s + ((v - this.mean[j]!) / this.scale[j]!) * this.coef[j]!, 0);
  }
}

export type ForecastResult = {
  target: string;
  model: string;
  history_months: number;
  forecast: { month: string; value: number }[];
  backtest_mae: number | null;
  naive_mae: number | null;
  beats_naive: boolean | null;
};

export const MIN_MONTHS_FOR_MODEL = 12;
const BACKTEST_MONTHS = 3;
const r2 = (v: number) => Math.round(v * 100) / 100;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);

function fit(months: string[], values: number[]): RidgeModel {
  const { x, y } = buildFeatures(months, values);
  const rows: number[][] = [], targets: number[] = [];
  x.forEach((row, i) => { if (row.every((v) => !Number.isNaN(v))) { rows.push(row); targets.push(y[i]!); } });
  return new RidgeModel(1).fit(rows, targets);
}
function nextFeatures(months: string[], values: number[]): number[] {
  const next = addMonths(months[months.length - 1]!, 1);
  const { x } = buildFeatures([...months, next], [...values, Number.NaN]);
  return x[x.length - 1]!;
}

function finish(result: Omit<ForecastResult, "beats_naive">): ForecastResult {
  const beats = result.backtest_mae === null || result.naive_mae === null ? null : result.backtest_mae <= result.naive_mae;
  return { ...result, beats_naive: beats };
}

export function forecast(series: Series, target: string, horizon = 3): ForecastResult {
  const { months, values } = series;
  const level = (v: number[]) => (v.length ? mean(v.slice(-3)) : 0);
  if (values.length < MIN_MONTHS_FOR_MODEL) {
    const start = months[months.length - 1] ?? monthStart(new Date().toISOString());
    return finish({ target, model: "moving_average_3", history_months: values.length,
      forecast: Array.from({ length: horizon }, (_, i) => ({ month: addMonths(start, i + 1), value: r2(level(values)) })),
      backtest_mae: null, naive_mae: null });
  }
  const errors: number[] = [], naive: number[] = [], average: number[] = [];
  for (let cut = values.length - BACKTEST_MONTHS; cut < values.length; cut++) {
    const trainM = months.slice(0, cut), trainV = values.slice(0, cut);
    const model = fit(trainM, trainV);
    const predicted = Math.max(0, model.predict(nextFeatures(trainM, trainV)));
    const actual = values[cut]!;
    errors.push(Math.abs(predicted - actual));
    naive.push(Math.abs(trainV[trainV.length - 1]! - actual));
    average.push(Math.abs(level(trainV) - actual));
  }
  const naiveMae = r2(mean(naive));
  const last = months[months.length - 1]!;
  if (mean(average) < mean(errors)) {
    const lvl = r2(level(values));
    return finish({ target, model: "moving_average_3", history_months: values.length,
      forecast: Array.from({ length: horizon }, (_, i) => ({ month: addMonths(last, i + 1), value: lvl })),
      backtest_mae: r2(mean(average)), naive_mae: naiveMae });
  }
  const model = fit(months, values);
  const m = [...months], v = [...values];
  const points: { month: string; value: number }[] = [];
  for (let i = 0; i < horizon; i++) {
    const next = addMonths(m[m.length - 1]!, 1);
    const prediction = Math.max(0, model.predict(nextFeatures(m, v)));
    points.push({ month: next, value: r2(prediction) });
    m.push(next); v.push(prediction);
  }
  return finish({ target, model: "ridge_lag_seasonal", history_months: values.length, forecast: points,
    backtest_mae: r2(mean(errors)), naive_mae: naiveMae });
}
