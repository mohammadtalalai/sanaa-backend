import { useApp } from '@/fos/context/AppContext';
import { Button } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';
import FormModal from './FormModal';
import ConfirmModal from './ConfirmModal';
import OrderModal from './OrderModal';
import SignatureModal from './SignatureModal';
import AiAnswerModal from './AiAnswerModal';
import ActionConfirmModal from './ActionConfirmModal';
import TeamModal from './TeamModal';
import TenantModal from './TenantModal';
import RecordModal from './RecordModal';

export default function ModalHost() {
  const { modal, setModal, selected } = useApp();
  return (
    <>
      {modal && (
        <div className="overlay" onClick={() => setModal('')}>
          <section
            className={`dialog ${modal === 'signature' ? 'wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="icon dialog-close" aria-label="Close dialog" onClick={() => setModal('')}>
              <Icon name="close" />
            </Button>
            {['customer', 'factory', 'revision', 'payment', 'approve', 'reject', 'password'].includes(
              modal,
            ) ? (
              <FormModal />
            ) : modal === 'confirm' ? (
              <ConfirmModal />
            ) : modal === 'order' && selected ? (
              <OrderModal />
            ) : modal === 'signature' ? (
              <SignatureModal />
            ) : modal === 'ai-answer' ? (
              <AiAnswerModal />
            ) : ['invoice-confirm', 'shift-confirm'].includes(modal) ? (
              <ActionConfirmModal />
            ) : modal === 'team' ? (
              <TeamModal />
            ) : modal === 'tenant' ? (
              <TenantModal />
            ) : (
              <RecordModal />
            )}
          </section>
        </div>
      )}
    </>
  );
}
