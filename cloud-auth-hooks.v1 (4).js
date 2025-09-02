/*! cloud-auth-hooks.v1.js  (updated)
   Stabilize login locally without persisting login to cloud.
   - Detects successful login (currentUserId set from null -> uid).
   - Mirrors to localStorage and stores a session flag.
   - Does NOT call save(); login remains per-tab/session.
*/
(function(){
  const LOG = (...a)=>{ try{ console.log('[auth.v1]', ...a); }catch(_){ } };
  const SK   = window.STORE_KEY || 'marlow.dashboard.v23';
  const SESS = 'auth.currentUserId';

  function getMem(){ return window.state || {}; }
  function setLocal(s){ try{ localStorage.setItem(SK, JSON.stringify(s)); }catch(_){ } }

  let lastId = (getMem() && getMem().currentUserId) || null;

  function persistLogin(uid){
    const s = getMem();
    try{ s.currentUserId = uid; setLocal(s); }catch(_){}
    try{
      // Only write to sessionStorage if there is no existing session value. This
      // prevents view switching from overwriting the current login with a
      // different user id. If a user is already logged in, leaving the
      // session key unchanged ensures render() continues to treat the
      // session as authenticated when switching views.
      const existing = sessionStorage.getItem(SESS) || '';
      if (!existing) {
        sessionStorage.setItem(SESS, uid || '');
      }
    }catch(_){}
    LOG('login mirrored (session only) for', uid);
  }

  setInterval(() => {
    try{
      const nowId = (getMem() && getMem().currentUserId) || null;
      if (nowId !== lastId){
        // login
        if (nowId) persistLogin(nowId);
        // logout
        else { try{ sessionStorage.removeItem(SESS);}catch(_){ } }
        lastId = nowId;
      }
    }catch(_){}
  }, 250);
})();
