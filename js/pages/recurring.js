window.Pages = window.Pages || {};
window.Pages.recurring = (function(){
  const U = Utils;

  function render(container){
    const st = State;
    container.innerHTML = `
      <div class="section-head">
        <h2>Recurring expenses</h2>
        <button class="btn btn-primary" id="addRecBtn">+ Add recurring</button>
      </div>
      <div class="card responsive-table" id="recCard"></div>
    `;
    container.querySelector('#addRecBtn').onclick = openForm;
    renderList(container);
  }

  function renderList(container){
    const st = State;
    const card = container.querySelector('#recCard');
    if(!st.data.recurring.length){
      card.innerHTML = `<div class="empty-state"><div class="es-title">No recurring expenses</div><div class="es-sub">Track subscriptions, rent, and bills that repeat every cycle.</div><button class="btn btn-primary" id="recAddEmpty">+ Add recurring expense</button></div>`;
      card.querySelector('#recAddEmpty').onclick = openForm;
      return;
    }
    const rows = st.data.recurring.map(r=>{
      const dueSoon = new Date(r.nextDueDate) - new Date() < 3*24*60*60*1000;
      return `
        <tr>
          <td data-label="Name" style="font-weight:600;">${U.escapeHtml(r.name)}</td>
          <td data-label="Category"><span class="dot" style="background:${st.categoryColor(r.category)}"></span> ${U.escapeHtml(st.categoryName(r.category))}</td>
          <td data-label="Frequency">${U.escapeHtml(r.frequency)}</td>
          <td data-label="Next due" style="${dueSoon?'color:var(--warning); font-weight:600;':''}">${U.fmtDate(r.nextDueDate)}</td>
          <td data-label="Amount" style="font-weight:700;">${U.fmtMoney(r.amount)}</td>
          <td data-label="">
            <div class="row-actions">
              <button class="btn btn-sm btn-primary" data-pay="${r.id}">Add now</button>
              <button class="btn btn-sm btn-danger" data-del="${r.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    card.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Frequency</th><th>Next due</th><th>Amount</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    card.querySelectorAll('[data-pay]').forEach(b=>{
      b.onclick = ()=>{
        const r = st.data.recurring.find(x=>x.id===b.getAttribute('data-pay'));
        st.addExpense({ name:r.name, amount:r.amount, category:r.category, date:new Date().toISOString(), paymentMethod:'Bank Transfer', notes:'Recurring expense', tags:['recurring'] });
        const next = advanceDate(r.nextDueDate, r.frequency);
        st.updateRecurring(r.id, {nextDueDate: next});
        Toast.show('Expense logged from recurring item');
        render(document.getElementById('mainContent'));
      };
    });
    card.querySelectorAll('[data-del]').forEach(b=>{
      b.onclick = ()=>{
        Modal.confirm({
          title:'Delete recurring expense?', body:'This only removes the recurring schedule, not past logged expenses.',
          confirmText:'Delete', danger:true,
          onConfirm: ()=>{ st.deleteRecurring(b.getAttribute('data-del')); Toast.show('Recurring expense removed'); }
        });
      };
    });
  }

  function advanceDate(dateStr, freq){
    const d = new Date(dateStr);
    if(freq==='Weekly') d.setDate(d.getDate()+7);
    else if(freq==='Yearly') d.setFullYear(d.getFullYear()+1);
    else d.setMonth(d.getMonth()+1);
    return d.toISOString();
  }

  function openForm(){
    const st = State;
    Modal.open(`
      <div class="modal-title">Add recurring expense</div>
      <div class="field">
        <label>Name</label>
        <input type="text" id="recName" placeholder="e.g. Netflix, Rent, Internet">
        <div class="field-error" id="recErrName">Name is required.</div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Amount (₹)</label>
          <input type="number" id="recAmount" min="0" placeholder="0">
          <div class="field-error" id="recErrAmount">Enter a valid amount.</div>
        </div>
        <div class="field">
          <label>Category</label>
          <select id="recCategory">${st.data.categories.map(c=>`<option value="${c.id}">${U.escapeHtml(c.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Frequency</label>
          <select id="recFreq"><option>Weekly</option><option selected>Monthly</option><option>Yearly</option></select>
        </div>
        <div class="field">
          <label>Next due date</label>
          <input type="date" id="recDue" value="${U.todayISODate()}">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="recCancel">Cancel</button>
        <button class="btn btn-primary" id="recSave">Add recurring</button>
      </div>
    `);
    document.getElementById('recCancel').onclick = Modal.close;
    document.getElementById('recSave').onclick = ()=>{
      const name = document.getElementById('recName').value.trim();
      const amount = parseFloat(document.getElementById('recAmount').value);
      let valid = true;
      const errN = document.getElementById('recErrName'), errA = document.getElementById('recErrAmount');
      errN.classList.toggle('show', !name); if(!name) valid=false;
      errA.classList.toggle('show', !(amount>0)); if(!(amount>0)) valid=false;
      if(!valid) return;
      State.addRecurring({
        name, amount,
        category: document.getElementById('recCategory').value,
        frequency: document.getElementById('recFreq').value,
        nextDueDate: new Date(document.getElementById('recDue').value).toISOString()
      });
      Toast.show('Recurring expense added');
      Modal.close();
      render(document.getElementById('mainContent'));
    };
  }

  return { render, title:'Recurring' };
})();
