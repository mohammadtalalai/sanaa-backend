import { useApp } from '@/fos/context/AppContext';
import { Heading } from '@/fos/components/ui';

export default function RecordModal() {
  const { counted, t } = useApp();
  return (
    <>
      <Heading>{t('تفاصيل السجل', 'Record details')}</Heading>
      {counted.split(' · ').map((part, i) => (
        <div className="record-row" key={i}>
          {part}
        </div>
      ))}
    </>
  );
}
