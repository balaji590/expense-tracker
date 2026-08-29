window.Pages = window.Pages || {};
window.Pages.settleUp = (function(){
  const U = Utils;
  const AVATAR_PALETTE = ['#4a90d9','#4f9d69','#d4568f','#c99a2e','#8b6fd6','#3fb0a8','#e0704a','#5d7fd6','#a15fc7','#3ba3c9'];

  function avatarColor(id){
    let hash = 0;
    for(let i=0;i<id.length;i++) hash = (hash*31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  }
  function initial(name){ return (name||'?').trim().charAt(0).toUpperCase() || '?'; }
  function memberDisplayName(m){
    return m.displayName + (m.removed ? ' (removed)' : '');
  }

  function render(container){
    const st = State;
    const groupId = st.activeGroupId();
    const group = st.groupById(groupId);
    const isPersonal = groupId === Storage.PERSONAL_GROUP_ID;

    if(isPersonal){
      container.innerHTML = `
        <div class="section-head"><h2>Settle up</h2></div>
        <div class="card empty-state">
          <div class="es-title">Nothing to settle</div>
          <div class="es-sub">Settle Up is for shared groups. Personal mode has no one to split expenses with.</div>
        </div>
      `;
      return;
    }

    // Include removed members too — someone who left the group may still
    // have an outstanding balance that needs settling.
    const members = st.membersForBalances(groupId);
    const expenses = st.getExpensesForGroup(groupId);
    const settlements = st.getSettlementsForGroup(groupId);
    const balances = Balances.balancesForGroup(members, expenses, settlements);
    const hasAnyMoney = balances.some(b => b.balancePaise !== 0) || balances.some(b=>b.paid>0 || b.owed>0);

    container.innerHTML = `
      <div class="section-head">
        <h2>Settle up ${group ? `<span class="badge" style="background:var(--accent-2); color:var(--accent); margin-left:6px;">${U.escapeHtml(group.name)}</span>` : ''}</h2>
        <button class="btn btn-primary" id="recordSettlementBtn">+ Record settlement</button>
      </div>

      ${!hasAnyMoney ? `
        <div class="card empty-state">
          <div class="es-title">Nothing to settle yet</div>
          <div class="es-sub">Add a shared expense with a split to start tracking balances here.</div>
        </div>
      ` : `
        <div class="section">
          <div class="card-title" style="margin-bottom:12px;">Balances</div>
          <div id="balanceRows"></div>
        </div>

        <div class="section">
          <div class="card-title" style="margin-bottom:12px;">Who owes whom</div>
          <div id="owesRows"></div>
        </div>

        <div class="section">
          <div class="card responsive-table">
            <div class="card-title" style="margin-bottom:12px;">Settlement history</div>
            <div id="settlementHistory"></div>
          </div>
        </div>
      `}
    `;

    document.getElementById('recordSettlementBtn').onclick = ()=> openSettlementModal(groupId, members, balances);

    if(hasAnyMoney){
      renderBalanceRows(container, members, balances);
      renderOwesRows(container, groupId, members, balances);
      renderSettlementHistory(container, members, settlements);
    }
  }

  function balancePhrase(st, b){
    const isYou = b.userId === Storage.PERSONAL_USER_ID;
    const name = isYou ? 'You' : U.escapeHtml(b.displayName);
    if(b.balancePaise === 0){
      return isYou ? `You're settled` : `${name} is settled`;
    }
    if(b.balancePaise > 0){
      return isYou ? `You'll receive ${U.fmtMoney(b.balance)}` : `${name} is owed ${U.fmtMoney(b.balance)}`;
    }
    return isYou ? `You owe ${U.fmtMoney(Math.abs(b.balance))}` : `${name} owes ${U.fmtMoney(Math.abs(b.balance))}`;
  }

  function renderBalanceRows(container, members, balances){
    const st = State;
    const el = container.querySelector('#balanceRows');
    el.innerHTML = `<div class="card">` + balances.map(b=>{
      const level = b.balancePaise > 0 ? 'pos' : b.balancePaise < 0 ? 'neg' : '';
      return `
        <div class="save-row">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="cat-avatar" style="background:${avatarColor(b.userId)}">${initial(b.displayName)}</span>
            <div>
              <div style="font-weight:600; font-size:13.5px;">${U.escapeHtml(b.displayName)}${b.removed?' <span class="badge" style="background:var(--surface-2); color:var(--text-3);">removed</span>':''}</div>
              <div class="stat-sub">Paid ${U.fmtMoney(b.paid)} · Share ${U.fmtMoney(b.owed)}</div>
            </div>
          </div>
          <div class="insight-item ${level}" style="margin:0; padding:6px 12px; white-space:nowrap;">${balancePhrase(st, b)}</div>
        </div>
      `;
    }).join('') + `</div>`;
  }

  function renderOwesRows(container, groupId, members, balances){
    const el = container.querySelector('#owesRows');
    const transfers = Balances.whoOwesWhom(balances);
    if(!transfers.length){
      el.innerHTML = `<div class="card empty-state" style="padding:24px 10px;"><div class="es-sub">Everyone is settled up.</div></div>`;
      return;
    }
    el.innerHTML = `<div class="card">` + transfers.map((t,i)=>`
      <div class="save-row">
        <div style="font-size:13.5px;"><b>${U.escapeHtml(t.fromName)}</b> owes <b>${U.escapeHtml(t.toName)}</b></div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-weight:700;">${U.fmtMoney(t.amount)}</span>
          <button class="btn btn-sm btn-primary" data-record-transfer="${i}">Record settlement</button>
        </div>
      </div>
    `).join('') + `</div>`;

    transfers.forEach((t,i)=>{
      container.querySelector(`[data-record-transfer="${i}"]`).onclick = ()=>{
        openSettlementModal(groupId, members, balances, { fromUserId: t.fromUserId, toUserId: t.toUserId, amount: t.amount });
      };
    });
  }

  function renderSettlementHistory(container, members, settlements){
    const st = State;
    const el = container.querySelector('#settlementHistory');
    if(!settlements.length){
      el.innerHTML = `<div class="stat-sub">No settlements recorded yet.</div>`;
      return;
    }
    const sorted = [...settlements].sort((a,b)=> new Date(b.date) - new Date(a.date));
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Note</th></tr></thead>
          <tbody>
            ${sorted.map(s=>`
              <tr>
                <td data-label="Date">${U.fmtDateShort(s.date)}</td>
                <td data-label="From">${U.escapeHtml(st.userName(s.fromUserId))}</td>
                <td data-label="To">${U.escapeHtml(st.userName(s.toUserId))}</td>
                <td data-label="Amount" style="font-weight:700;">${U.fmtMoney(s.amount)}</td>
                <td data-label="Note">${U.escapeHtml(s.note||'—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function openSettlementModal(groupId, members, balances, prefill){
    const st = State;
    prefill = prefill || {};
    Modal.open(`
      <div class="modal-title">Record settlement</div>
      <div class="field-row">
        <div class="field">
          <label>Paid by</label>
          <select id="settleFrom">
            ${members.map(m=>`<option value="${m.userId}" ${prefill.fromUserId===m.userId?'selected':''}>${U.escapeHtml(memberDisplayName(m))}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Received by</label>
          <select id="settleTo">
            ${members.map(m=>`<option value="${m.userId}" ${prefill.toUserId===m.userId?'selected':''}>${U.escapeHtml(memberDisplayName(m))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Amount (₹)</label>
          <input type="number" id="settleAmount" min="0" step="0.01" value="${prefill.amount||''}" placeholder="0.00">
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="settleDate" value="${U.todayISODate()}">
        </div>
      </div>
      <div class="field">
        <label>Note (optional)</label>
        <input type="text" id="settleNote" placeholder="e.g. Paid via UPI">
      </div>
      <div class="field-error" id="errSettle">Enter a valid settlement.</div>
      <div class="modal-actions">
        <button class="btn" id="settleCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="settleSaveBtn">Record settlement</button>
      </div>
    `);
    document.getElementById('settleCancelBtn').onclick = Modal.close;
    document.getElementById('settleSaveBtn').onclick = ()=>{
      const fromUserId = document.getElementById('settleFrom').value;
      const toUserId = document.getElementById('settleTo').value;
      const amount = parseFloat(document.getElementById('settleAmount').value);
      const date = document.getElementById('settleDate').value;
      const note = document.getElementById('settleNote').value.trim();

      // Re-derive fresh balances at save time (never trust the snapshot the
      // modal opened with — nothing else should have changed mid-modal, but
      // this keeps validation honest regardless).
      const freshExpenses = st.getExpensesForGroup(groupId);
      const freshSettlements = st.getSettlementsForGroup(groupId);
      const freshBalances = Balances.balancesForGroup(members, freshExpenses, freshSettlements);

      const result = Balances.validateSettlement({fromUserId, toUserId, amount}, freshBalances);
      const errEl = document.getElementById('errSettle');
      if(!result.valid){
        errEl.textContent = result.error;
        errEl.classList.add('show');
        return;
      }
      if(!date){
        errEl.textContent = 'Pick a valid date.';
        errEl.classList.add('show');
        return;
      }
      errEl.classList.remove('show');

      st.addSettlement({
        groupId, fromUserId, toUserId, amount,
        date: new Date(date).toISOString(), note
      });
      Toast.show('Settlement recorded');
      Modal.close();
    };
  }

  return { render, title: 'Settle Up' };
})();
