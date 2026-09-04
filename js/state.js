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
  //
  // Order matters here (Phase 5.7): groups must load before groupMembers
  // (ApiRepository's fetchAllMembersAcrossGroups reuses the just-fetched
  // groups list, and also learns "my own real user id" from the Personal
  // group's created_by field as a side effect of loading groups first).
  // groupMembers must load before users (ApiRepository.getAll for users
  // merges in real OTHER members' identities learned while loading
  // groupMembers — see apiRepository.js's knownUsers). expenses must load
  // after groups (ApiRepository needs to know which groups are shared, to
  // fetch each one's expenses). None of this reordering changes local-mode
  // behavior at all: LocalRepository.getAll is a plain independent
  // localStorage read per key with no cross-key dependency, so the order
  // these assignments happen in has no effect on what ends up in `data`.
  async function load(){
    await repository.init();
    data.groups = await repository.getAll(S.KEYS.groups, []);
    data.groupMembers = await repository.getAll(S.KEYS.groupMembers, []);
    data.users = await repository.getAll(S.KEYS.users, []);
    data.expenses = await repository.getAll(S.KEYS.expenses, []);
    data.categories = await repository.getAll(S.KEYS.categories, S.DEFAULT_CATEGORIES);
    data.budgets = await repository.getAll(S.KEYS.budgets, {overall:null, categoryBudgets:{}});
    data.recurring = await repository.getAll(S.KEYS.recurring, []);
    data.settings = await repository.getAll(S.KEYS.settings, {theme:'light', currency:'INR'});
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
    // groupId passed as extra context (Phase 5.7), same pattern as
    // removeGroupMember below: an edit payload never includes groupId
    // itself (it never changes an expense's group — see
    // js/pages/expenses.js's bindForm), but ApiRepository needs it to know
    // which endpoint (Personal vs a specific shared group) to call.
    // LocalRepository.updateItem ignores this extra argument entirely.
    const authoritative = await repository.updateItem(S.KEYS.expenses, id, patch, { groupId: e.groupId });
    if(authoritative) Object.assign(e, authoritative);
    notify();
  }
  async function deleteExpense(id){
    const e = data.expenses.find(x=>x.id===id);
    data.expenses = data.expenses.filter(x=>x.id!==id);
    // groupId passed as extra context — see updateExpense above.
    await repository.removeItem(S.KEYS.expenses, id, { groupId: e && e.groupId });
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
  // Hardened (Phase 5.5): a stored activeGroupId that no longer corresponds
  // to any loaded group (stale from a previous session, a deleted group, or
  // tampered-with localStorage) falls back safely to Personal rather than
  // leaving the UI pointed at a group that doesn't exist. This check is
  // purely a display-safety net — it grants no access by itself, since
  // every group-scoped read in API mode only ever contains groups the
  // server already confirmed this user belongs to.
  function activeGroupId(){
    const stored = data.settings.activeGroupId;
    if(stored && data.groups.some(g => g.id === stored)) return stored;
    return S.PERSONAL_GROUP_ID;
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
    // Attempt the repository call BEFORE committing to local memory — in
    // API mode a failed create (bad name, network error, etc.) must never
    // leave a phantom group behind that doesn't exist server-side.
    // LocalRepository.addItem never rejects, so local-mode behavior is
    // unchanged (still fully synchronous-feeling, just reordered).
    const authoritativeGroup = await repository.addItem(S.KEYS.groups, group);
    if(authoritativeGroup) Object.assign(group, authoritativeGroup);

    // The member object is built AFTER group.id is finalized — building it
    // earlier (using the client placeholder id) would leave member.groupId
    // pointing at an id that no longer matches the group once its real/
    // mapped id is applied above.
    const member = {
      id: Utils.uid('member'),
      groupId: group.id,
      userId: S.PERSONAL_USER_ID,
      role: 'owner',
      joinedAt: new Date().toISOString()
    };
    const authoritativeMember = await repository.addItem(S.KEYS.groupMembers, member);
    if(authoritativeMember) Object.assign(member, authoritativeMember);

    data.groups.push(group);
    data.groupMembers.push(member);
    notify();
    return group;
  }
  async function renameGroup(id, name){
    if(id === S.PERSONAL_GROUP_ID) return; // the Personal group is not user-editable
    const g = data.groups.find(x=>x.id===id);
    if(!g) return;
    g.name = name;
    const authoritative = await repository.updateItem(S.KEYS.groups, id, { name });
    if(authoritative) Object.assign(g, authoritative);
    notify();
  }
  async function deleteGroup(id){
    if(id === S.PERSONAL_GROUP_ID) return; // never delete the implicit Personal group
    data.groups = data.groups.filter(g=>g.id!==id);
    data.groupMembers = data.groupMembers.filter(m=>m.groupId!==id);
    data.settlements = data.settlements.filter(s=>s.groupId!==id);
    await repository.removeItem(S.KEYS.groups, id);
    if(activeGroupId() === id){
      data.settings.activeGroupId = S.PERSONAL_GROUP_ID;
      await persist('settings');
    }
    // Pre-existing defect fixed (found via Phase 5.7 E2E testing): in API
    // mode, the backend's DELETE /groups/:id already cascades to remove
    // that group's members/expenses/settlements at the database level (see
    // groupRepository.remove's comment) -- the item-level removeItem call
    // above is already authoritative and persisted. Calling persist() for
    // groupMembers here would attempt a whole-array re-save, which
    // ApiRepository deliberately rejects (see repository.js: groupMembers
    // is item-level-only in API mode) -- this was throwing whenever a real
    // cloud user deleted a shared group that had ever had a member in it.
    // Local mode still needs this call: LocalRepository has no server to
    // cascade the deletion for it, so the already-filtered in-memory data
    // must still be explicitly saved.
    if(!isCloudMode()){
      await persist('groupMembers');
    }
    await persist('settlements');
    notify();
  }
  async function addGroupMember(groupId, displayName){
    const group = data.groups.find(g=>g.id===groupId);
    if(!group) return;
    const user = { id: Utils.uid('user'), displayName: displayName, createdAt: new Date().toISOString() };
    const member = { id: Utils.uid('member'), groupId, userId: user.id, role: 'member', joinedAt: new Date().toISOString() };
    // Attempt the repository call FIRST — in API mode this currently always
    // rejects (adding a member isn't implemented yet, see groupService.js's
    // addMemberByName), and a rejection must never leave a phantom local
    // user/member behind. LocalRepository.addItem never rejects, so
    // local-mode behavior (and its persisted result) is unchanged.
    const authoritative = await repository.addItem(S.KEYS.groupMembers, member);
    if(authoritative) Object.assign(member, authoritative);

    data.users.push(user);
    await persist('users');
    data.groupMembers.push(member);
    group.memberIds.push(user.id);
    await persist('groupMembers'); await persist('groups');
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
    // groupId passed as extra context — see repository.js: the API's
    // remove-member URL is scoped by group, unlike the flat local array.
    await repository.removeItem(S.KEYS.groupMembers, memberId, { groupId: member.groupId });
    // Pre-existing defect fixed (found via Phase 5.7 E2E testing): in API
    // mode, the backend's soft-delete (via the removeItem call above) is
    // already authoritative and persisted. Calling persist() here would
    // attempt a whole-array re-save of groupMembers/groups, which
    // ApiRepository deliberately rejects (see repository.js) -- this was
    // throwing on every single real-cloud-group member removal, unrelated
    // to Phase 5.7. Local mode still needs these calls: LocalRepository.
    // removeItem hard-deletes the record, and this immediately-following
    // persist() is what turns that into the intended Phase 4 soft-delete
    // (re-saving the in-memory object, which still has removedAt set,
    // instead of leaving it hard-deleted).
    if(!isCloudMode()){
      await persist('groupMembers'); await persist('groups');
    }
    notify();
  }
  // ---- Invitations (Phase 5.6) — API-mode only; see repository stubs ----
  // These are thin pass-throughs, not item-level CRUD on a local collection
  // (there's no local equivalent), so they call the repository's own
  // invitation methods directly rather than going through persist/addItem.
  async function inviteMember(groupId, email){
    return repository.createInvitation(groupId, email);
  }
  async function listPendingInvitations(groupId){
    return repository.listInvitations(groupId);
  }
  async function revokeInvitation(groupId, invitationId){
    return repository.revokeInvitation(groupId, invitationId);
  }
  async function previewInvitation(token){
    return repository.previewInvitation(token);
  }
  async function acceptInvitation(token){
    const result = await repository.acceptInvitation(token);
    // Accepting adds a new group + membership server-side — refresh those
    // collections (not a full State.load()) so the app reflects it
    // immediately without an unnecessary full reload of everything else.
    // users is refreshed too (Phase 5.7): fetching groupMembers is what
    // discovers real OTHER members' identities (see
    // apiRepository.js's knownUsers), so without this, the group owner's
    // name wouldn't resolve until the next full page load.
    data.groups = await repository.getAll(S.KEYS.groups, data.groups);
    data.groupMembers = await repository.getAll(S.KEYS.groupMembers, data.groupMembers);
    data.users = await repository.getAll(S.KEYS.users, data.users);
    notify();
    return result;
  }
  async function whoAmI(){
    return repository.whoAmI();
  }
  async function requestSignInLink(email){
    return repository.requestMagicLink(email);
  }
  // Lets pages branch on mode (e.g. Groups showing "Invite by email" vs.
  // "Add member by name") without importing Repository/AppConfig
  // themselves — they only ever ask State, never inspect which concrete
  // implementation is active.
  function isCloudMode(){
    return repository === window.ApiRepository;
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

  // ---- Settlements (Phase 4 local, Phase 5.8 cloud) ----
  async function addSettlement(settlement){
    settlement.id = Utils.uid('settle');
    settlement.createdAt = new Date().toISOString();
    data.settlements.push(settlement);
    // Phase 5.8: item-level addItem, not a whole-array persist() — mirrors
    // addExpense's exact pattern. In API mode this posts to
    // /groups/:groupId/settlements and merges the server-authoritative
    // response back (createdBy is server-derived and only ever arrives
    // this way, never sent by the client). LocalRepository.addItem already
    // handles this generically, so local mode is unaffected.
    const authoritative = await repository.addItem(S.KEYS.settlements, settlement);
    if(authoritative) Object.assign(settlement, authoritative);
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
    addSettlement, getSettlementsForGroup,
    inviteMember, listPendingInvitations, revokeInvitation, previewInvitation, acceptInvitation,
    whoAmI, requestSignInLink, isCloudMode
  };
})();
