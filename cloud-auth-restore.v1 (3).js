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
    const sess  = sessionStorage.getItem(SESS) || '';
    const token = sessionStorage.getItem('sessionToken') || '';
    const s = window.state || readLocal() || {};
    // If both user id and session token exist in sessionStorage and the
    // current state lacks a user, restore them into the in-memory state.
    if (sess && token && !s.currentUserId){
      s.currentUserId = sess;
      s.sessionToken  = token;
      window.state = s;
      try{ if (typeof state !== 'undefined') state = window.state; }catch(_){}
      writeLocal(s);
      LOG('restored session user', sess);
      try{ if (typeof window.render==='function') window.render(); }catch(_){}
    // If either value is missing yet a user id is persisted locally, clear it
    // so that new tabs without a valid session cannot auto-login.
    } else if ((!sess || !token) && s.currentUserId){
      s.currentUserId = null;
      s.sessionToken = null;
      window.state = s; writeLocal(s);
      LOG('cleared persisted currentUserId for clean login');
    }
  }catch(_){}
})();
