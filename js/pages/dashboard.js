window.Pages = window.Pages || {};
window.Pages.dashboard = (function(){
  const U = Utils, C = Calc;

  function render(container, isNewRoute){
    const st = State;
    const all = State.getExpensesForGroup(State.activeGroupId());
    const now = new Date();
    const curKey = U.monthKey(now);
    const prevKey = U.prevMonthKey(curKey);
    const curExp = C.expensesForMonth(all, curKey);
    const prevExp = C.expensesForMonth(all, prevKey);
    const todayExp = C.expensesForToday(all);

    const curTotal = C.total(curExp);
    const prevTotal = C.total(prevExp);
    const totalAll = C.total(all);
    const avgDaily = C.avgDaily(curExp);
    const prevAvgDaily = C.avgDaily(prevExp);
    const topCat = C.highestCategory(curExp);

    const monthDelta = U.pctChange(curTotal, prevTotal);
    const avgDelta = U.pctChange(avgDaily, prevAvgDaily);

    if(all.length === 0){
      container.innerHTML = `
        <div class="card empty-state">
          <div class="es-title">No expenses yet</div>
          <div class="es-sub">Start tracking to see your dashboard come alive.</div>
          <button class="btn btn-primary" id="dashAddFirst">+ Add your first expense</button>
        </div>`;
      container.querySelector('#dashAddFirst').onclick = ()=> Pages.expenses.openAddModal();
      return;
    }

    container.innerHTML = `
      <div class="section">
        <div class="grid grid-5">
          <div class="stat-card">
            <div class="stat-label">Total expenses</div>
            <div class="stat-value" id="statTotalAll">₹0</div>
            <div class="stat-sub">${all.length} transactions all time</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">This month</div>
            <div class="stat-value" id="statCurTotal">₹0</div>
            ${prevExp.length ? `<div class="stat-delta ${monthDelta>=0?'up':'down'}">${monthDelta>=0?'↑':'↓'} ${Math.abs(monthDelta)}% vs last month</div>` : `<div class="stat-sub">No data last month</div>`}
          </div>
          <div class="stat-card">
            <div class="stat-label">Today's expense</div>
            <div class="stat-value" id="statToday">₹0</div>
            <div class="stat-sub">${todayExp.length} transaction${todayExp.length===1?'':'s'} today</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Average daily</div>
            <div class="stat-value" id="statAvgDaily">₹0</div>
            ${prevExp.length ? `<div class="stat-delta ${avgDelta>=0?'up':'down'}">${avgDelta>=0?'↑':'↓'} ${Math.abs(avgDelta)}% vs last month</div>` : `<div class="stat-sub">This month so far</div>`}
          </div>
          <div class="stat-card">
            <div class="stat-label">Highest category</div>
            <div class="stat-value" style="font-size:17px;">${topCat ? st.categoryName(topCat.category) : '—'}</div>
            <div class="stat-sub">${topCat ? U.fmtMoney(topCat.amount) + ' this month' : 'No spending yet'}</div>
          </div>
        </div>
      </div>

      <div class="section grid grid-2">
        <div class="card">
          <div class="card-title">Spending overview — ${U.monthLabel(curKey)}</div>
          <div class="chart-box" id="dashCatChartWrap">
            ${Object.keys(C.byCategory(curExp)).length ? '<canvas id="dashCatChart"></canvas>' : emptyChart('No expenses this month yet.')}
          </div>
        </div>
        <div class="card">
          <div class="card-title">This month at a glance</div>
          <div id="dashInsights"></div>
        </div>
      </div>

      <div class="section grid grid-2">
        <div class="card">
          <div class="card-title">6-month trend</div>
          <div class="chart-box short" id="dashTrendWrap"><canvas id="dashTrendChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Budget snapshot</div>
          <div id="dashBudget"></div>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <h2>Recent transactions</h2>
          <a href="#/expenses" class="btn btn-sm">View all</a>
        </div>
        <div class="card" id="dashRecent"></div>
      </div>
    `;

    // Count-up animated stat values — full animation only on fresh navigation into
    // this page; a same-page refresh (unrelated State.onChange) updates instantly
    // instead of replaying the 0 → value tween.
    const instant = !isNewRoute;
    Animate.countUp(container.querySelector('#statTotalAll'), totalAll, {formatter: U.fmtMoney, instant});
    Animate.countUp(container.querySelector('#statCurTotal'), curTotal, {formatter: U.fmtMoney, instant});
    Animate.countUp(container.querySelector('#statToday'), C.total(todayExp), {formatter: U.fmtMoney, instant});
    Animate.countUp(container.querySelector('#statAvgDaily'), avgDaily, {formatter: U.fmtMoney, instant});

    // Staggered entrance for the summary cards and section cards
    Animate.staggerIn(container.querySelectorAll('.grid-5 .stat-card'), {step:40});
    Animate.staggerIn(container.querySelectorAll('.section > .card, .section > .grid > .card'), {step:60});

    // Category donut
    const byCat = C.byCategory(curExp);
    const catIds = Object.keys(byCat);
    if(catIds.length){
      Charts.donut('dashCatChart', catIds.map(id=>st.categoryName(id)), catIds.map(id=>byCat[id]), catIds.map(id=>st.categoryColor(id)));
    }

    // Insights
    const insights = C.buildInsights(st, all);
    const glance = [
      topCat ? `Top category: <b>${U.escapeHtml(st.categoryName(topCat.category))}</b>` : null,
      `Transactions this month: <b>${curExp.length}</b>`,
      C.highestExpense(curExp) ? `Biggest expense: <b>${U.fmtMoney(C.highestExpense(curExp).amount)}</b> (${U.escapeHtml(C.highestExpense(curExp).name)})` : null
    ].filter(Boolean);
    const insightsEl = container.querySelector('#dashInsights');
    insightsEl.innerHTML = glance.map(g=>`<div class="insight-item"><span class="ic">•</span><span>${g}</span></div>`).join('')
      + insights.slice(0,3).map(i=>`<div class="insight-item ${i.type==='pos'?'pos':i.type==='neg'?'neg':''}"><span class="ic">${i.type==='pos'?'↓':i.type==='neg'?'↑':'•'}</span><span>${U.escapeHtml(i.text)}</span></div>`).join('');

    // Trend chart, 6 months
    const allKeys = [...new Set(all.map(e=>U.monthKey(e.date)))].sort();
    let last6 = allKeys.slice(-6);
    if(!last6.includes(curKey)) last6.push(curKey);
    last6 = [...new Set(last6)].sort().slice(-6);
    Charts.line('dashTrendChart', last6.map(U.monthLabel), last6.map(k=>C.total(C.expensesForMonth(all,k))), 'Spend');

    // Budget snapshot
    const budgetEl = container.querySelector('#dashBudget');
    const overallBudget = st.data.budgets.overall;
    if(!overallBudget){
      budgetEl.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><div class="es-sub">No monthly budget set.</div><a href="#/budgets" class="btn btn-sm btn-primary">Set a budget</a></div>`;
    } else {
      const status = C.budgetStatus(curTotal, overallBudget);
      budgetEl.innerHTML = `
        <div class="stat-sub" style="margin-bottom:8px;">Spent ${U.fmtMoney(curTotal)} of ${U.fmtMoney(overallBudget)}</div>
        <div class="progress ${status.level==='over'?'over':status.level==='warn'?'warn':''}"><div id="dashBudgetFill"></div></div>
        <div class="stat-sub" style="margin-top:8px;">${status.remaining>=0 ? U.fmtMoney(status.remaining)+' remaining' : U.fmtMoney(Math.abs(status.remaining))+' over budget'}</div>
      `;
      Animate.fillBar(budgetEl.querySelector('#dashBudgetFill'), status.pct);
    }

    // Recent transactions
    const recentEl = container.querySelector('#dashRecent');
    const recent = [...all].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,6);
    if(!recent.length){
      recentEl.innerHTML = `<div class="empty-state"><div class="es-sub">No transactions yet.</div></div>`;
    } else {
      recentEl.innerHTML = recent.map(e => `
        <div class="save-row">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="cat-avatar" style="background:${st.categoryColor(e.category)}">${(st.categoryById(e.category)||{}).icon || '?'}</span>
            <div>
              <div style="font-weight:600; font-size:13.5px;">${U.escapeHtml(e.name)} ${e.isDemo?'<span class="badge badge-demo">Demo</span>':''}</div>
              <div class="stat-sub">${st.categoryName(e.category)} · ${U.fmtDateShort(e.date)}</div>
            </div>
          </div>
          <div style="font-weight:700;">${U.fmtMoney(e.amount)}</div>
        </div>
      `).join('');
      Animate.staggerIn(recentEl.querySelectorAll('.save-row'), {step:35});
    }
  }

  function emptyChart(msg){
    return `<div class="empty-state" style="padding:40px 10px;"><div class="es-sub">${msg}</div></div>`;
  }

  return { render, title: 'Dashboard' };
})();
