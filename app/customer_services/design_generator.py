from __future__ import annotations

import datetime as dt
import json
import logging
import secrets
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import settings
from app.core.exceptions import NotFoundError, UnauthorizedError, ValidationFailedError
from app.customer_services.costing import Catalog, get_catalog
from app.customer_services.repository import Repository, get_repository

logger = logging.getLogger(__name__)
T = 1.8            # board thickness (cm)
TOLERANCE_CM = 0.5
FILES = ("model.glb", "preview.png", "viewer.html", "spec.json")


def _part(name: str, material: str, size: tuple[float, float, float], center: tuple[float, float, float]) -> dict:
    """size = (width x, height y, depth z) in cm; center in cm. Floor is y=0, front is +z."""
    return {"name": name, "material": material, "size_cm": [round(v, 2) for v in size],
            "center_cm": [round(v, 2) for v in center]}


def _wardrobe(w: float, d: float, h: float) -> list[dict]:
    plinth = 8.0
    doors = max(2, round(w / 50))
    door_w = (w - 2 * T) / doors
    parts = [
        _part("left side", "body", (T, h, d - 2), (-w / 2 + T / 2, h / 2, -1)),
        _part("right side", "body", (T, h, d - 2), (w / 2 - T / 2, h / 2, -1)),
        _part("top", "body", (w - 2 * T, T, d - 2), (0, h - T / 2, -1)),
        _part("plinth", "body", (w - 2 * T, plinth, d - 4), (0, plinth / 2, -2)),
        _part("back", "body", (w - 2 * T, h - T - plinth, 0.8), (0, plinth + (h - T - plinth) / 2, -d / 2 + 0.4)),
    ]
    for i in range(doors):
        x = -w / 2 + T + door_w * (i + 0.5)
        parts.append(_part(f"door {i + 1}", "body", (door_w - 0.4, h - T - plinth - 0.6, T),
                           (x, plinth + (h - T - plinth) / 2, d / 2 - 2 - T / 2)))
        handle_x = x + (door_w / 2 - 4) * (1 if i % 2 == 0 else -1)
        parts.append(_part(f"handle {i + 1}", "metal", (1.5, 18, 2), (handle_x, h * 0.5, d / 2 - 1)))
    return parts


def _bed(w: float, d: float, h: float) -> list[dict]:
    leg, base_h, mattress_h = 10.0, 25.0, 22.0
    parts = [_part(f"leg {i + 1}", "body", (6, leg, 6), (x * (w / 2 - 3), leg / 2, z * (d / 2 - 3)))
             for i, (x, z) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    parts += [
        _part("base", "body", (w, base_h, d - 6), (0, leg + base_h / 2, 3)),
        _part("headboard", "body", (w, h, 6), (0, h / 2, -d / 2 + 3)),
        _part("mattress", "mattress", (w - 4, min(mattress_h, h - leg - base_h), d - 10),
              (0, leg + base_h + min(mattress_h, h - leg - base_h) / 2, 4)),
    ]
    return parts


def _table(w: float, d: float, h: float, drawer: bool = False) -> list[dict]:
    top = 4.0
    parts = [_part("top", "body", (w, top, d), (0, h - top / 2, 0))]
    parts += [_part(f"leg {i + 1}", "body", (6, h - top, 6), (x * (w / 2 - 6), (h - top) / 2, z * (d / 2 - 6)))
              for i, (x, z) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    parts.append(_part("apron", "body", (w - 18, 8, T), (0, h - top - 4, d / 2 - 6)))
    if drawer:
        parts.append(_part("drawer", "body", (min(45, w / 3), 15, d - 14), (w / 2 - 6 - min(45, w / 3) / 2 - 4, h - top - 7.5, 0)))
    return parts


def _sofa(w: float, d: float, h: float) -> list[dict]:
    arm, leg, base_h, seat_h, back_d = 16.0, 8.0, 20.0, 16.0, 20.0
    arm_h = min(h, 62.0)
    parts = [_part(f"leg {i + 1}", "metal", (5, leg, 5), (x * (w / 2 - 6), leg / 2, z * (d / 2 - 6)))
             for i, (x, z) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    parts += [
        _part("base", "body", (w, base_h, d), (0, leg + base_h / 2, 0)),
        _part("seat cushion", "fabric", (w - 2 * arm, seat_h, d - back_d - 2),
              (0, leg + base_h + seat_h / 2, back_d / 2 + 1)),
        _part("back", "fabric", (w - 2 * arm, h - leg - base_h, back_d), (0, leg + base_h + (h - leg - base_h) / 2, -d / 2 + back_d / 2)),
        _part("left arm", "fabric", (arm, arm_h - leg, d), (-w / 2 + arm / 2, leg + (arm_h - leg) / 2, 0)),
        _part("right arm", "fabric", (arm, arm_h - leg, d), (w / 2 - arm / 2, leg + (arm_h - leg) / 2, 0)),
    ]
    return parts


def _tv_unit(w: float, d: float, h: float) -> list[dict]:
    leg = 10.0
    body_h = h - leg
    parts = [_part(f"leg {i + 1}", "metal", (3, leg, 3), (x * (w / 2 - 5), leg / 2, z * (d / 2 - 5)))
             for i, (x, z) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    parts.append(_part("carcass", "body", (w, body_h, d - T), (0, leg + body_h / 2, -T / 2)))
    fronts = max(2, round(w / 60))
    front_w = w / fronts
    for i in range(fronts):
        x = -w / 2 + front_w * (i + 0.5)
        parts.append(_part(f"front {i + 1}", "body", (front_w - 0.4, body_h - 0.6, T), (x, leg + body_h / 2, d / 2 - T / 2)))
    return parts


def _chair(w: float, d: float, h: float) -> list[dict]:
    seat_y, seat_t = 45.0, 4.0
    back_h = max(h - seat_y - seat_t, 10)
    parts = [_part(f"leg {i + 1}", "body", (4, seat_y, 4), (x * (w / 2 - 2), seat_y / 2, z * (d / 2 - 2)))
             for i, (x, z) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])]
    parts += [
        _part("seat", "fabric", (w, seat_t, d), (0, seat_y + seat_t / 2, 0)),
        _part("back", "body", (w, back_h, 3), (0, seat_y + seat_t + back_h / 2, -d / 2 + 1.5)),
    ]
    return parts


TEMPLATES = {
    "wardrobe": _wardrobe, "bed": _bed, "dining_table": _table, "desk": lambda w, d, h: _table(w, d, h, True),
    "sofa": _sofa, "tv_unit": _tv_unit, "chair": _chair,
}


def resolve_materials(item: dict[str, Any], catalog: Catalog) -> dict[str, str]:
    wood_hex = catalog.options("wood")[item["wood"]]["color_hex"]
    color_hex = catalog.options("color")[item["color"]].get("color_hex")
    return {"body": color_hex or wood_hex, "fabric": color_hex or "#CDBFA8", "metal": "#8C8C8C",
            "mattress": "#EEEBE4"}


def build_design_spec(quotation: dict[str, Any], catalog: Catalog | None = None) -> dict[str, Any]:
    catalog = catalog or get_catalog()
    item = quotation["item"]
    w, d, h = (float(item[k]) for k in ("width_cm", "depth_cm", "height_cm"))
    template = TEMPLATES.get(item["product_type"])
    if template is None:
        raise ValidationFailedError(f"No 3D template for {item['product_type']}")
    return {
        "design_version": 1,
        "quotation_no": quotation["quotation_no"],
        "product_type": item["product_type"],
        "label_ar": catalog.label("product_type", item["product_type"], "ar"),
        "label_en": catalog.label("product_type", item["product_type"], "en"),
        "dimensions_cm": {"width": w, "depth": d, "height": h},
        "wood": {"key": item["wood"], "ar": catalog.label("wood", item["wood"], "ar"),
                 "en": catalog.label("wood", item["wood"], "en")},
        "finish": {"key": item["finish"], "ar": catalog.label("finish", item["finish"], "ar"),
                   "en": catalog.label("finish", item["finish"], "en")},
        "color": {"key": item["color"], "ar": catalog.label("color", item["color"], "ar"),
                  "en": catalog.label("color", item["color"], "en")},
        "quantity": item["quantity"],
        "materials": resolve_materials(item, catalog),
        "parts": template(w, d, h),
        "units": "cm (model files are in metres)",
    }


def _hex_rgba(value: str) -> list[int]:
    value = value.lstrip("#")
    return [int(value[i:i + 2], 16) for i in (0, 2, 4)] + [255]


def build_scene(spec: dict[str, Any]):
    import trimesh

    scene = trimesh.Scene()
    for part in spec["parts"]:
        box = trimesh.creation.box(extents=np.array(part["size_cm"]) / 100.0)
        box.apply_translation(np.array(part["center_cm"]) / 100.0)
        box.visual.face_colors = _hex_rgba(spec["materials"][part["material"]])
        scene.add_geometry(box, node_name=part["name"], geom_name=part["name"])
    return scene


def verify_dimensions(scene, spec: dict[str, Any]) -> dict[str, Any]:
    """Model bounding box (cm) must equal the requested width x depth x height."""
    bounds = np.asarray(scene.bounds) * 100.0
    extent = bounds[1] - bounds[0]
    model = {"width": round(float(extent[0]), 2), "height": round(float(extent[1]), 2),
             "depth": round(float(extent[2]), 2)}
    requested = spec["dimensions_cm"]
    difference = {k: round(model[k] - float(requested[k]), 2) for k in ("width", "depth", "height")}
    return {"passed": all(abs(v) <= TOLERANCE_CM for v in difference.values()), "tolerance_cm": TOLERANCE_CM,
            "requested_cm": requested, "model_cm": model, "difference_cm": difference,
            "on_floor": abs(float(bounds[0][1])) <= TOLERANCE_CM}


def _cuboid_faces(size, center) -> list[list[tuple[float, float, float]]]:
    """Faces of a box in plot space: X = width, Y = -depth (front faces the camera), Z = height."""
    (sx, sy, sz), (cx, cy, cz) = size, center
    xs = (cx - sx / 2, cx + sx / 2)
    zs = (cy - sy / 2, cy + sy / 2)
    ys = (-(cz + sz / 2), -(cz - sz / 2))
    v = [(x, y, z) for x in xs for y in ys for z in zs]
    idx = [(0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)]
    return [[v[i] for i in face] for face in idx]


def render_preview(spec: dict[str, Any], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    dims = spec["dimensions_cm"]
    w, d, h = dims["width"], dims["depth"], dims["height"]
    faces, colors = [], []
    for part in spec["parts"]:
        color = spec["materials"][part["material"]]
        for face in _cuboid_faces(part["size_cm"], part["center_cm"]):
            faces.append(face)
            colors.append(color)
    fig = plt.figure(figsize=(7, 6), dpi=110)
    ax = fig.add_subplot(111, projection="3d")
    ax.add_collection3d(Poly3DCollection(faces, facecolors=colors, edgecolors="#3b3b3b", linewidths=0.4))
    ax.set_xlim(-w / 2, w / 2)
    ax.set_ylim(-d / 2, d / 2)
    ax.set_zlim(0, h)
    ax.set_box_aspect((w, d, h))
    ax.view_init(elev=18, azim=-58)
    ax.set_axis_off()
    ax.set_title(f"{spec['label_en']}  {w:g} x {d:g} x {h:g} cm  |  {spec['wood']['en']} / "
                 f"{spec['finish']['en']} / {spec['color']['en']}", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, facecolor="white")
    plt.close(fig)


VIEWER_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SANAA design {design_id}</title>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
<style>body{{margin:0;font-family:system-ui,sans-serif;background:#f4f1ec;color:#2b2b2b}}
model-viewer{{width:100vw;height:80vh;background:#fff}} .info{{padding:12px 18px}}</style></head>
<body><model-viewer src="model.glb" camera-controls auto-rotate shadow-intensity="1" ar alt="3D design"></model-viewer>
<div class="info"><b>{label_ar} / {label_en}</b> &mdash; {width:g} &times; {depth:g} &times; {height:g} cm &mdash;
{wood} / {finish} / {color} &mdash; quotation {quotation_no}</div></body></html>"""


class DesignService:
    def __init__(self, repository: Repository | None = None, output_dir: Path | None = None,
                 catalog: Catalog | None = None):
        self._repository = repository
        self._output_dir = output_dir
        self.catalog = catalog

    @property
    def repository(self) -> Repository:
        return self._repository or get_repository()

    @property
    def output_dir(self) -> Path:
        return self._output_dir or settings.path(settings.design_output_dir)

    def folder(self, design_id: str) -> Path:
        if not design_id.replace("-", "").replace("_", "").isalnum():
            raise NotFoundError("Design not found")
        return self.output_dir / design_id

    def file_path(self, design_id: str, name: str) -> Path:
        if name not in FILES:
            raise NotFoundError("File not found")
        path = self.folder(design_id) / name
        if not path.exists():
            raise NotFoundError("File not found")
        return path

    @staticmethod
    def urls(design_id: str) -> dict[str, str]:
        base = f"{settings.public_base_url.rstrip('/')}{settings.api_prefix}/customer/designs/{design_id}/files"
        return {"model": f"{base}/model.glb", "preview": f"{base}/preview.png", "viewer": f"{base}/viewer.html"}

    async def create(self, quotation_no: str, session_id: str) -> dict[str, Any]:
        quotation = await self.repository.get_quotation(quotation_no)
        if quotation is None:
            raise NotFoundError("Quotation not found")
        if quotation["session_id"] != session_id:
            raise UnauthorizedError("This quotation belongs to another chat session")
        spec = build_design_spec(quotation, self.catalog)
        scene = build_scene(spec)
        check = verify_dimensions(scene, spec)
        if not check["passed"]:
            logger.error("Dimension check failed for %s: %s", quotation_no, check)

        design_id = f"D-{dt.date.today():%Y%m%d}-{secrets.token_urlsafe(9).replace('-', 'x').replace('_', 'y')}"
        folder = self.folder(design_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "model.glb").write_bytes(scene.export(file_type="glb"))
        render_preview(spec, folder / "preview.png")
        dims = spec["dimensions_cm"]
        (folder / "viewer.html").write_text(VIEWER_HTML.format(
            design_id=design_id, label_ar=spec["label_ar"], label_en=spec["label_en"], width=dims["width"],
            depth=dims["depth"], height=dims["height"], wood=spec["wood"]["en"], finish=spec["finish"]["en"],
            color=spec["color"]["en"], quotation_no=quotation_no), encoding="utf-8")
        (folder / "spec.json").write_text(json.dumps({**spec, "dimension_check": check}, ensure_ascii=False, indent=2),
                                          encoding="utf-8")
        design = {
            "design_id": design_id, "quotation_no": quotation_no, "session_id": session_id, "spec": spec,
            "files": self.urls(design_id), "dimension_check": check, "status": "pending", "feedback": None,
            "created_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "approved_at": None,
        }
        await self.repository.save_design(design)
        await self.repository.update_quotation(quotation_no, design_id=design_id)
        return design

    async def get(self, design_id: str, session_id: str) -> dict[str, Any]:
        design = await self.repository.get_design(design_id)
        if design is None:
            raise NotFoundError("Design not found")
        if design["session_id"] != session_id:
            raise UnauthorizedError("This design belongs to another chat session")
        return design

    async def decide(self, design_id: str, session_id: str, approved: bool, feedback: str | None = None) -> dict[str, Any]:
        design = await self.get(design_id, session_id)
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        status = "approved" if approved else "changes_requested"
        await self.repository.update_design(design_id, status=status, feedback=feedback,
                                            approved_at=now if approved else None)
        if approved:
            await self.repository.update_quotation(design["quotation_no"], status="accepted", accepted_at=now)
        design.update(status=status, feedback=feedback, approved_at=now if approved else None)
        return design
