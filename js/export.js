/* Export: shared CSV-building and file-download helpers.
   Used by Settings (full-history export) and the Expenses/Monthly Sheet page
   (single-month export) so the CSV format is defined in exactly one place.
   Settings' Import also uses this file's fromCsv() (Phase: CSV import) so
   the parse side lives right next to the format it's the inverse of. */
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

  // Minimal, dependency-free CSV parser (this project has no build step, so
  // no Papa Parse) -- handles quoted fields, commas inside quotes, and
  // escaped "" quotes, which is exactly (and only) what toCsv() above ever
  // produces. Not a general-purpose RFC4180 parser, but sufficient for
  // round-tripping this app's own export format and for a typical
  // spreadsheet-exported CSV using the same conventions.
  function parseCsvLine(line){
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for(let i=0; i<line.length; i++){
      const ch = line[i];
      if(inQuotes){
        if(ch === '"'){
          if(line[i+1] === '"'){ cur += '"'; i++; }
          else inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if(ch === '"') inQuotes = true;
        else if(ch === ','){ fields.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  }

  // Accepts the exact shape toCsv() produces (Date,Name,Category,Payment
  // Method,[Paid By],Amount,Notes -- column order doesn't matter, only the
  // header names do) plus typical spreadsheet exports using the same
  // column names. Returns raw {name, category, paymentMethod, amount,
  // notes, dateText} rows -- date parsing/category resolution is the
  // caller's job (Settings' handleImport), since that needs access to
  // State (existing categories) that this shared module doesn't have.
  function fromCsv(csvText){
    const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '');
    if(lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const idx = (name) => headers.indexOf(name);
    const dateIdx = idx('date'), nameIdx = idx('name'), categoryIdx = idx('category'),
      paymentIdx = idx('payment method'), amountIdx = idx('amount'), notesIdx = idx('notes');
    if(dateIdx === -1 || nameIdx === -1 || amountIdx === -1){
      throw new Error('CSV must include at least Date, Name, and Amount columns');
    }
    const rows = [];
    for(let i=1; i<lines.length; i++){
      const fields = parseCsvLine(lines[i]);
      if(!fields.some(f => f.trim() !== '')) continue; // skip blank rows
      rows.push({
        dateText: (fields[dateIdx]||'').trim(),
        name: (fields[nameIdx]||'').trim(),
        category: categoryIdx !== -1 ? (fields[categoryIdx]||'').trim() : '',
        paymentMethod: paymentIdx !== -1 ? (fields[paymentIdx]||'').trim() : '',
        amount: amountIdx !== -1 ? Number(fields[amountIdx]) : NaN,
        notes: notesIdx !== -1 ? (fields[notesIdx]||'').trim() : ''
      });
    }
    return rows;
  }

  // Parses the two date shapes this app ever needs to read back: its own
  // CSV export's en-IN locale format (D/M/YYYY, no guaranteed leading
  // zeros) and a plain ISO date (YYYY-MM-DD...). Deliberately NOT handed
  // off to `new Date(dateText)` for the D/M/YYYY case -- browsers disagree
  // on whether "28/8/2026"-style strings are D/M/Y or M/D/Y, which silently
  // produces wrong dates (or Invalid Date) for exactly the format this app
  // itself writes. Returns an ISO string, or null if unparseable.
  function parseCsvDate(dateText){
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateText);
    if(isoMatch){
      const d = new Date(dateText);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateText);
    if(dmyMatch){
      const [, day, month, year] = dmyMatch;
      const d = new Date(Date.UTC(Number(year), Number(month)-1, Number(day)));
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  }

  function downloadBlob(content, type, filename){
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { toCsv, fromCsv, parseCsvDate, downloadBlob };
})();
