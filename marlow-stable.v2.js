// --- 1) Single source of truth for state + safe shape + durations
(function(){
  window.state = window.state || {};
  var s = window.state;
  if (!s.users   || typeof s.users   !== 'object') s.users   = {};
  if (!s.clients || typeof s.clients !== 'object') s.clients = {};
  if (!Array.isArray(s.tasks)) s.tasks = [];
  s.durations = Object.assign(
    { kickoff:1, brief:2, prep:3, filming:4, edit:5, review:1, publish:1 },
    s.durations || {}
  );
})();

// --- 2) Save guard: prevent empty local from overwriting richer cloud
(function(){
  if (window.__saveGuard_v2) return; window.__saveGuard_v2 = true;
  var _save = window.save;
  window.save = async function guardedSave(){
    try { typeof _save === 'function' && _save.apply(this, arguments); } catch(_){}
    try {
      var s = window.state || {};
      var lU = Object.keys((s.users||{})).length;
      var lC = Object.keys((s.clients||{})).length;
      var lT = (s.tasks||[]).length;
      if (window.supa && window.WORKSPACE_ID) {
        var r = await window.supa.from('app_state')
                  .select('state').eq('id', WORKSPACE_ID).maybeSingle();
        var cloud = (r && r.data && r.data.state) || {};
        var cU = Object.keys((cloud.users||{})).length;
        var cC = Object.keys((cloud.clients||{})).length;
        var cT = (cloud.tasks||[]).length;
        var looksEmpty = lU===0 && lC===0 && lT===0;
        var cloudHasMore = (cU>lU) || (cC>lC) || (cT>lT);
        if (looksEmpty && cloudHasMore) {
          console.warn('[guard] blocked empty overwrite; adopting cloud instead');
          window.state = cloud;
          try { localStorage.setItem('marlow.dashboard.v23', JSON.stringify(cloud)); } catch(_){}
          if (typeof render === 'function') render();
          return;
        }
      }
    } catch(e) { console.warn('[guard] mirror check failed', e); }
  };
})();

// --- 3) Assignment picker: Owner is eligible + load-balanced
(function(){
  function dayKey(d){ var x=new Date((d||'')+'T00:00:00'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][isNaN(x)?0:x.getDay()]; }
  function worksOn(d,u){ var m=u && (u.days||u.scheduleDays); return m ? !!m[dayKey(d)] : true; }
  function minutes(t){ var n=Number(t&&t.duration); return isFinite(n)?n:0; }
  function loadOn(dateStr, s){
    var out={}; Object.keys(s.users||{}).forEach(function(uid){ out[uid]=0; });
    (s.tasks||[]).forEach(function(t){
      var d=t.date||t.day||t.scheduledFor||t.when;
      var uid=t.assigneeId||t.owner||t.employeeId||t.userId||t.assignee;
      if(d===dateStr && uid){ out[uid]=(out[uid]||0)+minutes(t); }
    });
    return out;
  }
  function reqSkillFromType(type){ if(!type) return null; var M={S:'script',F:'film',E:'edit',P:'photo'}; return M[String(type).toUpperCase()]||null; }

  window.firstAvailableEmp = function(a,b){
    var s = window.state||{}, users = s.users||{};
    var ids = Object.keys(users); if (!ids.length) return null;

    // normalize inputs
    var dateStr, skill;
    if (typeof a === 'string' || (a instanceof Date)) {
      dateStr = (a instanceof Date) ? a.toISOString().slice(0,10) : a;
      skill   = (typeof b === 'string') ? b : (b && b.type) || null;
    } else {
      var t = a || {};
      dateStr = t.date||t.day||t.scheduledFor||t.when;
      skill   = t.skillKey||t.skill||reqSkillFromType(t.type);
    }
    if (!dateStr) return null;

    // include Owner; prefer available+skill, then available, then anyone
    var cand = ids.filter(function(uid){ return worksOn(dateStr, users[uid]); });
    if (skill){
      var withSkill = cand.filter(function(uid){ return (users[uid].skills||[]).indexOf(skill)>-1; });
      if (withSkill.length) cand = withSkill;
    }
    if (!cand.length) cand = ids.filter(function(uid){ return worksOn(dateStr, users[uid]); });
    if (!cand.length) cand = ids.slice();

    var load = loadOn(dateStr, s);
    cand.sort(function(a,b){ return (load[a]||0)-(load[b]||0) || (a>b?1:-1); });
    return { id: cand[0] || null };
  };
})();

// --- 4) One-shot auto-assign pass on boot + expose a function for later
(function(){
  function setOwnerAll(t, uid){
    t.assigneeId = uid; t.owner = uid; t.employeeId = uid; t.userId = uid; t.assignee = uid;
  }
  window.__autoAssignPass = function(){
    var s = window.state||{}; var tasks = s.tasks||[]; var updated=0;
    for (var i=0;i<tasks.length;i++){
      var t=tasks[i];
      if (t.assigneeId||t.owner||t.employeeId||t.userId||t.assignee) continue;
      var d=t.date||t.day||t.scheduledFor||t.when || new Date().toISOString().slice(0,10);
      var pick = window.firstAvailableEmp({date:d, type:t.type, skill:t.skill||t.skillKey});
      var uid = pick && pick.id;
      if (uid){ setOwnerAll(t, uid); updated++; }
    }
    try { if (typeof save==='function') save(); } catch(_){}
    try { if (typeof render==='function') render(); } catch(_){}
    console.log('[stable] autoAssignPass updated:', updated, 'of', (window.state?.tasks||[]).length);
    return updated;
  };
  // run once on load
  try { window.__autoAssignPass(); } catch(_){}
})();

// --- 5) Default view to Team (All) after login (no console needed)
(function(){
  var _afterLogin = window.afterLogin;
  window.afterLogin = function(){
    if (typeof _afterLogin === 'function') try{ _afterLogin(); }catch(_){}
    if (window.state) window.state.currentUserId = 'all';
    try { if (typeof save==='function') save(); } catch(_){}
    try { if (typeof render==='function') render(); } catch(_){}
  };
})();
