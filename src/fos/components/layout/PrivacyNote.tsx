import { useApp } from '@/fos/context/AppContext';
import Icon from '@/fos/components/Icon';

export default function PrivacyNote() {
  const { system, view, t } = useApp();
  return (
    <>
      {system === 'admin' && (
        <div className="privacy">
          <Icon name="shield" />
          {t(
            'لا يمكن لمسؤولي المنصة الاطلاع على بيانات أعمال المصانع. يتطلب الوصول موافقة مؤقتة من مدير المصنع ويُسجّل بالكامل.',
            'Platform admins cannot view factory business data. Access requires time-limited manager approval and is audited.',
          )}
        </div>
      )}
    </>
  );
}
