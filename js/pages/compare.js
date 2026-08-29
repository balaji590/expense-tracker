window.Pages = window.Pages || {};
window.Pages.compare = (function(){
  const U = Utils, C = Calc;
  let keyA = U.prevMonthKey(U.monthKey(new Date()));
  let keyB = U.monthKey(new Date());

  function render(container){
    const st = State;
    const allKeys = [...new Set(st.data.expenses.map(e=>U.monthKey(e.date)))];
    allKeys.push(U.monthKey(new Date()));
    const uniqueKeys = [...new Set(allKeys)].sort().reverse();

    container.innerHTML = `
      <div class="section-head">
        <h2>Compare months</h2>
      </div>
      <div class="card" style="margin-bottom:20px;">
        <div class="field-row">
          <div class="field">
            <label>Month A</label>
            <select id="cmpA">${uniqueKeys.map(k=>`<option value="${k}" ${k===keyA?'selected':''}>${U.monthLabel(k)}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Month B</label>
            <select id="cmpB">${uniqueKeys.map(k=>`<option value="${k}" ${k===keyB?'selected':''}>${U.monthLabel(k)}</option>`).join('')}</select>
          </div>
        </div>
      </div>
      <div id="cmpBody"></div>
    `;
    container.querySelector('#cmpA').onchange = e=>{ keyA = e.target.value; renderBody(container); };
    container.querySelector('#cmpB').onchange = e=>{ keyB = e.target.value; renderBody(container); };
    renderBody(container);
  }

  function renderBody(container){
    const st = State;
    const expA = C.expensesForMonth(st.data.expenses, keyA);
    const expB = C.expensesForMonth(st.data.expenses, keyB);
    const totalA = C.total(expA), totalB = C.total(expB);
    const diff = totalB - totalA;
    const pct = U.pctChange(totalB, totalA);

    const catA = C.byCategory(expA), catB = C.byCategory(expB);
    const allCatIds = [...new Set([...Object.keys(catA), ...Object.keys(catB)])];

    let biggestInc = null, biggestDec = null;
    allCatIds.forEach(id=>{
      const a = catA[id]||0, b = catB[id]||0;
      const d = b - a;
      if(!biggestInc || d > biggestInc.d) biggestInc = {id, d};
      if(!biggestDec || d < biggestDec.d) biggestDec = {id, d};
    });

    const body = container.querySelector('#cmpBody');
    if(!expA.length && !expB.length){
      body.innerHTML = `<div class="card empty-state"><div class="es-sub">No data for either month yet.</div></div>`;
      return;
    }

    body.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-label">${U.monthLabel(keyA)}</div>
          <div class="stat-value">${U.fmtMoney(totalA)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${U.monthLabel(keyB)}</div>
          <div class="stat-value">${U.fmtMoney(totalB)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Difference</div>
          <div class="stat-value ${diff>=0?'':''}" style="color:${diff>0?'var(--danger)':diff<0?'var(--success)':'inherit'}">${diff===0?'—':(diff>0?'+':'')+U.fmtMoney(diff)}</div>
          <div class="stat-sub">${diff===0?'No change':(pct>=0?'+':'')+pct+'%'}</div>
        </div>
      </div>

      ${biggestInc && biggestInc.d > 0 ? `<div class="insight-item neg"><span class="ic">↑</span><span>Biggest increase: <b>${U.escapeHtml(st.categoryName(biggestInc.id))}</b> +${U.fmtMoney(biggestInc.d)}</span></div>` : ''}
      ${biggestDec && biggestDec.d < 0 ? `<div class="insight-item pos"><span class="ic">↓</span><span>Biggest reduction: <b>${U.escapeHtml(st.categoryName(biggestDec.id))}</b> ${U.fmtMoney(biggestDec.d)}</span></div>` : ''}

      <div class="card" style="margin-top:16px;">
        <div class="card-title">Category-by-category</div>
        <div class="chart-box" id="cmpChartWrap"><canvas id="cmpChart"></canvas></div>
      </div>

      <div class="card responsive-table" style="margin-top:16px;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>${U.monthLabel(keyA)}</th><th>${U.monthLabel(keyB)}</th><th>Change</th></tr></thead>
            <tbody>
              ${allCatIds.map(id=>{
                const a = catA[id]||0, b = catB[id]||0, d = b-a;
                return `<tr>
                  <td data-label="Category"><span class="dot" style="background:${st.categoryColor(id)}"></span> ${U.escapeHtml(st.categoryName(id))}</td>
                  <td data-label="${U.escapeHtml(U.monthLabel(keyA))}">${U.fmtMoney(a)}</td>
                  <td data-label="${U.escapeHtml(U.monthLabel(keyB))}">${U.fmtMoney(b)}</td>
                  <td data-label="Change" style="color:${d>0?'var(--danger)':d<0?'var(--success)':'inherit'}; font-weight:600;">${d===0?'—':(d>0?'+':'')+U.fmtMoney(d)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Charts.bar('cmpChart', allCatIds.map(id=>st.categoryName(id)), [
      { label: U.monthLabel(keyA), data: allCatIds.map(id=>catA[id]||0), backgroundColor:'#c7cbe8', borderRadius:4 },
      { label: U.monthLabel(keyB), data: allCatIds.map(id=>catB[id]||0), backgroundColor:'#4f5bd5', borderRadius:4 }
    ]);
  }

  return { render, title:'Compare' };
})();
