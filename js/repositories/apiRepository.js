/* ApiRepository: implements the same Repository contract as LocalRepository,
 * so state.js's repository selection is a one-line swap.
 *
 * Phase 5.4: Personal expenses are API-backed.
 * Phase 5.5: Groups and group membership are API-backed too.
 * Phase 5.7: Shared-group expenses are API-backed too, and group-member
 * identity mapping is fixed to support real OTHER users in a group (see
 * fromApiMember below) — Everything else (categories, budgets, recurring,
 * settings, settlements) still delegates straight to LocalRepository —
 * composition, not duplication.
 */
window.ApiRepository = (function(){
  const EXPENSES_KEY = Storage.KEYS.expenses;
  const GROUPS_KEY = Storage.KEYS.groups;
  const GROUP_MEMBERS_KEY = Storage.KEYS.groupMembers;
  const USERS_KEY = Storage.KEYS.users;

  function init(){
    // No server-side migration/seeding call needed here — authService
    // already ensures the user's Personal group exists at login time
    // (backend/src/services/groupService.js). Non-API collections still
    // need Storage's local defaults, so this still goes through
    // LocalRepository's init.
    return LocalRepository.init();
  }

  // A frontend-facing groupId is "the Personal group" if it's the local
  // constant (or absent/undefined, matching the same convention already
  // used elsewhere — e.g. js/state.js's getExpensesForGroup treats a
  // missing groupId as Personal). Centralized here since expense routing
  // needs this check in four different places below.
  function isPersonalFrontendGroupId(frontendGroupId){
    return !frontendGroupId || frontendGroupId === Storage.PERSONAL_GROUP_ID;
  }

  // ===================== Expenses (Phase 5.4 + 5.7) =====================

  // Shared expenses additionally need paidBy/splitType/splits — Personal
  // expenses never send these (the backend's Personal expense API doesn't
  // accept or use them; see backend/src/services/expenseService.js).
  // addedBy is deliberately NEVER included in either case — the backend
  // always derives it from the authenticated session
  // (expenseService.js / sharedExpenseService.js), never trusts a
  // client-supplied identity for it.
  function toApiExpensePayload(item){
    const payload = {
      name: item.name, amount: item.amount, date: item.date, category: item.category,
      paymentMethod: item.paymentMethod, notes: item.notes, tags: item.tags
    };
    if(!isPersonalFrontendGroupId(item.groupId)){
      payload.paidBy = toBackendUserId(item.paidBy);
      payload.splitType = item.splitType;
      payload.splits = (item.splits || []).map(s => ({ memberId: s.memberId, amount: s.amount }));
    }
    return payload;
  }

  // The current session's own real backend user id. Learned for free from
  // the Personal group's created_by field the first time groups are
  // fetched — every user's Personal group is always created_by themselves
  // (see backend groupService.ensurePersonalGroup) — so no extra network
  // round trip is needed. Guaranteed known before any member/expense row
  // is mapped, because State.load() (js/state.js) always fetches groups
  // before groupMembers and before expenses.
  let myUserId = null;

  // Real OTHER users encountered via enriched group-member rows (Phase
  // 5.7 — GET /groups/:id/members now includes email/display_name; see
  // backend/src/repositories/groupMemberRepository.js's
  // listForGroupWithUserInfo). Keyed by real backend user id. Merged into
  // getAll(USERS_KEY) below so State.userName()/userById() can resolve
  // someone who isn't you, not just the locally-seeded "Me" record.
  let knownUsers = {}; // realUserId -> { id, displayName, email }

  // Frontend-facing user ids are always either Storage.PERSONAL_USER_ID
  // (you) or a real backend user UUID (anyone else) — see fromApiMember.
  // The backend, however, always needs a real UUID. This is the inverse of
  // that mapping, used when SENDING paidBy back to the server.
  function toBackendUserId(frontendUserId){
    return frontendUserId === Storage.PERSONAL_USER_ID ? myUserId : frontendUserId;
  }

  // Personal expenses' groupId/addedBy/paidBy are always the caller's own
  // Personal group/identity (the backend's Personal API guarantees this —
  // see expenseService.js), and shared expenses' groupId/addedBy/paidBy
  // are real, possibly-someone-else, values (sharedExpenseService.js) — but
  // both endpoints return the exact same DTO shape (services/
  // expenseMapper.js's toDto), so ONE mapping handles both cases uniformly:
  // remap the real group id to whatever frontend id it's known by (Personal
  // group -> the local constant; a shared group -> its own real id,
  // unchanged), and remap any user id that happens to be YOU to the local
  // "Me" constant, while leaving any OTHER real user id exactly as-is.
  // splits (memberId + amount) need no remapping at all — group_member ids
  // were never locally remapped in the first place (see fromApiMember).
  function fromApiExpense(dto){
    return Object.assign({}, dto, {
      groupId: groupFrontendId[dto.groupId] || dto.groupId,
      addedBy: dto.addedBy === myUserId ? Storage.PERSONAL_USER_ID : dto.addedBy,
      paidBy: dto.paidBy === myUserId ? Storage.PERSONAL_USER_ID : dto.paidBy
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
    // The Personal group is always created_by the caller themselves — see
    // backend groupService.ensurePersonalGroup — so this is exactly the
    // caller's own real user id, learned without any extra request.
    if(row.type === 'personal') myUserId = row.created_by;
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

  // Fixed (Phase 5.7): before real invitations existed, every membership
  // row belonged to the caller themselves, so mapping every row's userId
  // to the local Storage.PERSONAL_USER_ID constant was harmless. Now that
  // a shared group can have real OTHER members (Phase 5.6 invitations),
  // that would incorrectly show every member as "Me" AND send the
  // non-UUID placeholder string to the server as paidBy. Fixed:
  //   - the caller's OWN real user id still maps to Storage.PERSONAL_USER_ID
  //     (preserves every existing comparison/display that assumes "you"
  //     are identified by that constant — e.g. the Personal group's own
  //     membership row, and Storage.init()'s locally-seeded "Me" User record)
  //   - every OTHER real member keeps their actual backend user UUID as-is,
  //     and gets registered into knownUsers (using the email/display_name
  //     the backend now includes on this same row — see
  //     groupMemberRepository.listForGroupWithUserInfo) so
  //     getAll(USERS_KEY) below can synthesize a matching local User
  //     record for them, and State.userName()/userById() resolve them
  //     correctly too.
  function fromApiMember(row){
    const isMe = row.user_id === myUserId;
    const userId = isMe ? Storage.PERSONAL_USER_ID : row.user_id;
    if(!isMe){
      knownUsers[row.user_id] = {
        id: row.user_id,
        displayName: row.display_name || row.email || 'Group member',
        email: row.email
      };
    }
    return {
      id: row.id,
      groupId: groupFrontendId[row.group_id] || row.group_id,
      userId,
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

  // Every frontend-facing group id that ISN'T the Personal constant is a
  // shared group. Built from groupRealId — which registerGroup keeps in
  // sync on every group fetch/create — rather than an extra network call.
  // Falls back to a fresh fetchGroups() only if groups genuinely haven't
  // been loaded yet in this session (groupRealId would contain at least
  // the Personal group otherwise), so this never assumes a specific call
  // order elsewhere.
  async function sharedFrontendGroupIds(){
    if(Object.keys(groupRealId).length === 0){
      const groups = await fetchGroups();
      return groups.filter(g => g.id !== Storage.PERSONAL_GROUP_ID).map(g => g.id);
    }
    return Object.keys(groupRealId).filter(fid => fid !== Storage.PERSONAL_GROUP_ID);
  }

  async function getAll(key, fallback){
    if(key === EXPENSES_KEY){
      const personalBody = await ApiClient.request('/expenses', { method: 'GET' });
      const personalExpenses = (personalBody && personalBody.expenses) || [];

      const sharedIds = await sharedFrontendGroupIds();
      let sharedExpenses = [];
      for(const frontendGroupId of sharedIds){
        const body = await ApiClient.request(`/groups/${realGroupIdFor(frontendGroupId)}/expenses`, { method: 'GET' });
        sharedExpenses = sharedExpenses.concat((body && body.expenses) || []);
      }

      const all = personalExpenses.concat(sharedExpenses).map(fromApiExpense);
      return all.length ? all : fallback;
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
    if(key === USERS_KEY){
      // LocalRepository still owns the actual localStorage record for the
      // locally-seeded "Me" user (Storage.init() creates it even in API
      // mode) — this just adds real OTHER users learned via fromApiMember
      // on top, so State.userName()/userById() can resolve them too.
      // Requires groupMembers to have been fetched at least once first in
      // this session (js/state.js's load() ordering guarantees this); if
      // not, this simply has nothing extra to add yet, same as before.
      const localUsers = await LocalRepository.getAll(key, fallback || []);
      const extra = Object.keys(knownUsers)
        .filter(uid => !localUsers.some(u => u.id === uid))
        .map(uid => ({ id: uid, displayName: knownUsers[uid].displayName, createdAt: undefined }));
      return extra.length ? localUsers.concat(extra) : localUsers;
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
      const payload = toApiExpensePayload(item);
      const url = isPersonalFrontendGroupId(item.groupId)
        ? '/expenses'
        : `/groups/${realGroupIdFor(item.groupId)}/expenses`;
      const body = await ApiClient.request(url, { method: 'POST', body: payload });
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

  // The optional 4th `extra` argument mirrors removeItem's existing,
  // documented extension pattern below: an edit payload deliberately never
  // includes groupId itself (an expense's group never changes via edit —
  // see js/pages/expenses.js's bindForm), so ApiRepository needs the
  // caller to pass it separately in order to know which endpoint (Personal
  // vs a specific shared group) to call. LocalRepository.updateItem(key,
  // id, patch) doesn't declare a 4th parameter, so passing this extra
  // argument for local-mode calls is silently ignored — zero behavior
  // change there.
  async function updateItem(key, id, patch, extra){
    if(key === EXPENSES_KEY){
      const frontendGroupId = extra && extra.groupId;
      const apiPatch = {};
      ['name', 'amount', 'date', 'category', 'paymentMethod', 'notes', 'tags'].forEach(field => {
        if(patch[field] !== undefined) apiPatch[field] = patch[field];
      });
      if(isPersonalFrontendGroupId(frontendGroupId)){
        const body = await ApiClient.request(`/expenses/${id}`, { method: 'PUT', body: apiPatch });
        return fromApiExpense(body.expense);
      }
      if(patch.paidBy !== undefined) apiPatch.paidBy = toBackendUserId(patch.paidBy);
      if(patch.splitType !== undefined) apiPatch.splitType = patch.splitType;
      if(patch.splits !== undefined) apiPatch.splits = patch.splits.map(s => ({ memberId: s.memberId, amount: s.amount }));
      const body = await ApiClient.request(`/groups/${realGroupIdFor(frontendGroupId)}/expenses/${id}`, { method: 'PUT', body: apiPatch });
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
  // to the Phase 5.4 item-level contract: removing a group MEMBER (and now,
  // Phase 5.7, a shared expense) needs to know which group it belongs to,
  // since those API URLs are scoped by group (/api/groups/:groupId/...),
  // not a flat collection. LocalRepository ignores this extra argument
  // entirely (its single flat array already has everything it needs from
  // key+id alone).
  async function removeItem(key, id, extra){
    if(key === EXPENSES_KEY){
      const frontendGroupId = extra && extra.groupId;
      const url = isPersonalFrontendGroupId(frontendGroupId)
        ? `/expenses/${id}`
        : `/groups/${realGroupIdFor(frontendGroupId)}/expenses/${id}`;
      await ApiClient.request(url, { method: 'DELETE' });
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
