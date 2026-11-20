import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PublicShell, usePublicLang } from "@/fos/public/PublicShell";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة | صنعة SANAA" },
      { name: "description", content: "اختر كلمة مرور جديدة لحسابك في صنعة SANAA." },
      { property: "og:title", content: "تعيين كلمة مرور جديدة | صنعة SANAA" },
      { property: "og:description", content: "اختر كلمة مرور جديدة لحسابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { lang, setLang, t } = usePublicLang();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return (
    <PublicShell lang={lang} setLang={setLang}>
      <section className="panel public-card" style={{ maxWidth: 440 }}>
        <h1 style={{ fontSize: 22 }}>{t("كلمة مرور جديدة", "New password")}</h1>
        {done ? (
          <>
            <p>{t("تم تغيير كلمة المرور.", "Your password was changed.")}</p>
            <button className="button primary" onClick={() => navigate({ to: "/$page", params: { page: "dashboard" } })}>
              {t("الدخول للنظام", "Go to the app")}
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const { error } = await supabase.auth.updateUser({ password });
              if (error) setError(error.message);
              else setDone(true);
            }}
          >
            <div className="field">
              <span>{t("كلمة المرور الجديدة (٨ أحرف على الأقل)", "New password (at least 8 characters)")}</span>
              <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            {error && <div className="notice danger">{error}</div>}
            <button className="button primary" type="submit">
              {t("حفظ", "Save")}
            </button>
          </form>
        )}
      </section>
    </PublicShell>
  );
}
