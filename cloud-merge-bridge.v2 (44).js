
/*! cloud-merge-bridge.v2.js (server-time aware)
   - Boot & poll adopt based on Supabase row.updated_at (server time), not local state._updatedAt
   - After adopting remote, calls renderClients() (and render() if present)
   - Save: wraps your save() then MERGE to server via RPC
*/
(function(){
  const STORE_KEY = 'marlow.dashboard.v23';
  const WORKSPACE_ID = window.WORKSPACE_ID || 'marlow-media-prod';
  const SUPABASE_URL = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0d3BibWZ2Z2Z5amF2ZWpuZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2MTYwMDYsImV4cCI6MjA3MjE5MjAwNn0.o84ycMmWUBkoZpNim2viy4IFjQ00Tb8zwRahNCoOERk';

  function log(){ try{ console.log.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ['[cloud.v2]'].concat([].slice.call(arguments))); }catch(_){ } }

  // Ensure supabase client
  try {
    if (!window.supa) {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      } else {
        warn('supabase-js missing. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> in <head>.');
      }
    }
  } catch (e) { warn('supabase init failed', e); }

  async function readCloudRow(){
    try {
      const { data, error } = await window.supa.from('app_state').select('state, updated_at').eq('id', WORKSPACE_ID).maybeSingle();
      if (error) { warn('load error', error); return null; }
      return data || null; // { state, updated_at }
    } catch (e) { warn('load exception', e); return null; }
  }

  function adoptRemoteState(remote){
    // Adopt incoming snapshot without clobbering local-only fields such as users or currentUserId.
    if (!remote || !remote.state) return;
    try {
      // Load previous local snapshot so we can merge missing fields.
      let local = null;
      try { local = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_e) {}
      if (!local || typeof local !== 'object') local = {};
      // Compose an incoming state: start with local (to preserve users/currentUserId) then overlay remote.
      const incoming = Object.assign({}, local, remote.state);
      // Explicitly ignore any currentUserId from the cloud row; login should be per session only.
      if (incoming && Object.prototype.hasOwnProperty.call(incoming, 'currentUserId')) {
        delete incoming.currentUserId;
      }
      // Persist the merged snapshot locally (so subsequent reloads keep users/tasks).
      localStorage.setItem(STORE_KEY, JSON.stringify(incoming));
      // Merge into in-memory state as well.
      if (window.state) {
        window.state = Object.assign({}, window.state, incoming);
      } else {
        window.state = incoming;
      }
    } catch(_){}
    try { if (typeof window.renderClients === 'function') window.renderClients(); } catch(_){}
    try { if (typeof window.render === 'function') window.render(); } catch(_){}
  }

  function getLastServerTime(){
    try { return sessionStorage.getItem('lastServerUpdatedAt') || ''; } catch(_){ return ''; }
  }
  function setLastServerTime(ts){
    try { sessionStorage.setItem('lastServerUpdatedAt', ts || ''); } catch(_){}
  }

  // ----- BOOT HYDRATION (server-time aware) -----
  (async function(){
    try {
      if (!window.supa) return;
      const row = await readCloudRow();
      if (!row || !row.state) { log('boot: no cloud row'); return; }
      const serverTs = row.updated_at || '';
      const lastTs = getLastServerTime();
      if (serverTs && serverTs !== lastTs) {
        adoptRemoteState(row);
        setLastServerTime(serverTs);
        log('boot: adopted cloud (serverTs changed)');
      } else {
        log('boot: no adoption needed');
      }
    } catch (e) { warn('boot failed', e); }
  })();

  // ----- SAVE MIRROR: wrap existing save() and call RPC merge on server -----
  (function(){
    try {
      if (window.__cloudMergePatchedV2) return;
      window.__cloudMergePatchedV2 = true;

      const orig = window.save;
      window.save = function(){
        // 1) Your original save (updates localStorage/state)
        try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ warn('orig save failed', e); }
        // 2) Now MERGE to server
        try {
          let snap = window.state;
          if (!snap) { try { snap = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(_){ snap = null; } }
          if (!snap) return;
          snap = JSON.parse(JSON.stringify(snap));
          // Remove any currentUserId prior to saving so that login is not persisted to the cloud.
          if (snap && Object.prototype.hasOwnProperty.call(snap, 'currentUserId')) {
            delete snap.currentUserId;
          }
          snap._updatedAt = Date.now();
          window.supa.rpc('merge_app_state', { p_id: WORKSPACE_ID, p_state: snap })
            .then(async ({ error }) => {
              if (error) { warn('rpc error', error); return; }
              // Read back server row to get server updated_at and adopt in all tabs
              const row = await readCloudRow();
              if (row && row.updated_at) setLastServerTime(row.updated_at);
              log('merged');
            });
        } catch (e) { warn('save mirror failed', e); }
      };
      log('save merge enabled');
    } catch (e) { warn('patch failed', e); }
  })();

  // ----- POLL: adopt when server updated_at changes (every 8s) -----
  (function(){
    let busy = false;
    setInterval(async () => {
      if (busy || !window.supa) return;
      busy = true;
      try {
        const row = await readCloudRow();
        if (!row || !row.state) { busy = false; return; }
        const serverTs = row.updated_at || '';
        const lastTs = getLastServerTime();
        if (serverTs && serverTs !== lastTs) {
          adoptRemoteState(row);
          setLastServerTime(serverTs);
          log('poll: adopted newer cloud (serverTs changed)');
        }
      } catch (_e) {}
      busy = false;
    }, 8000);
  })();

})();
