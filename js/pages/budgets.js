window.Pages = window.Pages || {};
window.Pages.budgets = (function(){
  const U = Utils, C = Calc;

  function render(container){
    const st = State;
    const curKey = U.monthKey(new Date());
    const activeExpenses = State.getExpensesForGroup(State.activeGroupId());
    const curExp = C.expensesForMonth(activeExpenses, curKey);
    const curTotal = C.total(curExp);
    const byCat = C.byCategory(curExp);
    const overall = st.data.budgets.overall;
    const overallStatus = C.budgetStatus(curTotal, overall);
    const suggestions = C.buildSavingSuggestions(st, activeExpenses);

    container.innerHTML = `
      <div class="section-head"><h2>Budgets — ${U.monthLabel(curKey)}</h2></div>

      <div class="card" style="margin-bottom:20px;">
        <div class="card-title">Overall monthly budget</div>
        <div class="field-row" style="align-items:flex-end;">
          <div class="field">
            <label>Monthly budget (₹)</label>
            <input type="number" id="overallBudgetInput" min="0" value="${overall||''}" placeholder="e.g. 30000">
          </div>
          <button class="btn btn-primary" id="saveOverallBtn" style="margin-bottom:14px;">Save budget</button>
        </div>
        ${overall ? `
          <div class="stat-sub" style="margin-bottom:8px;">Spent ${U.fmtMoney(curTotal)} of ${U.fmtMoney(overall)}</div>
          <div class="progress ${overallStatus.level==='over'?'over':overallStatus.level==='warn'?'warn':''}"><div id="overallBudgetFill"></div></div>
          <div class="stat-sub" style="margin-top:8px;">
            ${overallStatus.level==='over' ? `Budget exceeded by ${U.fmtMoney(Math.abs(overallStatus.remaining))}` :
              overallStatus.level==='warn' ? `Nearing budget — ${U.fmtMoney(overallStatus.remaining)} remaining` :
              `${U.fmtMoney(overallStatus.remaining)} remaining`}
          </div>
        ` : `<div class="stat-sub">Set a monthly budget to see progress here.</div>`}
      </div>

      <div class="section-head"><h2>Category budgets</h2></div>
      <div class="card" style="margin-bottom:20px;">
        <div id="catBudgetRows"></div>
      </div>

      <div class="section-head"><h2>Where can I spend less?</h2></div>
      <div class="card">
        <div class="stat-sub" style="margin-bottom:12px;">Suggestions based on your own spending history — not financial advice.</div>
        <div id="savingSuggestions"></div>
      </div>
    `;

    if(overall){
      Animate.fillBar(document.getElementById('overallBudgetFill'), overallStatus.pct);
    }

    document.getElementById('saveOverallBtn').onclick = ()=>{
      const val = parseFloat(document.getElementById('overallBudgetInput').value);
      st.setOverallBudget(val>0 ? val : null);
      Toast.show('Budget saved');
      render(container);
    };

    const catRows = document.getElementById('catBudgetRows');
    catRows.innerHTML = st.data.categories.map(c=>{
      const spent = byCat[c.id] || 0;
      const budget = st.data.budgets.categoryBudgets[c.id];
      const status = C.budgetStatus(spent, budget);
      return `
        <div class="save-row" style="display:block; padding:14px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;"><span class="dot" style="background:${c.color}"></span><b style="font-size:13.5px;">${U.escapeHtml(c.name)}</b></div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="number" data-catbudget="${c.id}" value="${budget||''}" placeholder="No budget" style="width:120px;">
            </div>
          </div>
          ${budget ? `
            <div class="stat-sub" style="margin-bottom:6px;">Spent ${U.fmtMoney(spent)} of ${U.fmtMoney(budget)}</div>
            <div class="progress ${status.level==='over'?'over':status.level==='warn'?'warn':''}"><div class="catBudgetFill" data-fill="${c.id}"></div></div>
          ` : `<div class="stat-sub">Spent ${U.fmtMoney(spent)} so far this month</div>`}
        </div>
      `;
    }).join('');

    catRows.querySelectorAll('.catBudgetFill').forEach(fillEl=>{
      const cid = fillEl.getAttribute('data-fill');
      const spent = byCat[cid] || 0;
      const budget = st.data.budgets.categoryBudgets[cid];
      const status = C.budgetStatus(spent, budget);
      if(status) Animate.fillBar(fillEl, status.pct);
    });

    catRows.querySelectorAll('[data-catbudget]').forEach(input=>{
      input.addEventListener('change', ()=>{
        st.setCategoryBudget(input.getAttribute('data-catbudget'), parseFloat(input.value));
        Toast.show('Category budget saved');
        render(container);
      });
    });

    const sugEl = document.getElementById('savingSuggestions');
    if(!suggestions.items.length){
      sugEl.innerHTML = `<div class="empty-state" style="padding:20px 10px;"><div class="es-sub">Not enough spending pattern yet to suggest cuts. Keep logging expenses.</div></div>`;
    } else {
      sugEl.innerHTML = suggestions.items.map(i=>`
        <div class="save-row">
          <div>
            <div style="font-weight:600; font-size:13.5px;">${U.escapeHtml(i.category)}</div>
            <div class="stat-sub">Current ${U.fmtMoney(i.current)} → suggested target ${U.fmtMoney(i.target)}</div>
          </div>
          <div style="font-weight:700; color:var(--success);">Save ${U.fmtMoney(i.saving)}</div>
        </div>
      `).join('') + `
        <div class="save-row" style="border-top:2px solid var(--border); margin-top:6px;">
          <div style="font-weight:700;">Total potential saving</div>
          <div style="font-weight:700; color:var(--success); font-size:16px;">${U.fmtMoney(suggestions.totalSaving)} / month</div>
        </div>
      `;
    }
  }

  return { render, title:'Budgets' };
})();
