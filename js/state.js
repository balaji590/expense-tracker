window.State = (function(){
  const S = window.Storage;
  let data = {
    expenses: [],
    categories: [],
    budgets: {overall:null, categoryBudgets:{}},
    recurring: [],
    settings: {theme:'light', currency:'INR'},
    // Phase 1 (shared-expenses foundation) — loaded for future phases; no page reads these yet.
    users: [],
    groups: [],
    groupMembers: []
  };
  const listeners = [];

  function load(){
    data.expenses = S.read(S.KEYS.expenses, []);
    data.categories = S.read(S.KEYS.categories, S.DEFAULT_CATEGORIES);
    data.budgets = S.read(S.KEYS.budgets, {overall:null, categoryBudgets:{}});
    data.recurring = S.read(S.KEYS.recurring, []);
    data.settings = S.read(S.KEYS.settings, {theme:'light', currency:'INR'});
    data.users = S.read(S.KEYS.users, []);
    data.groups = S.read(S.KEYS.groups, []);
    data.groupMembers = S.read(S.KEYS.groupMembers, []);
  }

  function persist(key){
    S.write(S.KEYS[key], data[key]);
  }

  function onChange(fn){ listeners.push(fn); }
  function notify(){ listeners.forEach(fn => fn()); }

  // ---- Expenses ----
  function addExpense(exp){
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
    persist('expenses');
    notify();
    return exp;
  }
  function updateExpense(id, patch){
    const e = data.expenses.find(x=>x.id===id);
    if(!e) return;
    Object.assign(e, patch);
    e.updatedAt = new Date().toISOString();
    persist('expenses');
    notify();
  }
  function deleteExpense(id){
    data.expenses = data.expenses.filter(e=>e.id!==id);
    persist('expenses');
    notify();
  }
  function clearDemoData(){
    data.expenses = data.expenses.filter(e=>!e.isDemo);
    persist('expenses');
    notify();
  }

  // ---- Categories ----
  function addCategory(cat){
    cat.id = Utils.uid('cat');
    data.categories.push(cat);
    persist('categories');
    notify();
    return cat;
  }
  function updateCategory(id, patch){
    const c = data.categories.find(x=>x.id===id);
    if(!c) return;
    Object.assign(c, patch);
    persist('categories');
    notify();
  }
  function deleteCategory(id, reassignToId){
    data.expenses.forEach(e=>{ if(e.category===id) e.category = reassignToId; });
    data.categories = data.categories.filter(c=>c.id!==id);
    if(data.budgets.categoryBudgets[id]) delete data.budgets.categoryBudgets[id];
    persist('expenses'); persist('categories'); persist('budgets');
    notify();
  }
  function categoryById(id){ return data.categories.find(c=>c.id===id); }
  function categoryName(id){ const c = categoryById(id); return c ? c.name : 'Uncategorized'; }
  function categoryColor(id){ const c = categoryById(id); return c ? c.color : '#8b8f97'; }

  // ---- Budgets ----
  function setOverallBudget(amount){
    data.budgets.overall = amount;
    persist('budgets'); notify();
  }
  function setCategoryBudget(catId, amount){
    if(amount === null || amount === '' || isNaN(amount)){
      delete data.budgets.categoryBudgets[catId];
    } else {
      data.budgets.categoryBudgets[catId] = amount;
    }
    persist('budgets'); notify();
  }

  // ---- Recurring ----
  function addRecurring(item){
    item.id = Utils.uid('rec');
    data.recurring.push(item);
    persist('recurring'); notify();
  }
  function deleteRecurring(id){
    data.recurring = data.recurring.filter(r=>r.id!==id);
    persist('recurring'); notify();
  }
  function updateRecurring(id, patch){
    const r = data.recurring.find(x=>x.id===id);
    if(!r) return;
    Object.assign(r, patch);
    persist('recurring'); notify();
  }

  // ---- Settings ----
  function setSetting(key, val){
    data.settings[key] = val;
    persist('settings'); notify();
  }

  // ---- Groups & members (Phase 2) ----
  // Follows the same shape/conventions as the Categories CRUD above.
  function activeGroupId(){
    return data.settings.activeGroupId || S.PERSONAL_GROUP_ID;
  }
  function setActiveGroup(groupId){
    setSetting('activeGroupId', groupId);
  }
  function addGroup(name){
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
    persist('groups'); persist('groupMembers');
    notify();
    return group;
  }
  function renameGroup(id, name){
    if(id === S.PERSONAL_GROUP_ID) return; // the Personal group is not user-editable
    const g = data.groups.find(x=>x.id===id);
    if(!g) return;
    g.name = name;
    persist('groups');
    notify();
  }
  function deleteGroup(id){
    if(id === S.PERSONAL_GROUP_ID) return; // never delete the implicit Personal group
    data.groups = data.groups.filter(g=>g.id!==id);
    data.groupMembers = data.groupMembers.filter(m=>m.groupId!==id);
    if(activeGroupId() === id){
      data.settings.activeGroupId = S.PERSONAL_GROUP_ID;
      persist('settings');
    }
    persist('groups'); persist('groupMembers');
    notify();
  }
  function addGroupMember(groupId, displayName){
    const group = data.groups.find(g=>g.id===groupId);
    if(!group) return;
    const user = { id: Utils.uid('user'), displayName: displayName, createdAt: new Date().toISOString() };
    data.users.push(user);
    const member = { id: Utils.uid('member'), groupId, userId: user.id, role: 'member', joinedAt: new Date().toISOString() };
    data.groupMembers.push(member);
    group.memberIds.push(user.id);
    persist('users'); persist('groupMembers'); persist('groups');
    notify();
    return member;
  }
  function removeGroupMember(memberId){
    const member = data.groupMembers.find(m=>m.id===memberId);
    if(!member || member.role === 'owner') return; // owner can't be removed via this action
    data.groupMembers = data.groupMembers.filter(m=>m.id!==memberId);
    const group = data.groups.find(g=>g.id===member.groupId);
    if(group) group.memberIds = group.memberIds.filter(uid=>uid!==member.userId);
    persist('groupMembers'); persist('groups');
    notify();
  }
  function groupById(id){ return data.groups.find(g=>g.id===id); }
  function userById(id){ return data.users.find(u=>u.id===id); }
  function userName(id){ const u = userById(id); return u ? u.displayName : 'Unknown'; }
  function membersForGroup(groupId){ return data.groupMembers.filter(m=>m.groupId===groupId); }

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
  function replaceAll(newData){
    data.expenses = newData.expenses || [];
    data.categories = newData.categories || S.DEFAULT_CATEGORIES;
    data.budgets = newData.budgets || {overall:null, categoryBudgets:{}};
    data.recurring = newData.recurring || [];
    persist('expenses'); persist('categories'); persist('budgets'); persist('recurring');
    notify();
  }
  function clearAll(){
    data.expenses = [];
    data.categories = JSON.parse(JSON.stringify(S.DEFAULT_CATEGORIES));
    data.budgets = {overall:null, categoryBudgets:{}};
    data.recurring = [];
    persist('expenses'); persist('categories'); persist('budgets'); persist('recurring');
    notify();
  }

  load();

  return {
    data, load, onChange, notify,
    addExpense, updateExpense, deleteExpense, clearDemoData,
    addCategory, updateCategory, deleteCategory, categoryById, categoryName, categoryColor,
    setOverallBudget, setCategoryBudget,
    addRecurring, deleteRecurring, updateRecurring,
    setSetting, replaceAll, clearAll,
    activeGroupId, setActiveGroup, addGroup, renameGroup, deleteGroup,
    addGroupMember, removeGroupMember, groupById, userById, userName, membersForGroup,
    getExpensesForGroup, getExpensesForMonth
  };
})();
