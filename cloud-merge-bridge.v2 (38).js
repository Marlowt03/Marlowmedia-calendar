/*! cloud-merge-bridge.v2.js — robust Supabase sync (multi-user)
    Behavior:
      - On boot: compares remote.updated_at vs local._updatedAt. Adopts the newer; if local newer, uploads local.
      - On save(): after your original save, uploads local snapshot to Supabase and records serverTs.
      - Polling: every 8s fetches remote; adopts only if remote is newer than local.
    Requirements:
      - <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> in <head>
      - Supabase table app_state with columns: id (text, PK), state (jsonb), updated_at (timestamptz, default now())
*/
(function(){
  const STORE_KEY      = 'marlow.dashboard.v23';
  const SERVER_TS_KEY  = STORE_KEY + '.serverTs';
  const WORKSPACE_ID   = window.WORKSPACE_ID || 'marlow-media-prod';
  const SUPABASE_URL   = window.SUPABASE_URL || 'https://ttwpbmfvgfyjavejnelc.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGc...anon-key-truncated...';

  const CLOUD_ENABLED = true;  // set false for purely local debugging

  function log(){ try{ console.log.apply(console, ['[cloud.v2]'].concat(Array.from(arguments))); }catch(_){ } }
  function warn(){ try{ console.warn.apply(console, ['[cloud.v2]'].concat(Array.from(arguments))); }catch(_){ } }

  // --- Supabase client
  let supa = null;
  try{
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.supa = supa;
    } else {
      warn('supabase-js missing. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> in <head>.');
    }
  }catch(e){ warn('supabase init failed', e); }

  // --- Local helpers
  function safeParse(json){ try{ return JSON.parse(json); }catch(_){ return null; } }
  function getLocal(){ return safeParse(localStorage.getItem(STORE_KEY)); }
  function setLocal(obj){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }catch(_){ } }
  function getLocalUpdatedAt(){
    const s = getLocal();
    return (s && typeof s._updatedAt === 'number') ? s._updatedAt : 0;
  }
  function setLastServerTime(ts){ try{ localStorage.setItem(SERVER_TS_KEY, ts||''); } catch(_){ } }
  function getLastServerTime(){ return localStorage.getItem(SERVER_TS_KEY) || ''; }

  // --- Remote helpers
  async function readCloudRow(){
    if (!CLOUD_ENABLED || !supa) return null;
    try{
      const { data, error } = await supa.from('app_state').select('state, updated_at').eq('id', WORKSPACE_ID).maybeSingle();
      if (error){ warn('load error', error); return null; }
      return data || null;
    }catch(e){ warn('load exception', e); return null; }
  }
  async function upsertCloudState(snap){
    if (!CLOUD_ENABLED || !supa) return null;
    try{
      const payload = { id: WORKSPACE_ID, state: snap };
      const { data, error } = await supa.from('app_state').upsert(payload).select('updated_at').single();
      if (error){ warn('save error', error); return null; }
      return data; // { updated_at }
    }catch(e){ warn('save exception', e); return null; }
  }

  // --- Adopt remote -> local
  function adoptRemoteState(remote){
    if (!remote || !remote.state) return;
    setLocal(remote.state);
    // reflect into window.state if app uses it
    try{ window.state = remote.state; } catch(_){}
    // re-render
    try{ if (typeof window.render === 'function') window.render(); } catch(_){}
    try{ if (typeof window.renderClients === 'function') window.renderClients(); } catch(_){}
    log('adopted cloud');
  }

  // --- BOOT: resolve newest
  (async function boot(){
    if (!CLOUD_ENABLED || !supa) { log('cloud disabled or supa missing'); return; }
    try{
      const localTs  = getLocalUpdatedAt(); // number (ms)
      const local    = getLocal();
      const row      = await readCloudRow(); // { state, updated_at }
      if (!row){ 
        // No remote row. If we have local, publish it.
        if (local){ const wrote = await upsertCloudState(local); if (wrote?.updated_at){ setLastServerTime(wrote.updated_at); log('boot: published local to cloud'); } }
        else { log('boot: no cloud row and no local'); }
        return;
      }
      const remoteTs = Date.parse(row.updated_at || '') || 0; // ms
      const lastSeen = getLastServerTime();

      if (remoteTs > localTs){
        adoptRemoteState(row);
        setLastServerTime(row.updated_at || '');
        log('boot: adopted newer cloud');
      } else if (localTs > remoteTs && local){
        const wrote = await upsertCloudState(local);
        if (wrote?.updated_at){ setLastServerTime(wrote.updated_at); log('boot: uploaded newer local'); }
      } else {
        // equal or nothing to do
        if (row.updated_at && row.updated_at !== lastSeen) setLastServerTime(row.updated_at);
        log('boot: up-to-date');
      }
    }catch(e){ warn('boot failed', e); }
  })();

  // --- SAVE mirror: wrap your existing save() to also push to cloud
  (function(){
    try{
      if (window.__cloudMergePatchedV2) return;
      window.__cloudMergePatchedV2 = true;

      const orig = window.save;
      window.save = async function(){
        // 1) your original save (updates state & localStorage)
        try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ warn('orig save failed', e); }
        // 2) ensure local has an _updatedAt timestamp (used for conflict checks)
        try {
          let snap = window.state || getLocal();
          if (!snap) return;
          if (typeof snap._updatedAt !== 'number') snap._updatedAt = Date.now();
          setLocal(snap);
          // 3) push to server
          const wrote = await upsertCloudState(snap);
          if (wrote?.updated_at) setLastServerTime(wrote.updated_at);
          log('merged');
        } catch (e){ warn('save mirror failed', e); }
      };
      log('save merge enabled');
    }catch(e){ warn('mirror patch failed', e); }
  })();

  // --- POLL: check for newer cloud every 8s
  (function(){
    if (!CLOUD_ENABLED || !supa) return;
    let busy = false;
    setInterval(async function(){
      if (busy) return;
      busy = true;
      try{
        const localTs = getLocalUpdatedAt();
        const row = await readCloudRow();
        if (!row || !row.updated_at) { busy = false; return; }
        const remoteTs = Date.parse(row.updated_at) || 0;
        if (remoteTs > localTs){
          adoptRemoteState(row);
          setLastServerTime(row.updated_at);
          log('poll: adopted newer cloud');
        } else {
          // no-op
        }
      }catch(e){ /* ignore */ }
      busy = false;
    }, 8000);
  })();
})();