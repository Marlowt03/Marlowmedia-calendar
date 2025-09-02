// marlow-stable.v3.js — final persistent hardening for Marlow Media Calendar
// - Single-source-of-truth state + safe shape + durations
// - Save guard: prevent empty local overwriting richer cloud
// - Owner-eligible assignment picker (load-balanced)
// - Auto-assign pass on boot (and normalize task owner fields)
// - Sticky "Viewing as" (no more blinking back), with setViewing(uid)
// - Adopt richer cloud on boot if local is emptier
// - Gentle autosave sensors for UI interactions

(function(){
  // ---------- 1) State shape ----------
  var s = (window.state && typeof window.state==='object') ? window.state : {};
  window.state = s;
  if (!s.users   || typeof s.users   !== 'object') s.users   = {};
  if (!s.clients || typeof s.clients !== 'object') s.clients = {};
  if (!Array.isArray(s.tasks)) s.tasks = [];
  s.durations = Object.assign(
    { kickoff:1, brief:2, prep:3, filming:4, edit:5, review:1, publish:1 },
    s.durations || {}
  );
  // Ensure Owner can receive assignments
  if (s.users['u-OWNER']) {
    var o = s.users['u-OWNER'];
    if (!Array.isArray(o.skills)) o.skills = ['film','edit','script','photo'];
    if (!o.days) o.days = {Mon:true,Tue:true,Wed:true,Thu:true,Fri:true,Sat:false,Sun:false};
  }

  // ---------- 2) Helpers ----------
  function setOwnerAll(t, uid){
    t.assigneeId = uid;
    t.owner      = uid;
    t.employeeId = uid;
    t.userId     = uid;
    t.assignee   = uid;
  }
  function normalizeTaskOwners(){
    var tasks = s.tasks || [];
    for (var i=0;i<tasks.length;i++){
      var t = tasks[i];
      var uid = t.assigneeId || t.owner || t.employeeId || t.userId || t.assignee || null;
      if (uid) setOwnerAll(t, uid);
    }
  }

  // ---------- 3) Save guard (mirror to cloud safely) ----------
  if (!window.__saveGuard_v3) {
    window.__saveGuard_v3 = true;
    var _save = window.save;
    window.save = async function guardedSave(){
      try { normalizeTaskOwners(); } catch(_){}
      try { if (typeof _save === 'function') _save.apply(this, arguments); } catch(_){}
      try {
        var local = window.state || {};
        var lU = Object.keys((local.users||{})).length;
        var lC = Object.keys((local.clients||{})).length;
        var lT = (local.tasks||[]).length;
        if (window.supa && window.WORKSPACE_ID) {
          var res = await window.supa.from('app_state').select('state').eq('id', window.WORKSPACE_ID).maybeSingle();
          var cloud = (res && res.data && res.data.state) || {};
          var cU = Object.keys((cloud.users||{})).length;
          var cC = Object.keys((cloud.clients||{})).length;
          var cT = (cloud.tasks||[]).length;
          if ((lU===0 && lC===0 && lT===0) && (cU>0 || cC>0 || cT>0)) {
            console.warn('[stable.v3] blocked empty overwrite; adopting cloud instead');
            window.state = s = cloud;
            normalizeTaskOwners();
            if (typeof render==='function') render();
            return;
          }
          await window.supa.from('app_state').upsert({ id: window.WORKSPACE_ID, state: window.state }).select('updated_at').single();
        }
      } catch(e) { console.warn('[stable.v3] save mirror err', e); }
    };
  }

  // ---------- 4) Assignment picker (Owner eligible) ----------
  (function(){
    function dayKey(d){ var x=new Date((d||'')+'T00:00:00'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][isNaN(x)?0:x.getDay()]; }
    function worksOn(d,u){ var m=u && (u.days||u.scheduleDays); return m ? !!m[dayKey(d)] : true; }
    function minutes(t){ var n=Number(t && t.duration); return isFinite(n) ? n : 0; }
    function loadOn(dateStr){
      var out={}; Object.keys(s.users||{}).forEach(function(uid){ out[uid]=0; });
      (s.tasks||[]).forEach(function(t){
        var d=t.date||t.day||t.scheduledFor||t.when;
        var uid=t.assigneeId||t.owner||t.employeeId||t.userId||t.assignee;
        if (d===dateStr && uid) out[uid]=(out[uid]||0)+minutes(t);
      });
      return out;
    }
    function reqSkill(type){ if(!type) return null; var M={S:'script',F:'film',E:'edit',P:'photo'}; return M[String(type).toUpperCase()]||null; }

    window.firstAvailableEmp = function(a,b){
      var ids = Object.keys(s.users||{}); if (!ids.length) return null;
      var dateStr, skill;
      if (typeof a === 'string' || (a instanceof Date)) {
        dateStr = (a instanceof Date) ? a.toISOString().slice(0,10) : a;
        skill   = (typeof b === 'string') ? b : (b && b.type) || null;
      } else {
        var t=a||{};
        dateStr = t.date||t.day||t.scheduledFor||t.when;
        skill   = t.skillKey||t.skill||reqSkill(t.type);
      }
      if (!dateStr) return null;
      var cand = ids.filter(function(uid){ return worksOn(dateStr, s.users[uid]); });
      if (skill){
        var withSkill = cand.filter(function(uid){ return (s.users[uid].skills||[]).indexOf(skill)>-1; });
        if (withSkill.length) cand = withSkill;
      }
      if (!cand.length) cand = ids.filter(function(uid){ return worksOn(dateStr, s.users[uid]); });
      if (!cand.length) cand = ids.slice();
      var load = loadOn(dateStr);
      cand.sort(function(a,b){ return (load[a]||0)-(load[b]||0) || (a>b?1:-1); });
      return { id: cand[0] || null };
    };
  })();

  // ---------- 5) Auto-assign pass + normalize ----------
  window.__autoAssignPass = function(){
    var tasks = s.tasks||[];
    var updated=0;
    for (var i=0;i<tasks.length;i++){
      var t=tasks[i];
      var uid = t.assigneeId||t.owner||t.employeeId||t.userId||t.assignee||null;
      if (!uid) {
        var d=t.date||t.day||t.scheduledFor||t.when || new Date().toISOString().slice(0,10);
        var pick = window.firstAvailableEmp({date:d, type:t.type, skill:t.skill||t.skillKey});
        uid = pick && pick.id;
        if (uid){ setOwnerAll(t, uid); updated++; }
      } else {
        setOwnerAll(t, uid); // normalize cross fields
      }
    }
    if (updated) {
      try { if (typeof save==='function') save(); } catch(_){}
      try { if (typeof render==='function') render(); } catch(_){}
    }
    console.log('[stable.v3] autoAssignPass updated:', updated, 'of', tasks.length);
    return updated;
  };

  // ---------- 6) Sticky "Viewing as" ----------
  (function(){
    var KEY = 'marlow.viewingId';
    function restoreView(){
      try {
        var wanted = localStorage.getItem(KEY);
        if (wanted && s.currentUserId !== wanted) s.currentUserId = wanted;
        if (!s.currentUserId) s.currentUserId = 'all';
      } catch(_){}
    }
    function rememberView(){
      try { if (s && s.currentUserId) localStorage.setItem(KEY, s.currentUserId); } catch(_){}
    }
    restoreView();
    if (!window.__renderGuard_v3) {
      window.__renderGuard_v3 = true;
      var _render = window.render;
      window.render = function(){
        restoreView();
        try { return (typeof _render === 'function') ? _render.apply(this, arguments) : void 0; }
        finally { rememberView(); }
      };
    }
    window.setViewing = function(uid){
      s.currentUserId = uid || 'all';
      rememberView();
      if (typeof save==='function') save();
      if (typeof render==='function') render();
    };
  })();

  // ---------- 7) Adopt richer cloud on boot ----------
  (async function(){
    if (!(window.supa && window.WORKSPACE_ID)) return;
    try {
      var res = await window.supa.from('app_state').select('state').eq('id', WORKSPACE_ID).maybeSingle();
      var cloud = (res && res.data && res.data.state) || {};
      var lU = Object.keys((s.users||{})).length;
      var lT = (s.tasks||[]).length;
      var cU = Object.keys((cloud.users||{})).length;
      var cT = (cloud.tasks||[]).length;
      if (cU>lU || cT>lT) {
        window.state = s = cloud;
        normalizeTaskOwners();
        if (typeof render==='function') render();
        console.log('[stable.v3] adopted richer cloud snapshot');
      }
    } catch(e) {
      console.warn('[stable.v3] adopt check failed', e);
    }
  })();

  // ---------- 8) Gentle autosave sensors (optional, safe) ----------
  (function(){
    if (window.__autosaveSensors_v3) return;
    window.__autosaveSensors_v3 = true;
    var timer=null;
    function ping(){ clearTimeout(timer); timer=setTimeout(function(){ try{ if (typeof save==='function') save(); }catch(_){ } }, 300); }
    ['input','change','pointerup','dragend','drop','keyup'].forEach(function(ev){
      document.addEventListener(ev, ping, true);
    });
  })();

  // ---------- 9) Run once on boot ----------
  try { window.__autoAssignPass(); } catch(_){}
})();