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

  // Invitations and auth-status are genuinely API-only concepts — local
  // mode has no server, no other identity to invite, and no "am I signed
  // in" question (you always just are, implicitly). These aren't part of
  // the core Repository contract (they don't fit "a collection keyed by a
  // Storage key"), so they're plain extra methods, not contract-checked.
  // A clear rejection is safer than silently doing nothing, in case a
  // future UI path ever calls these without first checking the mode.
  function createInvitation(){ return Promise.reject(new Error('Invitations are only available in cloud mode.')); }
  function listInvitations(){ return Promise.resolve([]); } // a read — an empty list is the honest, safe answer, not an error
  function revokeInvitation(){ return Promise.reject(new Error('Invitations are only available in cloud mode.')); }
  function previewInvitation(){ return Promise.reject(new Error('Invitations are only available in cloud mode.')); }
  function acceptInvitation(){ return Promise.reject(new Error('Invitations are only available in cloud mode.')); }
  function whoAmI(){ return Promise.resolve(null); } // local mode has no separate "signed in" identity to report
  function requestMagicLink(){ return Promise.reject(new Error('Signing in is only available in cloud mode.')); }

  const repo = {
    init, getAll, save, addItem, updateItem, removeItem,
    createInvitation, listInvitations, revokeInvitation, previewInvitation, acceptInvitation,
    whoAmI, requestMagicLink
  };
  Repository.assertImplementsContract(repo, 'LocalRepository');
  Repository.assertImplementsItemContract(repo, 'LocalRepository');
  return repo;
})();
