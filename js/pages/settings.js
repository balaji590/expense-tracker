window.Pages = window.Pages || {};
window.Pages.settings = (function(){
  const U = Utils;

  function render(container){
    const st = State;
    const demoCount = st.data.expenses.filter(e=>e.isDemo).length;
    container.innerHTML = `
      <div class="section-head"><h2>Settings</h2></div>

      <div class="card" style="margin-bottom:18px;">
        <div class="card-title">Data & privacy</div>
        <div class="insight-item"><span class="ic">•</span><span>All your data is stored locally in this browser. Nothing is sent to any server.</span></div>
      </div>

      ${demoCount ? `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-title">Demo data</div>
        <div class="stat-sub" style="margin-bottom:12px;">You currently have ${demoCount} demo entries (marked with a "Demo" badge) so you can preview the dashboard. Remove them whenever you're ready to track real spending.</div>
        <button class="btn btn-danger" id="removeDemoBtn">Remove demo data</button>
      </div>` : ''}

      <div class="card" style="margin-bottom:18px;">
        <div class="card-title">Export data</div>
        <div class="stat-sub" style="margin-bottom:12px;">Download your expenses for backup or use in another tool.</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" id="exportCsvBtn">Export as CSV</button>
          <button class="btn" id="exportJsonBtn">Export as JSON</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <div class="card-title">Import data</div>
        <div class="stat-sub" style="margin-bottom:12px;">Restore from a previously exported JSON file. This replaces your current data.</div>
        <input type="file" id="importFile" accept="application/json">
      </div>

      <div class="card">
        <div class="card-title" style="color:var(--danger);">Danger zone</div>
        <div class="stat-sub" style="margin-bottom:12px;">Permanently erase all expenses, categories, budgets, and recurring items from this browser.</div>
        <button class="btn btn-danger" id="clearAllBtn">Clear all data</button>
      </div>
    `;

    if(demoCount){
      document.getElementById('removeDemoBtn').onclick = ()=>{
        Modal.confirm({
          title:'Remove demo data?', body:'This deletes only the sample "Demo" entries. Your real expenses are untouched.',
          confirmText:'Remove', danger:true,
          onConfirm: ()=>{ st.clearDemoData(); Toast.show('Demo data removed'); render(container); }
        });
      };
    }

    document.getElementById('exportCsvBtn').onclick = exportCsv;
    document.getElementById('exportJsonBtn').onclick = exportJson;
    document.getElementById('importFile').addEventListener('change', handleImport);
    document.getElementById('clearAllBtn').onclick = ()=>{
      Modal.confirm({
        title:'Clear all data?',
        body:'This permanently deletes every expense, category, budget, and recurring item. This cannot be undone.',
        confirmText:'Clear everything', danger:true,
        onConfirm: ()=>{ st.clearAll(); Toast.show('All data cleared'); render(container); }
      });
    };
  }

  function exportCsv(){
    const st = State;
    const csv = Export.toCsv(st.data.expenses, st.categoryName);
    Export.downloadBlob(csv, 'text/csv', 'expenses.csv');
    Toast.show('CSV exported');
  }

  function exportJson(){
    const st = State;
    const payload = {
      expenses: st.data.expenses, categories: st.data.categories,
      budgets: st.data.budgets, recurring: st.data.recurring, exportedAt: new Date().toISOString()
    };
    Export.downloadBlob(JSON.stringify(payload, null, 2), 'application/json', 'expense-tracker-backup.json');
    Toast.show('JSON exported');
  }

  function handleImport(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = JSON.parse(reader.result);
        if(!parsed.expenses || !Array.isArray(parsed.expenses)) throw new Error('bad format');
        Modal.confirm({
          title:'Import data?', body:'This will replace your current expenses, categories, budgets, and recurring items with the contents of this file.',
          confirmText:'Import', danger:true,
          onConfirm: ()=>{ State.replaceAll(parsed); Toast.show('Data imported successfully'); render(document.getElementById('mainContent')); }
        });
      }catch(err){
        Toast.show('That file could not be read. Please choose a valid backup JSON.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  return { render, title:'Settings' };
})();
