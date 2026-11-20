import { useState } from 'react';
import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Select, Option, Heading } from '@/fos/components/ui';
import { supabase } from '@/integrations/supabase/client';

export default function FormModal() {
  const { modal, setModal, selected, counted, t, notify, fail, request, addCustomer, addTenant, recordPayment, decide, busy } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const value = String(form.get('value') || '').trim();
        let ok = true;
        if (modal === 'customer') ok = await addCustomer(value, String(form.get('phone') || ''));
        if (modal === 'factory') ok = await addTenant(value, String(form.get('email') || ''), String(form.get('plan') || 'Professional'));
        if (modal === 'revision') ok = await request(value);
        if (modal === 'payment' && selected) {
          const amount = +value;
          const balance = selected.grandTotal - selected.paid;
          if (!(amount > 0) || amount > balance + 0.01) {
            notify('المبلغ غير صالح أو يتجاوز الرصيد', 'Invalid amount or overpayment');
            return;
          }
          ok = await recordPayment(selected, amount, String(form.get('method') || 'cash'));
        }
        if (modal === 'approve' || modal === 'reject') ok = await decide(counted, modal === 'approve', value);
        if (modal === 'password') {
          const { error } = await supabase.auth.updateUser({ password: value, current_password: currentPassword } as never);
          if (error) {
            fail(error);
            return;
          }
          notify('تم تغيير كلمة المرور', 'Password changed');
        }
        if (ok) setModal('');
      }}
    >
      <Heading>
        {t(
          { customer: 'إضافة عميل', factory: 'إنشاء مصنع', revision: 'طلب تعديل', payment: 'تسجيل دفعة', approve: 'تأكيد الموافقة',
            reject: 'رفض الطلب', password: 'تغيير كلمة المرور' }[modal] || '',
          { customer: 'Add customer', factory: 'Create factory', revision: 'Request revision', payment: 'Record payment',
            approve: 'Confirm approval', reject: 'Reject request', password: 'Change password' }[modal] || '',
        )}
      </Heading>
      {modal === 'payment' && selected && (
        <p>
          {selected.id} · {t('المتبقي', 'Balance')}: {Math.max(0, Math.round(selected.grandTotal - selected.paid)).toLocaleString()} EGP
        </p>
      )}
      {modal === 'password' && (
        <div className="field">
          <span>{t('كلمة المرور الحالية', 'Current password')}</span>
          <Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </div>
      )}
      <div className="field">
        <span>
          {['approve', 'reject', 'revision'].includes(modal)
            ? t('السبب (مطلوب)', 'Reason (required)')
            : modal === 'payment'
              ? t('المبلغ بالجنيه', 'Amount in EGP')
              : modal === 'password'
                ? t('كلمة مرور جديدة (٨ أحرف على الأقل)', 'New password (at least 8 characters)')
                : t('الاسم', 'Name')}
        </span>
        <Input
          name="value"
          required
          maxLength={modal === 'payment' ? undefined : 300}
          type={modal === 'payment' ? 'number' : modal === 'password' ? 'password' : 'text'}
          min={modal === 'payment' ? 1 : undefined}
          step={modal === 'payment' ? '0.01' : undefined}
          minLength={modal === 'password' ? 8 : undefined}
          autoComplete={modal === 'password' ? 'new-password' : undefined}
        />
      </div>
      {modal === 'customer' && (
        <div className="field">
          <span>{t('الهاتف', 'Phone')}</span>
          <Input name="phone" type="tel" required pattern="[0-9+ ()-]{10,16}" />
        </div>
      )}
      {modal === 'factory' && (
        <>
          <div className="field">
            <span>{t('بريد مدير المصنع', 'First manager email')}</span>
            <Input name="email" type="email" required />
          </div>
          <Select name="plan">
            <Option>Professional</Option>
            <Option>Starter</Option>
            <Option>Enterprise</Option>
          </Select>
        </>
      )}
      {modal === 'payment' && (
        <div className="field">
          <span>{t('طريقة الدفع', 'Payment method')}</span>
          <Select name="method">
            <Option value="cash">{t('نقدي', 'Cash')}</Option>
            <Option value="bank_transfer">{t('تحويل بنكي', 'Bank transfer')}</Option>
            <Option value="card">{t('بطاقة', 'Card')}</Option>
          </Select>
        </div>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        {t('تأكيد وحفظ', 'Confirm & save')}
      </Button>
    </form>
  );
}
