window.Pages = window.Pages || {};
window.Pages.expenses = (function(){
  const U = Utils, C = Calc;
  let filterState = { search:'', dateFrom:'', dateTo:'', category:'', payment:'', min:'', max:'', sort:'newest' };
  let selKey = U.monthKey(new Date());
  let groupByDay = false;
  let containerRef = null;

  // ---------------------------------------------------------------------
  // Render: month navigator + monthly summary + category strip + filters
  // ---------------------------------------------------------------------
  function render(container){
    containerRef = container;
    const st = State;
    const isCurrentMonth = selKey === U.monthKey(new Date());

    container.innerHTML = `
      <div class="section">
        <div class="month-nav">
          <button class="icon-btn" id="prevMonthBtn" aria-label="Previous month">‹</button>
          <span class="month-label" id="monthLabel">${U.monthLabel(selKey)}</span>
          <button class="icon-btn" id="nextMonthBtn" aria-label="Next month">›</button>
          ${!isCurrentMonth ? `<button class="btn btn-sm" id="jumpTodayBtn">Current month</button>` : ''}
          <div style="flex:1;"></div>
          <button class="btn btn-sm" id="exportMonthBtn">Export this month</button>
        </div>
      </div>

      <div class="grid grid-3" id="monthSummary" style="margin-bottom:18px;"></div>

      <div id="catSummaryStrip"></div>

      <div class="section">
        <div class="filters-bar">
          <input type="text" id="fSearch" placeholder="Search name, category, notes" value="${U.escapeHtml(filterState.search)}">
          <select id="fCategory">
            <option value="">All categories</option>
            ${st.data.categories.map(c=>`<option value="${c.id}" ${filterState.category===c.id?'selected':''}>${U.escapeHtml(c.name)}</option>`).join('')}
          </select>
          <select id="fPayment">
            <option value="">All payment methods</option>
            ${['Cash','UPI','Debit Card','Credit Card','Bank Transfer','Other'].map(p=>`<option ${filterState.payment===p?'selected':''}>${p}</option>`).join('')}
          </select>
          <input type="date" id="fFrom" value="${filterState.dateFrom}" title="From date">
          <input type="date" id="fTo" value="${filterState.dateTo}" title="To date">
          <input type="number" id="fMin" placeholder="Min ₹" value="${filterState.min}">
          <input type="number" id="fMax" placeholder="Max ₹" value="${filterState.max}">
          <select id="fSort">
            <option value="newest" ${filterState.sort==='newest'?'selected':''}>Newest first</option>
            <option value="oldest" ${filterState.sort==='oldest'?'selected':''}>Oldest first</option>
            <option value="highest" ${filterState.sort==='highest'?'selected':''}>Highest amount</option>
            <option value="lowest" ${filterState.sort==='lowest'?'selected':''}>Lowest amount</option>
          </select>
        </div>
        <label style="display:flex; align-items:center; gap:7px; font-size:13px; font-weight:500; color:var(--text-2); cursor:pointer; margin-top:2px;">
          <input type="checkbox" id="fGroupByDay" style="width:auto;" ${groupByDay?'checked':''}> Group by day
        </label>
      </div>
      <div class="card" id="expListCard"></div>
    `;

    bindMonthNav();
    bindFilters();
    renderSummary();
    renderCategorySummary();
    renderList();
  }

  function bindMonthNav(){
    const c = containerRef;
    c.querySelector('#prevMonthBtn').onclick = ()=>{ selKey = U.prevMonthKey(selKey); render(containerRef); };
    c.querySelector('#nextMonthBtn').onclick = ()=>{ selKey = U.nextMonthKey(selKey); render(containerRef); };
    const jumpBtn = c.querySelector('#jumpTodayBtn');
    if(jumpBtn) jumpBtn.onclick = ()=>{ selKey = U.monthKey(new Date()); render(containerRef); };
    c.querySelector('#exportMonthBtn').onclick = exportMonthCsv;
  }

  function bindFilters(){
    const c = containerRef;
    const setAndRender = (key, val) => { filterState[key] = val; renderList(); };
    c.querySelector('#fSearch').addEventListener('input', U.debounce(e=>setAndRender('search', e.target.value), 200));
    c.querySelector('#fCategory').addEventListener('change', e=>setAndRender('category', e.target.value));
    c.querySelector('#fPayment').addEventListener('change', e=>setAndRender('payment', e.target.value));
    c.querySelector('#fFrom').addEventListener('change', e=>setAndRender('dateFrom', e.target.value));
    c.querySelector('#fTo').addEventListener('change', e=>setAndRender('dateTo', e.target.value));
    c.querySelector('#fMin').addEventListener('input', U.debounce(e=>setAndRender('min', e.target.value),200));
    c.querySelector('#fMax').addEventListener('input', U.debounce(e=>setAndRender('max', e.target.value),200));
    c.querySelector('#fSort').addEventListener('change', e=>setAndRender('sort', e.target.value));
    c.querySelector('#fGroupByDay').addEventListener('change', e=>{ groupByDay = e.target.checked; renderList(); });
  }

  // ---------------------------------------------------------------------
  // Monthly summary (Total / Transactions / Avg daily) — reuses Calc as-is
  // ---------------------------------------------------------------------
  function renderSummary(){
    const monthExpenses = C.expensesForMonth(State.data.expenses, selKey);
    const el = containerRef.querySelector('#monthSummary');
    el.innerHTML = `
      <div class="stat-card"><div class="stat-label">Total this month</div><div class="stat-value">${U.fmtMoney(C.total(monthExpenses))}</div></div>
      <div class="stat-card"><div class="stat-label">Transactions</div><div class="stat-value">${monthExpenses.length}</div></div>
      <div class="stat-card"><div class="stat-label">Avg daily spend</div><div class="stat-value">${U.fmtMoney(C.avgDaily(monthExpenses))}</div></div>
    `;
  }

  // Compact, low-clutter category chip strip — not a chart, not a dashboard section.
  function renderCategorySummary(){
    const st = State;
    const monthExpenses = C.expensesForMonth(st.data.expenses, selKey);
    const el = containerRef.querySelector('#catSummaryStrip');
    const byCat = C.byCategory(monthExpenses);
    const catIds = Object.keys(byCat).sort((a,b)=> byCat[b]-byCat[a]);
    if(!catIds.length){ el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="cat-summary-strip">
        ${catIds.map(id => `
          <span class="cat-chip">
            <span class="dot" style="background:${st.categoryColor(id)}"></span>
            ${U.escapeHtml(st.categoryName(id))} · ${U.fmtMoney(byCat[id])}
          </span>
        `).join('')}
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // Filtering — scoped to the selected month first, then existing filters
  // ---------------------------------------------------------------------
  function filteredExpenses(){
    const st = State;
    let list = C.expensesForMonth(st.data.expenses, selKey);
    const f = filterState;
    if(f.search){
      const q = f.search.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        st.categoryName(e.category).toLowerCase().includes(q) ||
        (e.notes||'').toLowerCase().includes(q)
      );
    }
    if(f.category) list = list.filter(e=>e.category===f.category);
    if(f.payment) list = list.filter(e=>e.paymentMethod===f.payment);
    if(f.dateFrom) list = list.filter(e=> e.date.slice(0,10) >= f.dateFrom);
    if(f.dateTo) list = list.filter(e=> e.date.slice(0,10) <= f.dateTo);
    if(f.min !== '') list = list.filter(e=> Number(e.amount) >= Number(f.min));
    if(f.max !== '') list = list.filter(e=> Number(e.amount) <= Number(f.max));

    switch(f.sort){
      case 'oldest': list.sort((a,b)=> new Date(a.date)-new Date(b.date)); break;
      case 'highest': list.sort((a,b)=> b.amount-a.amount); break;
      case 'lowest': list.sort((a,b)=> a.amount-b.amount); break;
      default: list.sort((a,b)=> new Date(b.date)-new Date(a.date));
    }
    return list;
  }

  function hasActiveFilters(){
    const f = filterState;
    return !!(f.search || f.category || f.payment || f.dateFrom || f.dateTo || f.min !== '' || f.max !== '');
  }

  // ---------------------------------------------------------------------
  // List rendering — table (desktop) + card list (mobile), optional day groups
  // ---------------------------------------------------------------------
  function rowHtml(e, st){
    return `
      <tr>
        <td>${U.fmtDate(e.date)}</td>
        <td>${U.escapeHtml(e.name)} ${e.isDemo?'<span class="badge badge-demo">Demo</span>':''}</td>
        <td><span class="dot" style="background:${st.categoryColor(e.category)}"></span> ${U.escapeHtml(st.categoryName(e.category))}</td>
        <td>${U.escapeHtml(e.paymentMethod||'—')}</td>
        <td style="font-weight:700;">${U.fmtMoney(e.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" data-edit="${e.id}">Edit</button>
            <button class="btn btn-sm btn-danger" data-del="${e.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  function cardHtml(e, st){
    return `
      <div class="expense-card">
        <span class="cat-avatar" style="background:${st.categoryColor(e.category)}">${(st.categoryById(e.category)||{}).icon||'?'}</span>
        <div style="flex:1;">
          <div style="font-weight:600; font-size:14px;">${U.escapeHtml(e.name)} ${e.isDemo?'<span class="badge badge-demo">Demo</span>':''}</div>
          <div class="stat-sub">${U.escapeHtml(st.categoryName(e.category))} · ${U.fmtDateShort(e.date)} · ${U.escapeHtml(e.paymentMethod||'—')}</div>
          <div class="row-actions" style="justify-content:flex-start; margin-top:8px;">
            <button class="btn btn-sm" data-edit="${e.id}">Edit</button>
            <button class="btn btn-sm btn-danger" data-del="${e.id}">Delete</button>
          </div>
        </div>
        <div style="font-weight:700;">${U.fmtMoney(e.amount)}</div>
      </div>
    `;
  }

  function renderList(){
    const st = State;
    const list = filteredExpenses();
    const card = containerRef.querySelector('#expListCard');

    if(!list.length){
      const monthExpenses = C.expensesForMonth(st.data.expenses, selKey);
      if(st.data.expenses.length === 0){
        card.innerHTML = `<div class="empty-state"><div class="es-title">No expenses yet</div><div class="es-sub">Start tracking your spending.</div><button class="btn btn-primary" id="expAddEmpty">+ Add Your First Expense</button></div>`;
        card.querySelector('#expAddEmpty').onclick = openAddModal;
      } else if(monthExpenses.length === 0){
        card.innerHTML = `<div class="empty-state"><div class="es-title">No expenses in ${U.escapeHtml(U.monthLabel(selKey))}</div><div class="es-sub">Try a different month, or add one for this month.</div><button class="btn btn-primary" id="expAddEmpty">+ Add Expense</button></div>`;
        card.querySelector('#expAddEmpty').onclick = openAddModal;
      } else {
        card.innerHTML = `<div class="empty-state"><div class="es-title">No expenses match your filters</div><div class="es-sub">Try adjusting or clearing your search and filters.</div><button class="btn" id="expClearFilters">Clear filters</button></div>`;
        card.querySelector('#expClearFilters').onclick = ()=>{
          filterState = { search:'', dateFrom:'', dateTo:'', category:'', payment:'', min:'', max:'', sort:'newest' };
          render(containerRef);
        };
      }
      return;
    }

    let rows, cards;
    if(groupByDay){
      const groups = C.byDayGroups(list);
      rows = groups.map(g => `
        <tr class="day-group-row"><td colspan="6">${U.fmtDate(g.dateKey)} — ${U.fmtMoney(g.total)}</td></tr>
        ${g.expenses.map(e=>rowHtml(e, st)).join('')}
      `).join('');
      cards = groups.map(g => `
        <div class="day-divider">${U.fmtDate(g.dateKey)} — ${U.fmtMoney(g.total)}</div>
        ${g.expenses.map(e=>cardHtml(e, st)).join('')}
      `).join('');
    } else {
      rows = list.map(e=>rowHtml(e, st)).join('');
      cards = list.map(e=>cardHtml(e, st)).join('');
    }

    card.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th>Category</th><th>Payment</th><th>Amount</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="expense-cards">${cards}</div>
    `;

    card.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.onclick = ()=> openEditModal(btn.getAttribute('data-edit'));
    });
    card.querySelectorAll('[data-del]').forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute('data-del');
        Modal.confirm({
          title:'Delete expense?',
          body:'This will permanently remove this expense entry.',
          confirmText:'Delete', danger:true,
          onConfirm: ()=>{
            const rowEls = card.querySelectorAll(`[data-del="${id}"]`);
            const targets = Array.from(rowEls).map(b => b.closest('tr') || b.closest('.expense-card'));
            if(targets.length && !Animate.prefersReducedMotion()){
              targets.forEach(t => t && t.classList.add('row-leaving'));
              setTimeout(()=>{ State.deleteExpense(id); Toast.show('Expense deleted'); }, 170);
            } else {
              State.deleteExpense(id); Toast.show('Expense deleted');
            }
          }
        });
      };
    });
  }

  // ---------------------------------------------------------------------
  // Monthly CSV export — shared Export module, same format as Settings
  // ---------------------------------------------------------------------
  function exportMonthCsv(){
    const st = State;
    const monthExpenses = C.expensesForMonth(st.data.expenses, selKey);
    const csv = Export.toCsv(monthExpenses, st.categoryName);
    Export.downloadBlob(csv, 'text/csv', `expenses-${selKey}.csv`);
    Toast.show(`Exported ${U.monthLabel(selKey)}`);
  }

  // ---------------------------------------------------------------------
  // Add/Edit modal — unchanged form/validation logic; only the post-save
  // toast/navigation behavior is month-aware.
  // ---------------------------------------------------------------------
  function formHtml(existing, prefill){
    const st = State;
    const e = existing || prefill || {};
    return `
      <div class="modal-title">${existing? 'Edit expense':'Add expense'}</div>
      <div class="field">
        <label>Expense name</label>
        <input type="text" id="expName" value="${U.escapeHtml(e.name||'')}" placeholder="e.g. Lunch with friends">
        <div class="field-error" id="errName">Expense name is required.</div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Amount (₹)</label>
          <input type="number" id="expAmount" min="0" step="0.01" value="${e.amount||''}" placeholder="0.00">
          <div class="field-error" id="errAmount">Enter a valid amount greater than 0.</div>
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="expDate" value="${(e.date||U.todayISODate()).slice(0,10)}">
          <div class="field-error" id="errDate">Pick a valid date.</div>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Category</label>
          <select id="expCategory">
            ${st.data.categories.map(c=>`<option value="${c.id}" ${e.category===c.id?'selected':''}>${U.escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Payment method</label>
          <select id="expPayment">
            ${['Cash','UPI','Debit Card','Credit Card','Bank Transfer','Other'].map(p=>`<option ${e.paymentMethod===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <textarea id="expNotes" rows="2" placeholder="Any extra detail">${U.escapeHtml(e.notes||'')}</textarea>
      </div>
      <div class="field">
        <label>Tags (optional, comma separated)</label>
        <input type="text" id="expTags" value="${(e.tags||[]).join(', ')}" placeholder="work, reimbursable">
      </div>
      <div class="modal-actions">
        <button class="btn" id="expCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="expSaveBtn">${existing?'Save changes':'Add expense'}</button>
      </div>
    `;
  }

  function bindForm(existingId){
    document.getElementById('expCancelBtn').onclick = Modal.close;
    document.getElementById('expSaveBtn').onclick = ()=>{
      const name = document.getElementById('expName').value.trim();
      const amount = parseFloat(document.getElementById('expAmount').value);
      const date = document.getElementById('expDate').value;
      let valid = true;
      toggleError('errName', !name); if(!name) valid=false;
      toggleError('errAmount', !(amount>0)); if(!(amount>0)) valid=false;
      toggleError('errDate', !date); if(!date) valid=false;
      if(!valid) return;

      const payload = {
        name, amount,
        date: new Date(date).toISOString(),
        category: document.getElementById('expCategory').value,
        paymentMethod: document.getElementById('expPayment').value,
        notes: document.getElementById('expNotes').value.trim(),
        tags: document.getElementById('expTags').value.split(',').map(t=>t.trim()).filter(Boolean)
      };
      const newMonthKey = U.monthKey(payload.date);

      if(existingId){
        State.updateExpense(existingId, payload);
        if(newMonthKey !== selKey){
          Toast.show(`Expense moved to ${U.monthLabel(newMonthKey)}`);
        } else {
          Toast.show('Expense updated');
        }
      } else {
        State.addExpense(payload);
        if(newMonthKey !== selKey){
          selKey = newMonthKey;
          Toast.show(`Expense added — showing ${U.monthLabel(selKey)}`);
        } else {
          Toast.show('Expense added successfully');
        }
      }
      Modal.close();
    };
  }

  function toggleError(id, show){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle('show', !!show);
    const input = el.previousElementSibling;
    if(input) input.classList.toggle('invalid', !!show);
  }

  function openAddModal(prefill){
    Modal.open(formHtml(null, prefill));
    bindForm(null);
  }
  function openEditModal(id){
    const e = State.data.expenses.find(x=>x.id===id);
    if(!e) return;
    Modal.open(formHtml(e));
    bindForm(id);
  }

  return { render, title:'Expenses', openAddModal, openEditModal };
})();
