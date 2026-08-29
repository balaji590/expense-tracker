/* Balances: pure, always-live calculation of who paid/owes/is-settled within a
   group. Never stored — every value here is recomputed from expenses +
   settlements at read time, so editing or deleting an expense is automatically
   reflected with no invalidation logic needed anywhere.

   Kept as its own module (not folded into calculations.js) so personal-mode
   users never load balance logic they'll never exercise, and so this file has
   exactly one job: money owed between people. */
window.Balances = (function(){

  function toPaise(amount){ return Math.round(Number(amount||0) * 100); }
  function toRupees(paise){ return paise / 100; }

  // Only expenses that are actually shared participate in balance math.
  // splitType 'none' is a personal-style entry recorded inside a shared
  // group's ledger — it must never be treated as a shared cost.
  function sharedExpenses(expenses){
    return (expenses||[]).filter(e => e.splitType === 'equal' || e.splitType === 'custom');
  }

  function paidPaiseByUser(expenses, userId){
    return sharedExpenses(expenses)
      .filter(e => e.paidBy === userId)
      .reduce((sum, e) => sum + toPaise(e.amount), 0);
  }

  function owedPaiseByMember(expenses, memberId){
    let sum = 0;
    sharedExpenses(expenses).forEach(e=>{
      (e.splits||[]).forEach(s=>{
        if(s.memberId === memberId) sum += toPaise(s.amount);
      });
    });
    return sum;
  }

  // Positive = net amount this user has paid toward settling debts (raises
  // their balance). Negative = net amount they've received.
  function settledPaiseByUser(settlements, userId){
    let net = 0;
    (settlements||[]).forEach(s=>{
      if(s.fromUserId === userId) net += toPaise(s.amount);
      if(s.toUserId === userId) net -= toPaise(s.amount);
    });
    return net;
  }

  // members: [{id (GroupMember.id), userId, displayName, removed}], including
  // soft-removed members so their historical balance is still resolvable.
  function balancesForGroup(members, expenses, settlements){
    return (members||[]).map(m=>{
      const paidPaise = paidPaiseByUser(expenses, m.userId);
      const owedPaise = owedPaiseByMember(expenses, m.id);
      const settledPaise = settledPaiseByUser(settlements, m.userId);
      const balancePaise = paidPaise - owedPaise + settledPaise;
      return {
        memberId: m.id, userId: m.userId, displayName: m.displayName, removed: !!m.removed,
        paid: toRupees(paidPaise), owed: toRupees(owedPaise), settled: toRupees(settledPaise),
        balance: toRupees(balancePaise), balancePaise
      };
    });
  }

  // Greedy largest-creditor/largest-debtor matching. Deliberately not a
  // globally-optimal min-transaction solver — that's unnecessary complexity
  // for small family/roommate/trip groups. Deterministic given the same input.
  function whoOwesWhom(balances){
    const creditors = balances.filter(b=>b.balancePaise>0)
      .map(b=>({userId:b.userId, displayName:b.displayName, remaining:b.balancePaise}))
      .sort((a,b)=>b.remaining-a.remaining);
    const debtors = balances.filter(b=>b.balancePaise<0)
      .map(b=>({userId:b.userId, displayName:b.displayName, remaining:-b.balancePaise}))
      .sort((a,b)=>b.remaining-a.remaining);

    const transfers = [];
    let ci=0, di=0;
    while(ci<creditors.length && di<debtors.length){
      const c = creditors[ci], d = debtors[di];
      const amountPaise = Math.min(c.remaining, d.remaining);
      if(amountPaise > 0){
        transfers.push({
          fromUserId: d.userId, fromName: d.displayName,
          toUserId: c.userId, toName: c.displayName,
          amount: toRupees(amountPaise), amountPaise
        });
      }
      c.remaining -= amountPaise;
      d.remaining -= amountPaise;
      if(c.remaining<=0) ci++;
      if(d.remaining<=0) di++;
    }
    return transfers;
  }

  function outstandingDebtPaise(balancePaise){
    return balancePaise < 0 ? -balancePaise : 0;
  }

  // Pure validation — returns {valid, error?}. The page decides how to show it.
  // Over-settlement guard: a settlement FROM someone can never exceed what
  // they currently owe overall in this group (recomputed live, so a prior
  // partial settlement correctly shrinks the allowed amount for the next one).
  function validateSettlement({fromUserId, toUserId, amount}, balances){
    if(!fromUserId || !toUserId) return {valid:false, error:'Select both who paid and who received.'};
    if(fromUserId === toUserId) return {valid:false, error:'Paid by and received by must be different people.'};
    const fromBalance = balances.find(b=>b.userId===fromUserId);
    const toBalance = balances.find(b=>b.userId===toUserId);
    if(!fromBalance || !toBalance) return {valid:false, error:'Selected member not found in this group.'};
    const amountPaise = toPaise(amount);
    if(!(amountPaise > 0)) return {valid:false, error:'Enter an amount greater than ₹0.'};
    const maxPaise = outstandingDebtPaise(fromBalance.balancePaise);
    if(amountPaise > maxPaise){
      return {valid:false, error:`This exceeds what they currently owe (₹${toRupees(maxPaise).toLocaleString('en-IN')}).`};
    }
    return {valid:true};
  }

  return {
    toPaise, toRupees, sharedExpenses,
    balancesForGroup, whoOwesWhom, outstandingDebtPaise, validateSettlement
  };
})();
