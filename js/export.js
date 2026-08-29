/* Export: shared CSV-building and file-download helpers.
   Used by Settings (full-history export) and the Expenses/Monthly Sheet page
   (single-month export) so the CSV format is defined in exactly one place. */
window.Export = (function(){

  function toCsv(expenses, categoryNameFn){
    let csv = 'Date,Name,Category,Payment Method,Amount,Notes\n';
    expenses.forEach(e=>{
      csv += `${new Date(e.date).toLocaleDateString('en-IN')},"${(e.name||'').replace(/"/g,'""')}",${categoryNameFn(e.category)},${e.paymentMethod||''},${e.amount},"${(e.notes||'').replace(/"/g,'""')}"\n`;
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
