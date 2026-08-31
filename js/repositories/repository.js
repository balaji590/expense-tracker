/* Repository: the abstraction boundary between State and wherever the data
 * actually lives. State depends ONLY on this shape -- never on Storage or
 * localStorage directly, and never on which concrete implementation
 * (LocalRepository today, ApiRepository for API-backed collections) is active.
 *
 * Base contract (Phase 5.3): init, getAll, save -- "give me everything under
 * this key" / "replace everything under this key". This is all any
 * localStorage-backed collection ever needs, since Storage has no concept
 * of a single record.
 *
 * Extended contract (Phase 5.4): addItem, updateItem, removeItem. Justified
 * addition, not scope creep -- once a collection is backed by a real REST
 * API (Personal expenses in this phase), the whole-array save() semantic
 * stops making sense: re-sending the entire collection on every single add/
 * edit/delete would be wasteful, wrong for the API's POST-one/PUT-one/
 * DELETE-one design, and unable to receive server-authoritative id/
 * createdAt/updatedAt back for just the one record that changed. These
 * three methods are OPTIONAL -- only collections that need item-level
 * operations (expenses, so far) use them; every other collection keeps
 * using plain save() exactly as before, untouched.
 *
 * Every method returns a Promise, even though LocalRepository resolves most
 * of them synchronously under the hood -- that's what lets ApiRepository
 * implement the same shape with real network calls, without State or any
 * page needing to change.
 *
 * This is documentation plus a runtime contract check, not a class
 * hierarchy -- kept deliberately simple for vanilla JS with no build step.
 */
window.Repository = (function(){
  const CONTRACT_METHODS = ['init', 'getAll', 'save'];
  const ITEM_CONTRACT_METHODS = ['addItem', 'updateItem', 'removeItem'];

  function assertImplementsContract(candidate, name){
    CONTRACT_METHODS.forEach(method => {
      if(typeof candidate[method] !== 'function'){
        throw new Error(`${name} does not implement Repository.${method}()`);
      }
    });
  }

  function assertImplementsItemContract(candidate, name){
    ITEM_CONTRACT_METHODS.forEach(method => {
      if(typeof candidate[method] !== 'function'){
        throw new Error(`${name} does not implement Repository.${method}()`);
      }
    });
  }

  return { CONTRACT_METHODS, ITEM_CONTRACT_METHODS, assertImplementsContract, assertImplementsItemContract };
})();
