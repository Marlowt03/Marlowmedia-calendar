/*! cloud-auth-restore.v1.js  (updated)
   On boot, if we have a prior session user, restore it into state.currentUserId
   before the first render. Does not write to cloud.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[auth.restore]', ...a); }catch(_){ } };
  const SK   = window.STORE_KEY || 'marlow.dashboard.v23';
  const SESS = 'auth.currentUserId';

  function readLocal(){ try{ return JSON.parse(localStorage.getItem(SK)||'null')||{}; }catch(_){ return {}; } }
  function writeLocal(s){ try{ localStorage.setItem(SK, JSON.stringify(s)); }catch(_){ } }

  try{
    // Only consider valid user IDs (u-*) from session storage. Ignore "undefined", "null", "all" and empty strings.
    const raw = sessionStorage.getItem(SESS);
    const sess = (typeof raw === 'string' && /^u-/.test(raw)) ? raw : '';
    const s = window.state || readLocal() || {};
    if (sess && !s.currentUserId){
      // restore a previously logged‑in user
      s.currentUserId = sess;
      window.state = s;
      try{ if (typeof state !== 'undefined') state = window.state; }catch(_){}
      writeLocal(s);
      LOG('restored session user', sess);
      try{ if (typeof window.render==='function') window.render(); }catch(_){}
    } else if (!sess && s.currentUserId){
      // If there is no valid session user but state has a user ID, clear it only when it looks like a user (u-*)
      if (typeof s.currentUserId === 'string' && /^u-/.test(s.currentUserId)){
        s.currentUserId = null;
        window.state = s; writeLocal(s);
        LOG('cleared persisted currentUserId for clean login');
      }
    }
  }catch(_){}
})();
