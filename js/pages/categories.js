window.Pages = window.Pages || {};
window.Pages.categories = (function(){
  const U = Utils;
  const PALETTE = ['#e0704a','#4f9d69','#4a90d9','#d4568f','#c99a2e','#8b6fd6','#3fb0a8','#5d7fd6','#3ba3c9','#a8623e','#a15fc7','#8b8f97','#d64545','#1e8e5a'];

  function render(container){
    const st = State;
    container.innerHTML = `
      <div class="section-head">
        <h2>Categories</h2>
        <button class="btn btn-primary" id="addCatBtn">+ Add category</button>
      </div>
      <div class="card responsive-table">
        <div class="table-wrap">
          <table>
            <thead><tr><th></th><th>Name</th><th>Expenses</th><th>Total spent</th><th></th></tr></thead>
            <tbody id="catRows"></tbody>
          </table>
        </div>
      </div>
    `;

    const rows = st.data.categories.map(c=>{
      const count = st.data.expenses.filter(e=>e.category===c.id).length;
      const spent = st.data.expenses.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount),0);
      return `
        <tr>
          <td data-label=""><span class="cat-avatar" style="background:${c.color}">${U.escapeHtml(c.icon||c.name[0])}</span></td>
          <td data-label="Name" style="font-weight:600;">${U.escapeHtml(c.name)}</td>
          <td data-label="Expenses">${count}</td>
          <td data-label="Total spent">${U.fmtMoney(spent)}</td>
          <td data-label="">
            <div class="row-actions">
              <button class="btn btn-sm" data-edit="${c.id}">Edit</button>
              <button class="btn btn-sm btn-danger" data-del="${c.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    container.querySelector('#catRows').innerHTML = rows;

    container.querySelector('#addCatBtn').onclick = ()=> openForm(null);
    container.querySelectorAll('[data-edit]').forEach(b=> b.onclick = ()=> openForm(st.categoryById(b.getAttribute('data-edit'))));
    container.querySelectorAll('[data-del]').forEach(b=> b.onclick = ()=> handleDelete(b.getAttribute('data-del')));
  }

  function openForm(existing){
    const swatches = PALETTE.map(c=>`<button type="button" class="dot swatch" data-color="${c}" aria-label="Color ${c}" style="background:${c}; width:22px;height:22px;cursor:pointer;border:2px solid ${existing&&existing.color===c?'#000':'transparent'}; padding:0;"></button>`).join(' ');
    Modal.open(`
      <div class="modal-title">${existing?'Edit category':'Add category'}</div>
      <div class="field">
        <label>Category name</label>
        <input type="text" id="catName" value="${U.escapeHtml(existing?existing.name:'')}" placeholder="e.g. Pet care">
        <div class="field-error" id="catErr">Enter a unique category name.</div>
      </div>
      <div class="field">
        <label>Icon letter</label>
        <input type="text" id="catIcon" maxlength="2" value="${U.escapeHtml(existing?existing.icon:'')}" placeholder="e.g. P">
      </div>
      <div class="field">
        <label>Color</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;" id="catSwatches">${swatches}</div>
        <input type="hidden" id="catColor" value="${existing?existing.color:PALETTE[0]}">
      </div>
      <div class="modal-actions">
        <button class="btn" id="catCancel">Cancel</button>
        <button class="btn btn-primary" id="catSave">${existing?'Save changes':'Add category'}</button>
      </div>
    `);
    document.querySelectorAll('#catSwatches .swatch').forEach(sw=>{
      sw.onclick = ()=>{
        document.querySelectorAll('#catSwatches .swatch').forEach(s=>s.style.border='2px solid transparent');
        sw.style.border = '2px solid #000';
        document.getElementById('catColor').value = sw.getAttribute('data-color');
      };
    });
    document.getElementById('catCancel').onclick = Modal.close;
    document.getElementById('catSave').onclick = ()=>{
      const name = document.getElementById('catName').value.trim();
      const dup = State.data.categories.some(c=> c.name.toLowerCase()===name.toLowerCase() && (!existing || c.id!==existing.id));
      const err = document.getElementById('catErr');
      if(!name || dup){ err.classList.add('show'); document.getElementById('catName').classList.add('invalid'); return; }
      err.classList.remove('show');
      const payload = {
        name,
        icon: document.getElementById('catIcon').value.trim() || name[0].toUpperCase(),
        color: document.getElementById('catColor').value
      };
      if(existing){ State.updateCategory(existing.id, payload); Toast.show('Category updated'); }
      else{ State.addCategory(payload); Toast.show('Category added'); }
      Modal.close();
    };
  }

  function handleDelete(id){
    const st = State;
    const cat = st.categoryById(id);
    if(!cat) return;
    if(st.data.categories.length <= 1){
      Modal.alert({title:'Cannot delete', body:'At least one category must remain.'});
      return;
    }
    const usedCount = st.data.expenses.filter(e=>e.category===id).length;
    if(usedCount === 0){
      Modal.confirm({
        title:`Delete "${U.escapeHtml(cat.name)}"?`, body:'This category has no expenses linked to it.',
        confirmText:'Delete', danger:true,
        onConfirm: ()=>{ st.deleteCategory(id, st.data.categories.find(c=>c.id!==id).id); Toast.show('Category deleted'); }
      });
      return;
    }
    const others = st.data.categories.filter(c=>c.id!==id);
    Modal.open(`
      <div class="modal-title">Move expenses before deleting</div>
      <div class="modal-body">"${U.escapeHtml(cat.name)}" has ${usedCount} expense${usedCount===1?'':'s'} linked to it. Choose a category to move ${usedCount===1?'it':'them'} to — expense history is never deleted silently.</div>
      <div class="field">
        <label>Move expenses to</label>
        <select id="reassignTarget">${others.map(c=>`<option value="${c.id}">${U.escapeHtml(c.name)}</option>`).join('')}</select>
      </div>
      <div class="modal-actions">
        <button class="btn" id="reassignCancel">Cancel</button>
        <button class="btn btn-danger" id="reassignConfirm">Move & Delete</button>
      </div>
    `);
    document.getElementById('reassignCancel').onclick = Modal.close;
    document.getElementById('reassignConfirm').onclick = ()=>{
      const target = document.getElementById('reassignTarget').value;
      st.deleteCategory(id, target);
      Toast.show('Category deleted and expenses moved');
      Modal.close();
    };
  }

  return { render, title:'Categories' };
})();
