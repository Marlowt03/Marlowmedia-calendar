(function(){
  const LOG = (...a)=>console.log('[assign.v3]', ...a);

  function ymd(d){
    if (!d) return '';
    if (typeof d === 'string' && d.length >= 10) return d.slice(0,10);
    const dt = new Date(d);
    return dt.toISOString().slice(0,10);
  }

  function currentHoursOnDay(state, uid, day){
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    let hours = 0;
    for (const t of tasks){
      if (!t || t.done || t.archived) continue;
      if (ymd(t.date) !== day) continue;
      if (t.ownerId !== uid) continue;
      hours += Number(t.duration||1);
    }
    return hours;
  }

  function capacityFor(user){
    // default 6 hrs/day unless specified on the user (e.g., user.hoursPerDay)
    return Number(user && user.hoursPerDay || 6);
  }

  function pickAssignee(state, day, duration){
    const users = state.users || {};
    const ownerId = 'u-OWNER';
    const dur = Number(duration || 1);
    const staff = Object.values(users).filter(u =>
      u && u.id && u.role !== 'client' && u.disabled !== true
    );

    // Prefer non-owner staff; fallback to owner only if necessary
    const pool = staff.filter(u => u.id !== ownerId);
    const candidates = (pool.length ? pool : staff);
    if (!candidates.length) return ownerId;

    // Sort by current load (ascending)
    candidates.sort((a,b) => {
      const ha = currentHoursOnDay(state, a.id, day);
      const hb = currentHoursOnDay(state, b.id, day);
      return (ha - hb) || (a.id > b.id ? 1 : -1);
    });

    // Respect capacity first, then fallback to least-loaded
    for (const u of candidates){
      const used = currentHoursOnDay(state, u.id, day);
      if (used + dur <= capacityFor(u)) return u.id;
    }
    return candidates[0].id;
  }

  // Patch globals the app already uses
  window.firstAvailableEmp = function(date, duration){
    const st = window.state || {};
    return pickAssignee(st, ymd(date), duration);
  };

  // Ensure reassign spreads evenly too
  window.reassignTasks = function(tasks){
    const st = window.state || {};
    const arr = Array.isArray(tasks) ? tasks : [];
    for (const t of arr){
      if (!t || !t.date) continue;
      t.ownerId = pickAssignee(st, ymd(t.date), t.duration||1);
    }
    return arr;
  };

  LOG('firstAvailableEmp patched');
  LOG('reassignTasks patched');
})();
