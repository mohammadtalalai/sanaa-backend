import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Select, Option, Heading } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';
import { PRODUCT_KEYS, WOOD_OPTIONS } from '@/fos/context/useAppState';
import { getCatalog } from '@/shared/catalog';

export default function WizardPage() {
  const {
    setModal,
    customers,
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
    step,
    setStep,
    draftCustomer,
    draftCustomerId,
    setDraftCustomerId,
    product,
    productKey,
    setProduct,
    limits,
    dimsValid,
    notes,
    setNotes,
    promisedDate,
    setPromisedDate,
    ar,
    t,
    money,
    total,
    notify,
    go,
  } = useApp();
  return (
    <>
      <section className="panel wizard">
        <div className="steps">
          {[
            t('العميل', 'Customer'),
            t('نوع المنتج', 'Product'),
            t('الأبعاد', 'Dimensions'),
            t('التكوين', 'Configuration'),
            t('التفاصيل', 'Details'),
            t('المراجعة', 'Review'),
          ].map((s, i) => (
            <div key={s} className={i <= step ? 'current' : ''}>
              <span>{i + 1}</span>
              {s}
            </div>
          ))}
        </div>
        <Heading>
          {
            [
              t('لمن نصنع القطعة؟', 'Who are we making this for?'),
              t('اختر نوع المنتج', 'Choose a product'),
              t('كل سنتيمتر يصنع فرقًا', 'Every centimetre matters'),
              t('صمّمها بطريقتك', 'Make it yours'),
              t('التفاصيل الأخيرة', 'Final details'),
              t('جاهز لرؤية فكرتك؟', 'Ready to see your idea?'),
            ][step]
          }
        </Heading>
        <div className="wizard-body">
          {step === 0 ? (
            <div className="field">
              <span>{t('العميل', 'Customer')}</span>
              <Select value={String(draftCustomerId ?? '')} onChange={(e) => setDraftCustomerId(+e.target.value)}>
                {customers.map((c) => (
                  <Option key={c.id} value={String(c.id)}>
                    {c.name} {c.phone ? `· ${c.phone}` : ''}
                  </Option>
                ))}
              </Select>
              <Button onClick={() => setModal('customer')}>
                {t('إضافة عميل جديد', 'Add a new customer')}
              </Button>
            </div>
          ) : step === 1 ? (
            <div className="product-choices">
              {PRODUCT_KEYS.map((key, i) => (
                <Button
                  variant={`product-choice ${productKey === key ? 'chosen' : ''}`}
                  key={key}
                  onClick={() => {
                    setProduct(key);
                    const [w, d, h] = getCatalog().product(key).default_dims as number[];
                    setWidth(w!);
                    setDepth(d!);
                    setHeight(h!);
                  }}
                >
                  <Icon name={i % 3 === 0 ? 'box' : i % 3 === 1 ? 'factory' : 'bag'} size={50} />
                  <strong>{getCatalog().label('product_type', key, ar ? 'ar' : 'en')}</strong>
                </Button>
              ))}
            </div>
          ) : step === 2 ? (
            <div className="dimension-inputs">
              {[
                [t('العرض (سم)', 'Width (cm)'), width, setWidth, 0],
                [t('الارتفاع (سم)', 'Height (cm)'), height, setHeight, 2],
                [t('العمق (سم)', 'Depth (cm)'), depth, setDepth, 1],
              ].map(([label, value, setter, axis]) => (
                <div className="field" key={String(label)}>
                  <span>{String(label)}</span>
                  <Input
                    type="number"
                    min={limits.min[axis as number]}
                    max={limits.max[axis as number]}
                    value={Number(value)}
                    onChange={(e) => (setter as (n: number) => void)(+e.target.value)}
                  />
                  <small>
                    {limits.min[axis as number]}–{limits.max[axis as number]} cm
                  </small>
                </div>
              ))}
            </div>
          ) : step === 3 ? (
            <>
              <div className="field">
                <span>{t('عدد الأبواب', 'Doors')}</span>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={doors}
                  onChange={(e) => setDoors(Math.max(1, Math.min(5, +e.target.value)))}
                />
              </div>
              <div className="swatches">
                {[0, 1, 2].map((i) => (
                  <Button
                    aria-label={WOOD_OPTIONS[i]!.en}
                    key={i}
                    variant={`swatch wood-${i} ${wood === i ? 'chosen' : ''}`}
                    onClick={() => setWood(i)}
                  />
                ))}
              </div>
              <small>{t(WOOD_OPTIONS[wood]!.ar, WOOD_OPTIONS[wood]!.en)}</small>
            </>
          ) : step === 4 ? (
            <div className="form-grid">
              <div className="field">
                <span>{t('تاريخ التسليم المطلوب', 'Requested delivery date')}</span>
                <Input type="date" value={promisedDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setPromisedDate(e.target.value)} />
              </div>
              <div className="field">
                <span>{t('ملاحظات', 'Notes')}</span>
                <Input
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('أضف التفاصيل التي تهم العميل', 'Add details that matter to your customer')}
                />
              </div>
            </div>
          ) : (
            <div className="review">
              <Icon name="check" size={44} />
              <Heading>{draftCustomer}</Heading>
              <p>
                {product} · {width} × {height} × {depth} cm · {doors} {t('أبواب', 'doors')} · {t(WOOD_OPTIONS[wood]!.ar, WOOD_OPTIONS[wood]!.en)}
              </p>
              <strong>
                {money(total)} {t('ج.م', 'EGP')}
              </strong>
            </div>
          )}
        </div>
        <div className="panel-footer toolbar">
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
            {t('السابق', 'Back')}
          </Button>
          <span className="muted">{t('السعر من قائمة أسعار المصنع، قبل الضريبة', 'Price from the factory price list, before tax')}</span>
          <Button
            variant="primary"
            disabled={(step === 0 && !customers.length) || (step >= 2 && !dimsValid)}
            onClick={() => (step === 5 ? go('preview') : setStep(step + 1))}
          >
            {step === 5 ? t('فتح معاينة التصميم', 'Open design preview') : t('التالي', 'Next')}
            <Icon name="arrow" />
          </Button>
        </div>
      </section>
    </>
  );
}
