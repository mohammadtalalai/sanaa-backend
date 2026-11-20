import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicShell, usePublicLang } from "@/fos/public/PublicShell";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "اطلب عرض سعر وتصميم ثلاثي الأبعاد | صنعة SANAA" },
      { name: "description", content: "تحدث مع مساعد المصنع، احصل على عرض سعر فوري وتصميم ثلاثي الأبعاد بمقاساتك قبل التصنيع." },
      { property: "og:title", content: "اطلب عرض سعر وتصميم ثلاثي الأبعاد | صنعة SANAA" },
      { property: "og:description", content: "عرض سعر فوري وتصميم ثلاثي الأبعاد بمقاساتك قبل التصنيع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

type Msg = { role: "user" | "assistant"; text: string; design?: any };

function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p.includes("viewer.html") ? "🧊 3D" : p.includes("preview") ? "🖼" : p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function ChatPage() {
  const { lang, setLang, t } = usePublicLang();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("collecting");
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("fos-chat");
    if (saved) {
      const s = JSON.parse(saved);
      setSessionId(s.sessionId);
      setMessages(s.messages);
      setStatus(s.status);
    }
  }, []);
  useEffect(() => {
    sessionStorage.setItem("fos-chat", JSON.stringify({ sessionId, messages, status }));
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [sessionId, messages, status]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/customer/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session_id: sessionId, language: sessionId ? null : lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "error");
      setSessionId(data.session_id);
      setStatus(data.status);
      setMessages((m) => [...m, { role: "assistant", text: data.reply, design: data.status === "design_ready" ? data.design : undefined }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: t("حصل خطأ، حاول مرة أخرى.", "Something went wrong, please try again.") + ` (${(e as Error).message})` }]);
      if ((e as Error).message.includes("Session")) setSessionId(null);
    } finally {
      setSending(false);
    }
  }

  const quick =
    status === "confirming" || status === "quoted"
      ? [t("نعم", "Yes")]
      : status === "design_ready"
        ? [t("موافق", "Approve"), t("عايز أغير اللون", "Change the colour")]
        : messages.length
          ? []
          : [t("عايز دولاب", "I want a wardrobe"), t("عايز ترابيزة سفرة", "I want a dining table"), t("عايز سرير", "I want a bed")];

  return (
    <PublicShell lang={lang} setLang={setLang}>
      <section className="panel public-card">
        <div className="panel-heading" style={{ padding: "0 0 14px" }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{t("اطلب قطعة أثاث بمقاساتك", "Order furniture made to your size")}</h1>
            <p>{t("اكتب طلبك، وخد عرض سعر فوري وتصميم ثلاثي الأبعاد قبل التأكيد.", "Describe what you need, get an instant quotation and a 3D design before confirming.")}</p>
          </div>
          {sessionId && (
            <button className="button" onClick={() => { setSessionId(null); setMessages([]); setStatus("collecting"); }}>
              {t("طلب جديد", "New order")}
            </button>
          )}
        </div>
        <div className="chat-log" ref={log} aria-live="polite">
          {!messages.length && <p>{t("مثال: «عايز دولاب زان ٢٠٠×٦٠×٢٢٠ لون أبيض».", "Example: “I want a white beech wardrobe 200x60x220”.")}</p>}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.design?.files?.preview && (
                <div className="chat-design">
                  <img src={m.design.files.preview} alt={t("صورة التصميم", "Design preview")} />
                </div>
              )}
              <Linkify text={m.text} />
            </div>
          ))}
          {sending && <div className="chat-msg assistant">…</div>}
        </div>
        {!!quick.length && (
          <div className="toolbar" style={{ marginBottom: 10, flexWrap: "wrap" }}>
            {quick.map((q) => (
              <button key={q} className="button" onClick={() => send(q)} disabled={sending}>
                {q}
              </button>
            ))}
          </div>
        )}
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input className="input" value={input} maxLength={1000} onChange={(e) => setInput(e.target.value)}
            placeholder={t("اكتب رسالتك...", "Type your message...")} aria-label={t("رسالتك", "Your message")} />
          <button className="button primary" type="submit" disabled={sending || !input.trim()}>
            {t("إرسال", "Send")}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 10, fontSize: 11 }}>
          {t("الأسعار تقديرية حسب قائمة أسعار المصنع، ويؤكدها فريق المبيعات قبل التصنيع.", "Prices are estimates from the factory price list and are confirmed by our sales team before production.")}
        </p>
      </section>
    </PublicShell>
  );
}
