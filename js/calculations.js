window.Calc = (function(){
  const U = Utils;

  function expensesForMonth(expenses, key){
    return expenses.filter(e => U.monthKey(e.date) === key);
  }
  function expensesForToday(expenses){
    const today = U.todayISODate();
    return expenses.filter(e => e.date.slice(0,10) === today);
  }
  function total(expenses){ return expenses.reduce((s,e)=>s+Number(e.amount||0),0); }

  function byCategory(expenses){
    const map = {};
    expenses.forEach(e=>{ map[e.category] = (map[e.category]||0) + Number(e.amount||0); });
    return map;
  }
  function byPaymentMethod(expenses){
    const map = {};
    expenses.forEach(e=>{ const k = e.paymentMethod||'Other'; map[k] = (map[k]||0) + Number(e.amount||0); });
    return map;
  }
  function byDay(expenses, year, month){
    const dim = U.daysInMonth(year, month);
    const arr = new Array(dim).fill(0);
    expenses.forEach(e=>{
      const d = new Date(e.date);
      if(d.getFullYear()===year && (d.getMonth()+1)===month){
        arr[d.getDate()-1] += Number(e.amount||0);
      }
    });
    return arr;
  }

  function highestCategory(expenses){
    const map = byCategory(expenses);
    let top=null, val=-1;
    Object.entries(map).forEach(([k,v])=>{ if(v>val){val=v;top=k;} });
    return top ? {category:top, amount:val} : null;
  }
  function highestExpense(expenses){
    if(!expenses.length) return null;
    return expenses.reduce((a,b)=> (b.amount>a.amount? b:a));
  }
  function avgDaily(expenses){
    if(!expenses.length) return 0;
    const days = new Set(expenses.map(e=>e.date.slice(0,10)));
    return total(expenses) / Math.max(1, days.size);
  }
  function avgTransaction(expenses){
    if(!expenses.length) return 0;
    return total(expenses) / expenses.length;
  }

  // Groups an already-filtered/sorted expense array by calendar day, for display purposes only
  // (e.g. the Monthly Sheet's optional daily-grouping view). Preserves each day's existing relative
  // row order from the input array; groups themselves are ordered newest-day-first. Uses the same
  // date.slice(0,10) convention as expensesForToday/byDay/the Expenses page's date filters, so it
  // stays consistent with how "day" is determined everywhere else in the app.
  function byDayGroups(expenses){
    const map = {};
    expenses.forEach(e=>{
      const key = e.date.slice(0,10);
      if(!map[key]) map[key] = [];
      map[key].push(e);
    });
    return Object.keys(map)
      .sort((a,b)=> b.localeCompare(a))
      .map(dateKey => ({ dateKey, expenses: map[dateKey], total: total(map[dateKey]) }));
  }

  // ---- Insights (rule based) ----
  function buildInsights(state){
    const insights = [];
    const now = new Date();
    const curKey = U.monthKey(now);
    const prevKey = U.prevMonthKey(curKey);
    const curExp = expensesForMonth(state.data.expenses, curKey);
    const prevExp = expensesForMonth(state.data.expenses, prevKey);
    if(curExp.length === 0) return insights;

    const curTotal = total(curExp), prevTotal = total(prevExp);
    const curByCat = byCategory(curExp), prevByCat = byCategory(prevExp);

    const top = highestCategory(curExp);
    if(top){
      insights.push({type:'neutral', text: `${state.categoryName(top.category)} is your highest spending category this month (${U.fmtMoney(top.amount)}).`});
    }

    Object.keys(curByCat).forEach(catId=>{
      const cur = curByCat[catId], prev = prevByCat[catId]||0;
      if(prev > 0){
        const pct = U.pctChange(cur, prev);
        if(pct >= 25){
          insights.push({type:'neg', text: `${state.categoryName(catId)} spending increased by ${pct}% compared with last month.`});
        } else if(pct <= -25){
          insights.push({type:'pos', text: `${state.categoryName(catId)} spending decreased by ${Math.abs(pct)}% this month.`});
        }
      }
    });

    if(prevExp.length){
      const avgCur = avgDaily(curExp), avgPrev = avgDaily(prevExp);
      if(avgCur > avgPrev * 1.15){
        insights.push({type:'neg', text: `Your average daily spending (${U.fmtMoney(avgCur)}) is higher than last month.`});
      }
    }

    const txCounts = {};
    curExp.forEach(e=>{ txCounts[e.category] = (txCounts[e.category]||0)+1; });
    Object.entries(txCounts).forEach(([catId, count])=>{
      if(count >= 10){
        insights.push({type:'neutral', text: `You have made ${count} transactions in the ${state.categoryName(catId)} category this month.`});
      }
    });

    return insights.slice(0,6);
  }

  // "Where can I spend less" — suggests trimming categories that grew a lot or sit above their typical share
  function buildSavingSuggestions(state){
    const now = new Date();
    const curKey = U.monthKey(now);
    const prevKey = U.prevMonthKey(curKey);
    const curExp = expensesForMonth(state.data.expenses, curKey);
    const prevExp = expensesForMonth(state.data.expenses, prevKey);
    if(curExp.length < 3) return {items:[], totalSaving:0};

    const curByCat = byCategory(curExp);
    const prevByCat = byCategory(prevExp);
    const items = [];

    Object.entries(curByCat).forEach(([catId, cur])=>{
      const prev = prevByCat[catId] || 0;
      let target = null;
      if(prev > 0 && cur > prev * 1.1){
        target = prev * 1.05; // suggest trimming back toward last month + small buffer
      } else if(prev === 0 && cur > 1500){
        target = cur * 0.75; // new/discretionary-looking category, suggest trimming 25%
      }
      if(target && target < cur){
        const saving = cur - target;
        if(saving > 100){
          items.push({category: state.categoryName(catId), current: cur, target: Math.round(target), saving: Math.round(saving)});
        }
      }
    });

    items.sort((a,b)=> b.saving - a.saving);
    const top = items.slice(0,4);
    const totalSaving = top.reduce((s,i)=>s+i.saving,0);
    return {items: top, totalSaving};
  }

  // ---- Budget status ----
  function budgetStatus(spent, budget){
    if(!budget || budget<=0) return null;
    const pct = Math.min(999, Math.round((spent/budget)*100));
    let level = 'ok';
    if(pct >= 100) level = 'over';
    else if(pct >= 80) level = 'warn';
    return {pct, level, remaining: budget-spent};
  }

  // ---- Calculator math ----
  function calcFinal({price, qty, taxPct, discountAmt}){
    price = Number(price)||0; qty = Number(qty)||1; taxPct = Number(taxPct)||0; discountAmt = Number(discountAmt)||0;
    const subtotal = price * qty;
    const afterDiscount = Math.max(0, subtotal - discountAmt);
    const tax = afterDiscount * (taxPct/100);
    const final = afterDiscount + tax;
    return { subtotal, afterDiscount, tax, final };
  }

  // ---- Splits (Phase 3: Equal / Custom only — no percentage/shares/balances yet) ----
  // Pure functions, reused identically by the Add/Edit expense form's live preview
  // and by its save-time validation, so the split math is never duplicated.
  function equalSplit(amount, memberIds){
    if(!memberIds || !memberIds.length) return [];
    // Work in integer paise to avoid floating-point drift, then give any
    // leftover paise to the first N members so the parts always sum exactly.
    const totalPaise = Math.round(Number(amount) * 100);
    const base = Math.floor(totalPaise / memberIds.length);
    const remainder = totalPaise - base * memberIds.length;
    return memberIds.map((memberId, i) => ({
      memberId,
      amount: (base + (i < remainder ? 1 : 0)) / 100
    }));
  }
  function splitsTotal(splits){
    return (splits||[]).reduce((s, sp) => s + Number(sp.amount||0), 0);
  }
  function splitsMatchAmount(splits, amount){
    // Compare in paise so 999.999999999 vs 1000 (float drift) never false-fails.
    return Math.round(splitsTotal(splits) * 100) === Math.round(Number(amount) * 100);
  }

  return {
    expensesForMonth, expensesForToday, total, byCategory, byPaymentMethod, byDay, byDayGroups,
    highestCategory, highestExpense, avgDaily, avgTransaction,
    buildInsights, buildSavingSuggestions, budgetStatus, calcFinal,
    equalSplit, splitsTotal, splitsMatchAmount
  };
})();
