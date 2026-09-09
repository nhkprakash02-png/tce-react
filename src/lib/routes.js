// Lightweight URL routing — no react-router dependency, just the browser History API. Added
// specifically so each main section has a real, distinct, indexable URL (previously everything
// lived at "/" and sections were only switched by JS state, which is invisible to Google and
// meant a sitemap listing separate section URLs would have been pointing at pages that don't
// actually exist).
export const PATH_FOR_TAB = {
  home: '/',
  mocks: '/mock-tests',
  quiz: '/quick-quiz',
  pyq: '/pyq-hub',
  materials: '/study-materials',
  batches: '/batches-fees',
  dashboard: '/dashboard',
  notices: '/notices-contact',
};

const TAB_FOR_PATH = Object.fromEntries(Object.entries(PATH_FOR_TAB).map(([tab, path]) => [path, tab]));

export function tabForPath(pathname) {
  return TAB_FOR_PATH[pathname] || 'home';
}
