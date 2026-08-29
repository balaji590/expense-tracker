window.Pages = window.Pages || {};
window.Pages.expenses = (function(){
  const U = Utils, C = Calc;
  let filterState = { search:'', dateFrom:'', dateTo:'', category:'', payment:'', min:'', max:'', sort:'newest' };
  let selKey = U.monthKey(new Date());
  let groupByDay = false;
  let containerRef = null;

  function isSharedActive(){
    return State.activeGroupId() !== Storage.PERSONAL_GROUP_ID;
  }

  // New expenses only ever offer active members. Editing an expense that
  // already references a removed member (as paidBy or in a split) must still
  // show that member so the historical value displays and saves correctly —
  // it's just not offered as a NEW selection for anyone else.
  function resolveMembersForForm(groupId, existing){
    const active = State.membersForGroup(groupId);
    if(!existing) return active;
    const all = State.membersForGroup(groupId, {includeRemoved:true});
    const referencedMemberIds = new Set((existing.splits||[]).map(s=>s.memberId));
    const extra = all.filter(m => m.removedAt && (m.userId === existing.paidBy || referencedMemberIds.has(m.id)));
    return [...active, ...extra];
  }

  function memberDisplayName(st, m){
    return st.userName(m.userId) + (m.removedAt ? ' (removed)' : '');
  }

  // ---------------------------------------------------------------------
  // Render: month navigator + monthly summary + category strip + filters
  // ---------------------------------------------------------------------
  function render(container){
    containerRef = container;
    const st = State;
    const isCurrentMonth = selKey === U.monthKey(new Date());
    const activeGroup = st.groupById(st.activeGroupId());
    const shared = isSharedActive();

    container.innerHTML = `
      <div class="section">
        <div class="month-nav">
          <button class="icon-btn" id="prevMonthBtn" aria-label="Previous month">‹</button>
          <span class="month-label" id="monthLabel">${U.monthLabel(selKey)}</span>
          <button class="icon-btn" id="nextMonthBtn" aria-label="Next month">›</button>
          ${!isCurrentMonth ? `<button class="btn btn-sm" id="jumpTodayBtn">Current month</button>` : ''}
          ${shared && activeGroup ? `<span class="badge" style="background:var(--accent-2); color:var(--accent);">${U.escapeHtml(activeGroup.name)}</span>` : ''}
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
    const monthExpenses = State.getExpensesForMonth(State.activeGroupId(), selKey);
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
    const monthExpenses = State.getExpensesForMonth(st.activeGroupId(), selKey);
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
  // Filtering — scoped to the active group + selected month first, then
  // the existing filters. Group scoping goes through the single centralized
  // State.getExpensesForGroup so it's never re-implemented here.
  // ---------------------------------------------------------------------
  function filteredExpenses(){
    const st = State;
    let list = State.getExpensesForMonth(st.activeGroupId(), selKey);
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

  // ---------------------------------------------------------------------
  // List rendering — table (desktop) + card list (mobile), optional day groups.
  // Paid By column/line only appears when the active group is shared.
  // ---------------------------------------------------------------------
  function rowHtml(e, st, shared){
    return `
      <tr>
        <td>${U.fmtDate(e.date)}</td>
        <td>${U.escapeHtml(e.name)} ${e.isDemo?'<span class="badge badge-demo">Demo</span>':''}</td>
        <td><span class="dot" style="background:${st.categoryColor(e.category)}"></span> ${U.escapeHtml(st.categoryName(e.category))}</td>
        ${shared ? `<td>${U.escapeHtml(st.userName(e.paidBy))}</td>` : `<td>${U.escapeHtml(e.paymentMethod||'—')}</td>`}
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

  function cardHtml(e, st, shared){
    const subParts = [U.escapeHtml(st.categoryName(e.category)), U.fmtDateShort(e.date)];
    if(shared) subParts.push('Paid by ' + U.escapeHtml(st.userName(e.paidBy)));
    else subParts.push(U.escapeHtml(e.paymentMethod||'—'));
    return `
      <div class="expense-card">
        <span class="cat-avatar" style="background:${st.categoryColor(e.category)}">${(st.categoryById(e.category)||{}).icon||'?'}</span>
        <div style="flex:1;">
          <div style="font-weight:600; font-size:14px;">${U.escapeHtml(e.name)} ${e.isDemo?'<span class="badge badge-demo">Demo</span>':''}</div>
          <div class="stat-sub">${subParts.join(' · ')}</div>
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
    const shared = isSharedActive();
    const list = filteredExpenses();
    const card = containerRef.querySelector('#expListCard');

    if(!list.length){
      const monthExpenses = State.getExpensesForMonth(st.activeGroupId(), selKey);
      const groupExpenseCount = State.getExpensesForGroup(st.activeGroupId()).length;
      if(groupExpenseCount === 0){
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
        ${g.expenses.map(e=>rowHtml(e, st, shared)).join('')}
      `).join('');
      cards = groups.map(g => `
        <div class="day-divider">${U.fmtDate(g.dateKey)} — ${U.fmtMoney(g.total)}</div>
        ${g.expenses.map(e=>cardHtml(e, st, shared)).join('')}
      `).join('');
    } else {
      rows = list.map(e=>rowHtml(e, st, shared)).join('');
      cards = list.map(e=>cardHtml(e, st, shared)).join('');
    }

    card.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th>Category</th><th>${shared?'Paid By':'Payment'}</th><th>Amount</th><th></th></tr></thead>
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
  // Monthly CSV export — shared Export module. Personal export format is
  // byte-identical to before; shared groups additionally include Paid By.
  // ---------------------------------------------------------------------
  function exportMonthCsv(){
    const st = State;
    const shared = isSharedActive();
    const monthExpenses = State.getExpensesForMonth(st.activeGroupId(), selKey);
    const csv = Export.toCsv(monthExpenses, st.categoryName, shared ? { paidByFn: st.userName } : undefined);
    Export.downloadBlob(csv, 'text/csv', `expenses-${selKey}.csv`);
    Toast.show(`Exported ${U.monthLabel(selKey)}`);
  }

  // ---------------------------------------------------------------------
  // Add/Edit modal. Personal-mode fields/validation are unchanged. When the
  // active group is shared, Paid By + Split fields are added conditionally.
  // ---------------------------------------------------------------------
  function formHtml(existing, prefill){
    const st = State;
    const e = existing || prefill || {};
    const shared = isSharedActive();
    const groupId = st.activeGroupId();
    const members = shared ? resolveMembersForForm(groupId, existing) : [];

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
      ${shared ? sharedFieldsHtml(members, e) : ''}
      <div class="modal-actions">
        <button class="btn" id="expCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="expSaveBtn">${existing?'Save changes':'Add expense'}</button>
      </div>
    `;
  }

  function sharedFieldsHtml(members, e){
    const st = State;
    const paidBy = e.paidBy || Storage.PERSONAL_USER_ID;
    const splitType = e.splitType || 'none';
    return `
      <div class="field-row">
        <div class="field">
          <label>Added by</label>
          <div class="stat-sub" style="margin-top:9px;">${U.escapeHtml(st.userName(Storage.PERSONAL_USER_ID))}</div>
        </div>
        <div class="field">
          <label>Paid by</label>
          <select id="expPaidBy">
            ${members.map(m=>`<option value="${m.userId}" ${paidBy===m.userId?'selected':''}>${U.escapeHtml(memberDisplayName(st, m))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Split</label>
        <select id="expSplitType">
          <option value="none" ${splitType==='none'?'selected':''}>No split</option>
          <option value="equal" ${splitType==='equal'?'selected':''}>Split equally</option>
          <option value="custom" ${splitType==='custom'?'selected':''}>Custom amounts</option>
        </select>
      </div>
      <div id="splitBuilderWrap"></div>
    `;
  }

  function splitBuilderHtml(members, splitType, existingSplits, amount){
    const st = State;
    if(splitType === 'none') return '';
    const existingByMember = {};
    (existingSplits||[]).forEach(s=>{ existingByMember[s.memberId] = s.amount; });

    if(splitType === 'equal'){
      const defaultChecked = existingSplits && existingSplits.length
        ? members.map(m=>existingByMember[m.id]!==undefined)
        : members.map(()=>true);
      return `
        <div class="field">
          <label>Split with</label>
          ${members.map((m,i)=>`
            <label style="display:flex; align-items:center; gap:7px; font-size:13.5px; font-weight:500; margin-bottom:6px; cursor:pointer;">
              <input type="checkbox" data-split-member="${m.id}" style="width:auto;" ${defaultChecked[i]?'checked':''}>
              ${U.escapeHtml(memberDisplayName(st, m))}
              <span class="stat-sub" data-split-preview="${m.id}" style="margin-left:auto;"></span>
            </label>
          `).join('')}
        </div>
        <div class="field-error" id="errSplit">Select at least one member to split with.</div>
      `;
    }

    // custom
    return `
      <div class="field">
        <label>Custom amounts</label>
        ${members.map(m=>`
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="flex:1; font-size:13.5px; font-weight:500;">${U.escapeHtml(memberDisplayName(st, m))}</span>
            <input type="number" min="0" step="0.01" data-split-amount="${m.id}" value="${existingByMember[m.id]!==undefined ? existingByMember[m.id] : ''}" style="width:120px;" placeholder="0.00">
          </div>
        `).join('')}
        <div class="stat-sub" id="splitRunningTotal" style="margin-top:6px;"></div>
      </div>
      <div class="field-error" id="errSplit">Split total must exactly equal the expense amount.</div>
    `;
  }

  function updateEqualPreview(container, members){
    const amount = parseFloat(document.getElementById('expAmount').value) || 0;
    const checked = members.filter(m => container.querySelector(`[data-split-member="${m.id}"]`).checked).map(m=>m.id);
    const splits = C.equalSplit(amount, checked);
    const byMember = {};
    splits.forEach(s=>{ byMember[s.memberId] = s.amount; });
    members.forEach(m=>{
      const el = container.querySelector(`[data-split-preview="${m.id}"]`);
      if(el) el.textContent = checked.includes(m.id) ? U.fmtMoney(byMember[m.id]||0) : '';
    });
  }

  function updateCustomTotal(container, members){
    const amount = parseFloat(document.getElementById('expAmount').value) || 0;
    const splits = members.map(m => ({ memberId: m.id, amount: parseFloat(container.querySelector(`[data-split-amount="${m.id}"]`).value) || 0 }));
    const totalEl = container.querySelector('#splitRunningTotal');
    const runningTotal = C.splitsTotal(splits);
    const matches = C.splitsMatchAmount(splits, amount);
    if(totalEl){
      totalEl.textContent = `Total: ${U.fmtMoney(runningTotal)} of ${U.fmtMoney(amount)}`;
      totalEl.style.color = matches ? 'var(--success)' : 'var(--danger)';
    }
  }

  function bindSplitBuilder(members, initialSplitType, initialSplits){
    const wrap = document.getElementById('splitBuilderWrap');
    const splitTypeSel = document.getElementById('expSplitType');
    const amountInput = document.getElementById('expAmount');

    function rebuild(){
      const type = splitTypeSel.value;
      wrap.innerHTML = splitBuilderHtml(members, type, type===initialSplitType ? initialSplits : null, amountInput.value);
      if(type === 'equal'){
        members.forEach(m=>{
          const cb = wrap.querySelector(`[data-split-member="${m.id}"]`);
          if(cb) cb.addEventListener('change', ()=>updateEqualPreview(wrap, members));
        });
        updateEqualPreview(wrap, members);
      } else if(type === 'custom'){
        members.forEach(m=>{
          const input = wrap.querySelector(`[data-split-amount="${m.id}"]`);
          if(input) input.addEventListener('input', U.debounce(()=>updateCustomTotal(wrap, members), 120));
        });
        updateCustomTotal(wrap, members);
      }
    }

    splitTypeSel.addEventListener('change', rebuild);
    amountInput.addEventListener('input', U.debounce(()=>{
      const type = splitTypeSel.value;
      if(type==='equal') updateEqualPreview(wrap, members);
      else if(type==='custom') updateCustomTotal(wrap, members);
    }, 150));

    rebuild();
  }

  function bindForm(existingId){
    const shared = isSharedActive();
    const existing = existingId ? State.data.expenses.find(x=>x.id===existingId) : null;
    const members = shared ? resolveMembersForForm(State.activeGroupId(), existing) : [];

    if(shared){
      bindSplitBuilder(members, existing ? existing.splitType : 'none', existing ? existing.splits : []);
    }

    document.getElementById('expCancelBtn').onclick = Modal.close;
    document.getElementById('expSaveBtn').onclick = ()=>{
      const name = document.getElementById('expName').value.trim();
      const amount = parseFloat(document.getElementById('expAmount').value);
      const date = document.getElementById('expDate').value;
      let valid = true;
      toggleError('errName', !name); if(!name) valid=false;
      toggleError('errAmount', !(amount>0)); if(!(amount>0)) valid=false;
      toggleError('errDate', !date); if(!date) valid=false;

      const payload = {
        name, amount,
        date: new Date(date).toISOString(),
        category: document.getElementById('expCategory').value,
        paymentMethod: document.getElementById('expPayment').value,
        notes: document.getElementById('expNotes').value.trim(),
        tags: document.getElementById('expTags').value.split(',').map(t=>t.trim()).filter(Boolean)
      };

      if(shared){
        const paidBy = document.getElementById('expPaidBy').value;
        const splitType = document.getElementById('expSplitType').value;
        payload.paidBy = paidBy;
        payload.splitType = splitType;

        if(splitType === 'equal'){
          const checked = members.filter(m => document.querySelector(`[data-split-member="${m.id}"]`).checked).map(m=>m.id);
          toggleError('errSplit', checked.length===0);
          if(checked.length===0) valid = false;
          if(valid) payload.splits = C.equalSplit(amount, checked);
        } else if(splitType === 'custom'){
          const splits = members.map(m => ({ memberId: m.id, amount: parseFloat(document.querySelector(`[data-split-amount="${m.id}"]`).value) || 0 }));
          const matches = amount>0 && C.splitsMatchAmount(splits, amount);
          toggleError('errSplit', !matches);
          if(!matches) valid = false;
          if(valid) payload.splits = splits;
        } else {
          payload.splits = [];
        }
      }

      if(!valid) return;

      const newMonthKey = U.monthKey(payload.date);

      if(existingId){
        // groupId and addedBy are intentionally never included in an edit
        // payload, so State.updateExpense's merge always preserves them.
        State.updateExpense(existingId, payload);
        if(newMonthKey !== selKey){
          Toast.show(`Expense moved to ${U.monthLabel(newMonthKey)}`);
        } else {
          Toast.show('Expense updated');
        }
      } else {
        payload.groupId = State.activeGroupId();
        payload.addedBy = Storage.PERSONAL_USER_ID;
        if(!shared){
          payload.paidBy = Storage.PERSONAL_USER_ID;
          payload.splitType = 'none';
          payload.splits = [];
        }
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
    if(input && (input.tagName==='INPUT' || input.tagName==='SELECT' || input.tagName==='TEXTAREA')) input.classList.toggle('invalid', !!show);
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
