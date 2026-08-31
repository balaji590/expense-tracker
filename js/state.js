window.State = (function(){
  const S = window.Storage;
  // The ONLY place the active data-access implementation is chosen. Reads
  // AppConfig once at module load — nothing else in State or any page
  // branches on mode. Defaults to LocalRepository whenever AppConfig isn't
  // explicitly set to 'api' (see js/config.js: 'local' is always the
  // fallback, so this application is never silently affected by API mode).
  const repository = (window.AppConfig && window.AppConfig.repositoryMode() === 'api')
    ? window.ApiRepository
    : window.LocalRepository;

  let data = {
    expenses: [],
    categories: [],
    budgets: {overall:null, categoryBudgets:{}},
    recurring: [],
    settings: {theme:'light', currency:'INR'},
    // Phase 1 (shared-expenses foundation) — loaded for future phases; no page reads these yet.
    users: [],
    groups: [],
    groupMembers: [],
    settlements: []
  };
  const listeners = [];

  // Genuinely async: in a future API-backed world this is a real network
  // fetch. Callers (only main.js today) must await this before relying on
  // `data` being populated.
  async function load(){
    await repository.init();
    data.expenses = await repository.getAll(S.KEYS.expenses, []);
    data.categories = await repository.getAll(S.KEYS.categories, S.DEFAULT_CATEGORIES);
    data.budgets = await repository.getAll(S.KEYS.budgets, {overall:null, categoryBudgets:{}});
    data.recurring = await repository.getAll(S.KEYS.recurring, []);
    data.settings = await repository.getAll(S.KEYS.settings, {theme:'light', currency:'INR'});
    data.users = await repository.getAll(S.KEYS.users, []);
    data.groups = await repository.getAll(S.KEYS.groups, []);
    data.groupMembers = await repository.getAll(S.KEYS.groupMembers, []);
    data.settlements = await repository.getAll(S.KEYS.settlements, []);
  }

  async function persist(key){
    await repository.save(S.KEYS[key], data[key]);
  }

  function onChange(fn){ listeners.push(fn); }
  function notify(){ listeners.forEach(fn => fn()); }

  // ---- Expenses ----
  // Every mutation method below is `async` because persistence now goes
  // through the (Promise-based) repository — but every method performs its
  // actual `data` mutation BEFORE the first `await`, exactly like before.
  // That's what makes this conversion invisible to every existing call
  // site: none of them capture a return value (confirmed by inspection),
  // and JS runs an async function's body synchronously up to its first
  // `await` regardless of whether the caller awaits the call — so any code
  // that reads `State.data.*` immediately after calling one of these
  // (without awaiting) still sees the fully-updated data, exactly as before.
  async function addExpense(exp){
    exp.id = Utils.uid('exp');
    if(!exp.tags) exp.tags = [];
    // Phase 1 defaults: every expense always has these fields, whether it was
    // backfilled by migration or created just now — same personal-mode values
    // (S.PERSONAL_GROUP_ID/PERSONAL_USER_ID) until group UI exists to set them.
    if(exp.groupId === undefined) exp.groupId = S.PERSONAL_GROUP_ID;
    if(exp.addedBy === undefined) exp.addedBy = S.PERSONAL_USER_ID;
    if(exp.paidBy === undefined) exp.paidBy = S.PERSONAL_USER_ID;
    if(exp.splitType === undefined) exp.splitType = 'none';
    if(exp.splits === undefined) exp.splits = [];
    exp.createdAt = new Date().toISOString();
    data.expenses.push(exp);
    // addItem (not persist/save) — see repository.js for why expenses use
    // the item-level contract. LocalRepository returns null here (nothing
    // authoritative to add), so this Object.assign is a no-op in local
    // mode; ApiRepository returns the server's authoritative id/groupId/
    // addedBy/paidBy/splitType/createdAt/updatedAt, which overwrite this
    // same object (already sitting in data.expenses) in place.
    const authoritative = await repository.addItem(S.KEYS.expenses, exp);
    if(authoritative) Object.assign(exp, authoritative);
    notify();
    return exp;
  }
  async function updateExpense(id, patch){
    const e = data.expenses.find(x=>x.id===id);
    if(!e) return;
    Object.assign(e, patch);
    e.updatedAt = new Date().toISOString();
    const authoritative = await repository.updateItem(S.KEYS.expenses, id, patch);
    if(authoritative) Object.assign(e, authoritative);
    notify();
  }
  async function deleteExpense(id){
    data.expenses = data.expenses.filter(e=>e.id!==id);
    await repository.removeItem(S.KEYS.expenses, id);
    notify();
  }
  async function clearDemoData(){
    data.expenses = data.expenses.filter(e=>!e.isDemo);
    await persist('expenses');
    notify();
  }

  // ---- Categories ----
  async function addCategory(cat){
    cat.id = Utils.uid('cat');
    data.categories.push(cat);
    await persist('categories');
    notify();
    return cat;
  }
  async function updateCategory(id, patch){
    const c = data.categories.find(x=>x.id===id);
    if(!c) return;
    Object.assign(c, patch);
    await persist('categories');
    notify();
  }
  async function deleteCategory(id, reassignToId){
    data.expenses.forEach(e=>{ if(e.category===id) e.category = reassignToId; });
    data.categories = data.categories.filter(c=>c.id!==id);
    if(data.budgets.categoryBudgets[id]) delete data.budgets.categoryBudgets[id];
    await persist('expenses'); await persist('categories'); await persist('budgets');
    notify();
  }
  function categoryById(id){ return data.categories.find(c=>c.id===id); }
  function categoryName(id){ const c = categoryById(id); return c ? c.name : 'Uncategorized'; }
  function categoryColor(id){ const c = categoryById(id); return c ? c.color : '#8b8f97'; }

  // ---- Budgets ----
  async function setOverallBudget(amount){
    data.budgets.overall = amount;
    await persist('budgets'); notify();
  }
  async function setCategoryBudget(catId, amount){
    if(amount === null || amount === '' || isNaN(amount)){
      delete data.budgets.categoryBudgets[catId];
    } else {
      data.budgets.categoryBudgets[catId] = amount;
    }
    await persist('budgets'); notify();
  }

  // ---- Recurring ----
  async function addRecurring(item){
    item.id = Utils.uid('rec');
    data.recurring.push(item);
    await persist('recurring'); notify();
  }
  async function deleteRecurring(id){
    data.recurring = data.recurring.filter(r=>r.id!==id);
    await persist('recurring'); notify();
  }
  async function updateRecurring(id, patch){
    const r = data.recurring.find(x=>x.id===id);
    if(!r) return;
    Object.assign(r, patch);
    await persist('recurring'); notify();
  }

  // ---- Settings ----
  async function setSetting(key, val){
    data.settings[key] = val;
    await persist('settings'); notify();
  }

  // ---- Groups & members (Phase 2) ----
  // Follows the same shape/conventions as the Categories CRUD above.
  function activeGroupId(){
    return data.settings.activeGroupId || S.PERSONAL_GROUP_ID;
  }
  async function setActiveGroup(groupId){
    await setSetting('activeGroupId', groupId);
  }
  async function addGroup(name){
    const group = {
      id: Utils.uid('group'),
      name: name,
      type: 'shared',
      memberIds: [S.PERSONAL_USER_ID],
      createdBy: S.PERSONAL_USER_ID,
      createdAt: new Date().toISOString()
    };
    data.groups.push(group);
    const member = {
      id: Utils.uid('member'),
      groupId: group.id,
      userId: S.PERSONAL_USER_ID,
      role: 'owner',
      joinedAt: new Date().toISOString()
    };
    data.groupMembers.push(member);
    await persist('groups'); await persist('groupMembers');
    notify();
    return group;
  }
  async function renameGroup(id, name){
    if(id === S.PERSONAL_GROUP_ID) return; // the Personal group is not user-editable
    const g = data.groups.find(x=>x.id===id);
    if(!g) return;
    g.name = name;
    await persist('groups');
    notify();
  }
  async function deleteGroup(id){
    if(id === S.PERSONAL_GROUP_ID) return; // never delete the implicit Personal group
    data.groups = data.groups.filter(g=>g.id!==id);
    data.groupMembers = data.groupMembers.filter(m=>m.groupId!==id);
    data.settlements = data.settlements.filter(s=>s.groupId!==id);
    if(activeGroupId() === id){
      data.settings.activeGroupId = S.PERSONAL_GROUP_ID;
      await persist('settings');
    }
    await persist('groups'); await persist('groupMembers'); await persist('settlements');
    notify();
  }
  async function addGroupMember(groupId, displayName){
    const group = data.groups.find(g=>g.id===groupId);
    if(!group) return;
    const user = { id: Utils.uid('user'), displayName: displayName, createdAt: new Date().toISOString() };
    data.users.push(user);
    const member = { id: Utils.uid('member'), groupId, userId: user.id, role: 'member', joinedAt: new Date().toISOString() };
    data.groupMembers.push(member);
    group.memberIds.push(user.id);
    await persist('users'); await persist('groupMembers'); await persist('groups');
    notify();
    return member;
  }
  // Phase 4: soft-delete. The GroupMember row is kept forever (with removedAt
  // set) so historical paidBy/split references for this member can always be
  // resolved. Existing records without removedAt are implicitly active.
  async function removeGroupMember(memberId){
    const member = data.groupMembers.find(m=>m.id===memberId);
    if(!member || member.role === 'owner') return; // owner can't be removed via this action
    member.removedAt = new Date().toISOString();
    const group = data.groups.find(g=>g.id===member.groupId);
    if(group) group.memberIds = group.memberIds.filter(uid=>uid!==member.userId);
    await persist('groupMembers'); await persist('groups');
    notify();
  }
  function groupById(id){ return data.groups.find(g=>g.id===id); }
  function userById(id){ return data.users.find(u=>u.id===id); }
  function userName(id){ const u = userById(id); return u ? u.displayName : 'Unknown'; }
  // Active members only — used everywhere a NEW selection is being made
  // (Paid By / Split checkboxes on the Add/Edit expense form, the Groups
  // page's member list). Pass includeRemoved:true for anything that needs to
  // resolve or display historical data (balances, an expense already
  // referencing a removed member).
  function membersForGroup(groupId, opts){
    const all = data.groupMembers.filter(m=>m.groupId===groupId);
    if(opts && opts.includeRemoved) return all;
    return all.filter(m=>!m.removedAt);
  }
  // Phase 4: members shaped for Balances.balancesForGroup — resolves displayName
  // so callers never have to do that mapping themselves. Always includes removed
  // members, since balances must be able to show/settle them.
  function membersForBalances(groupId){
    return membersForGroup(groupId, {includeRemoved:true}).map(m => ({
      id: m.id, userId: m.userId, displayName: userName(m.userId), removed: !!m.removedAt
    }));
  }

  // ---- Settlements (Phase 4) ----
  async function addSettlement(settlement){
    settlement.id = Utils.uid('settle');
    settlement.createdAt = new Date().toISOString();
    data.settlements.push(settlement);
    await persist('settlements');
    notify();
    return settlement;
  }
  function getSettlementsForGroup(groupId){
    return data.settlements.filter(s=>s.groupId===groupId);
  }

  // Phase 3: the single, centralized place every page reads group-scoped expenses
  // from — so "an expense in Family never appears in Personal" is enforced once,
  // here, rather than re-implemented (and possibly gotten wrong) per page.
  function getExpensesForGroup(groupId){
    return data.expenses.filter(e => (e.groupId || S.PERSONAL_GROUP_ID) === groupId);
  }
  function getExpensesForMonth(groupId, monthKey){
    return Calc.expensesForMonth(getExpensesForGroup(groupId), monthKey);
  }

  // ---- Bulk (import/export/clear) ----
  async function replaceAll(newData){
    data.expenses = newData.expenses || [];
    data.categories = newData.categories || S.DEFAULT_CATEGORIES;
    data.budgets = newData.budgets || {overall:null, categoryBudgets:{}};
    data.recurring = newData.recurring || [];
    await persist('expenses'); await persist('categories'); await persist('budgets'); await persist('recurring');
    notify();
  }
  async function clearAll(){
    data.expenses = [];
    data.categories = JSON.parse(JSON.stringify(S.DEFAULT_CATEGORIES));
    data.budgets = {overall:null, categoryBudgets:{}};
    data.recurring = [];
    await persist('expenses'); await persist('categories'); await persist('budgets'); await persist('recurring');
    notify();
  }

  return {
    data, load, onChange, notify,
    addExpense, updateExpense, deleteExpense, clearDemoData,
    addCategory, updateCategory, deleteCategory, categoryById, categoryName, categoryColor,
    setOverallBudget, setCategoryBudget,
    addRecurring, deleteRecurring, updateRecurring,
    setSetting, replaceAll, clearAll,
    activeGroupId, setActiveGroup, addGroup, renameGroup, deleteGroup,
    addGroupMember, removeGroupMember, groupById, userById, userName, membersForGroup, membersForBalances,
    getExpensesForGroup, getExpensesForMonth,
    addSettlement, getSettlementsForGroup
  };
})();
