/* ApiRepository: implements the same Repository contract as LocalRepository,
 * so state.js's repository selection is a one-line swap.
 *
 * Only Personal expenses are API-backed in Phase 5.4 (per the explicit
 * scope: no Group/Budgets/Recurring/Analytics/Settlement API yet). Every
 * other collection (categories, budgets, recurring, settings, users,
 * groups, groupMembers, settlements) still delegates straight to
 * LocalRepository — composition, not duplication, and it's what lets this
 * proof-of-concept run without breaking every other page that isn't part
 * of this phase's scope.
 */
window.ApiRepository = (function(){
  const EXPENSES_KEY = Storage.KEYS.expenses;

  function isExpensesKey(key){ return key === EXPENSES_KEY; }

  function init(){
    // No server-side migration/seeding call needed here — authService
    // already ensures the user's Personal group exists at login time
    // (backend/src/services/groupService.js). Non-expense collections still
    // need Storage's local defaults (categories, etc.), so this still goes
    // through LocalRepository's init.
    return LocalRepository.init();
  }

  // Only the fields the Personal expense API actually accepts — never
  // send groupId/addedBy/paidBy/splitType/splits/id/createdAt/updatedAt;
  // those are always server-authoritative or server-determined (Personal
  // group + self) for this phase, never trusted from the client.
  function toApiExpensePayload(item){
    return {
      name: item.name, amount: item.amount, date: item.date, category: item.category,
      paymentMethod: item.paymentMethod, notes: item.notes, tags: item.tags
    };
  }

  // The server assigns a real UUID for the user's Personal group/identity —
  // but every existing frontend code path (State.getExpensesForGroup,
  // State.activeGroupId(), Dashboard, Monthly Sheet, etc.) compares against
  // the fixed local constants (Storage.PERSONAL_GROUP_ID = 'group_personal',
  // Storage.PERSONAL_USER_ID = 'user_local'). Without this mapping, an
  // API-sourced expense's real groupId would never match
  // getExpensesForGroup('group_personal'), and every page would silently
  // show zero expenses. This is the explicit API-DTO -> frontend-shape
  // mapping this phase calls for — it belongs here, in the repository
  // layer, not leaked into any page.
  function fromApiExpense(dto){
    return Object.assign({}, dto, {
      groupId: Storage.PERSONAL_GROUP_ID,
      addedBy: Storage.PERSONAL_USER_ID,
      paidBy: Storage.PERSONAL_USER_ID
    });
  }

  async function getAll(key, fallback){
    if(!isExpensesKey(key)) return LocalRepository.getAll(key, fallback);
    const body = await ApiClient.request('/expenses', { method: 'GET' });
    return body && body.expenses ? body.expenses.map(fromApiExpense) : fallback;
  }

  function save(key, value){
    if(!isExpensesKey(key)) return LocalRepository.save(key, value);
    // Expenses never go through whole-array save() in API mode — every
    // mutation uses addItem/updateItem/removeItem instead (see
    // repository.js for why re-sending the whole collection would be wrong
    // for a REST API). Reaching here for expenses means some code path
    // called persist('expenses') directly instead of the item-level
    // methods — fail loudly rather than silently re-uploading everything.
    return Promise.reject(new Error("ApiRepository.save() must not be called for expenses — use addItem/updateItem/removeItem"));
  }

  async function addItem(key, item){
    if(!isExpensesKey(key)) return LocalRepository.addItem(key, item);
    const body = await ApiClient.request('/expenses', { method: 'POST', body: toApiExpensePayload(item) });
    return fromApiExpense(body.expense); // server-authoritative id/createdAt/updatedAt, group/identity mapped to local constants
  }

  async function updateItem(key, id, patch){
    if(!isExpensesKey(key)) return LocalRepository.updateItem(key, id, patch);
    const apiPatch = {};
    ['name', 'amount', 'date', 'category', 'paymentMethod', 'notes', 'tags'].forEach(field => {
      if(patch[field] !== undefined) apiPatch[field] = patch[field];
    });
    const body = await ApiClient.request(`/expenses/${id}`, { method: 'PUT', body: apiPatch });
    return fromApiExpense(body.expense); // server-authoritative updatedAt, group/identity mapped to local constants
  }

  async function removeItem(key, id){
    if(!isExpensesKey(key)) return LocalRepository.removeItem(key, id);
    await ApiClient.request(`/expenses/${id}`, { method: 'DELETE' });
  }

  const repo = { init, getAll, save, addItem, updateItem, removeItem };
  Repository.assertImplementsContract(repo, 'ApiRepository');
  Repository.assertImplementsItemContract(repo, 'ApiRepository');
  return repo;
})();
