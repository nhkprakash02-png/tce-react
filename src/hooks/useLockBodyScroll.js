import { useEffect } from 'react';

// Prevents the page behind a full-screen overlay (mobile nav drawer, modals) from scrolling
// while that overlay is open. Restores the previous overflow value on close/unmount so it
// never gets stuck locked.
export default function useLockBodyScroll(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}
