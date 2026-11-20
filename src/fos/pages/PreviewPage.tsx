import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Select, Option, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import PreviewModel from '@/fos/components/shared/PreviewModel';
import Icon from '@/fos/components/Icon';
import Model3D from '@/fos/components/shared/Model3D';
import { WOOD_OPTIONS } from '@/fos/context/useAppState';

export default function PreviewPage() {
  const {
    setModal,
    selected,
    width,
    setWidth,
    height,
    setHeight,
    depth,
    setDepth,
    doors,
    setDoors,
    wood,
    setWood,
    opened,
    setOpened,
    view,
    setView,
    dimensions,
    setDimensions,
    setZoom,
    setOrbit,
    approvedDesign,
    setApprovedDesign,
    locked,
    draftCustomer,
    product,
    limits,
    dimsValid,
    busy,
    policy,
    t,
    money,
    total,
    go,
    saveOrder,
  } = useApp();
  return (
    <>
      <>
        <div className="preview-status">
          <StatusBadge status={locked ? 'confirmed' : 'draft'} />
          <span>
            {selected?.id || t('مسودة جديدة', 'New draft')} · {draftCustomer} · {product}
          </span>
          <span className="muted">
            {t('اختر «ثلاثي الأبعاد» لعرض الموديل الحقيقي بالمقاسات', 'Choose “3D” to see the true-to-size model')}
          </span>
        </div>
        {locked && (
          <div className="notice">
            <Icon name="shield" />
            {t(
              'مقفل بعد التأكيد. أي تغيير يتطلب موافقة المدير.',
              'Locked after confirmation. Changes require manager approval.',
            )}
          </div>
        )}
        <div className="preview-layout">
          <section className="panel viewer">
            <div className="viewer-toolbar">
              <div className="segmented">
                {['perspective', 'front', 'side', 'top', '3d'].map((v, i) => (
                  <Button variant={view === v ? 'selected' : ''} key={v} onClick={() => setView(v)}>
                    {t(['منظور', 'أمامي', 'جانبي', 'علوي', 'ثلاثي الأبعاد'][i]!, ['Perspective', 'Front', 'Side', 'Top', '3D'][i]!)}
                  </Button>
                ))}
              </div>
              <Button
                variant="icon"
                aria-label="Reset view"
                onClick={() => {
                  setOrbit(-24);
                  setZoom(1);
                }}
              >
                <Icon name="refresh" />
              </Button>
            </div>
            {view === '3d' ? <Model3D /> : <PreviewModel />}
            <div className="viewer-footer">
              <Button onClick={() => setDimensions(!dimensions)}>
                <Icon name="tool" />
                {t('الأبعاد', 'Dimensions')}
              </Button>
              <Button onClick={() => setOpened(!opened)}>
                <Icon name="box" />
                {opened ? t('إغلاق الأبواب', 'Close doors') : t('فتح الأبواب', 'Open doors')}
              </Button>
              <Button
                onClick={() => {
                  document.querySelector('.viewer')?.requestFullscreen?.();
                }}
              >
                <Icon name="eye" />
                {t('عرض للعميل', 'Present')}
              </Button>
            </div>
          </section>
          <section className="panel specification">
            <div className="panel-heading">
              <Heading>{t('تفاصيل القطعة', 'Your piece, in detail')}</Heading>
              <Icon name="box" />
            </div>
            <div className="field">
              <span>{t('الأبعاد بالسنتيمتر', 'Dimensions in cm')}</span>
              <div className="dimension-inputs">
                {[
                  [width, setWidth, 0],
                  [height, setHeight, 2],
                  [depth, setDepth, 1],
                ].map(([v, s, axis], i) => (
                  <Input
                    key={i}
                    aria-label={['Width', 'Height', 'Depth'][i]}
                    type="number"
                    min={limits.min[axis as number]}
                    max={limits.max[axis as number]}
                    disabled={locked}
                    value={Number(v)}
                    onChange={(e) => (s as (v: number) => void)(+e.target.value)}
                  />
                ))}
              </div>
            </div>
            <div className="field">
              <span>{t('الخامة والتشطيب', 'Material & finish')}</span>
              <div className="swatches">
                {[0, 1, 2].map((i) => (
                  <Button
                    key={i}
                    disabled={locked}
                    aria-label={['Walnut', 'Oak', 'Ivory'][i]}
                    variant={`swatch wood-${i} ${wood === i ? 'chosen' : ''}`}
                    onClick={() => setWood(i)}
                  />
                ))}
              </div>
              <small>
                {t(WOOD_OPTIONS[wood]!.ar, WOOD_OPTIONS[wood]!.en)}
              </small>
            </div>
            <div className="field">
              <span>{t('عدد الأبواب', 'Number of doors')}</span>
              <Select disabled={locked} value={doors} onChange={(e) => setDoors(+e.target.value)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Option key={n}>{n}</Option>
                ))}
              </Select>
            </div>
            <div className="price-summary">
              <div>
                <span>{t('سعر القطعة', 'Piece price')}</span>
                <strong>
                  {money(total)} {t('ج.م', 'EGP')}
                </strong>
              </div>
              <div>
                <span>{t('الكمية', 'Quantity')}</span>
                <span>1</span>
              </div>
              <div>
                <span>
                  {t('الضريبة', 'VAT')} ({policy.tax}%)
                </span>
                <span>{money((total * policy.tax) / 100)}</span>
              </div>
              <div className="selling-total">
                <span>{t('الإجمالي شامل الضريبة', 'Total incl. tax')}</span>
                <strong>
                  {money(total * (1 + policy.tax / 100))} <small>{t('ج.م', 'EGP')}</small>
                </strong>
              </div>
            </div>
            <label className="checkbox">
              <Input
                type="checkbox"
                checked={approvedDesign}
                disabled={locked}
                onChange={(e) => setApprovedDesign(e.target.checked)}
              />
              {t('وافق العميل على التصميم', 'Customer approved the design')}
            </label>
          </section>
        </div>
        <div className="action-bar">
          <Button onClick={() => (locked ? setModal('revision') : go('wizard'))}>
            {locked ? t('طلب تعديل', 'Request revision') : t('العودة للتعديل', 'Back to edit')}
          </Button>
          <Button onClick={() => go('documents')}>
            <Icon name="file" />
            {t('ورقة الطلب', 'Order sheet')}
          </Button>
          <div className="spacer" />
          <Button disabled={locked || busy || !dimsValid} onClick={() => saveOrder()}>
            {t('حفظ المسودة', 'Save draft')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || (!locked && (!approvedDesign || !dimsValid))}
            onClick={() => (locked ? go('finance') : setModal('confirm'))}
          >
            {locked ? t('إنشاء فاتورة', 'Create invoice') : t('تأكيد الطلب', 'Confirm order')}
            <Icon name="check" />
          </Button>
        </div>
      </>
    </>
  );
}
