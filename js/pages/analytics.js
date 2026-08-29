window.Pages = window.Pages || {};
window.Pages.analytics = (function(){
  const U = Utils, C = Calc;
  let selKey = U.monthKey(new Date());

  function render(container){
    const st = State;
    const allKeys = [...new Set(State.getExpensesForGroup(State.activeGroupId()).map(e=>U.monthKey(e.date)))];
    allKeys.push(U.monthKey(new Date()));
    const uniqueKeys = [...new Set(allKeys)].sort().reverse();

    container.innerHTML = `
      <div class="section-head">
        <h2>Monthly analytics</h2>
        <select id="monthSel" style="max-width:220px;">
          ${uniqueKeys.map(k=>`<option value="${k}" ${k===selKey?'selected':''}>${U.monthLabel(k)}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-5" id="analyticsStats" style="margin-bottom:20px;"></div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Category spending</div>
          <div class="chart-box" id="acCatWrap"><canvas id="acCatChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Payment methods</div>
          <div class="chart-box" id="acPayWrap"><canvas id="acPayChart"></canvas></div>
        </div>
      </div>
      <div class="section" style="margin-top:20px;">
        <div class="card">
          <div class="card-title">Daily spending — ${U.monthLabel(selKey)}</div>
          <div class="chart-box" id="acDailyWrap"><canvas id="acDailyChart"></canvas></div>
        </div>
      </div>
    `;

    container.querySelector('#monthSel').onchange = (e)=>{ selKey = e.target.value; renderBody(container); };
    renderBody(container);
  }

  function renderBody(container){
    const st = State;
    const exp = C.expensesForMonth(State.getExpensesForGroup(State.activeGroupId()), selKey);
    const [y,m] = selKey.split('-').map(Number);

    const statsEl = container.querySelector('#analyticsStats');
    if(!exp.length){
      statsEl.innerHTML = `<div class="card empty-state" style="grid-column: 1/-1;"><div class="es-sub">No transactions for ${U.monthLabel(selKey)}.</div></div>`;
      Charts.destroy('acCatChart'); Charts.destroy('acPayChart'); Charts.destroy('acDailyChart');
      container.querySelector('#acCatWrap').innerHTML = `<div class="empty-state"><div class="es-sub">Nothing to chart yet.</div></div>`;
      container.querySelector('#acPayWrap').innerHTML = `<div class="empty-state"><div class="es-sub">Nothing to chart yet.</div></div>`;
      container.querySelector('#acDailyWrap').innerHTML = `<div class="empty-state"><div class="es-sub">Nothing to chart yet.</div></div>`;
      return;
    }

    const total = C.total(exp);
    const top = C.highestCategory(exp);
    const highest = C.highestExpense(exp);
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-label">Total spending</div><div class="stat-value">${U.fmtMoney(total)}</div></div>
      <div class="stat-card"><div class="stat-label">Transactions</div><div class="stat-value">${exp.length}</div></div>
      <div class="stat-card"><div class="stat-label">Avg transaction</div><div class="stat-value">${U.fmtMoney(C.avgTransaction(exp))}</div></div>
      <div class="stat-card"><div class="stat-label">Avg daily spend</div><div class="stat-value">${U.fmtMoney(C.avgDaily(exp))}</div></div>
      <div class="stat-card"><div class="stat-label">Highest expense</div><div class="stat-value" style="font-size:16px;">${U.fmtMoney(highest.amount)}</div><div class="stat-sub">${U.escapeHtml(highest.name)}</div></div>
    `;

    if(!container.querySelector('#acCatChart')) container.querySelector('#acCatWrap').innerHTML = '<canvas id="acCatChart"></canvas>';
    if(!container.querySelector('#acPayChart')) container.querySelector('#acPayWrap').innerHTML = '<canvas id="acPayChart"></canvas>';
    if(!container.querySelector('#acDailyChart')) container.querySelector('#acDailyWrap').innerHTML = '<canvas id="acDailyChart"></canvas>';

    const byCat = C.byCategory(exp);
    const catIds = Object.keys(byCat);
    Charts.donut('acCatChart', catIds.map(id=>st.categoryName(id)), catIds.map(id=>byCat[id]), catIds.map(id=>st.categoryColor(id)));

    const byPay = C.byPaymentMethod(exp);
    const payKeys = Object.keys(byPay);
    Charts.donut('acPayChart', payKeys, payKeys.map(k=>byPay[k]), ['#4a90d9','#4f9d69','#d4568f','#c99a2e','#8b6fd6','#8b8f97']);

    const dailyArr = C.byDay(exp, y, m);
    const labels = dailyArr.map((_,i)=> String(i+1));
    Charts.bar('acDailyChart', labels, [{ label:'Spend', data: dailyArr, backgroundColor: '#4f5bd5', borderRadius:4 }]);
  }

  return { render, title:'Analytics' };
})();
