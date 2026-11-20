import { useState } from 'react';
import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Heading } from '@/fos/components/ui';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { LovableMark } from '@lovable.dev/cloud-auth-js/react';
import { brandLogoUrl } from '@/fos/lib/brand';

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
  );
}

export default function AuthOverlay() {
  const { authStage, setAuthStage, t, notify, lang, setLang } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function social(provider: 'google' | 'lovable') {
    setError('');
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + '/dashboard' });
    if (result.error) setError(result.error.message ?? String(result.error));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      if (authStage === 'recovery') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        notify('أرسلنا رابط استعادة كلمة المرور إلى بريدك', 'We sent a password reset link to your email');
        setAuthStage('login');
      } else if (authStage === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) setAuthStage('check-email');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(/Invalid login/i.test(message) ? t('البريد أو كلمة المرور غير صحيحة', 'Wrong email or password') : message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-overlay">
      <section className="panel auth-card">
        <div className="brand">
          <img className="logo-img" src={brandLogoUrl} alt="" width={34} height={34} />
          <strong>صنعة SANAA</strong>
        </div>
        <Heading>
          {authStage === 'recovery'
            ? t('استعادة كلمة المرور', 'Recover password')
            : authStage === 'signup'
              ? t('إنشاء حساب', 'Create an account')
              : authStage === 'check-email'
                ? t('راجع بريدك الإلكتروني', 'Check your email')
                : t('أهلاً بعودتك', 'Welcome back')}
        </Heading>
        <p>
          {authStage === 'check-email'
            ? t('أرسلنا رابط تأكيد إلى بريدك. افتحه ثم سجّل الدخول.', 'We sent a confirmation link. Open it, then sign in.')
            : t('نظام إدارة مصانع ومعارض الأثاث.', 'Management system for furniture factories and showrooms.')}
        </p>
        {authStage !== 'check-email' && (
          <form onSubmit={submit}>
            {authStage === 'signup' && (
              <div className="field">
                <span>{t('الاسم', 'Full name')}</span>
                <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </div>
            )}
            <div className="field">
              <span>{t('البريد الإلكتروني', 'Email')}</span>
              <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            {authStage !== 'recovery' && (
              <div className="field">
                <span>{t('كلمة المرور', 'Password')}</span>
                <Input type="password" required minLength={authStage === 'signup' ? 8 : 6} value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete={authStage === 'signup' ? 'new-password' : 'current-password'} />
              </div>
            )}
            {error && <div className="notice danger">{error}</div>}
            <Button type="submit" variant="primary" disabled={sending}>
              {authStage === 'recovery' ? t('إرسال الرابط', 'Send link') : authStage === 'signup' ? t('إنشاء الحساب', 'Create account') : t('تسجيل الدخول', 'Sign in')}
            </Button>
          </form>
        )}
        {(authStage === 'login' || authStage === 'signup') && (
          <div className="auth-providers">
            <Button type="button" variant="google-button" onClick={() => social('google')}>
              <GoogleLogo />
              {t('المتابعة باستخدام Google', 'Continue with Google')}
            </Button>
            <Button type="button" onClick={() => social('lovable')}>
              <LovableMark />
              {t('المتابعة باستخدام Lovable', 'Continue with Lovable')}
            </Button>
          </div>
        )}
        <div className="auth-links">
          {authStage === 'login' ? (
            <>
              <Button variant="text" onClick={() => setAuthStage('signup')}>{t('ليس لديك حساب؟ أنشئ حساباً', 'No account? Sign up')}</Button>
              <Button variant="text" onClick={() => setAuthStage('recovery')}>{t('نسيت كلمة المرور؟', 'Forgot password?')}</Button>
            </>
          ) : (
            <Button variant="text" onClick={() => setAuthStage('login')}>{t('العودة لتسجيل الدخول', 'Back to sign in')}</Button>
          )}
          <Button variant="text" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'English' : 'العربية'}</Button>
        </div>
        <div className="auth-links">
          <a className="button text" href="/chat">{t('عميل؟ اطلب عرض سعر', 'Customer? Get a quotation')}</a>
          <a className="button text" href="/track">{t('تتبع طلبك', 'Track your order')}</a>
        </div>
      </section>
    </div>
  );
}
