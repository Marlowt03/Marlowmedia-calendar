(function(){
  const LOG = (...a)=>console.log('[auth.v1]', ...a);
  const SESS_KEY = 'auth.currentUserId';

  // Mirror ONLY on explicit login. Do not mirror 'all' or falsy values.
  function mirrorLogin(uid){
    if (!uid || uid === 'all') return;
    try { sessionStorage.setItem(SESS_KEY, uid); } catch(_) {}
    LOG('login mirrored (session only) for', uid);
  }

  function clearLogin(){
    try { sessionStorage.removeItem(SESS_KEY); } catch(_) {}
    LOG('logout cleared session');
  }

  // Expose helpers for the login/logout flows to call.
  window.auth = window.auth || {};
  window.auth.mirrorLogin = mirrorLogin;
  window.auth.clearLogin  = clearLogin;
})();
