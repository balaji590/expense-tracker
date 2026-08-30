/* Storage: all data lives in localStorage. No backend calls, ever. */
window.Storage = (function(){
  const KEYS = {
    expenses: 'et_expenses',
    categories: 'et_categories',
    budgets: 'et_budgets',
    recurring: 'et_recurring',
    settings: 'et_settings',
    // Phase 1 (shared-expenses foundation) — data-layer only, no UI reads/writes these yet.
    users: 'et_users',
    groups: 'et_groups',
    groupMembers: 'et_group_members',
    settlements: 'et_settlements',
    migrationState: 'et_migration_state',
    migrationBackup: 'et_migration_backup'
  };

  // Fixed, well-known IDs for the single implicit personal user/group/membership.
  // Using fixed IDs (rather than random uids) keeps the migration trivially idempotent:
  // "does a record with this exact ID already exist?" instead of fuzzy matching.
  const PERSONAL_USER_ID = 'user_local';
  const PERSONAL_GROUP_ID = 'group_personal';
  const PERSONAL_MEMBER_ID = 'member_local';

  const DEFAULT_CATEGORIES = [
    {id:'cat_food', name:'Food', color:'#e0704a', icon:'F'},
    {id:'cat_grocery', name:'Groceries', color:'#4f9d69', icon:'G'},
    {id:'cat_transport', name:'Transport', color:'#4a90d9', icon:'T'},
    {id:'cat_shopping', name:'Shopping', color:'#d4568f', icon:'S'},
    {id:'cat_bills', name:'Bills', color:'#c99a2e', icon:'B'},
    {id:'cat_entertainment', name:'Entertainment', color:'#8b6fd6', icon:'E'},
    {id:'cat_health', name:'Health', color:'#3fb0a8', icon:'H'},
    {id:'cat_education', name:'Education', color:'#5d7fd6', icon:'E'},
    {id:'cat_travel', name:'Travel', color:'#3ba3c9', icon:'T'},
    {id:'cat_rent', name:'Rent', color:'#a8623e', icon:'R'},
    {id:'cat_subs', name:'Subscriptions', color:'#a15fc7', icon:'S'},
    {id:'cat_other', name:'Other', color:'#8b8f97', icon:'O'}
  ];

  function daysAgoISO(n){
    const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString();
  }

  function demoExpenses(){
    return [
      {id:'demo1', name:'Grocery run', amount:1450, category:'cat_grocery', date: daysAgoISO(2), paymentMethod:'UPI', notes:'', tags:[], isDemo:true},
      {id:'demo2', name:'Movie night', amount:600, category:'cat_entertainment', date: daysAgoISO(4), paymentMethod:'Card', notes:'', tags:[], isDemo:true},
      {id:'demo3', name:'Electricity bill', amount:2100, category:'cat_bills', date: daysAgoISO(6), paymentMethod:'Bank Transfer', notes:'', tags:[], isDemo:true},
      {id:'demo4', name:'Lunch with team', amount:520, category:'cat_food', date: daysAgoISO(8), paymentMethod:'Cash', notes:'', tags:[], isDemo:true},
      {id:'demo5', name:'New shoes', amount:3200, category:'cat_shopping', date: daysAgoISO(12), paymentMethod:'Credit Card', notes:'', tags:[], isDemo:true},
      {id:'demo6', name:'Petrol', amount:1000, category:'cat_transport', date: daysAgoISO(15), paymentMethod:'UPI', notes:'', tags:[], isDemo:true},
      {id:'demo7', name:'Netflix', amount:499, category:'cat_subs', date: daysAgoISO(20), paymentMethod:'Card', notes:'', tags:[], isDemo:true},
      {id:'demo8', name:'Doctor visit', amount:800, category:'cat_health', date: daysAgoISO(35), paymentMethod:'Cash', notes:'', tags:[], isDemo:true},
      {id:'demo9', name:'Train ticket', amount:1800, category:'cat_travel', date: daysAgoISO(40), paymentMethod:'UPI', notes:'', tags:[], isDemo:true},
      {id:'demo10', name:'Grocery run', amount:1620, category:'cat_grocery', date: daysAgoISO(48), paymentMethod:'UPI', notes:'', tags:[], isDemo:true}
    ];
  }

  function read(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(raw === null) return fallback;
      return JSON.parse(raw);
    }catch(e){ return fallback; }
  }
  function write(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ return false; }
  }

  function init(){
    if(localStorage.getItem(KEYS.categories) === null){
      write(KEYS.categories, DEFAULT_CATEGORIES);
    }
    if(localStorage.getItem(KEYS.expenses) === null){
      write(KEYS.expenses, demoExpenses());
    }
    if(localStorage.getItem(KEYS.budgets) === null){
      write(KEYS.budgets, {overall: null, categoryBudgets: {}});
    }
    if(localStorage.getItem(KEYS.recurring) === null){
      write(KEYS.recurring, []);
    }
    if(localStorage.getItem(KEYS.settings) === null){
      write(KEYS.settings, {theme:'light', currency:'INR'});
    }
    // Runs last, after all existing defaults are in place, so a brand-new install's
    // seeded demo expenses get backfilled exactly like a returning user's real data.
    runPhase1Migration();
  }

  // ------------------------------------------------------------------
  // Phase 1 migration: shared-expenses data-model foundation.
  //
  // Creates exactly one hidden Personal User/Group/GroupMember, and backfills
  // every existing expense with groupId/addedBy/paidBy/splitType/splits.
  // Never touches categories/budgets/recurring/settings. Never removes or
  // overwrites any existing expense field. Safe to call on every app load —
  // every step below checks "does this already exist?" before creating
  // anything, so re-running is a no-op once migration has completed.
  // ------------------------------------------------------------------
  function runPhase1Migration(){
    try{
      const state = read(KEYS.migrationState, null);
      if(state && state.phase1Complete) return; // already migrated — nothing to do

      // Snapshot the exact pre-migration expenses array once, before any mutation,
      // so existing data is always recoverable if anything below goes wrong.
      // Only written if it doesn't already exist, so a retry after a partial
      // failure never overwrites the original snapshot with already-modified data.
      if(localStorage.getItem(KEYS.migrationBackup) === null){
        const rawExpenses = localStorage.getItem(KEYS.expenses);
        write(KEYS.migrationBackup, {
          version: 1,
          createdAt: new Date().toISOString(),
          expenses: rawExpenses === null ? null : JSON.parse(rawExpenses)
        });
      }

      // User — idempotent by fixed ID, never duplicated.
      const users = read(KEYS.users, []);
      if(!users.some(u => u.id === PERSONAL_USER_ID)){
        users.push({ id: PERSONAL_USER_ID, displayName: 'Me', createdAt: new Date().toISOString() });
        write(KEYS.users, users);
      }

      // Group — idempotent by fixed ID.
      const groups = read(KEYS.groups, []);
      if(!groups.some(g => g.id === PERSONAL_GROUP_ID)){
        groups.push({
          id: PERSONAL_GROUP_ID, name: 'Personal', type: 'personal',
          memberIds: [PERSONAL_USER_ID], createdBy: PERSONAL_USER_ID,
          createdAt: new Date().toISOString()
        });
        write(KEYS.groups, groups);
      }

      // GroupMember — idempotent by fixed ID.
      const members = read(KEYS.groupMembers, []);
      if(!members.some(m => m.id === PERSONAL_MEMBER_ID)){
        members.push({
          id: PERSONAL_MEMBER_ID, groupId: PERSONAL_GROUP_ID, userId: PERSONAL_USER_ID,
          role: 'owner', joinedAt: new Date().toISOString()
        });
        write(KEYS.groupMembers, members);
      }

      // Expenses — backfill each new field independently and only if missing,
      // so existing name/amount/date/category/paymentMethod/notes/tags/id/isDemo
      // are never touched, and partially-migrated or corrupted-but-present
      // records are handled field-by-field rather than all-or-nothing.
      const expenses = read(KEYS.expenses, []);
      expenses.forEach(exp => {
        if(!exp || typeof exp !== 'object') return; // skip anything unexpected rather than throwing
        if(exp.groupId === undefined) exp.groupId = PERSONAL_GROUP_ID;
        if(exp.addedBy === undefined) exp.addedBy = PERSONAL_USER_ID;
        if(exp.paidBy === undefined) exp.paidBy = PERSONAL_USER_ID;
        if(exp.splitType === undefined) exp.splitType = 'none';
        if(exp.splits === undefined) exp.splits = [];
      });
      write(KEYS.expenses, expenses);

      write(KEYS.migrationState, { phase1Complete: true, migratedAt: new Date().toISOString() });
    }catch(e){
      // Fail safe: never let a migration error break app startup, and never
      // mark migration complete if something went wrong — it will simply
      // retry (safely — every step above is idempotent) on the next load.
      if(window.console && console.warn) console.warn('Phase 1 migration did not complete cleanly:', e);
    }
  }

  return {
    KEYS, DEFAULT_CATEGORIES, PERSONAL_USER_ID, PERSONAL_GROUP_ID, PERSONAL_MEMBER_ID,
    init, read, write, runPhase1Migration
  };
})();
