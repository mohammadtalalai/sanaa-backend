import io

import pytest
import trimesh

from app.core.exceptions import NotFoundError, UnauthorizedError
from app.customer_services.costing import get_catalog
from app.customer_services.design_generator import DesignService, build_design_spec, build_scene, verify_dimensions

catalog = get_catalog()


def _quotation(product, dims, wood="oak", finish="matte", color="natural", no="Q-AI-TEST-1", session="s1"):
    w, d, h = dims
    return {"quotation_no": no, "session_id": session, "item": {
        "product_type": product, "width_cm": w, "depth_cm": d, "height_cm": h, "wood": wood, "finish": finish,
        "color": color, "quantity": 1, "city": "Cairo"}}


@pytest.mark.parametrize("product", list(catalog.options("product_type")))
@pytest.mark.parametrize("size", ["default", "min", "max"])
def test_model_dimensions_match_the_request(product, size):
    dims = catalog.product(product)[f"{size}_dims"]
    spec = build_design_spec(_quotation(product, dims))
    check = verify_dimensions(build_scene(spec), spec)
    assert check["passed"], check
    assert check["on_floor"]


def test_glb_round_trip_keeps_dimensions():
    spec = build_design_spec(_quotation("wardrobe", (240, 60, 230)))
    data = build_scene(spec).export(file_type="glb")
    loaded = trimesh.load(io.BytesIO(data), file_type="glb")
    extents = [round(v * 100, 1) for v in loaded.extents]
    assert extents == [240.0, 230.0, 60.0]          # x = width, y = height, z = depth


def test_materials_follow_choices():
    spec = build_design_spec(_quotation("sofa", (220, 90, 85), wood="walnut", color="grey"))
    assert spec["materials"]["fabric"] == "#8E8E8E"
    natural = build_design_spec(_quotation("bed", (180, 210, 110), wood="walnut"))
    assert natural["materials"]["body"] == "#6B4A32"
    assert natural["wood"]["ar"] == "جوز"


async def test_design_service_create_and_approve(memory_repository, tmp_path):
    quotation = {**_quotation("dining_table", (200, 100, 75)), "status": "draft", "design_id": None}
    await memory_repository.save_quotation(quotation)
    service = DesignService(memory_repository, output_dir=tmp_path)

    design = await service.create("Q-AI-TEST-1", "s1")
    assert design["dimension_check"]["passed"]
    assert design["dimension_check"]["model_cm"] == {"width": 200.0, "height": 75.0, "depth": 100.0}
    for name in ("model.glb", "preview.png", "viewer.html", "spec.json"):
        assert service.file_path(design["design_id"], name).stat().st_size > 0
    assert memory_repository.quotations["Q-AI-TEST-1"]["design_id"] == design["design_id"]

    with pytest.raises(UnauthorizedError):
        await service.get(design["design_id"], "another-session")
    with pytest.raises(UnauthorizedError):
        await service.create("Q-AI-TEST-1", "another-session")

    approved = await service.decide(design["design_id"], "s1", approved=True)
    assert approved["status"] == "approved"
    assert memory_repository.quotations["Q-AI-TEST-1"]["status"] == "accepted"


async def test_file_names_are_restricted(memory_repository, tmp_path):
    service = DesignService(memory_repository, output_dir=tmp_path)
    with pytest.raises(NotFoundError):
        service.file_path("D-1", "../../.env")
    with pytest.raises(NotFoundError):
        service.file_path("../etc", "model.glb")


async def test_chatbot_design_flow(memory_repository, tmp_output):
    from app.customer_services.chatbot import CustomerChatbot

    bot = CustomerChatbot(repository=memory_repository, use_llm=False)
    r = await bot.handle("I want a bed 180x210x110 beech natural oil, natural colour, 1 piece, Cairo")
    sid = r["session_id"]
    for text in ("Omar Hassan", "01001234567", "yes"):
        r = await bot.handle(text, sid)
    assert r["status"] == "quoted"
    r = await bot.handle("yes", sid)
    assert r["status"] == "design_ready" and r["design"]["dimension_check"]["passed"]
    assert "/files/viewer.html" in r["reply"]
    r = await bot.handle("approve", sid)
    assert r["status"] == "approved"
    assert memory_repository.quotations[r["quotation"]["quotation_no"]]["status"] == "accepted"
