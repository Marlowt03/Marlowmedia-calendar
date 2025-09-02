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
    // Only persist real user IDs (starting with "u-"). "all" and undefined should clear the session key.
    const s = getMem();
    try{ s.currentUserId = uid; setLocal(s); }catch(_){}
    try{
      const storeVal = (typeof uid === 'string' && /^u-/.test(uid)) ? uid : '';
      if (storeVal){ sessionStorage.setItem(SESS, storeVal); }
      else { sessionStorage.removeItem(SESS); }
    }catch(_){}
    LOG('login mirrored (session only) for', uid);
  }

  setInterval(() => {
    try{
      const nowId = (getMem() && getMem().currentUserId) || null;
      if (nowId !== lastId){
        // login
        // Only treat valid user IDs as a login event. "all" and empty values clear the session.
        const isValid = (typeof nowId === 'string' && /^u-/.test(nowId));
        if (isValid) persistLogin(nowId);
        else {
          try{ sessionStorage.removeItem(SESS);}catch(_){ }
        }
        lastId = nowId;
      }
    }catch(_){}
  }, 250);
})();
