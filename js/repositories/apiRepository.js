/* ApiRepository: implements the same Repository contract as LocalRepository,
 * so state.js's repository selection is a one-line swap.
 *
 * Phase 5.4: Personal expenses are API-backed.
 * Phase 5.5: Groups and group membership are API-backed too.
 * Everything else (categories, budgets, recurring, settings, users,
 * settlements) still delegates straight to LocalRepository — composition,
 * not duplication.
 */
window.ApiRepository = (function(){
  const EXPENSES_KEY = Storage.KEYS.expenses;
  const GROUPS_KEY = Storage.KEYS.groups;
  const GROUP_MEMBERS_KEY = Storage.KEYS.groupMembers;

  function init(){
    // No server-side migration/seeding call needed here — authService
    // already ensures the user's Personal group exists at login time
    // (backend/src/services/groupService.js). Non-API collections still
    // need Storage's local defaults, so this still goes through
    // LocalRepository's init.
    return LocalRepository.init();
  }

  // ===================== Expenses (Phase 5.4) =====================

  function toApiExpensePayload(item){
    return {
      name: item.name, amount: item.amount, date: item.date, category: item.category,
      paymentMethod: item.paymentMethod, notes: item.notes, tags: item.tags
    };
  }

  function fromApiExpense(dto){
    return Object.assign({}, dto, {
      groupId: Storage.PERSONAL_GROUP_ID,
      addedBy: Storage.PERSONAL_USER_ID,
      paidBy: Storage.PERSONAL_USER_ID
    });
  }

  // ===================== Groups (Phase 5.5) =====================
  //
  // The server assigns a real UUID for every group, including the user's
  // Personal one — but the entire existing frontend (groups.js's
  // st.groupById(Storage.PERSONAL_GROUP_ID), State.activeGroupId()'s
  // fallback, getExpensesForGroup, etc.) compares against the fixed local
  // constant Storage.PERSONAL_GROUP_ID. Exactly the Phase 5.4 UUID-mapping
  // lesson, applied to groups: the Personal group's real id is remapped to
  // the local constant; shared groups keep their real UUID as-is (there's
  // no local constant for them to collide with).
  //
  // groupRealId maps a frontend-facing id (possibly the normalized
  // Storage.PERSONAL_GROUP_ID) back to the real server UUID needed to
  // build API URLs. Rebuilt every time groups are fetched.
  let groupRealId = {};   // frontendId -> real server UUID
  let groupFrontendId = {}; // real server UUID -> frontendId

  function registerGroup(row){
    const frontendId = row.type === 'personal' ? Storage.PERSONAL_GROUP_ID : row.id;
    groupRealId[frontendId] = row.id;
    groupFrontendId[row.id] = frontendId;
    return frontendId;
  }

  function realGroupIdFor(frontendId){
    return groupRealId[frontendId] || frontendId; // shared groups: already their own real id
  }

  function fromApiGroup(row){
    const frontendId = registerGroup(row);
    return {
      id: frontendId,
      name: row.name,
      type: row.type,
      memberIds: [], // never read by any page (verified before this phase) — kept for shape compatibility only
      createdBy: Storage.PERSONAL_USER_ID, // every group in this phase is created by the authenticated user themselves
      createdAt: row.created_at
    };
  }

  // Every membership row in this phase belongs to the authenticated user
  // themselves (adding other members isn't implemented yet — see
  // addGroupMember below), so userId always maps to the local constant,
  // exactly like expenses' addedBy/paidBy in Phase 5.4. Storage.init()
  // (still running via LocalRepository even in API mode) already seeds a
  // local User record for Storage.PERSONAL_USER_ID, so State.userName()
  // resolves it correctly ("Me") without any extra API call.
  function fromApiMember(row){
    return {
      id: row.id,
      groupId: groupFrontendId[row.group_id] || row.group_id,
      userId: Storage.PERSONAL_USER_ID,
      role: row.role,
      joinedAt: row.joined_at,
      removedAt: row.removed_at || undefined
    };
  }

  // Short-lived reuse: State.load() always fetches groups immediately
  // before groupMembers, so the groups list groupMembers' own fetch needs
  // (to know which group ids to query) is often already sitting here,
  // avoiding a redundant GET /api/groups. Consumed (cleared) on read so it
  // can never serve stale data to an unrelated later call.
  let pendingGroupsForMemberFetch = null;

  // Same short-lived-reuse idea: right after creating a group, the backend
  // already returned its owner-membership row in the same response (see
  // addItem below) — this lets the immediately-following
  // addItem(GROUP_MEMBERS_KEY, ...) call return that authoritative data
  // instead of making a second round-trip.
  let pendingOwnerMembership = null;

  async function fetchGroups(){
    const body = await ApiClient.request('/groups', { method: 'GET' });
    return (body && body.groups ? body.groups : []).map(fromApiGroup);
  }

  async function fetchAllMembersAcrossGroups(){
    const groups = pendingGroupsForMemberFetch || await fetchGroups();
    pendingGroupsForMemberFetch = null;
    const allMembers = [];
    for(const g of groups){
      const body = await ApiClient.request(`/groups/${realGroupIdFor(g.id)}/members`, { method: 'GET' });
      (body && body.members ? body.members : []).forEach(row => allMembers.push(fromApiMember(row)));
    }
    return allMembers;
  }

  // ===================== Contract methods =====================

  async function getAll(key, fallback){
    if(key === EXPENSES_KEY){
      const body = await ApiClient.request('/expenses', { method: 'GET' });
      return body && body.expenses ? body.expenses.map(fromApiExpense) : fallback;
    }
    if(key === GROUPS_KEY){
      const groups = await fetchGroups();
      pendingGroupsForMemberFetch = groups; // likely reused by the very next call, if it's groupMembers
      return groups.length ? groups : fallback;
    }
    if(key === GROUP_MEMBERS_KEY){
      const members = await fetchAllMembersAcrossGroups();
      return members.length ? members : fallback;
    }
    return LocalRepository.getAll(key, fallback);
  }

  function save(key, value){
    if(key === EXPENSES_KEY || key === GROUPS_KEY || key === GROUP_MEMBERS_KEY){
      // These three collections never go through whole-array save() in API
      // mode — every mutation uses addItem/updateItem/removeItem instead
      // (see repository.js for why re-sending a whole collection would be
      // wrong for a REST API). Reaching here means some code path called
      // persist(key) directly instead of the item-level methods — fail
      // loudly rather than silently re-uploading everything.
      return Promise.reject(new Error(`ApiRepository.save() must not be called for ${key} — use addItem/updateItem/removeItem`));
    }
    return LocalRepository.save(key, value);
  }

  async function addItem(key, item){
    if(key === EXPENSES_KEY){
      const body = await ApiClient.request('/expenses', { method: 'POST', body: toApiExpensePayload(item) });
      return fromApiExpense(body.expense);
    }
    if(key === GROUPS_KEY){
      const body = await ApiClient.request('/groups', { method: 'POST', body: { name: item.name } });
      const group = fromApiGroup(body.group);
      // The owner-membership the backend created atomically alongside the
      // group is returned in the same response — stash it so the very next
      // addItem(GROUP_MEMBERS_KEY, ...) call for this same create-group flow
      // can return real data instead of making a second round-trip.
      pendingOwnerMembership = body.membership ? fromApiMember(body.membership) : null;
      return group;
    }
    if(key === GROUP_MEMBERS_KEY){
      if(pendingOwnerMembership && pendingOwnerMembership.groupId === item.groupId){
        // Right after creating a group, State immediately calls addItem for
        // the owner-membership record too — the backend already returned
        // this exact row in the create-group response (see addItem for
        // GROUPS_KEY above), so no second network call is needed here.
        const authoritative = pendingOwnerMembership;
        pendingOwnerMembership = null;
        return authoritative;
      }
      // Adding a member by name isn't implemented in cloud mode yet — the
      // backend returns a clear 501 explaining why (see
      // backend/src/services/groupService.js's addMemberByName). This is a
      // documented limitation, not a bug: it requires a real email
      // identity, and fabricating one would create a fake account. The
      // request body's content doesn't matter since this always 501s.
      await ApiClient.request(`/groups/${realGroupIdFor(item.groupId)}/members`, { method: 'POST', body: {} });
      return null; // unreachable — the request above always throws
    }
    return LocalRepository.addItem(key, item);
  }

  async function updateItem(key, id, patch){
    if(key === EXPENSES_KEY){
      const apiPatch = {};
      ['name', 'amount', 'date', 'category', 'paymentMethod', 'notes', 'tags'].forEach(field => {
        if(patch[field] !== undefined) apiPatch[field] = patch[field];
      });
      const body = await ApiClient.request(`/expenses/${id}`, { method: 'PUT', body: apiPatch });
      return fromApiExpense(body.expense);
    }
    if(key === GROUPS_KEY){
      const body = await ApiClient.request(`/groups/${realGroupIdFor(id)}`, { method: 'PUT', body: { name: patch.name } });
      return fromApiGroup(body.group);
    }
    return LocalRepository.updateItem(key, id, patch);
  }

  // removeItem's optional third argument carries collection-specific extra
  // context the base (key, id) shape doesn't include. Documented extension
  // to the Phase 5.4 item-level contract: removing a group MEMBER needs to
  // know which group it belongs to, since the API's URL is scoped by group
  // (/api/groups/:groupId/members/:memberId), not a flat /members
  // collection. LocalRepository ignores this extra argument entirely (its
  // single flat array already has everything it needs from key+id alone).
  async function removeItem(key, id, extra){
    if(key === EXPENSES_KEY){
      await ApiClient.request(`/expenses/${id}`, { method: 'DELETE' });
      return;
    }
    if(key === GROUPS_KEY){
      await ApiClient.request(`/groups/${realGroupIdFor(id)}`, { method: 'DELETE' });
      return;
    }
    if(key === GROUP_MEMBERS_KEY){
      const groupId = extra && extra.groupId;
      await ApiClient.request(`/groups/${realGroupIdFor(groupId)}/members/${id}`, { method: 'DELETE' });
      return;
    }
    return LocalRepository.removeItem(key, id, extra);
  }

  const repo = { init, getAll, save, addItem, updateItem, removeItem };
  Repository.assertImplementsContract(repo, 'ApiRepository');
  Repository.assertImplementsItemContract(repo, 'ApiRepository');

  // ===================== Invitations (Phase 5.6) =====================
  // Not part of the core Repository contract — invitations don't fit "a
  // collection of items keyed by a Storage key" (there's no local
  // equivalent at all; see LocalRepository's stubs). Plain extra methods,
  // called directly by State's own invitation-specific wrapper functions.

  async function createInvitation(groupId, email){
    return ApiClient.request(`/groups/${realGroupIdFor(groupId)}/invitations`, { method: 'POST', body: { email } });
  }
  async function listInvitations(groupId){
    const body = await ApiClient.request(`/groups/${realGroupIdFor(groupId)}/invitations`, { method: 'GET' });
    return (body && body.invitations) || [];
  }
  async function revokeInvitation(groupId, invitationId){
    await ApiClient.request(`/groups/${realGroupIdFor(groupId)}/invitations/${invitationId}`, { method: 'DELETE' });
  }
  async function previewInvitation(token){
    return ApiClient.request(`/invitations/${token}/preview`, { method: 'GET' });
  }
  async function acceptInvitation(token){
    return ApiClient.request(`/invitations/${token}/accept`, { method: 'POST' });
  }

  // Wraps GET /api/auth/me. Returns null on an unauthenticated (401)
  // response rather than throwing — "not signed in" is an expected,
  // ordinary state for the invitation-acceptance page to handle, not an error.
  async function whoAmI(){
    try{
      const body = await ApiClient.request('/auth/me', { method: 'GET' });
      return body && body.user ? body.user : null;
    }catch(e){
      if(e instanceof ApiError && e.code === 'unauthorized') return null;
      throw e;
    }
  }
  async function requestMagicLink(email){
    return ApiClient.request('/auth/magic-link', { method: 'POST', body: { email } });
  }

  Object.assign(repo, {
    createInvitation, listInvitations, revokeInvitation, previewInvitation, acceptInvitation,
    whoAmI, requestMagicLink
  });
  return repo;
})();
