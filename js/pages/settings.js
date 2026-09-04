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
        <div class="stat-sub" style="margin-bottom:12px;">Restore from a previously exported JSON backup (replaces all your data), or import expenses from a CSV file (adds to your existing expenses).</div>
        <input type="file" id="importFile" accept=".json,.csv,application/json,text/csv">
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
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    const reader = new FileReader();
    reader.onload = ()=>{
      if(isCsv) handleCsvImport(reader.result);
      else handleJsonImport(reader.result);
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function handleJsonImport(text){
    try{
      const parsed = JSON.parse(text);
      if(!parsed.expenses || !Array.isArray(parsed.expenses)) throw new Error('bad format');
      Modal.confirm({
        title:'Import data?', body:'This will replace your current expenses, categories, budgets, and recurring items with the contents of this file.',
        confirmText:'Import', danger:true,
        onConfirm: ()=>{ State.replaceAll(parsed); Toast.show('Data imported successfully'); render(document.getElementById('mainContent')); }
      });
    }catch(err){
      Toast.show('That file could not be read. Please choose a valid backup JSON.');
    }
  }

  // CSV import ADDS to existing expenses (never replaces) -- unlike JSON
  // restore, which is an explicit full-backup restore, a CSV is typically
  // external/partial data (a bank export, a spreadsheet, another month's
  // worth of entries) that the person wants brought IN alongside what's
  // already there, not a replacement for it. Any category name in the CSV
  // that doesn't already exist (case-insensitive match) is created fresh
  // rather than silently dropped or mis-mapped to "Other".
  function handleCsvImport(text){
    let rows;
    try{
      rows = Export.fromCsv(text);
    }catch(err){
      Toast.show(err.message || 'That CSV could not be read.');
      return;
    }
    if(rows.length === 0){
      Toast.show('No rows found in that CSV.');
      return;
    }

    const parsedRows = [];
    const unparseableDates = [];
    rows.forEach((r, i) => {
      const iso = Export.parseCsvDate(r.dateText);
      if(!iso || !r.name || !Number.isFinite(r.amount) || r.amount <= 0){
        unparseableDates.push(i + 2); // +2: header row + 1-indexed
        return;
      }
      parsedRows.push(Object.assign({}, r, { isoDate: iso }));
    });

    if(parsedRows.length === 0){
      Toast.show('None of the rows could be read. Check the Date/Name/Amount columns.');
      return;
    }

    const newCategoryNames = [...new Set(
      parsedRows.map(r => r.category).filter(name => name &&
        !State.data.categories.some(c => c.name.toLowerCase() === name.toLowerCase()))
    )];

    const skippedNote = unparseableDates.length ? ` ${unparseableDates.length} row(s) will be skipped (rows ${unparseableDates.join(', ')}).` : '';
    Modal.confirm({
      title: 'Import CSV?',
      body: `This will ADD ${parsedRows.length} expense(s) to your existing data` +
        (newCategoryNames.length ? `, and create ${newCategoryNames.length} new categor${newCategoryNames.length===1?'y':'ies'}: ${newCategoryNames.join(', ')}.` : '.') +
        skippedNote,
      confirmText: 'Import',
      onConfirm: async ()=>{
        const categoryIdByName = {};
        State.data.categories.forEach(c => { categoryIdByName[c.name.toLowerCase()] = c.id; });
        for(const name of newCategoryNames){
          const created = await State.addCategory({ name, color: '#8b8f97', icon: name[0].toUpperCase() });
          categoryIdByName[name.toLowerCase()] = created.id;
        }
        for(const r of parsedRows){
          await State.addExpense({
            name: r.name,
            amount: r.amount,
            date: r.isoDate,
            category: r.category ? (categoryIdByName[r.category.toLowerCase()] || 'cat_other') : 'cat_other',
            paymentMethod: r.paymentMethod,
            notes: r.notes,
            tags: []
          });
        }
        Toast.show(`Imported ${parsedRows.length} expense(s) from CSV`);
        render(document.getElementById('mainContent'));
      }
    });
  }

  return { render, title:'Settings' };
})();
