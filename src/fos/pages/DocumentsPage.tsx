import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import PreviewModel from '@/fos/components/shared/PreviewModel';
import Icon from '@/fos/components/Icon';

export default function DocumentsPage() {
  const {
    setModal,
    selected,
    width,
    height,
    depth,
    doors,
    draftCustomer,
    product,
    signed,
    settings,
    policy,
    ar,
    t,
    money,
    total,
    record,
    go,
  } = useApp();
  return (
    <>
      <>
        <div className="toolbar print-controls">
          <Button variant="primary" onClick={() => window.print()}>
            <Icon name="file" />
            {t('طباعة / حفظ PDF', 'Print / Save PDF')}
          </Button>
          <Button onClick={() => setModal('signature')}>
            {signed ? t('التوقيع محفوظ', 'Signature saved') : t('توقيع العميل', 'Customer signature')}
          </Button>
          <Button onClick={() => go('preview')}>{t('العودة للمعاينة', 'Back to preview')}</Button>
        </div>
        <section className="print-document">
          <div className="document-header">
            <div>
              <Heading>صنعة SANAA</Heading>
              <p>{ar ? settings?.factory_name_ar : settings?.factory_name_en} · {ar ? settings?.branch_label_ar : settings?.branch_label_en}</p>
              <p dir="ltr">{settings?.phone}</p>
            </div>
            <div>
              <Heading>{t('ورقة طلب تصنيع', 'Manufacturing order sheet')}</Heading>
              <p>{selected?.id || t('مسودة', 'Draft')}</p>
            </div>
          </div>
          <div className="document-customer">
            <strong>{draftCustomer}</strong>
            <span>{selected?.date || new Date().toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}</span>
          </div>
          <div className="document-model">
            <PreviewModel />
          </div>
          <div className="record-row">
            <strong>{t('المنتج', 'Product')}</strong>
            <span>{product}</span>
          </div>
          <div className="record-row">
            <strong>{t('الأبعاد', 'Dimensions')}</strong>
            <span>
              {width} × {height} × {depth} cm
            </span>
          </div>
          <div className="record-row">
            <strong>{t('الأبواب', 'Doors')}</strong>
            <span>{doors}</span>
          </div>
          <div className="record-row">
            <strong>{t('الإجمالي', 'Selling total')}</strong>
            <span>{money(selected?.grandTotal || total * (1 + policy.tax / 100))} EGP</span>
          </div>
          <p>
            {t(
              'يبدأ التصنيع بعد اعتماد التصميم. التعديلات بعد التأكيد تتطلب موافقة المدير.',
              'Production starts after design approval. Changes after confirmation require manager approval.',
            )}
          </p>
          <div className="signatures">
            <span>
              {t('توقيع العميل', 'Customer signature')} {signed ? '✓' : ''}
            </span>
            <span>{t('توقيع الموظف', 'Employee signature')} __________________</span>
          </div>
        </section>
      </>
    </>
  );
}
