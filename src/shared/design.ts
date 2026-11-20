/** Phase 4: design spec -> 3D parts -> GLB / SVG preview (port of design_generator.py). Browser and server safe. */
import { Catalog, getCatalog } from "./catalog";
import type { ItemSpec } from "./costing";

const T = 1.8; // board thickness (cm)
export const TOLERANCE_CM = 0.5;

export type Part = { name: string; material: string; size_cm: [number, number, number]; center_cm: [number, number, number] };
export type DesignSpec = {
  design_version: number;
  quotation_no: string;
  product_type: string;
  label_ar: string;
  label_en: string;
  dimensions_cm: { width: number; depth: number; height: number };
  wood: { key: string; ar: string; en: string };
  finish: { key: string; ar: string; en: string };
  color: { key: string; ar: string; en: string };
  quantity: number;
  materials: Record<string, string>;
  parts: Part[];
  units: string;
};
export type DimensionCheck = {
  passed: boolean;
  tolerance_cm: number;
  requested_cm: { width: number; depth: number; height: number };
  model_cm: { width: number; height: number; depth: number };
  difference_cm: { width: number; depth: number; height: number };
  on_floor: boolean;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** size = (width x, height y, depth z) in cm; center in cm. Floor is y=0, front is +z. */
function part(name: string, material: string, size: [number, number, number], center: [number, number, number]): Part {
  return { name, material, size_cm: size.map(r2) as Part["size_cm"], center_cm: center.map(r2) as Part["center_cm"] };
}

const pyRound = (v: number) => {
  // Python round(): banker's rounding for .5
  const floor = Math.floor(v);
  const diff = v - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(v);
};

const CORNERS: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

function wardrobe(w: number, d: number, h: number): Part[] {
  const plinth = 8;
  const doors = Math.max(2, pyRound(w / 50));
  const doorW = (w - 2 * T) / doors;
  const parts = [
    part("left side", "body", [T, h, d - 2], [-w / 2 + T / 2, h / 2, -1]),
    part("right side", "body", [T, h, d - 2], [w / 2 - T / 2, h / 2, -1]),
    part("top", "body", [w - 2 * T, T, d - 2], [0, h - T / 2, -1]),
    part("plinth", "body", [w - 2 * T, plinth, d - 4], [0, plinth / 2, -2]),
    part("back", "body", [w - 2 * T, h - T - plinth, 0.8], [0, plinth + (h - T - plinth) / 2, -d / 2 + 0.4]),
  ];
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + T + doorW * (i + 0.5);
    parts.push(part(`door ${i + 1}`, "body", [doorW - 0.4, h - T - plinth - 0.6, T], [x, plinth + (h - T - plinth) / 2, d / 2 - 2 - T / 2]));
    const handleX = x + (doorW / 2 - 4) * (i % 2 === 0 ? 1 : -1);
    parts.push(part(`handle ${i + 1}`, "metal", [1.5, 18, 2], [handleX, h * 0.5, d / 2 - 1]));
  }
  return parts;
}

function bed(w: number, d: number, h: number): Part[] {
  const leg = 10, baseH = 25, mattressH = 22;
  const parts = CORNERS.map(([x, z], i) => part(`leg ${i + 1}`, "body", [6, leg, 6], [x * (w / 2 - 3), leg / 2, z * (d / 2 - 3)]));
  const m = Math.min(mattressH, h - leg - baseH);
  parts.push(
    part("base", "body", [w, baseH, d - 6], [0, leg + baseH / 2, 3]),
    part("headboard", "body", [w, h, 6], [0, h / 2, -d / 2 + 3]),
    part("mattress", "mattress", [w - 4, m, d - 10], [0, leg + baseH + m / 2, 4]),
  );
  return parts;
}

function table(w: number, d: number, h: number, drawer = false): Part[] {
  const top = 4;
  const parts = [part("top", "body", [w, top, d], [0, h - top / 2, 0])];
  CORNERS.forEach(([x, z], i) => parts.push(part(`leg ${i + 1}`, "body", [6, h - top, 6], [x * (w / 2 - 6), (h - top) / 2, z * (d / 2 - 6)])));
  parts.push(part("apron", "body", [w - 18, 8, T], [0, h - top - 4, d / 2 - 6]));
  if (drawer) {
    const dw = Math.min(45, w / 3);
    parts.push(part("drawer", "body", [dw, 15, d - 14], [w / 2 - 6 - dw / 2 - 4, h - top - 7.5, 0]));
  }
  return parts;
}

function sofa(w: number, d: number, h: number): Part[] {
  const arm = 16, leg = 8, baseH = 20, seatH = 16, backD = 20;
  const armH = Math.min(h, 62);
  const parts = CORNERS.map(([x, z], i) => part(`leg ${i + 1}`, "metal", [5, leg, 5], [x * (w / 2 - 6), leg / 2, z * (d / 2 - 6)]));
  parts.push(
    part("base", "body", [w, baseH, d], [0, leg + baseH / 2, 0]),
    part("seat cushion", "fabric", [w - 2 * arm, seatH, d - backD - 2], [0, leg + baseH + seatH / 2, backD / 2 + 1]),
    part("back", "fabric", [w - 2 * arm, h - leg - baseH, backD], [0, leg + baseH + (h - leg - baseH) / 2, -d / 2 + backD / 2]),
    part("left arm", "fabric", [arm, armH - leg, d], [-w / 2 + arm / 2, leg + (armH - leg) / 2, 0]),
    part("right arm", "fabric", [arm, armH - leg, d], [w / 2 - arm / 2, leg + (armH - leg) / 2, 0]),
  );
  return parts;
}

function tvUnit(w: number, d: number, h: number): Part[] {
  const leg = 10;
  const bodyH = h - leg;
  const parts = CORNERS.map(([x, z], i) => part(`leg ${i + 1}`, "metal", [3, leg, 3], [x * (w / 2 - 5), leg / 2, z * (d / 2 - 5)]));
  parts.push(part("carcass", "body", [w, bodyH, d - T], [0, leg + bodyH / 2, -T / 2]));
  const fronts = Math.max(2, pyRound(w / 60));
  const frontW = w / fronts;
  for (let i = 0; i < fronts; i++) {
    const x = -w / 2 + frontW * (i + 0.5);
    parts.push(part(`front ${i + 1}`, "body", [frontW - 0.4, bodyH - 0.6, T], [x, leg + bodyH / 2, d / 2 - T / 2]));
  }
  return parts;
}

function chair(w: number, d: number, h: number): Part[] {
  const seatY = 45, seatT = 4;
  const backH = Math.max(h - seatY - seatT, 10);
  const parts = CORNERS.map(([x, z], i) => part(`leg ${i + 1}`, "body", [4, seatY, 4], [x * (w / 2 - 2), seatY / 2, z * (d / 2 - 2)]));
  parts.push(
    part("seat", "fabric", [w, seatT, d], [0, seatY + seatT / 2, 0]),
    part("back", "body", [w, backH, 3], [0, seatY + seatT + backH / 2, -d / 2 + 1.5]),
  );
  return parts;
}

export const TEMPLATES: Record<string, (w: number, d: number, h: number) => Part[]> = {
  wardrobe, bed, dining_table: (w, d, h) => table(w, d, h), desk: (w, d, h) => table(w, d, h, true),
  sofa, tv_unit: tvUnit, chair,
};

export function resolveMaterials(item: Pick<ItemSpec, "wood" | "color">, catalog: Catalog = getCatalog()): Record<string, string> {
  const woodHex = (catalog.options("wood")[item.wood] as { color_hex: string }).color_hex;
  const colorHex = (catalog.options("color")[item.color] as { color_hex: string | null }).color_hex;
  return { body: colorHex || woodHex, fabric: colorHex || "#CDBFA8", metal: "#8C8C8C", mattress: "#EEEBE4" };
}

export function buildDesignSpec(quotationNo: string, item: ItemSpec, catalog: Catalog = getCatalog()): DesignSpec {
  const w = Number(item.width_cm), d = Number(item.depth_cm), h = Number(item.height_cm);
  const template = TEMPLATES[item.product_type];
  if (!template) throw new Error(`No 3D template for ${item.product_type}`);
  const pair = (field: "wood" | "finish" | "color", key: string) => ({
    key, ar: catalog.label(field, key, "ar"), en: catalog.label(field, key, "en"),
  });
  return {
    design_version: 1,
    quotation_no: quotationNo,
    product_type: item.product_type,
    label_ar: catalog.label("product_type", item.product_type, "ar"),
    label_en: catalog.label("product_type", item.product_type, "en"),
    dimensions_cm: { width: w, depth: d, height: h },
    wood: pair("wood", item.wood),
    finish: pair("finish", item.finish),
    color: pair("color", item.color),
    quantity: Number(item.quantity),
    materials: resolveMaterials(item, catalog),
    parts: template(w, d, h),
    units: "cm (model files are in metres)",
  };
}

export function bounds(parts: Part[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.center_cm[i] - p.size_cm[i] / 2);
      max[i] = Math.max(max[i], p.center_cm[i] + p.size_cm[i] / 2);
    }
  }
  return { min, max };
}

/** Model bounding box (cm) must equal the requested width x depth x height. */
export function verifyDimensions(spec: DesignSpec): DimensionCheck {
  const { min, max } = bounds(spec.parts);
  const model = { width: r2(max[0] - min[0]), height: r2(max[1] - min[1]), depth: r2(max[2] - min[2]) };
  const req = spec.dimensions_cm;
  const difference = { width: r2(model.width - req.width), depth: r2(model.depth - req.depth), height: r2(model.height - req.height) };
  return {
    passed: Object.values(difference).every((v) => Math.abs(v) <= TOLERANCE_CM),
    tolerance_cm: TOLERANCE_CM,
    requested_cm: req,
    model_cm: model,
    difference_cm: difference,
    on_floor: Math.abs(min[1]) <= TOLERANCE_CM,
  };
}

// ---------------- GLB (binary glTF 2.0) ----------------
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
];

function hexToLinear(hex: string): [number, number, number, number] {
  const v = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => Number.parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return [lin[0], lin[1], lin[2], 1];
}

/** One shared unit cube, one node per part (scale + translation in metres). */
export function buildGlb(spec: DesignSpec): Uint8Array {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  FACES.forEach(([n, u, v], f) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let k = 0; k < 3; k++) positions.push(n[k] * 0.5 + (su * u[k] + sv * v[k]) * 0.5);
      normals.push(...n);
    }
    const b = f * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const posBytes = positions.length * 4;
  const normBytes = normals.length * 4;
  const idxBytes = indices.length * 2;
  const binLength = posBytes + normBytes + idxBytes; // 288 + 288 + 72 = 648
  const bin = new ArrayBuffer(binLength);
  const view = new DataView(bin);
  positions.forEach((p, i) => view.setFloat32(i * 4, p, true));
  normals.forEach((p, i) => view.setFloat32(posBytes + i * 4, p, true));
  indices.forEach((p, i) => view.setUint16(posBytes + normBytes + i * 2, p, true));

  const materialKeys = Array.from(new Set(spec.parts.map((p) => p.material)));
  const gltf = {
    asset: { version: "2.0", generator: "SANAA design generator" },
    scene: 0,
    scenes: [{ name: spec.label_en, nodes: spec.parts.map((_, i) => i) }],
    nodes: spec.parts.map((p) => ({
      name: p.name,
      mesh: materialKeys.indexOf(p.material),
      translation: p.center_cm.map((c) => c / 100),
      scale: p.size_cm.map((s) => Math.max(s, 0.01) / 100),
    })),
    meshes: materialKeys.map((m, i) => ({
      name: m,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }],
    })),
    materials: materialKeys.map((m) => ({
      name: m,
      pbrMetallicRoughness: {
        baseColorFactor: hexToLinear(spec.materials[m] ?? "#C9A27A"),
        metallicFactor: m === "metal" ? 0.7 : 0,
        roughnessFactor: m === "metal" ? 0.35 : spec.finish.key === "polyester" ? 0.3 : 0.75,
      },
    })),
    buffers: [{ byteLength: binLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: normBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + normBytes, byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  };
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(json.length + jsonPad);
    padded.set(json);
    padded.fill(0x20, json.length);
    json = padded;
  }
  const total = 12 + 8 + json.length + 8 + binLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // glTF
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(json, 20);
  const binStart = 20 + json.length;
  dv.setUint32(binStart, binLength, true);
  dv.setUint32(binStart + 4, 0x004e4942, true); // BIN
  out.set(new Uint8Array(bin), binStart + 8);
  return out;
}

// ---------------- SVG preview (isometric, painter's algorithm) ----------------
function shade(hex: string, factor: number): string {
  const v = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(Number.parseInt(v.slice(i, i + 2), 16) * factor))));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function renderPreviewSvg(spec: DesignSpec, width = 760, height = 620): string {
  const yaw = (-35 * Math.PI) / 180, pitch = (24 * Math.PI) / 180;
  const project = (x: number, y: number, z: number) => {
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    return [x1, -y2, z2];
  };
  type Poly = { pts: number[][]; depth: number; fill: string };
  const polys: Poly[] = [];
  for (const p of spec.parts) {
    const [sx, sy, sz] = p.size_cm, [cx, cy, cz] = p.center_cm;
    const base = spec.materials[p.material] ?? "#C9A27A";
    FACES.forEach(([n, u, v]) => {
      const rn = project(n[0], n[1], n[2]);
      const origin = project(0, 0, 0);
      if (rn[2] - origin[2] <= 1e-6) return; // back face
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
        const local = [0, 1, 2].map((k) => (n[k] * 0.5 + (su * u[k] + sv * v[k]) * 0.5) * [sx, sy, sz][k] + [cx, cy, cz][k]);
        return project(local[0], local[1], local[2]);
      });
      const factor = n[1] === 1 ? 1.12 : n[0] !== 0 ? 0.8 : 0.96;
      polys.push({ pts: corners, depth: corners.reduce((s, c) => s + c[2], 0) / 4, fill: shade(base, factor) });
    });
  }
  polys.sort((a, b) => a.depth - b.depth);
  const xs = polys.flatMap((p) => p.pts.map((c) => c[0]));
  const ys = polys.flatMap((p) => p.pts.map((c) => c[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 60, titleH = 50;
  const scale = Math.min((width - 2 * pad) / (maxX - minX || 1), (height - 2 * pad - titleH) / (maxY - minY || 1));
  const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = titleH + (height - titleH - (maxY - minY) * scale) / 2 - minY * scale;
  const body = polys
    .map((p) => `<polygon points="${p.pts.map((c) => `${(c[0] * scale + ox).toFixed(1)},${(c[1] * scale + oy).toFixed(1)}`).join(" ")}" fill="${p.fill}" stroke="#3b3b3b" stroke-width="0.6" stroke-linejoin="round"/>`)
    .join("");
  const d = spec.dimensions_cm;
  const title = `${spec.label_en}  ${d.width} × ${d.depth} × ${d.height} cm  |  ${spec.wood.en} / ${spec.finish.en} / ${spec.color.en}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="${width / 2}" y="30" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" fill="#2b2b2b">${escapeXml(title)}</text><ellipse cx="${width / 2}" cy="${(maxY * scale + oy + 6).toFixed(1)}" rx="${((maxX - minX) * scale) / 2.1}" ry="14" fill="#000" opacity="0.07"/>${body}</svg>`;
}

export function viewerHtml(designId: string, spec: DesignSpec, quotationNo: string): string {
  const d = spec.dimensions_cm;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design ${escapeXml(designId)}</title>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f1ec;color:#2b2b2b}
model-viewer{width:100vw;height:80vh;background:#fff} .info{padding:12px 18px}</style></head>
<body><model-viewer src="model.glb" camera-controls auto-rotate shadow-intensity="1" ar alt="3D design"></model-viewer>
<div class="info"><b>${escapeXml(spec.label_ar)} / ${escapeXml(spec.label_en)}</b> &mdash; ${d.width} &times; ${d.depth} &times; ${d.height} cm &mdash;
${escapeXml(spec.wood.en)} / ${escapeXml(spec.finish.en)} / ${escapeXml(spec.color.en)} &mdash; quotation ${escapeXml(quotationNo)}</div></body></html>`;
}
