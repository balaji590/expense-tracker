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
    data.expenses.push(exp);
    persist('expenses');
    notify();
    return exp;
  }
  function updateExpense(id, patch){
    const e = data.expenses.find(x=>x.id===id);
    if(!e) return;
    Object.assign(e, patch);
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
    setSetting, replaceAll, clearAll
  };
})();
