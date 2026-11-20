import { useEffect, useState, type ReactNode } from 'react';
import { brandLogoUrl } from '@/fos/lib/brand';

export function usePublicLang() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('fos-lang') || 'null');
      if (saved === 'en' || saved === 'ar') setLang(saved);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('fos-lang', JSON.stringify(lang));
  }, [lang]);
  const t = (a: string, e: string) => (lang === 'ar' ? a : e);
  return { lang, setLang, t };
}

export function PublicShell({ lang, setLang, children }: { lang: 'ar' | 'en'; setLang: (l: 'ar' | 'en') => void; children: ReactNode }) {
  return (
    <div className="public-page">
      <header className="public-top">
        <a href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <img className="logo-img" src={brandLogoUrl} alt="" width={34} height={34} />
          <div>
            <strong>
              صنعة <span>SANAA</span>
            </strong>
          </div>
        </a>
        <div className="toolbar">
          <a className="button text" href="/chat">{lang === 'ar' ? 'عرض سعر' : 'Get a quote'}</a>
          <a className="button text" href="/track">{lang === 'ar' ? 'تتبع طلبك' : 'Track order'}</a>
          <button className="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'AR'}</button>
        </div>
      </header>
      {children}
    </div>
  );
}
