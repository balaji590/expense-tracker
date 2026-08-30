/* Repository: the abstraction boundary between State and wherever the data
 * actually lives. State depends ONLY on this shape — never on Storage or
 * localStorage directly, and never on which concrete implementation
 * (LocalRepository today, a future ApiRepository) is active.
 *
 * Derived directly from how State actually uses Storage today: every read
 * State performs is "give me everything under this key, or a fallback if
 * it doesn't exist yet" (Storage.read), and every write is "replace
 * everything under this key with this value" (Storage.write). State always
 * operates on whole collections in memory (push/filter/find on the array
 * it already has) and only needs the repository for the "did it actually
 * get initialized" and "read/write a whole key" operations — so the real
 * contract is intentionally small: init, getAll, save.
 *
 * Every method returns a Promise, even though today's only implementation
 * (LocalRepository) resolves synchronously under the hood — that's what
 * lets a future ApiRepository implement this exact same contract with real
 * network calls, without State or any page needing to change.
 *
 * This is documentation plus a runtime contract check, not a class
 * hierarchy — kept deliberately simple for vanilla JS with no build step.
 */
window.Repository = (function(){
  const CONTRACT_METHODS = ['init', 'getAll', 'save'];

  function assertImplementsContract(candidate, name){
    CONTRACT_METHODS.forEach(method => {
      if(typeof candidate[method] !== 'function'){
        throw new Error(`${name} does not implement Repository.${method}()`);
      }
    });
  }

  return { CONTRACT_METHODS, assertImplementsContract };
})();
