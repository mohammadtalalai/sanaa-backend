from __future__ import annotations

import logging
from typing import Any

from app.ai.language import contains_any, detect_language
from app.ai.llm import LLMError, OllamaClient, llm
from app.ai.prompts import render
from app.core.exceptions import NotFoundError, ValidationFailedError
from app.customer_services.conversation import ConversationState
from app.customer_services.costing import Catalog, get_catalog
from app.customer_services.design_generator import DesignService
from app.customer_services.question_workflow import (
    OPTION_FIELDS,
    extract_mentions,
    is_no,
    is_yes,
    missing_fields,
    parse_dimensions,
    validate,
)
from app.customer_services.quotation import QuotationService
from app.customer_services.repository import Repository, get_repository

logger = logging.getLogger(__name__)
MAX_MESSAGE = 1000
RESET_WORDS = ("ابدأ من جديد", "ابدا من جديد", "من الاول", "start over", "reset", "new order")
DESIGN_WORDS = ("تصميم", "ثري دي", "3d", "design", "شكل", "صوره", "صورة")

TEXT = {
    "ar": {
        "greeting": "أهلاً بيك في صناع! هساعدك تطلب قطعة أثاث وتاخد عرض سعر وتصميم ثلاثي الأبعاد.",
        "product_type": "تحب تطلب إيه؟ ({choices})",
        "dimensions": "إيه المقاسات المطلوبة بالسنتيمتر؟ اكتبها كده: العرض × العمق × الارتفاع (مثال 200×60×220)، أو اكتب «مقاس عادي».",
        "wood": "تحب نوع الخشب إيه؟ ({choices})",
        "finish": "تحب التشطيب إيه؟ ({choices})",
        "color": "اللون المطلوب؟ ({choices})",
        "quantity": "محتاج كام قطعة؟",
        "city": "التوصيل لأي مدينة؟ ({choices}، أو اكتب مدينتك)",
        "customer_name": "ممكن اسمك؟",
        "customer_phone": "رقم موبايلك للتواصل؟ (11 رقم)",
        "bad_dimensions": "المقاس ده خارج المسموح لـ{product}: {axis} لازم يكون بين {low} و {high} سم.",
        "bad_quantity": "الكمية لازم تكون من 1 لـ 50 قطعة.",
        "axis": {"width_cm": "العرض", "depth_cm": "العمق", "height_cm": "الارتفاع"},
        "summary": "تمام، ده ملخص طلبك:\n- {product} {dims} سم × {quantity}\n- الخشب: {wood} | التشطيب: {finish} | اللون: {color}\n- التوصيل: {city}\n- الاسم: {name} | الموبايل: {phone}\nأأكد وأطلع عرض السعر؟ (نعم / أو قولي تغيّر إيه)",
        "what_change": "تحب تغيّر إيه؟ (المقاس، الخشب، التشطيب، اللون، الكمية، المدينة)",
        "quoted": "{quotation}\n\nتحب أعملك تصميم ثلاثي الأبعاد للقطعة دي قبل التأكيد؟ (نعم / لا)",
        "quoted_help": "عرض السعر {no} محفوظ. اكتب «تصميم» لو عايز تشوف التصميم ثلاثي الأبعاد، أو «ابدأ من جديد» لطلب جديد.",
        "design_ready": "التصميم جاهز ✅ المقاسات في الموديل مطابقة لطلبك ({dims} سم).\n- عرض ثلاثي الأبعاد: {viewer}\n- صورة: {preview}\nلو موافق اكتب «موافق»، ولو عايز تعديل قولي تغيّر إيه.",
        "design_mismatch": "تنبيه: مقاسات الموديل مش مطابقة تماماً للطلب، فريقنا هيراجعها قبل التأكيد.",
        "approved": "تم اعتماد التصميم وعرض السعر {no} ✅ فريق المبيعات هيتواصل معاك على {phone} لتأكيد العربون والتصنيع.",
        "changes": "تمام، سجلت ملاحظتك. قولي تحب تغيّر إيه بالظبط (المقاس، الخشب، التشطيب، اللون...).",
        "after_approved": "طلبك {no} معتمد. لمتابعة الطلب بعد التصنيع استخدم صفحة تتبع الطلبات برقم الطلب.",
        "not_understood": "معلش مفهمتش. ",
    },
    "en": {
        "greeting": "Welcome to SANAA! I'll help you order a piece of furniture and get a quotation and a 3D design.",
        "product_type": "What would you like to order? ({choices})",
        "dimensions": "What size do you need in cm? Write width × depth × height (e.g. 200x60x220), or type \"standard\".",
        "wood": "Which wood would you like? ({choices})",
        "finish": "Which finish? ({choices})",
        "color": "Which colour? ({choices})",
        "quantity": "How many pieces?",
        "city": "Delivery city? ({choices}, or type your city)",
        "customer_name": "May I have your name?",
        "customer_phone": "Your mobile number? (11 digits)",
        "bad_dimensions": "That size is outside the range for a {product}: {axis} must be between {low} and {high} cm.",
        "bad_quantity": "Quantity must be between 1 and 50.",
        "axis": {"width_cm": "width", "depth_cm": "depth", "height_cm": "height"},
        "summary": "Here is your order:\n- {product} {dims} cm x {quantity}\n- Wood: {wood} | Finish: {finish} | Colour: {color}\n- Delivery: {city}\n- Name: {name} | Mobile: {phone}\nShall I confirm and prepare the quotation? (yes / or tell me what to change)",
        "what_change": "What would you like to change? (size, wood, finish, colour, quantity, city)",
        "quoted": "{quotation}\n\nWould you like a 3D design of this piece before confirming? (yes / no)",
        "quoted_help": "Quotation {no} is saved. Type \"design\" to see the 3D design, or \"start over\" for a new order.",
        "design_ready": "Your design is ready ✅ The model dimensions match your request ({dims} cm).\n- 3D view: {viewer}\n- Image: {preview}\nType \"approve\" if you are happy, or tell me what to change.",
        "design_mismatch": "Note: the model dimensions do not exactly match the request; our team will review them.",
        "approved": "Design and quotation {no} approved ✅ Our sales team will call you on {phone} to confirm the deposit and production.",
        "changes": "Noted. Tell me exactly what you want to change (size, wood, finish, colour...).",
        "after_approved": "Your order {no} is approved. After production starts, use order tracking with your order number.",
        "not_understood": "Sorry, I didn't get that. ",
    },
}


class CustomerChatbot:
    def __init__(self, repository: Repository | None = None, catalog: Catalog | None = None,
                 quotations: QuotationService | None = None, designs: DesignService | None = None,
                 client: OllamaClient | None = None, use_llm: bool = True):
        self._repository = repository
        self.catalog = catalog or get_catalog()
        self.quotations = quotations or QuotationService(repository)
        self.designs = designs or DesignService(repository)
        self.client = client or llm
        self.use_llm = use_llm

    @property
    def repository(self) -> Repository:
        return self._repository or get_repository()

    # ---------- public API ----------
    async def handle(self, message: str, session_id: str | None = None, language: str | None = None) -> dict[str, Any]:
        message = (message or "").strip()
        if not message:
            raise ValidationFailedError("Message is empty")
        message = message[:MAX_MESSAGE]
        state = await self._load(session_id, message, language)
        state.add("user", message)
        reply, design = await self._step(state, message)
        state.add("assistant", reply)
        await self.repository.save_session(state.to_dict())
        quotation = await self.repository.get_quotation(state.quotation_no) if state.quotation_no else None
        return {
            "session_id": state.session_id, "language": state.language, "status": state.status,
            "awaiting": state.awaiting, "reply": reply, "collected": state.data,
            "quotation": quotation, "design": design,
        }

    async def history(self, session_id: str) -> dict[str, Any]:
        raw = await self.repository.get_session(session_id)
        if raw is None:
            raise NotFoundError("Session not found")
        return raw

    # ---------- internals ----------
    async def _load(self, session_id: str | None, message: str, language: str | None) -> ConversationState:
        if session_id:
            raw = await self.repository.get_session(session_id)
            if raw is None:
                raise NotFoundError("Session not found or expired; start a new chat without session_id")
            state = ConversationState.from_dict(raw)
            if language in ("ar", "en"):
                state.language = language
            return state
        return ConversationState(language=language if language in ("ar", "en") else detect_language(message))

    def _t(self, state: ConversationState, key: str, **values: Any) -> str:
        text = TEXT[state.language][key]
        return text.format(**values) if values else text

    def _question(self, state: ConversationState, field: str) -> str:
        if field in OPTION_FIELDS:
            choices = "، ".join(self.catalog.choices(field, state.language)) if state.language == "ar" \
                else ", ".join(self.catalog.choices(field, state.language))
            return self._t(state, field, choices=choices)
        return self._t(state, field)

    async def _extract(self, state: ConversationState, message: str) -> dict[str, Any]:
        values = extract_mentions(message, self.catalog, state.awaiting, state.data.get("product_type"))
        if state.awaiting == "dimensions" and "product_type" in state.data:
            values.update(parse_dimensions(message, self.catalog, state.data["product_type"]).values)
        if not values and self.use_llm and state.awaiting not in (None, "customer_name", "customer_phone"):
            values = await self._extract_with_llm(message)
        if state.awaiting == "city" and "city" not in values and len(message) <= 40 and not any(c.isdigit() for c in message):
            values["city"] = message.strip()  # unknown city -> "other" delivery zone
        return values

    async def _extract_with_llm(self, message: str) -> dict[str, Any]:
        catalog = self.catalog
        prompt = render("customer_prompt", product_types=str(list(catalog.options("product_type"))),
                        woods=str(list(catalog.options("wood"))), finishes=str(list(catalog.options("finish"))),
                        colors=str(list(catalog.options("color"))), cities=str(list(catalog.options("city"))))
        try:
            data = await self.client.chat_json([{"role": "system", "content": prompt},
                                                {"role": "user", "content": message}], num_predict=200)
        except LLMError as exc:
            logger.info("LLM extraction skipped: %s", exc)
            return {}
        values: dict[str, Any] = {}
        for field in OPTION_FIELDS:
            if data.get(field):
                match = catalog.find(field, str(data[field]))
                if match:
                    values[field] = match.key
        for key in ("width_cm", "depth_cm", "height_cm"):
            try:
                if data.get(key) and 1 <= float(data[key]) <= 1000:
                    values[key] = float(data[key])
            except (TypeError, ValueError):
                pass
        try:
            if data.get("quantity") and 1 <= int(data["quantity"]) <= 50:
                values["quantity"] = int(data["quantity"])
        except (TypeError, ValueError):
            pass
        return values

    def _apply(self, state: ConversationState, values: dict[str, Any]) -> str | None:
        """Store values; return an error message for invalid ones."""
        state.data.update(values)
        problems = validate(state.data, self.catalog)
        if "dimensions" in problems:
            axis, limits = problems["dimensions"].split(":")
            low, high = limits.split("-")
            for key in ("width_cm", "depth_cm", "height_cm"):
                state.data.pop(key, None)
            product = self.catalog.label("product_type", state.data["product_type"], state.language)
            return self._t(state, "bad_dimensions", product=product, axis=TEXT[state.language]["axis"][axis],
                           low=low, high=high)
        if "quantity" in problems:
            state.data.pop("quantity", None)
            return self._t(state, "bad_quantity")
        return None

    def _next(self, state: ConversationState, prefix: str = "") -> str:
        missing = missing_fields(state.data)
        if missing:
            state.status, state.awaiting = "collecting", missing[0]
            return (prefix + "\n" if prefix else "") + self._question(state, missing[0])
        state.status, state.awaiting = "confirming", None
        return (prefix + "\n" if prefix else "") + self._summary(state)

    def _summary(self, state: ConversationState) -> str:
        d, lang, label = state.data, state.language, self.catalog.label
        return self._t(state, "summary", product=label("product_type", d["product_type"], lang),
                       dims=f"{d['width_cm']:g}×{d['depth_cm']:g}×{d['height_cm']:g}", quantity=d["quantity"],
                       wood=label("wood", d["wood"], lang), finish=label("finish", d["finish"], lang),
                       color=label("color", d["color"], lang), city=label("city", d["city"], lang),
                       name=d["customer_name"], phone=d["customer_phone"])

    async def _step(self, state: ConversationState, message: str) -> tuple[str, dict | None]:
        if contains_any(message, RESET_WORDS):
            state.data, state.quotation_no, state.design_id = {}, None, None
            return self._next(state, self._t(state, "greeting")), None

        if state.status in ("collecting", "confirming"):
            is_new = not state.history[:-1]
            values = await self._extract(state, message)
            if state.status == "confirming" and not values:
                if is_yes(message):
                    quotation = await self.quotations.create(state.data, state.session_id, state.language)
                    state.quotation_no, state.status, state.awaiting = quotation["quotation_no"], "quoted", None
                    return self._t(state, "quoted", quotation=self.quotations.describe(quotation, state.language)), None
                return self._t(state, "what_change"), None
            error = self._apply(state, values)
            prefix = self._t(state, "greeting") if is_new else ""
            if error:
                prefix = (prefix + "\n" if prefix else "") + error
            elif not values and not is_new:
                prefix = self._t(state, "not_understood").strip()
            return self._next(state, prefix), None

        if state.status == "quoted":
            if is_yes(message) or contains_any(message, DESIGN_WORDS):
                return await self._make_design(state)
            return self._t(state, "quoted_help", no=state.quotation_no), None

        if state.status == "design_ready":
            values = extract_mentions(message, self.catalog, None, state.data.get("product_type"))
            if is_yes(message) and not values and not is_no(message):
                design = await self.designs.decide(state.design_id, state.session_id, approved=True)
                state.status = "approved"
                return self._t(state, "approved", no=state.quotation_no, phone=state.data.get("customer_phone")), design
            design = await self.designs.decide(state.design_id, state.session_id, approved=False, feedback=message)
            if values:  # changed something -> new summary, new quotation after confirmation
                state.quotation_no, state.design_id = None, None
                error = self._apply(state, values)
                return self._next(state, error or ""), design
            state.status, state.awaiting = "confirming", None
            state.quotation_no, state.design_id = None, None
            return self._t(state, "changes"), design

        return self._t(state, "after_approved", no=state.quotation_no), None

    async def _make_design(self, state: ConversationState) -> tuple[str, dict]:
        design = await self.designs.create(state.quotation_no, state.session_id)
        state.design_id, state.status = design["design_id"], "design_ready"
        dims = design["spec"]["dimensions_cm"]
        reply = self._t(state, "design_ready", dims=f"{dims['width']:g}×{dims['depth']:g}×{dims['height']:g}",
                        viewer=design["files"]["viewer"], preview=design["files"]["preview"])
        if not design["dimension_check"]["passed"]:
            reply += "\n" + self._t(state, "design_mismatch")
        return reply, design


chatbot = CustomerChatbot()
