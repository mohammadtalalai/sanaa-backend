import type { ReactNode } from 'react';
import { useApp } from '@/fos/context/AppContext';
import AdminStrip from './AdminStrip';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Notices from './Notices';
import PageHeading from './PageHeading';
import PrivacyNote from './PrivacyNote';
import Footer from './Footer';
import SystemPicker from './SystemPicker';
import Toast from './Toast';
import AuthOverlay from './AuthOverlay';
import ModalHost from '@/fos/components/modals/ModalHost';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { system, loggedIn, sessionReady, profileReady } = useApp();
  if (!sessionReady) return <div className="app-loading" />;
  if (!loggedIn) {
    return (
      <div className="app">
        <AuthOverlay />
        <Toast />
      </div>
    );
  }
  if (!profileReady) return <div className="app-loading" />;
  return (
    <div className={`app ${system}`}>
      <AdminStrip />
      <Sidebar />
      <div className="workspace">
        <Topbar />
        <main>
          <Notices />
          <PageHeading />
          <PrivacyNote />
          {children}
          <Footer />
        </main>
      </div>
      <SystemPicker />
      <Toast />
      <ModalHost />
    </div>
  );
}
