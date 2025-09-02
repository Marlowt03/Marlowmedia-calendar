
// marlow-fixes.v1.js — drop-in hardening (state shape, assignment compat, save guard)

(function(){
  // --- 1) Safe global state shape and single source of truth
  window.state = window.state || {};
  var s = window.state;
  if (!s.users   || typeof s.users   !== 'object') s.users   = {};
  if (!s.clients || typeof s.clients !== 'object') s.clients = {};
  if (!Array.isArray(s.tasks)) s.tasks = [];
  s.durations = Object.assign(
    { kickoff:1, brief:2, prep:3, filming:4, edit:5, review:1, publish:1 },
    s.durations || {}
  );

  // --- 2) Save guard: don't let empty local wipe richer cloud
  if (!window.__saveGuard_fix_v1) {
    window.__saveGuard_fix_v1 = true;
    var _save = window.save;
    window.save = async function guardedSave(){
      try { typeof _save === 'function' && _save.apply(this, arguments); } catch(_){}
      try {
        var SK = 'marlow.dashboard.v23';
        var s  = window.state || {};
        var lU = Object.keys((s.users||{})).length;
        var lC = Object.keys((s.clients||{})).length;
        var lT = (s.tasks||[]).length;
        if (window.supa && window.WORKSPACE_ID) {
          var r = await window.supa.from('app_state').select('state').eq('id', window.WORKSPACE_ID).maybeSingle();
          var cloud = (r && r.data && r.data.state) || {};
          var cU = Object.keys((cloud.users||{})).length;
          var cC = Object.keys((cloud.clients||{})).length;
          var cT = (cloud.tasks||[]).length;
          var looksEmpty = lU===0 && lC===0 && lT===0;
          var cloudHasMore = cU>lU || cC>lC || cT>lT;
          if (looksEmpty && cloudHasMore) {
            console.warn('[fixes] blocked empty overwrite; adopting cloud instead');
            window.state = cloud;
            try { localStorage.setItem(SK, JSON.stringify(cloud)); } catch(_){}
            if (typeof render === 'function') render();
            return;
          }
        }
      } catch(e) {
        console.warn('[fixes] save guard mirror err', e);
      }
    };
  }

  // --- 3) Assignment compatibility + auto-assign pass
  if (!window.firstAvailableEmp) {
    window.firstAvailableEmp = function(a,b){
      var s = window.state||{}, users = s.users||{};
      function dayKey(d){ var x=new Date((d||'')+'T00:00:00'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][isNaN(x)?0:x.getDay()]; }
      function worksOn(d,u){ var m=u && (u.days||u.scheduleDays); return m ? !!m[dayKey(d)] : true; }
      function reqSkillFromType(type){ var m={S:'script',F:'film',E:'edit',P:'photo'}; return type? (m[String(type).toUpperCase()]||null) : null; }
      function minutes(t){ var n=Number(t&&t.duration); return isFinite(n)?n:0; }
      function loadOn(dateStr){
        var out={}; Object.keys(users).forEach(function(uid){ out[uid]=0; });
        (s.tasks||[]).forEach(function(t){
          var d=t.date||t.day||t.scheduledFor||t.when;
          var uid=t.assigneeId||t.owner||t.employeeId||t.userId||t.assignee;
          if(d===dateStr&&uid){ out[uid]=(out[uid]||0)+minutes(t); }
        });
        return out;
      }
      function pick(dateStr, skill){
        var ids = Object.keys(users); if (!ids.length) return {id:null};
        var nonSales = ids.filter(function(id){ return (users[id]&&users[id].role)!=='sales'; });
        var nonOwner = nonSales.filter(function(id){ return (users[id]&&users[id].role)!=='owner'; });
        var cand = (nonOwner.length?nonOwner:nonSales).filter(function(uid){ return worksOn(dateStr, users[uid]); });
        if (skill) {
          var withSkill = cand.filter(function(uid){ return (users[uid].skills||[]).indexOf(skill)>-1; });
          if (withSkill.length) cand = withSkill;
        }
        if (!cand.length) cand = (nonOwner.length?nonOwner:nonSales).filter(function(uid){ return worksOn(dateStr, users[uid]); });
        if (!cand.length) cand = nonOwner.length?nonOwner : (nonSales.length?nonSales : ids);
        var load = loadOn(dateStr);
        cand.sort(function(a,b){ return (load[a]||0)-(load[b]||0) || (a>b?1:-1); });
        return { id: cand[0]||null };
      }
      // old shape: (dateStr, skill)
      if (typeof a === 'string' || (a instanceof Date)) {
        var dateStr = (a instanceof Date) ? a.toISOString().slice(0,10) : a;
        var skill = (typeof b === 'string') ? b : (b && b.type) || null;
        return pick(dateStr, skill);
      }
      // new shape: ({date,type|skill})
      var t = a||{};
      var dateStr2 = t.date||t.day||t.scheduledFor||t.when;
      var skill2 = t.skillKey||t.skill||reqSkillFromType(t.type);
      return dateStr2 ? pick(dateStr2, skill2) : {id:null};
    };
  }

  function setOwnerAll(t, uid){
    t.assigneeId = uid;
    t.owner      = uid;
    t.employeeId = uid;
    t.userId     = uid;
    t.assignee   = uid;
  }

  window.__autoAssignPass = function(){
    var s = window.state||{}; var tasks = s.tasks||[];
    var updated=0;
    for (var i=0;i<tasks.length;i++){
      var t=tasks[i];
      if (t.assigneeId||t.owner||t.employeeId||t.userId||t.assignee) continue;
      var d=t.date||t.day||t.scheduledFor||t.when || new Date().toISOString().slice(0,10);
      var type=t.type, skill=t.skillKey||t.skill;
      if (!skill && type){ var map={S:'script',F:'film',E:'edit',P:'photo'}; var T=String(type).toUpperCase(); skill=map[T]||null; }
      var pick = window.firstAvailableEmp({date:d, skill:skill, type:type});
      var uid = pick && pick.id;
      if (uid){ setOwnerAll(t, uid); updated++; }
    }
    if (typeof save==='function') try{ save(); }catch(_){}
    if (typeof render==='function') try{ render(); }catch(_){}
    console.log('[fixes] autoAssignPass updated:', updated, 'of', tasks.length);
    return updated;
  };

  // run once now to populate Overview
  try { window.__autoAssignPass(); } catch(_){}
})();
