import datetime as dt

import pytest

from app.customer_services.chatbot import CustomerChatbot
from app.customer_services.costing import CostCalculator, get_catalog
from app.customer_services.question_workflow import (
    extract_mentions,
    is_no,
    is_yes,
    parse_dimensions,
    parse_phone,
    parse_quantity,
)

catalog = get_catalog()


@pytest.mark.parametrize("field, text, key", [
    ("product_type", "عايز دولاب للأوضة", "wardrobe"),
    ("product_type", "I need a dining table", "dining_table"),
    ("product_type", "وحدة تلفزيون", "tv_unit"),          # longer synonym wins over "مكتب"
    ("wood", "خشب أرو لو سمحت", "oak"),
    ("wood", "MDF", "mdf"),
    ("finish", "دوكو", "lacquer"),
    ("color", "أبيض", "white"),
    ("city", "التوصيل التجمع", "Cairo"),
    ("city", "alex", "Alexandria"),
])
def test_catalog_matching(field, text, key):
    assert catalog.find(field, text).key == key


@pytest.mark.parametrize("text, dims", [
    ("200x60x220", (200, 60, 220)),
    ("٢٠٠×٦٠×٢٢٠", (200, 60, 220)),
    ("2 x 0.6 x 2.2 متر", (200, 60, 220)),
    ("عرض 180 عمق 90 ارتفاع 75", (180, 90, 75)),
    ("width 140, depth 70, height 75", (140, 70, 75)),
    ("200 في 100 في 75", (200, 100, 75)),
])
def test_dimension_parsing(text, dims):
    values = parse_dimensions(text).values
    assert (values["width_cm"], values["depth_cm"], values["height_cm"]) == dims


def test_standard_size():
    values = parse_dimensions("مقاس عادي", catalog, "wardrobe").values
    assert (values["width_cm"], values["depth_cm"], values["height_cm"]) == (200, 60, 220)


def test_quantity_parsing():
    assert parse_quantity("عايز 3 قطع").values == {"quantity": 3}
    assert parse_quantity("quantity: 4").values == {"quantity": 4}
    assert parse_quantity("2", bare_number=True).values == {"quantity": 2}
    assert parse_quantity("اتنين", bare_number=True).values == {"quantity": 2}
    assert parse_quantity("200x60x220").values == {}               # dimensions are not a quantity


def test_quantity_before_product_word():
    assert extract_mentions("عايز 2 دولاب", catalog)["quantity"] == 2


def test_phone_parsing():
    assert parse_phone("موبايلي ٠١٠١٢٣٤٥٦٧٨").values == {"customer_phone": "01012345678"}
    assert parse_phone("+20 112 345 6789").values == {"customer_phone": "01123456789"}
    assert parse_phone("12345").values == {}


def test_yes_no():
    assert is_yes("نعم أكد") and is_yes("ok") and not is_yes("لا")
    assert is_no("لا شكرا") and not is_no("لازم")


def test_ambiguous_word_only_used_for_the_asked_question():
    assert "color" not in extract_mentions("طبيعي", catalog, awaiting="finish")
    assert extract_mentions("طبيعي", catalog, awaiting="color")["color"] == "natural"


def test_cost_calculation_uses_catalogue_values():
    quote = CostCalculator(catalog).quote({
        "product_type": "wardrobe", "width_cm": 200, "depth_cm": 60, "height_cm": 220, "wood": "oak",
        "finish": "lacquer", "color": "white", "quantity": 2, "city": "Cairo"}, dt.date(2026, 1, 1))
    # 28000 x size 1.0 x oak 1.35 x lacquer 1.15 + white 600 = 44,070 per piece
    assert quote["unit_price"] == 44070.0
    assert quote["subtotal"] == 88140.0
    assert quote["delivery_cost"] == 750.0          # Cairo 600 + 150 for the 2nd piece
    assert quote["vat_amount"] == 12444.6           # 14% of (subtotal + delivery)
    assert quote["total"] == 101334.6
    assert quote["estimated_delivery_date"] == "2026-01-26"   # 21 + 2 production days + 2 delivery days


def test_bigger_size_costs_more():
    calc = CostCalculator(catalog)
    base = {"product_type": "bed", "wood": "beech", "finish": "natural", "color": "natural", "quantity": 1,
            "city": "Giza", "depth_cm": 210, "height_cm": 110}
    assert calc.quote({**base, "width_cm": 200})["unit_price"] > calc.quote({**base, "width_cm": 160})["unit_price"]


def _bot(repository):
    return CustomerChatbot(repository=repository, use_llm=False)


async def _say(bot, session, text):
    return await bot.handle(text, session)


async def test_full_arabic_order_to_quotation(memory_repository, tmp_output):
    bot = _bot(memory_repository)
    r = await bot.handle("السلام عليكم، عايز ترابيزة سفرة")
    sid = r["session_id"]
    assert r["language"] == "ar" and r["awaiting"] == "dimensions"
    for message, awaiting in [("200×100×75", "wood"), ("جوز", "finish"), ("مط", "color"), ("بني", "quantity"),
                              ("1", "city"), ("القاهرة", "customer_name"), ("اسمي محمد عمران", "customer_phone")]:
        r = await _say(bot, sid, message)
        assert r["awaiting"] == awaiting, (message, r["reply"])
    r = await _say(bot, sid, "01012345678")
    assert r["status"] == "confirming" and "200×100×75" in r["reply"]
    r = await _say(bot, sid, "نعم")
    assert r["status"] == "quoted"
    quotation = r["quotation"]
    assert quotation["quotation_no"].startswith("Q-AI-") and quotation["customer_phone"] == "01012345678"
    assert quotation["item"]["width_cm"] == 200 and quotation["item"]["wood"] == "walnut"
    assert memory_repository.quotations[quotation["quotation_no"]]["total"] == quotation["pricing"]["total"]
    assert "عرض السعر رقم" in r["reply"]


async def test_english_order_in_few_messages(memory_repository, tmp_output):
    bot = _bot(memory_repository)
    r = await bot.handle("I want 2 wardrobes 200x60x220 in oak, lacquer finish, white, delivered to Alexandria")
    assert r["language"] == "en" and r["collected"]["quantity"] == 2 and r["awaiting"] == "customer_name"
    r = await _say(bot, r["session_id"], "Sara Ali")
    r = await _say(bot, r["session_id"], "01123456789")
    assert r["status"] == "confirming"
    r = await _say(bot, r["session_id"], "change the wood to walnut")
    assert r["status"] == "confirming" and r["collected"]["wood"] == "walnut"
    r = await _say(bot, r["session_id"], "yes")
    assert r["status"] == "quoted" and r["quotation"]["pricing"]["delivery_cost"] == 1750.0


async def test_out_of_range_dimensions_are_asked_again(memory_repository, tmp_output):
    bot = _bot(memory_repository)
    r = await bot.handle("عايز دولاب")
    r = await _say(bot, r["session_id"], "900x60x220")
    assert r["awaiting"] == "dimensions" and "العرض" in r["reply"] and "400" in r["reply"]


async def test_unknown_city_uses_other_zone(memory_repository, tmp_output):
    bot = _bot(memory_repository)
    r = await bot.handle("I want a desk, standard size, beech, matte, black, 1 piece")
    assert r["awaiting"] == "city"
    r = await _say(bot, r["session_id"], "Hurghada")
    assert r["collected"]["city"] == "Hurghada" and r["awaiting"] == "customer_name"


async def test_reset(memory_repository, tmp_output):
    bot = _bot(memory_repository)
    r = await bot.handle("عايز سرير")
    r = await _say(bot, r["session_id"], "ابدأ من جديد")
    assert r["collected"] == {} and r["awaiting"] == "product_type"
