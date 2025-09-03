<!-- /cloud-auth-hooks.v1.js -->
<script>
(function(){
  const LOG = (...a)=>console.log('[auth.v1]', ...a);
  const SESS_KEY = 'auth.currentUserId';

  // Mirror **only** on explicit login; never on 'all' or falsy.
  function mirrorLogin(uid){
    if (!uid || uid === 'all') return;
    try { sessionStorage.setItem(SESS_KEY, uid); } catch(_) {}
    LOG('login mirrored (session only) for', uid);
  }

  function clearLogin(){
    try { sessionStorage.removeItem(SESS_KEY); } catch(_) {}
    LOG('logout cleared session');
  }

  // expose explicit entry points (index.html should call these)
  window.auth = window.auth || {};
  window.auth.mirrorLogin = mirrorLogin;
  window.auth.clearLogin  = clearLogin;
})();
</script>
