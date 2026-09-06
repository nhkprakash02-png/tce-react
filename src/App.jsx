import React, { useEffect, useState } from 'react';
import { Download, MessageCircle } from 'lucide-react';
import { useApp } from './context/AppContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Ticker from './components/Ticker';
import HeroCarousel from './components/HeroCarousel';
import Mentors from './components/Mentors';
import Modal from './components/Modal';
import AuthModal, { GoogleRegisterModal } from './components/AuthModal';
import EnrollModal from './components/EnrollModal';
import AdminLoginModal from './components/AdminLoginModal';

import Home from './pages/Home';
import MockTest from './pages/MockTest';
import Quiz from './pages/Quiz';
import PyqHub from './pages/PyqHub';
import StudyMaterials from './pages/StudyMaterials';
import Batches from './pages/Batches';
import Dashboard from './pages/Dashboard';
import Notices from './pages/Notices';
import AdminPanel from './pages/AdminPanel';

const PAGES = {
  home: Home,
  mocks: MockTest,
  quiz: Quiz,
  pyq: PyqHub,
  materials: StudyMaterials,
  batches: Batches,
  dashboard: Dashboard,
  notices: Notices,
};

function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const trigger = () => { if (deferred) { deferred.prompt(); setDeferred(null); } };
  return { canInstall: !!deferred, trigger };
}

export default function App() {
  const { activeTab, modal } = useApp();
  const { canInstall, trigger } = useInstallPrompt();
  const Page = PAGES[activeTab] || Home;
  const isHome = activeTab === 'home';

  return (
    <>
      <Navbar />
      <Ticker />
      {isHome && <HeroCarousel />}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="fade-in">
          <Page />
        </div>
      </main>

      {isHome && <Mentors />}
      <Footer />

      {/* Floating action buttons — ported from index.html lines ~229-238 */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col gap-3">
        {canInstall && (
          <button onClick={trigger} className="flex items-center gap-2 px-4 py-3 rounded-full btn-gold shadow-lg text-xs font-bold">
            <Download className="w-4 h-4" /> 📲 Install App
          </button>
        )}
        <a
          href="https://wa.me/919749587349?text=Hello%20Sir%2C%20I%20want%20to%20know%20more%20about%20TCE%20batches"
          target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#25D366] text-white shadow-lg text-xs font-bold"
        >
          <MessageCircle className="w-4 h-4" /> WhatsApp Support
        </a>
      </div>

      {modal?.type === 'login' && <AuthModal />}
      {modal?.type === 'googleRegister' && <GoogleRegisterModal {...modal.props} />}
      {modal?.type === 'enroll' && <EnrollModal {...modal.props} />}
      {modal?.type === 'adminLogin' && <AdminLoginModal />}
      {modal?.type === 'adminPanel' && (
        <Modal title="Admin Panel" wide>
          <AdminPanel />
        </Modal>
      )}
    </>
  );
}
