window.Utils = (function(){
  function uid(prefix){ return (prefix||'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  function fmtMoney(n){
    n = Number(n) || 0;
    const isNeg = n < 0;
    const abs = Math.abs(Math.round(n));
    const str = abs.toLocaleString('en-IN');
    return (isNeg? '-' : '') + '\u20B9' + str;
  }

  function escapeHtml(str){
    if(str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function monthKey(d){ const dt = new Date(d); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0'); }
  function monthLabel(key){
    const [y,m] = key.split('-').map(Number);
    return new Date(y, m-1, 1).toLocaleDateString('en-IN', {month:'short', year:'numeric'});
  }
  function prevMonthKey(key){
    const [y,m] = key.split('-').map(Number);
    const d = new Date(y, m-2, 1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function nextMonthKey(key){
    const [y,m] = key.split('-').map(Number);
    const d = new Date(y, m, 1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function fmtDate(d){
    return new Date(d).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
  }
  function fmtDateShort(d){
    return new Date(d).toLocaleDateString('en-IN', {day:'2-digit', month:'short'});
  }
  function todayISODate(){
    const d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function daysInMonth(y,m){ return new Date(y, m, 0).getDate(); }

  function debounce(fn, wait){
    let t;
    return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), wait); };
  }

  function pctChange(cur, prev){
    if(!prev) return cur ? 100 : 0;
    return Math.round(((cur-prev)/prev)*100);
  }

  function clampNumber(n, min, max){
    n = Number(n);
    if(isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  return { uid, fmtMoney, escapeHtml, monthKey, monthLabel, prevMonthKey, nextMonthKey, fmtDate, fmtDateShort, todayISODate, daysInMonth, debounce, pctChange, clampNumber };
})();
