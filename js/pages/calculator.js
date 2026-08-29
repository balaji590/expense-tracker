window.Pages = window.Pages || {};
window.Pages.calculator = (function(){
  const U = Utils, C = Calc;
  let vals = { price:'', qty:'1', taxPct:'', discountAmt:'' };
  let activeField = 'price';

  function render(container){
    container.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Quick expense calculator</div>
          <div class="field-row">
            <div class="field">
              <label>Item price (₹)</label>
              <input type="number" id="calcPrice" value="${vals.price}" placeholder="0">
            </div>
            <div class="field">
              <label>Quantity</label>
              <input type="number" id="calcQty" value="${vals.qty}" min="1" placeholder="1">
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Tax (%)</label>
              <input type="number" id="calcTax" value="${vals.taxPct}" placeholder="0">
            </div>
            <div class="field">
              <label>Discount (₹)</label>
              <input type="number" id="calcDiscount" value="${vals.discountAmt}" placeholder="0">
            </div>
          </div>

          <div class="calc-display" id="calcDisplay"></div>

          <div class="keypad" id="keypad">
            ${['7','8','9','C','4','5','6','⌫','1','2','3','.','0','00','+','='].map(k=>{
              const isOp = ['C','⌫','+','='].includes(k);
              return `<button class="${isOp?'op':''}" data-key="${k}">${k}</button>`;
            }).join('')}
          </div>

          <div style="display:flex; gap:10px; margin-top:14px;">
            <button class="btn btn-block" id="calcClearAll">Clear all</button>
            <button class="btn btn-primary btn-block" id="calcAddToExpense">Add to Expenses</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">How it works</div>
          <div class="insight-item"><span class="ic">•</span><span>Enter the item price and quantity — subtotal is price × quantity.</span></div>
          <div class="insight-item"><span class="ic">•</span><span>Discount is subtracted before tax is applied.</span></div>
          <div class="insight-item"><span class="ic">•</span><span>Tax is applied on the amount after discount.</span></div>
          <div class="insight-item"><span class="ic">•</span><span>Use the keypad to type directly into the active field, or type in the boxes above.</span></div>
          <div class="insight-item"><span class="ic">•</span><span>When the total looks right, hit "Add to Expenses" to log it straight away.</span></div>
        </div>
      </div>
    `;

    bind(container);
    updateDisplay();
  }

  function bind(container){
    const priceEl = container.querySelector('#calcPrice');
    const qtyEl = container.querySelector('#calcQty');
    const taxEl = container.querySelector('#calcTax');
    const discEl = container.querySelector('#calcDiscount');

    [['price',priceEl],['qty',qtyEl],['taxPct',taxEl],['discountAmt',discEl]].forEach(([key,el])=>{
      el.addEventListener('focus', ()=> activeField = key);
      el.addEventListener('input', ()=>{ vals[key]=el.value; updateDisplay(); });
    });

    container.querySelector('#keypad').addEventListener('click', (e)=>{
      const btn = e.target.closest('button');
      if(!btn) return;
      const key = btn.getAttribute('data-key');
      handleKey(key, container);
    });

    container.querySelector('#calcClearAll').onclick = ()=>{
      vals = { price:'', qty:'1', taxPct:'', discountAmt:'' };
      render(container);
    };

    container.querySelector('#calcAddToExpense').onclick = ()=>{
      const result = C.calcFinal(vals);
      Pages.expenses.openAddModal({ amount: Math.round(result.final*100)/100, name:'Calculated expense' });
    };
  }

  function handleKey(key, container){
    let field = activeField;
    let cur = String(vals[field] ?? '');
    if(key === 'C'){ vals[field] = ''; }
    else if(key === '⌫'){ vals[field] = cur.slice(0,-1); }
    else if(key === '='){ /* no-op, live calc already shown */ }
    else if(key === '+'){ /* reserved for future multi-item; currently no-op */ }
    else if(key === '.'){ if(!cur.includes('.')) vals[field] = cur + '.'; }
    else { vals[field] = cur + key; }

    const map = { price:'#calcPrice', qty:'#calcQty', taxPct:'#calcTax', discountAmt:'#calcDiscount' };
    const input = container.querySelector(map[field]);
    if(input) input.value = vals[field];
    updateDisplay(container);
  }

  function updateDisplay(container){
    container = container || document.getElementById('mainContent');
    const disp = container.querySelector('#calcDisplay');
    if(!disp) return;
    const r = C.calcFinal(vals);
    disp.innerHTML = `
      <div class="breakdown">Subtotal ${Utils.fmtMoney(r.subtotal)} &nbsp;−&nbsp; Discount ${Utils.fmtMoney(vals.discountAmt||0)} &nbsp;+&nbsp; Tax ${Utils.fmtMoney(r.tax)}</div>
      <div class="final">${Utils.fmtMoney(r.final)}</div>
    `;
  }

  return { render, title:'Calculator' };
})();
