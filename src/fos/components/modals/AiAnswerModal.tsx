import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import { api } from '@/fos/lib/cloud';

export default function AiAnswerModal() {
  const { counted, lang, t } = useApp();
  const [playing, setPlaying] = useState(false);
  const answer = useQuery({
    queryKey: ['fos', 'ask', counted],
    queryFn: () => api('internal/ask', { method: 'POST', body: JSON.stringify({ question: counted, language: lang, save_report: true }) }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const r = answer.data as any;
  const columns: string[] = r?.rows?.[0] ? Object.keys(r.rows[0]) : [];

  async function listen() {
    if (!r?.report?.answer) return;
    setPlaying(true);
    try {
      const blob = await api<Blob>('internal/voice/speak', { method: 'POST', body: JSON.stringify({ text: r.report.answer.slice(0, 3000), language: r.language }) });
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setPlaying(false);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  return (
    <div className="ai-answer">
      <Heading>{t('إجابة من بيانات مصنعك', 'Answer from your factory data')}</Heading>
      <p>{counted}</p>
      {answer.isLoading && <div className="notice">{t('جارٍ تحليل البيانات...', 'Analysing your data...')}</div>}
      {answer.isError && <div className="notice danger">{(answer.error as Error).message}</div>}
      {r && (
        <>
          <div className="notice">{r.report.answer}</div>
          {!!r.report.highlights?.length && (
            <ul>
              {r.report.highlights.map((h: string) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          {!!r.report.recommendations?.length && (
            <>
              <Heading level={3}>{t('توصيات', 'Recommendations')}</Heading>
              <ul>
                {r.report.recommendations.map((h: string) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </>
          )}
          {!!r.report.notes?.length && <small>{r.report.notes.join(' · ')}</small>}
          {columns.length > 0 && (
            <details>
              <summary>
                {t('البيانات', 'Data')} ({r.row_count})
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {r.rows.slice(0, 50).map((row: any, i: number) => (
                      <tr key={i}>{columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.sql && <pre className="sql">{r.sql}</pre>}
            </details>
          )}
          <div className="toolbar">
            <Button onClick={listen} disabled={playing}>{playing ? t('جارٍ التشغيل...', 'Playing...') : t('🔊 استمع للإجابة', '🔊 Listen')}</Button>
          </div>
          <p className="muted">
            {t('بيانات حتى', 'Data as of')} {r.reference_date} · {r.domain}
          </p>
        </>
      )}
    </div>
  );
}
