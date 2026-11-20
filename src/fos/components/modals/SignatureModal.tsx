import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';

export default function SignatureModal() {
  const { setModal, width, height, signed, setSigned, t, notify, record } = useApp();
  return (
    <>
      <>
        <Heading>{t('توقيع العميل', 'Customer signature')}</Heading>
        <p>
          {t(
            'ارسم توقيعك ثم اختر اعتماد. لا يتم التوقيع تلقائيًا.',
            'Draw your signature, then accept. No signature is added automatically.',
          )}
        </p>
        <canvas
          width="650"
          height="200"
          className="signature-pad"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext('2d');
            const r = e.currentTarget.getBoundingClientRect();
            ctx?.beginPath();
            ctx?.moveTo(((e.clientX - r.left) * 650) / r.width, ((e.clientY - r.top) * 200) / r.height);
          }}
          onPointerMove={(e) => {
            if (e.buttons) {
              const ctx = e.currentTarget.getContext('2d');
              const r = e.currentTarget.getBoundingClientRect();
              if (ctx) {
                ctx.lineWidth = 2;
                ctx.lineTo(((e.clientX - r.left) * 650) / r.width, ((e.clientY - r.top) * 200) / r.height);
                ctx.stroke();
                setSigned(true);
              }
            }
          }}
        />
        <div className="toolbar">
          <Button
            onClick={() => {
              const canvas = document.querySelector('canvas');
              canvas?.getContext('2d')?.clearRect(0, 0, 650, 200);
              setSigned(false);
            }}
          >
            {t('مسح', 'Clear')}
          </Button>
          <Button
            variant="primary"
            disabled={!signed}
            onClick={() => {
              setModal('');
              record('Customer signature accepted');
              notify('تم اعتماد التوقيع', 'Signature accepted');
            }}
          >
            {t('اعتماد التوقيع', 'Accept signature')}
          </Button>
        </div>
      </>
    </>
  );
}
