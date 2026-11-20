import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Heading } from '@/fos/components/ui';
import Metric from '@/fos/components/shared/Metric';
import Icon from '@/fos/components/Icon';
import { api, sb } from '@/fos/lib/cloud';
import { recordAudio } from '@/fos/lib/voice';

function MonthlyReport() {
  const { lang, t, money, notify } = useApp();
  const report = useMutation({
    mutationFn: () => api('internal/recommendations', { method: 'POST', body: JSON.stringify({ language: lang, use_llm: true, save: true }) }),
    onError: (e: Error) => notify(e.message, e.message),
  });
  const r = report.data as any;
  return (
    <section className="panel ai-report">
      <div className="panel-heading">
        <div>
          <Heading>{t('التوصيات والتوقعات الشهرية', 'Monthly recommendations & forecasts')}</Heading>
          <p>{t('تحليل آخر شهر مكتمل مع توقع الأشهر الثلاثة القادمة.', 'Analyses the last complete month and forecasts the next three.')}</p>
        </div>
        <Button variant="primary" disabled={report.isPending} onClick={() => report.mutate()}>
          <Icon name="spark" />
          {report.isPending ? t('جارٍ التحليل...', 'Analysing...') : t('توليد التقرير', 'Generate report')}
        </Button>
      </div>
      {r && (
        <div className="ai-report-body">
          <div className="notice">{r.summary}</div>
          {!!r.priorities?.length && (
            <>
              <Heading level={3}>{t('الأولويات', 'Priorities')}</Heading>
              <ol>
                {r.priorities.map((p: string) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </>
          )}
          <Heading level={3}>{t('التوصيات', 'Recommendations')}</Heading>
          {r.recommendations.map((rec: any, i: number) => (
            <div className="record-row" key={i}>
              <span className={`badge ${rec.priority === 1 ? 'pending' : ''}`}>P{rec.priority}</span>
              <strong>{rec.action}</strong>
              <span className="muted">{rec.reason}</span>
            </div>
          ))}
          <Heading level={3}>{t('توقع الإيرادات', 'Revenue forecast')}</Heading>
          {r.forecasts
            .filter((f: any) => f.target === 'company_net_revenue')
            .map((f: any) => (
              <div className="record-row" key={f.target}>
                {f.forecast.map((p: any) => (
                  <span key={p.month}>
                    {p.month.slice(0, 7)}: <strong>{money(p.value)}</strong> EGP
                  </span>
                ))}
                <small>{f.model}</small>
              </div>
            ))}
          <small>
            {t('بيانات حتى', 'Data as of')} {r.reference_date} · {t('الشهر المحلل', 'Month analysed')} {r.last_complete_month} ·{' '}
            {r.evaluation?.checks_passed ? t('اجتاز المراجعة مع البيانات التاريخية', 'Checked against history: passed') : t('راجع الملاحظات', 'Review the checks')}
          </small>
        </div>
      )}
    </section>
  );
}

function AdminAi() {
  const { t, notify, record } = useApp();
  const reports = useQuery({
    queryKey: ['fos', 'analysis-reports'],
    queryFn: async () => (await sb.from('analysis_reports').select('id, question, language, created_at').order('created_at', { ascending: false }).limit(20)).data ?? [],
  });
  const health = useQuery({ queryKey: ['fos', 'ai-health'], queryFn: () => api('health/ai') });
  const h = health.data as any;
  return (
    <>
      <div className="metrics">
        <Metric icon={'spark'} label={t('نموذج الذكاء', 'AI model')} value={h?.model ?? '—'} trend={''} />
        <Metric icon={'globe'} label={t('تحويل الصوت لنص', 'Speech to text')} value={h?.speech_to_text ? t('متاح', 'Available') : '—'} trend={''} />
        <Metric icon={'check'} label={t('تقارير محفوظة', 'Saved reports')} value={String(reports.data?.length ?? 0)} trend={''} />
      </div>
      <Button
        variant="primary"
        onClick={async () => {
          await health.refetch();
          const ok = (health.data as any)?.status === 'ok';
          notify(ok ? 'خدمة الذكاء تعمل بشكل سليم' : 'خدمة الذكاء غير متاحة', ok ? 'AI service is healthy' : 'AI service is unavailable');
          record('AI health check');
        }}
      >
        {t('فحص الخدمة', 'Run health check')}
      </Button>
      {(reports.data as any[] | undefined)?.map((r) => (
        <div className="record-row" key={r.id}>
          {r.question} · {new Date(r.created_at).toLocaleString()}
        </div>
      ))}
    </>
  );
}

export default function AiPage() {
  const { system, lang, setModal, counted, setCounted, t, notify } = useApp();
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const recorder = useRef<{ stop: () => Promise<Blob> } | null>(null);

  async function toggleVoice() {
    if (recording) {
      setRecording(false);
      const blob = await recorder.current!.stop();
      setSending(true);
      try {
        const form = new FormData();
        form.append('audio', new File([blob], 'question.webm', { type: blob.type }));
        form.append('language', lang);
        const result: any = await api('internal/voice/ask', { method: 'POST', body: form });
        queryClient.setQueryData(['fos', 'ask', result.transcript], result);
        setCounted(result.transcript);
        setModal('ai-answer');
      } catch (e) {
        notify((e as Error).message, (e as Error).message);
      } finally {
        setSending(false);
      }
      return;
    }
    try {
      recorder.current = await recordAudio();
      setRecording(true);
    } catch {
      notify('اسمح باستخدام الميكروفون للمتابعة', 'Allow microphone access to continue');
    }
  }

  return (
    <>
      <section className="panel ai-page">
        <div className="ai-emblem">
          <Icon name="spark" size={32} />
        </div>
        <Heading>
          {system === 'admin' ? t('ذكاء يمكن الوثوق به', 'Intelligence you can trust') : t('بيانات مصنعك، إجابات أوضح.', 'Your factory data. Clearer answers.')}
        </Heading>
        <p>
          {system === 'admin'
            ? t('حالة الخدمة · التقارير المحفوظة', 'Service status · Saved reports')
            : t('اسأل بالعربي أو الإنجليزي، كتابةً أو بالصوت. الإجابة من بيانات مصنعك فقط.', 'Ask in Arabic or English, typed or spoken. Answers come from your factory data only.')}
        </p>
        {system === 'admin' ? (
          <AdminAi />
        ) : (
          <>
            <div className="suggestions">
              {[
                t('ما صافي الربح هذا الشهر مقارنة بالشهر الماضي؟', 'What is net profit this month vs last month?'),
                t('ما أكثر ٥ منتجات مبيعاً في آخر ٣ شهور؟', 'Top 5 products by revenue in the last 3 months?'),
                t('أي فرع حقق خسارة في آخر ٣ شهور؟', 'Which branch made a loss in the last 3 months?'),
                t('ما الخامات التي تحتاج إعادة طلب؟', 'Which materials need reordering?'),
              ].map((q) => (
                <Button key={q} onClick={() => { setCounted(q); setModal('ai-answer'); }}>
                  {q}
                  <Icon name="arrow" />
                </Button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (counted.trim().length >= 2) setModal('ai-answer'); }} className="ai-input">
              <Input required minLength={2} maxLength={2000} value={counted} onChange={(e) => setCounted(e.target.value)}
                placeholder={t('اسأل عن مصنعك...', 'Ask about your factory...')} />
              <Button type="button" variant={recording ? 'primary' : ''} disabled={sending} onClick={toggleVoice}
                aria-label={t('سؤال بالصوت', 'Ask by voice')}>
                {sending ? '…' : recording ? t('إيقاف', 'Stop') : t('🎙 صوت', '🎙 Voice')}
              </Button>
              <Button type="submit" variant="primary" aria-label={t('إرسال', 'Send')}>
                <Icon name="arrow" />
              </Button>
            </form>
          </>
        )}
      </section>
      {system === 'manager' && <MonthlyReport />}
    </>
  );
}
