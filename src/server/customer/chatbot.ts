/** Phase 3-4 customer chatbot: collect order details -> quotation -> 3D design -> approval (port of chatbot.py). */
import { chatJson, LLMError, strictObject } from "@/server/ai/gateway";
import { render } from "@/server/ai/prompts";
import { NotFoundError, ValidationFailedError } from "@/server/core/http";
import { getCatalog, type OptionField } from "@/shared/catalog";
import { containsAny, detectLanguage, type Language } from "@/shared/language";
import {
  OPTION_FIELDS, extractMentions, isNo, isYes, missingFields, parseDimensions, validate, type Collected,
} from "@/shared/question-workflow";
import { createDesign, decideDesign, withOrigin } from "./designs";
import { nowIso, tokenUrlsafe } from "./ids";
import { createQuotation, formatQuotation } from "./quotation";
import { getQuotation, getSession, saveSession, type SessionState } from "./repository";

const MAX_MESSAGE = 1000;
const MAX_HISTORY = 40;
const RESET_WORDS = ["ابدأ من جديد", "ابدا من جديد", "من الاول", "start over", "reset", "new order"];
const DESIGN_WORDS = ["تصميم", "ثري دي", "3d", "design", "شكل", "صوره", "صورة"];

const TEXT: Record<Language, Record<string, any>> = {
  ar: {
    greeting: "أهلاً بيك في صنعة SANAA! هساعدك تطلب قطعة أثاث وتاخد عرض سعر وتصميم ثلاثي الأبعاد.",
    product_type: "تحب تطلب إيه؟ ({choices})",
    dimensions: "إيه المقاسات المطلوبة بالسنتيمتر؟ اكتبها كده: العرض × العمق × الارتفاع (مثال 200×60×220)، أو اكتب «مقاس عادي».",
    wood: "تحب نوع الخشب إيه؟ ({choices})",
    finish: "تحب التشطيب إيه؟ ({choices})",
    color: "اللون المطلوب؟ ({choices})",
    quantity: "محتاج كام قطعة؟",
    city: "التوصيل لأي مدينة؟ ({choices}، أو اكتب مدينتك)",
    customer_name: "ممكن اسمك؟",
    customer_phone: "رقم موبايلك للتواصل؟ (11 رقم)",
    bad_dimensions: "المقاس ده خارج المسموح لـ{product}: {axis} لازم يكون بين {low} و {high} سم.",
    bad_quantity: "الكمية لازم تكون من 1 لـ 50 قطعة.",
    axis: { width_cm: "العرض", depth_cm: "العمق", height_cm: "الارتفاع" },
    summary: "تمام، ده ملخص طلبك:\n- {product} {dims} سم × {quantity}\n- الخشب: {wood} | التشطيب: {finish} | اللون: {color}\n- التوصيل: {city}\n- الاسم: {name} | الموبايل: {phone}\nأأكد وأطلع عرض السعر؟ (نعم / أو قولي تغيّر إيه)",
    what_change: "تحب تغيّر إيه؟ (المقاس، الخشب، التشطيب، اللون، الكمية، المدينة)",
    quoted: "{quotation}\n\nتحب أعملك تصميم ثلاثي الأبعاد للقطعة دي قبل التأكيد؟ (نعم / لا)",
    quoted_help: "عرض السعر {no} محفوظ. اكتب «تصميم» لو عايز تشوف التصميم ثلاثي الأبعاد، أو «ابدأ من جديد» لطلب جديد.",
    design_ready: "التصميم جاهز ✅ المقاسات في الموديل مطابقة لطلبك ({dims} سم).\n- عرض ثلاثي الأبعاد: {viewer}\n- صورة: {preview}\nلو موافق اكتب «موافق»، ولو عايز تعديل قولي تغيّر إيه.",
    design_mismatch: "تنبيه: مقاسات الموديل مش مطابقة تماماً للطلب، فريقنا هيراجعها قبل التأكيد.",
    approved: "تم اعتماد التصميم وعرض السعر {no} ✅ فريق المبيعات هيتواصل معاك على {phone} لتأكيد العربون والتصنيع.",
    changes: "تمام، سجلت ملاحظتك. قولي تحب تغيّر إيه بالظبط (المقاس، الخشب، التشطيب، اللون...).",
    after_approved: "طلبك {no} معتمد. لمتابعة الطلب بعد التصنيع استخدم صفحة تتبع الطلبات برقم الطلب.",
    not_understood: "معلش مفهمتش. ",
  },
  en: {
    greeting: "Welcome to SANAA! I'll help you order a piece of furniture and get a quotation and a 3D design.",
    product_type: "What would you like to order? ({choices})",
    dimensions: 'What size do you need in cm? Write width × depth × height (e.g. 200x60x220), or type "standard".',
    wood: "Which wood would you like? ({choices})",
    finish: "Which finish? ({choices})",
    color: "Which colour? ({choices})",
    quantity: "How many pieces?",
    city: "Delivery city? ({choices}, or type your city)",
    customer_name: "May I have your name?",
    customer_phone: "Your mobile number? (11 digits)",
    bad_dimensions: "That size is outside the range for a {product}: {axis} must be between {low} and {high} cm.",
    bad_quantity: "Quantity must be between 1 and 50.",
    axis: { width_cm: "width", depth_cm: "depth", height_cm: "height" },
    summary: "Here is your order:\n- {product} {dims} cm x {quantity}\n- Wood: {wood} | Finish: {finish} | Colour: {color}\n- Delivery: {city}\n- Name: {name} | Mobile: {phone}\nShall I confirm and prepare the quotation? (yes / or tell me what to change)",
    what_change: "What would you like to change? (size, wood, finish, colour, quantity, city)",
    quoted: "{quotation}\n\nWould you like a 3D design of this piece before confirming? (yes / no)",
    quoted_help: 'Quotation {no} is saved. Type "design" to see the 3D design, or "start over" for a new order.',
    design_ready: 'Your design is ready ✅ The model dimensions match your request ({dims} cm).\n- 3D view: {viewer}\n- Image: {preview}\nType "approve" if you are happy, or tell me what to change.',
    design_mismatch: "Note: the model dimensions do not exactly match the request; our team will review them.",
    approved: "Design and quotation {no} approved ✅ Our sales team will call you on {phone} to confirm the deposit and production.",
    changes: "Noted. Tell me exactly what you want to change (size, wood, finish, colour...).",
    after_approved: "Your order {no} is approved. After production starts, use order tracking with your order number.",
    not_understood: "Sorry, I didn't get that. ",
  },
};

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`));
const g = (v: unknown) => String(Number(v));

export type ChatOptions = { useLlm?: boolean; origin?: string };

export class CustomerChatbot {
  catalog = getCatalog();
  constructor(private options: ChatOptions = {}) {}

  private t(state: SessionState, key: string, values?: Record<string, string | number>): string {
    const text = TEXT[state.language][key] as string;
    return values ? fill(text, values) : text;
  }

  private question(state: SessionState, field: string): string {
    if ((OPTION_FIELDS as string[]).includes(field)) {
      const choices = this.catalog.choices(field as OptionField, state.language).join(state.language === "ar" ? "، " : ", ");
      return this.t(state, field, { choices });
    }
    return this.t(state, field);
  }

  async handle(messageInput: string, sessionId?: string | null, language?: Language | null) {
    let message = (messageInput ?? "").trim();
    if (!message) throw new ValidationFailedError("Message is empty");
    message = message.slice(0, MAX_MESSAGE);
    const state = await this.load(sessionId ?? null, message, language ?? null);
    this.add(state, "user", message);
    const [reply, design] = await this.step(state, message);
    this.add(state, "assistant", reply);
    await saveSession(state);
    const quotation = state.quotation_no ? await getQuotation(state.quotation_no) : null;
    return {
      session_id: state.session_id, language: state.language, status: state.status, awaiting: state.awaiting,
      reply, collected: state.data, quotation, design: withOrigin(design, this.options.origin ?? ""),
    };
  }

  async history(sessionId: string) {
    const raw = await getSession(sessionId);
    if (!raw) throw new NotFoundError("Session not found");
    return raw;
  }

  private add(state: SessionState, role: string, text: string) {
    state.history.push({ role, text, at: nowIso() });
    state.history = state.history.slice(-MAX_HISTORY);
    state.updated_at = nowIso();
  }

  private async load(sessionId: string | null, message: string, language: Language | null): Promise<SessionState> {
    if (sessionId) {
      const raw = await getSession(sessionId);
      if (!raw) throw new NotFoundError("Session not found or expired; start a new chat without session_id");
      if (language === "ar" || language === "en") raw.language = language;
      return raw;
    }
    const now = nowIso();
    return {
      session_id: tokenUrlsafe(18), language: language === "ar" || language === "en" ? language : detectLanguage(message),
      status: "collecting", awaiting: null, data: {}, quotation_no: null, design_id: null, history: [], created_at: now, updated_at: now,
    };
  }

  private async extract(state: SessionState, message: string): Promise<Collected> {
    let values = extractMentions(message, this.catalog, state.awaiting, (state.data["product_type"] as string) ?? null);
    if (state.awaiting === "dimensions" && state.data["product_type"]) {
      Object.assign(values, parseDimensions(message, this.catalog, String(state.data["product_type"])));
    }
    if (!Object.keys(values).length && this.options.useLlm !== false && ![null, "customer_name", "customer_phone"].includes(state.awaiting)) {
      values = await this.extractWithLlm(message);
    }
    if (state.awaiting === "city" && !("city" in values) && message.length <= 40 && !/\d/.test(message)) {
      values["city"] = message.trim(); // unknown city -> "other" delivery zone
    }
    return values;
  }

  private async extractWithLlm(message: string): Promise<Collected> {
    const c = this.catalog;
    const list = (f: OptionField) => JSON.stringify(Object.keys(c.options(f)));
    const prompt = render("customer_prompt", { product_types: list("product_type"), woods: list("wood"), finishes: list("finish"),
      colors: list("color"), cities: list("city") });
    const nullable = (type: "string" | "number" | "integer") => ({ type: [type, "null"] }) as never;
    try {
      const data = await chatJson<Record<string, unknown>>({
        instructions: prompt, user: message,
        schema: strictObject({
          product_type: nullable("string"), width_cm: nullable("number"), depth_cm: nullable("number"), height_cm: nullable("number"),
          wood: nullable("string"), finish: nullable("string"), color: nullable("string"), quantity: nullable("integer"),
          city: nullable("string"), customer_name: nullable("string"), customer_phone: nullable("string"),
        }),
      });
      const values: Collected = {};
      for (const field of OPTION_FIELDS) {
        if (data[field]) {
          const match = c.find(field, String(data[field]));
          if (match) values[field] = match.key;
        }
      }
      for (const key of ["width_cm", "depth_cm", "height_cm"]) {
        const v = Number(data[key]);
        if (data[key] && v >= 1 && v <= 1000) values[key] = v;
      }
      const q = Math.trunc(Number(data["quantity"]));
      if (data["quantity"] && q >= 1 && q <= 50) values["quantity"] = q;
      return values;
    } catch (error) {
      if (error instanceof LLMError) {
        console.info("LLM extraction skipped:", error.message);
        return {};
      }
      throw error;
    }
  }

  /** Store values; return an error message for invalid ones. */
  private apply(state: SessionState, values: Collected): string | null {
    Object.assign(state.data, values);
    const problems = validate(state.data, this.catalog);
    if (problems["dimensions"]) {
      const [axis, limits] = problems["dimensions"].split(":") as [string, string];
      const [low, high] = limits.split("-") as [string, string];
      for (const key of ["width_cm", "depth_cm", "height_cm"]) delete state.data[key];
      const product = this.catalog.label("product_type", String(state.data["product_type"]), state.language);
      return this.t(state, "bad_dimensions", { product, axis: TEXT[state.language]["axis"][axis], low, high });
    }
    if (problems["quantity"]) {
      delete state.data["quantity"];
      return this.t(state, "bad_quantity");
    }
    return null;
  }

  private next(state: SessionState, prefix = ""): string {
    const missing = missingFields(state.data);
    if (missing.length) {
      state.status = "collecting";
      state.awaiting = missing[0]!;
      return (prefix ? prefix + "\n" : "") + this.question(state, missing[0]!);
    }
    state.status = "confirming";
    state.awaiting = null;
    return (prefix ? prefix + "\n" : "") + this.summary(state);
  }

  private summary(state: SessionState): string {
    const d = state.data, lang = state.language, label = this.catalog.label.bind(this.catalog);
    return this.t(state, "summary", {
      product: label("product_type", String(d["product_type"]), lang), dims: `${g(d["width_cm"])}×${g(d["depth_cm"])}×${g(d["height_cm"])}`,
      quantity: d["quantity"]!, wood: label("wood", String(d["wood"]), lang), finish: label("finish", String(d["finish"]), lang),
      color: label("color", String(d["color"]), lang), city: label("city", String(d["city"]), lang),
      name: d["customer_name"]!, phone: d["customer_phone"]!,
    });
  }

  private async step(state: SessionState, message: string): Promise<[string, any]> {
    if (containsAny(message, RESET_WORDS)) {
      state.data = {}; state.quotation_no = null; state.design_id = null;
      return [this.next(state, this.t(state, "greeting")), null];
    }
    if (state.status === "collecting" || state.status === "confirming") {
      const isNew = state.history.length <= 1;
      const values = await this.extract(state, message);
      if (state.status === "confirming" && !Object.keys(values).length) {
        if (isYes(message)) {
          const quotation = await createQuotation(state.data, state.session_id, state.language);
          state.quotation_no = quotation.quotation_no; state.status = "quoted"; state.awaiting = null;
          return [this.t(state, "quoted", { quotation: formatQuotation(quotation, state.language) }), null];
        }
        return [this.t(state, "what_change"), null];
      }
      const error = this.apply(state, values);
      let prefix = isNew ? this.t(state, "greeting") : "";
      if (error) prefix = (prefix ? prefix + "\n" : "") + error;
      else if (!Object.keys(values).length && !isNew) prefix = this.t(state, "not_understood").trim();
      return [this.next(state, prefix), null];
    }
    if (state.status === "quoted") {
      if (isYes(message) || containsAny(message, DESIGN_WORDS)) return this.makeDesign(state);
      return [this.t(state, "quoted_help", { no: state.quotation_no! }), null];
    }
    if (state.status === "design_ready") {
      const values = extractMentions(message, this.catalog, null, (state.data["product_type"] as string) ?? null);
      if (isYes(message) && !Object.keys(values).length && !isNo(message)) {
        const design = await decideDesign(state.design_id!, state.session_id, true);
        state.status = "approved";
        return [this.t(state, "approved", { no: state.quotation_no!, phone: String(state.data["customer_phone"] ?? "") }), design];
      }
      const design = await decideDesign(state.design_id!, state.session_id, false, message);
      if (Object.keys(values).length) {
        state.quotation_no = null; state.design_id = null;
        const error = this.apply(state, values);
        return [this.next(state, error ?? ""), design];
      }
      state.status = "confirming"; state.awaiting = null; state.quotation_no = null; state.design_id = null;
      return [this.t(state, "changes"), design];
    }
    return [this.t(state, "after_approved", { no: state.quotation_no ?? "" }), null];
  }

  private async makeDesign(state: SessionState): Promise<[string, any]> {
    const design = await createDesign(state.quotation_no!, state.session_id);
    state.design_id = design.design_id; state.status = "design_ready";
    const dims = design["spec"].dimensions_cm;
    const origin = this.options.origin ?? "";
    let reply = this.t(state, "design_ready", {
      dims: `${g(dims.width)}×${g(dims.depth)}×${g(dims.height)}`,
      viewer: origin + design["files"].viewer, preview: origin + design["files"].preview,
    });
    if (!design["dimension_check"].passed) reply += "\n" + this.t(state, "design_mismatch");
    return [reply, design];
  }
}
