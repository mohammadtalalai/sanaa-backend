/** Phase 4 design service: quotation -> spec -> files, approval linked to the quotation (port of DesignService). */
import { NotFoundError, UnauthorizedError } from "@/server/core/http";
import { buildDesignSpec, buildGlb, renderPreviewSvg, verifyDimensions, viewerHtml, type DesignSpec } from "@/shared/design";
import type { ItemSpec } from "@/shared/costing";
import { nowIso, tokenUrlsafe, ymd } from "./ids";
import { getDesign, getQuotation, saveDesign, updateDesign, updateQuotation, type Design } from "./repository";

export const FILES = ["model.glb", "preview.svg", "preview.png", "viewer.html", "spec.json"] as const;

export const fileUrls = (designId: string) => {
  const base = `/api/customer/designs/${designId}/files`;
  return { model: `${base}/model.glb`, preview: `${base}/preview.svg`, viewer: `${base}/viewer.html` };
};

/** Stored links are relative; make them absolute for the caller. */
export function withOrigin(design: Design | null, origin: string): Design | null {
  if (!design) return design;
  const files = Object.fromEntries(Object.entries((design["files"] ?? {}) as Record<string, string>)
    .map(([k, v]) => [k, v.startsWith("/") ? origin + v : v]));
  return { ...design, files };
}

export async function createDesign(quotationNo: string, sessionId: string): Promise<Design> {
  const quotation = await getQuotation(quotationNo);
  if (!quotation) throw new NotFoundError("Quotation not found");
  if (quotation.session_id !== sessionId) throw new UnauthorizedError("This quotation belongs to another chat session");
  const spec = buildDesignSpec(quotationNo, quotation["item"] as ItemSpec);
  const check = verifyDimensions(spec);
  if (!check.passed) console.error(`Dimension check failed for ${quotationNo}`, check);
  const designId = `D-${ymd()}-${tokenUrlsafe(9).replace(/-/g, "x").replace(/_/g, "y")}`;
  const design: Design = {
    design_id: designId, quotation_no: quotationNo, session_id: sessionId, spec, files: fileUrls(designId),
    dimension_check: check, status: "pending", feedback: null, created_at: nowIso(), approved_at: null,
  };
  await saveDesign(design);
  await updateQuotation(quotationNo, { design_id: designId });
  return design;
}

export async function getOwnDesign(designId: string, sessionId: string): Promise<Design> {
  const design = await getDesign(designId);
  if (!design) throw new NotFoundError("Design not found");
  if (design.session_id !== sessionId) throw new UnauthorizedError("This design belongs to another chat session");
  return design;
}

export async function decideDesign(designId: string, sessionId: string, approved: boolean, feedback: string | null = null): Promise<Design> {
  const design = await getOwnDesign(designId, sessionId);
  const now = nowIso();
  const status = approved ? "approved" : "changes_requested";
  await updateDesign(designId, { status, feedback, approved_at: approved ? now : null });
  if (approved) await updateQuotation(design.quotation_no, { status: "accepted", accepted_at: now });
  return { ...design, status, feedback, approved_at: approved ? now : null };
}

/** Files are generated on the fly from the stored spec. Public by unguessable design id. */
export async function designFile(designId: string, name: string): Promise<Response> {
  if (!(FILES as readonly string[]).includes(name) || !/^[A-Za-z0-9_-]+$/.test(designId)) throw new NotFoundError("File not found");
  const design = await getDesign(designId);
  if (!design) throw new NotFoundError("File not found");
  const spec = design["spec"] as DesignSpec;
  const cache = { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" };
  if (name === "model.glb") {
    return new Response(buildGlb(spec) as unknown as BodyInit, { headers: { "Content-Type": "model/gltf-binary", ...cache } });
  }
  if (name === "preview.svg" || name === "preview.png") {
    return new Response(renderPreviewSvg(spec), { headers: { "Content-Type": "image/svg+xml", ...cache } });
  }
  if (name === "viewer.html") {
    return new Response(viewerHtml(designId, spec, design.quotation_no), { headers: { "Content-Type": "text/html; charset=utf-8", ...cache } });
  }
  return new Response(JSON.stringify({ ...spec, dimension_check: design["dimension_check"] }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...cache },
  });
}
