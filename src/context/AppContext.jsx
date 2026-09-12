// Central app state. Replaces the original's global `let DB`, `let activeTab`, `getCurrentUser()`,
// `isAdmin()`, theme localStorage globals (index.html lines ~691-792) with React context.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { loadDB, saveDB as persistDB, attachDbRealtimeListeners, attachSubmissionsRealtimeListener, writeSubmission, loadBanners } from '../lib/db';
import { emptyDB } from '../lib/seedData';
import { fbAuth } from '../firebase';
import { isExemptEmail } from '../lib/utils';
import { PATH_FOR_TAB, tabForPath, parseTestDeepLink } from '../lib/routes';

const CUR_KEY = 'currentUser';
const ADM_KEY = 'tce_admin_session_v1';
const THEME_KEY = 'tce_theme';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [DB, setDB] = useState(emptyDB); // empty placeholder until Firestore loads — see emptyDB() in seedData.js
  const [dbLoading, setDbLoading] = useState(true);
  const [banners, setBanners] = useState([]);
  const [user, setUserState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CUR_KEY) || 'null'); } catch { return null; }
  });
  const [admin, setAdminState] = useState(() => localStorage.getItem(ADM_KEY) === '1');
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
  const [activeTab, setActiveTabState] = useState(() => tabForPath(window.location.pathname));
  // If the page was opened via a /test/:id deep link (see routes.js), this holds that testId
  // once, so MockTest.jsx can auto-select/launch it on first load. It's a one-shot value —
  // consumeDeepLinkTestId() below clears it after MockTest.jsx reads it, so navigating around
  // the app normally afterward never keeps re-triggering the same auto-launch.
  const [deepLinkTestId, setDeepLinkTestId] = useState(() => parseTestDeepLink(window.location.pathname));
  const consumeDeepLinkTestId = useCallback(() => setDeepLinkTestId(null), []);
  const [tabStack, setTabStack] = useState([]); // history of previously-visited tabs, for goBack()
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

  // Refs so the realtime-listener effect below can always read the LATEST DB/examInProgress
  // value without needing them in its dependency array — see the fix note in db.js for why
  // depending on DB directly caused a runaway resubscription loop that exhausted the daily
  // Firestore read quota. This effect now subscribes its 14 listeners exactly ONCE per session.
  const dbRef = useRef(DB);
  useEffect(() => { dbRef.current = DB; }, [DB]);
  const examInProgressRef = useRef(examInProgress);
  useEffect(() => { examInProgressRef.current = examInProgress; }, [examInProgress]);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    const unsub = attachDbRealtimeListeners(() => dbRef.current, (key, incoming) => {
      if (examInProgressRef.current) return; // never disrupt a test/quiz in progress
      setDB((prev) => ({ ...prev, [key]: incoming }));
    });
    return unsub;
  }, []);

  // Submissions have their own realtime listener, separate from the DB_KEYS one above, since
  // they now live in their own per-document collection (see SUBMISSIONS_COLLECTION in db.js) —
  // this is the actual fix for the "sequential submissions overwriting each other" bug. Doesn't
  // need the examInProgress guard the DB_KEYS listener uses: another student's submission
  // landing here just updates DB.submissions, which the exam screen itself never reads from
  // mid-test (only the result screen does, after finishing), so it can't disrupt anyone's
  // in-progress exam.
  useEffect(() => {
    const unsub = attachSubmissionsRealtimeListener((submissions) => {
      setDB((prev) => ({ ...prev, submissions }));
    });
    return unsub;
  }, []);

  // Records one finished exam attempt. This writes ONLY that submission's own Firestore
  // document (writeSubmission), never the whole submissions collection — see the fix note on
  // writeSubmission in db.js. The local state update here is optimistic (immediate UI update);
  // the realtime listener above will reconcile it with the server's copy shortly after.
  const addSubmission = useCallback((sub) => {
    setDB((prev) => ({ ...prev, submissions: [...prev.submissions, sub] }));
    writeSubmission(sub).catch((err) => {
      console.error('Failed to save submission:', err);
      alert('⚠ Could not sync this result to the cloud database. Please check your internet connection — your local result is still visible, but may not be saved permanently.');
    });
  }, []);

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

  const setAdmin = useCallback((v) => {
    setAdminState(v);
    if (v) localStorage.setItem(ADM_KEY, '1');
    else localStorage.removeItem(ADM_KEY);
  }, []);

  // Full session teardown for the student-facing "Logout" button. Previously this only cleared
  // the student's own `user` state — but if that same browser had EVER separately logged into
  // the Admin Panel in this session, the admin flag stays true independently (it has its own
  // logout button inside the Admin Panel), so a brand-new account created right after would
  // silently inherit full/unlocked access via `hasFullAccess = admin || isExemptUser`. This is
  // what actually caused "a fresh new account inherits the previous account's unlocked state" —
  // logout now clears both, guaranteeing a truly clean slate for whoever signs in next on this
  // browser. Also clears any exam-resume progress so a new account never sees a stale
  // "Resume Previous Attempt" prompt belonging to someone else.
  const logout = useCallback(() => {
    if (user) { try { localStorage.removeItem('tce_exam_resume_' + user.id); } catch (e) { /* ignore */ } }
    setUser(null);
    setAdmin(false);
  }, [user, setUser, setAdmin]);

  // setTab records where you came FROM onto a small history stack, so goBack() can retrace
  // your steps within the app (Home, Mock Tests, Dashboard, etc.) — this is what powers the
  // on-page Back button. It also updates the real URL (via pushState) so each section has its
  // own shareable/bookmarkable/indexable address instead of everything living at "/".
  const setTab = useCallback((id) => {
    setActiveTabState((prev) => {
      if (prev !== id) {
        setTabStack((stack) => [...stack, prev].slice(-20)); // cap history length
        const path = PATH_FOR_TAB[id] || '/';
        if (window.location.pathname !== path) window.history.pushState({}, '', path);
      }
      return id;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goBack = useCallback(() => {
    setTabStack((stack) => {
      const nextTab = stack.length ? stack[stack.length - 1] : 'home';
      const path = PATH_FOR_TAB[nextTab] || '/';
      if (window.location.pathname !== path) window.history.pushState({}, '', path);
      setActiveTabState(nextTab);
      return stack.length ? stack.slice(0, -1) : stack;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Keeps activeTab in sync with the browser's own Back/Forward buttons (which the real URLs
  // above now make meaningful) — this is separate from, and doesn't interfere with, the
  // in-app Back button's own tabStack above.
  useEffect(() => {
    const onPopState = () => setActiveTabState(tabForPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
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
    if (isExemptEmail(user.email)) return true;
    const rec = DB.students.find((s) => s.id === user.id);
    return !!(rec && rec.paymentStatus === 'Approved');
  }, [user, DB.students]);

  // Completes Google sign-in (signInWithRedirect() in AuthModal.jsx — see that file for why
  // redirect is used instead of a popup).
  //
  // This is split into two parts on purpose:
  //  1. getRedirectResult() is called once, immediately, purely to surface any sign-in ERROR
  //     right away (e.g. account-exists-with-different-credential). It is NOT relied on to
  //     detect a successful sign-in — that API is a one-shot call that Firebase's own docs
  //     note can silently return nothing if it's called even slightly late, and gating it
  //     behind `dbLoading` (as the previous version did) was exactly that kind of delay: sign-in
  //     would fully succeed with Google, but the app would never notice.
  //  2. onAuthStateChanged() is the actual source of truth. Firebase guarantees this fires once
  //     its internal auth state has finished restoring — including right after a redirect
  //     completes — so this is what reliably drives "log this person into the app." As a bonus,
  //     it also means a student who signed in with Google before gets recognized automatically
  //     on future visits, not just immediately after a fresh redirect.
  useEffect(() => {
    if (!fbAuth) return;
    getRedirectResult(fbAuth).catch((e) => console.warn('Google redirect sign-in error', e));
  }, []);

  useEffect(() => {
    if (!fbAuth || dbLoading) return;
    const unsub = onAuthStateChanged(fbAuth, (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) return;
      const currentUser = userRef.current;
      if (currentUser && (currentUser.email || '').toLowerCase() === firebaseUser.email.toLowerCase()) return; // already logged in as this account
      const profile = { name: firebaseUser.displayName || 'Student', email: firebaseUser.email, phone: firebaseUser.phoneNumber || '', photoURL: firebaseUser.photoURL || '' };
      const existing = dbRef.current.students.find((s) =>
        (s.email || '').toLowerCase() === profile.email.toLowerCase() ||
        (profile.phone && s.phone === profile.phone));
      if (existing) {
        // Auto-fill the Google profile photo as their avatar — but only if they don't already
        // have one (a previously-uploaded cropped photo, or a Google photo from a past login),
        // so this never overwrites a custom avatar they've since chosen.
        if (profile.photoURL && !existing.photoURL) {
          const updated = { ...existing, photoURL: profile.photoURL };
          saveDB((prev) => ({ ...prev, students: prev.students.map((s) => (s.id === existing.id ? updated : s)) }));
          setUser(updated);
        } else {
          setUser(existing);
        }
        setActiveTabState('dashboard');
      } else {
        setModalState({ type: 'googleRegister', props: { profile } });
      }
    });
    return unsub;
  }, [dbLoading, saveDB, setUser]);

  // True for the 4 exempt mentor/admin accounts — full content access bypass everywhere a mock
  // test or material would otherwise check the site-admin flag. Kept separate from `admin`
  // (which specifically means "logged into the Admin Panel") so the two privileges don't get
  // conflated — an exempt student never gets Admin Panel access from this alone.
  const isExemptUser = isExemptEmail(user?.email);
  const hasFullAccess = admin || isExemptUser;

  const value = useMemo(() => ({
    DB, setDB, saveDB, dbLoading,
    banners, setBanners,
    user, setUser, admin, setAdmin,
    theme, toggleTheme,
    activeTab, setTab, goBack, canGoBack: tabStack.length > 0,
    examInProgress, setExamInProgress,
    isEnrolled, isExemptUser, hasFullAccess, logout,
    deepLinkTestId, consumeDeepLinkTestId, addSubmission,
    modal, openModal, closeModal,
  }), [DB, saveDB, dbLoading, banners, user, setUser, admin, setAdmin, theme, toggleTheme, activeTab, setTab, goBack, tabStack, examInProgress, isEnrolled, isExemptUser, hasFullAccess, logout, deepLinkTestId, consumeDeepLinkTestId, addSubmission, modal, openModal, closeModal]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
