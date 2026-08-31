/* LocalRepository: implements the Repository contract on top of the
 * existing Storage module. Storage remains the ONLY code that ever touches
 * localStorage directly -- this file adds no persistence logic of its own,
 * it only adapts Storage's synchronous API to the Promise-based contract
 * every repository implementation must expose.
 *
 * Every method's actual work still happens synchronously inside the
 * function body (localStorage has no async variant to wait on) -- only the
 * *return type* is a Promise, for interface consistency with whatever a
 * future ApiRepository looks like. This is deliberate: State can call these
 * methods without awaiting them and still see correct, already-persisted
 * data immediately afterward, which is what keeps this phase's behavior
 * pixel-for-pixel identical to before it existed.
 *
 * Item-level methods (Phase 5.4): the caller (State) already assigns id/
 * createdAt/updatedAt exactly as it always has for local mode -- these
 * methods return null (nothing "authoritative" to hand back), so State's
 * existing local-mode field assignment is left completely untouched.
 */
window.LocalRepository = (function(){
  function init(){
    Storage.init();
    return Promise.resolve();
  }

  function getAll(key, fallback){
    return Promise.resolve(Storage.read(key, fallback));
  }

  function save(key, value){
    Storage.write(key, value);
    return Promise.resolve();
  }

  async function addItem(key, item){
    const all = await getAll(key, []);
    all.push(item);
    await save(key, all);
    return null;
  }

  async function updateItem(key, id, patch){
    const all = await getAll(key, []);
    const found = all.find(x => x.id === id);
    if(found) Object.assign(found, patch);
    await save(key, all);
    return null;
  }

  async function removeItem(key, id){
    const all = await getAll(key, []);
    await save(key, all.filter(x => x.id !== id));
  }

  const repo = { init, getAll, save, addItem, updateItem, removeItem };
  Repository.assertImplementsContract(repo, 'LocalRepository');
  Repository.assertImplementsItemContract(repo, 'LocalRepository');
  return repo;
})();
