// Hydrate Supabase state on login before any save operations.
// This script wraps the global `save` function to prevent writes
// while a freshly authenticated session is fetching the latest
// state from Supabase. When a login is detected (a new
// `auth.currentUserId` in sessionStorage), the hydration process
// calls `loadRemoteState()` to pull the current state from the
// backend. Once hydration completes, saves are re-enabled and
// a re-render occurs. See documentation for details.
(function(){
  const SESS_KEY = 'auth.currentUserId';
  const LOG = (...a)=>console.log('[login.hydrator]', ...a);
  // Gate all saves while hydrating
  window.__hydrating__ = window.__hydrating__ || false;
  // Wrap window.save once (idempotent)
  if (!window.__saveWrapInstalled) {
    const origSave = window.save;
    window.save = function(){
      if (window.__hydrating__) {
        LOG('skip save (hydrating)');
        return;
      }
      try {
        const uid = sessionStorage.getItem(SESS_KEY) || '';
        if (!uid) { LOG('skip save (no session)'); return; }
      } catch(_) { return; }
      if (typeof origSave === 'function') return origSave.apply(this, arguments);
    };
    window.__saveWrapInstalled = true;
  }
  // Detect a real login by watching sessionStorage for uid transitions
  let lastUid = '';
  const tick = () => {
    let uid = '';
    try { uid = sessionStorage.getItem(SESS_KEY) || ''; } catch(_) {}
    if (uid && uid !== lastUid) {
      // Real login just happened in this tab
      lastUid = uid;
      if (typeof window.loadRemoteState === 'function') {
        window.__hydrating__ = true;
        LOG('begin hydrate for', uid);
        Promise.resolve(window.loadRemoteState())
          .catch(e => console.warn('[login.hydrator] load error', e))
          .finally(() => {
            window.__hydrating__ = false;
            try { if (typeof window.render === 'function') window.render(); } catch(_) {}
            LOG('hydration done for', uid);
          });
      }
    } else if (!uid) {
      lastUid = '';
    }
  };
  setInterval(tick, 150); // lightweight watch
})();