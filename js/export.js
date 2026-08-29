/* Export: shared CSV-building and file-download helpers.
   Used by Settings (full-history export) and the Expenses/Monthly Sheet page
   (single-month export) so the CSV format is defined in exactly one place. */
window.Export = (function(){

  function toCsv(expenses, categoryNameFn, opts){
    opts = opts || {};
    const cols = ['Date','Name','Category','Payment Method'];
    if(opts.paidByFn) cols.push('Paid By');
    cols.push('Amount','Notes');
    let csv = cols.join(',') + '\n';
    expenses.forEach(e=>{
      const row = [
        new Date(e.date).toLocaleDateString('en-IN'),
        `"${(e.name||'').replace(/"/g,'""')}"`,
        categoryNameFn(e.category),
        e.paymentMethod||''
      ];
      if(opts.paidByFn) row.push(opts.paidByFn(e.paidBy));
      row.push(e.amount, `"${(e.notes||'').replace(/"/g,'""')}"`);
      csv += row.join(',') + '\n';
    });
    return csv;
  }

  function downloadBlob(content, type, filename){
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { toCsv, downloadBlob };
})();
