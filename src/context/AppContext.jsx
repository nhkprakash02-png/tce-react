// Central app state. Replaces the original's global `let DB`, `let activeTab`, `getCurrentUser()`,
// `isAdmin()`, theme localStorage globals (index.html lines ~691-792) with React context.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { loadDB, saveDB as persistDB, attachDbRealtimeListeners, loadBanners } from '../lib/db';
import { seedDB, normalizeDB } from '../lib/seedData';
import { fbAuth } from '../firebase';

const CUR_KEY = 'currentUser';
const ADM_KEY = 'tce_admin_session_v1';
const THEME_KEY = 'tce_theme';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [DB, setDB] = useState(() => normalizeDB(seedDB())); // placeholder until Firestore loads
  const [dbLoading, setDbLoading] = useState(true);
  const [banners, setBanners] = useState([]);
  const [user, setUserState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CUR_KEY) || 'null'); } catch { return null; }
  });
  const [admin, setAdminState] = useState(() => localStorage.getItem(ADM_KEY) === '1');
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
  const [activeTab, setActiveTabState] = useState('home');
  const [examInProgress, setExamInProgress] = useState(false); // mirrors original's `examState` guard
  // Replaces original's openModal(html)/closeModal() + #modalRoot innerHTML swap (lines ~951-980).
  // `modal` is { type: 'login' | 'enroll' | 'adminLogin' | ..., props: {...} } | null.
  const [modal, setModalState] = useState(null);
  const openModal = useCallback((type, props = {}) => setModalState({ type, props }), []);
  const closeModal = useCallback(() => setModalState(null), []);

  // Boot: load DB + banners from Firestore, attach realtime listeners.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadDB();
      if (cancelled) return;
      setDB(loaded);
      setDbLoading(false);
      const b = await loadBanners(loaded);
      if (!cancelled) setBanners(b);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsub = attachDbRealtimeListeners(DB, (key, incoming) => {
      if (examInProgress) return; // never disrupt a test/quiz in progress
      setDB((prev) => ({ ...prev, [key]: incoming }));
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DB, examInProgress]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme !== 'light');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'light' ? 'dark' : 'light')), []);

  const setUser = useCallback((u) => {
    setUserState(u);
    if (u) localStorage.setItem(CUR_KEY, JSON.stringify(u));
    else localStorage.removeItem(CUR_KEY);
  }, []);

  // Completes a Google sign-in that fell back to signInWithRedirect() on mobile (see
  // googleSignIn() in AuthModal.jsx) — without this, a user redirected back to the page after
  // redirect-based sign-in would never actually get logged in. Ported from index.html lines
  // ~260-265. Runs once DB has finished loading so the "does a matching student exist" check
  // below has real data to check against.
  useEffect(() => {
    if (dbLoading || !fbAuth) return;
    let cancelled = false;
    getRedirectResult(fbAuth).then((res) => {
      if (cancelled || !res || !res.user) return;
      const u = res.user;
      const profile = { name: u.displayName || 'Student', email: u.email, phone: u.phoneNumber || '' };
      const existing = DB.students.find((s) =>
        (profile.email && (s.email || '').toLowerCase() === (profile.email || '').toLowerCase()) ||
        (profile.phone && s.phone === profile.phone));
      if (existing) { setUser(existing); setActiveTabState('dashboard'); }
      else setModalState({ type: 'googleRegister', props: { profile } });
    }).catch((e) => console.warn('Google redirect sign-in failed', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoading]);

  const setAdmin = useCallback((v) => {
    setAdminState(v);
    if (v) localStorage.setItem(ADM_KEY, '1');
    else localStorage.removeItem(ADM_KEY);
  }, []);

  const setTab = useCallback((id) => {
    setActiveTabState(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Call after any in-memory DB mutation to persist to Firestore (fire-and-forget, matches
  // original saveDB() semantics — UI updates optimistically, sync happens in the background).
  const saveDB = useCallback((updater) => {
    setDB((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistDB(next);
      return next;
    });
  }, []);

  const isEnrolled = useCallback(() => {
    if (!user) return false;
    const rec = DB.students.find((s) => s.id === user.id);
    return !!(rec && rec.paymentStatus === 'Approved');
  }, [user, DB.students]);

  const value = useMemo(() => ({
    DB, setDB, saveDB, dbLoading,
    banners, setBanners,
    user, setUser, admin, setAdmin,
    theme, toggleTheme,
    activeTab, setTab,
    examInProgress, setExamInProgress,
    isEnrolled,
    modal, openModal, closeModal,
  }), [DB, saveDB, dbLoading, banners, user, setUser, admin, setAdmin, theme, toggleTheme, activeTab, setTab, examInProgress, isEnrolled, modal, openModal, closeModal]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
