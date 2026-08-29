window.Pages = window.Pages || {};
window.Pages.groups = (function(){
  const U = Utils;
  const AVATAR_PALETTE = ['#4a90d9','#4f9d69','#d4568f','#c99a2e','#8b6fd6','#3fb0a8','#e0704a','#5d7fd6','#a15fc7','#3ba3c9'];

  function avatarColor(id){
    // Deterministic color per id (not random), so the same member/group always
    // gets the same color across renders — purely cosmetic, no stored field needed.
    let hash = 0;
    for(let i=0;i<id.length;i++) hash = (hash*31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  }
  function initial(name){ return (name||'?').trim().charAt(0).toUpperCase() || '?'; }

  function render(container){
    const st = State;
    const personalGroup = st.groupById(Storage.PERSONAL_GROUP_ID);
    const sharedGroups = st.data.groups.filter(g=>g.id!==Storage.PERSONAL_GROUP_ID);

    container.innerHTML = `
      <div class="section-head">
        <h2>Groups</h2>
        <button class="btn btn-primary" id="createGroupBtn">+ Create group</button>
      </div>

      <div class="section">
        <div id="personalGroupCard"></div>
      </div>

      <div class="section-head"><h2 style="font-size:15px;">Shared groups</h2></div>
      <div id="sharedGroupsWrap"></div>
    `;

    renderPersonalCard(container, personalGroup);
    renderSharedGroups(container, sharedGroups);

    container.querySelector('#createGroupBtn').onclick = openCreateGroupModal;
  }

  function groupCardShell(group, isPersonal){
    const st = State;
    const isActive = st.activeGroupId() === group.id;
    const members = st.membersForGroup(group.id);
    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="card-title" style="margin-bottom:0;" id="groupName-${group.id}">${U.escapeHtml(group.name)}</span>
            ${isPersonal ? '<span class="badge" style="background:var(--accent-2); color:var(--accent);">Default</span>' : ''}
            ${isActive ? '<span class="badge" style="background:var(--success-bg); color:var(--success);">Active</span>' : ''}
          </div>
          <div class="row-actions">
            ${!isActive ? `<button class="btn btn-sm" data-setactive="${group.id}">Set active</button>` : ''}
            ${!isPersonal ? `<button class="btn btn-sm" data-rename="${group.id}">Rename</button>` : ''}
            ${!isPersonal ? `<button class="btn btn-sm btn-danger" data-delgroup="${group.id}">Delete</button>` : ''}
          </div>
        </div>
        <div id="memberList-${group.id}"></div>
        ${!isPersonal ? `<button class="btn btn-sm" style="margin-top:12px;" data-addmember="${group.id}">+ Add member</button>` : ''}
      </div>
    `;
  }

  function memberRowsHtml(group){
    const st = State;
    const members = st.membersForGroup(group.id);
    if(!members.length){
      return `<div class="stat-sub">No members yet.</div>`;
    }
    return members.map(m => {
      const name = st.userName(m.userId);
      return `
        <div class="save-row">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="cat-avatar" style="background:${avatarColor(m.userId)}">${initial(name)}</span>
            <div>
              <div style="font-weight:600; font-size:13.5px;">${U.escapeHtml(name)}</div>
              <div class="stat-sub" style="text-transform:capitalize;">${U.escapeHtml(m.role)}</div>
            </div>
          </div>
          ${m.role !== 'owner' ? `<button class="btn btn-sm btn-danger" data-removemember="${m.id}">Remove</button>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderPersonalCard(container, personalGroup){
    const wrap = container.querySelector('#personalGroupCard');
    if(!personalGroup){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = groupCardShell(personalGroup, true);
    wrap.querySelector(`#memberList-${personalGroup.id}`).innerHTML = memberRowsHtml(personalGroup);
    bindCardActions(container, personalGroup, true);
  }

  function renderSharedGroups(container, sharedGroups){
    const wrap = container.querySelector('#sharedGroupsWrap');
    if(!sharedGroups.length){
      wrap.innerHTML = `
        <div class="card empty-state">
          <div class="es-title">No shared groups yet</div>
          <div class="es-sub">Create a group for family, roommates, or a trip to start tracking shared expenses.</div>
          <button class="btn btn-primary" id="createGroupEmptyBtn">+ Create your first group</button>
        </div>
      `;
      wrap.querySelector('#createGroupEmptyBtn').onclick = openCreateGroupModal;
      return;
    }
    wrap.innerHTML = sharedGroups.map(g => groupCardShell(g, false)).join('');
    sharedGroups.forEach(g => {
      wrap.querySelector(`#memberList-${g.id}`).innerHTML = memberRowsHtml(g);
      bindCardActions(container, g, false);
    });
  }

  function bindCardActions(container, group, isPersonal){
    const setActiveBtn = container.querySelector(`[data-setactive="${group.id}"]`);
    if(setActiveBtn) setActiveBtn.onclick = ()=>{ State.setActiveGroup(group.id); Toast.show(`${group.name} is now active`); };

    const renameBtn = container.querySelector(`[data-rename="${group.id}"]`);
    if(renameBtn) renameBtn.onclick = ()=> openRenameModal(group);

    const delBtn = container.querySelector(`[data-delgroup="${group.id}"]`);
    if(delBtn) delBtn.onclick = ()=>{
      Modal.confirm({
        title: `Delete "${U.escapeHtml(group.name)}"?`,
        body: 'This removes the group and its member list. It does not delete any expenses.',
        confirmText: 'Delete', danger: true,
        onConfirm: ()=>{ State.deleteGroup(group.id); Toast.show('Group deleted'); }
      });
    };

    const addMemberBtn = container.querySelector(`[data-addmember="${group.id}"]`);
    if(addMemberBtn) addMemberBtn.onclick = ()=> openAddMemberModal(group);

    container.querySelectorAll(`#memberList-${group.id} [data-removemember]`).forEach(btn=>{
      btn.onclick = ()=>{
        const memberId = btn.getAttribute('data-removemember');
        const member = State.membersForGroup(group.id).find(m=>m.id===memberId);
        const name = member ? State.userName(member.userId) : 'this member';
        Modal.confirm({
          title: `Remove ${U.escapeHtml(name)}?`,
          body: 'They will no longer be part of this group. Past expenses are not affected.',
          confirmText: 'Remove', danger: true,
          onConfirm: ()=>{ State.removeGroupMember(memberId); Toast.show('Member removed'); }
        });
      };
    });
  }

  function openCreateGroupModal(){
    Modal.open(`
      <div class="modal-title">Create group</div>
      <div class="field">
        <label>Group name</label>
        <input type="text" id="groupNameInput" placeholder="e.g. Family, Roommates, Goa Trip">
        <div class="field-error" id="groupNameErr">Enter a group name.</div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="groupCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="groupCreateBtn">Create group</button>
      </div>
    `);
    document.getElementById('groupCancelBtn').onclick = Modal.close;
    document.getElementById('groupCreateBtn').onclick = ()=>{
      const name = document.getElementById('groupNameInput').value.trim();
      const err = document.getElementById('groupNameErr');
      if(!name){ err.classList.add('show'); document.getElementById('groupNameInput').classList.add('invalid'); return; }
      State.addGroup(name);
      Toast.show('Group created');
      Modal.close();
    };
  }

  function openRenameModal(group){
    Modal.open(`
      <div class="modal-title">Rename group</div>
      <div class="field">
        <label>Group name</label>
        <input type="text" id="groupRenameInput" value="${U.escapeHtml(group.name)}">
        <div class="field-error" id="groupRenameErr">Enter a group name.</div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="groupRenameCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="groupRenameSaveBtn">Save</button>
      </div>
    `);
    document.getElementById('groupRenameCancelBtn').onclick = Modal.close;
    document.getElementById('groupRenameSaveBtn').onclick = ()=>{
      const name = document.getElementById('groupRenameInput').value.trim();
      const err = document.getElementById('groupRenameErr');
      if(!name){ err.classList.add('show'); document.getElementById('groupRenameInput').classList.add('invalid'); return; }
      State.renameGroup(group.id, name);
      Toast.show('Group renamed');
      Modal.close();
    };
  }

  function openAddMemberModal(group){
    Modal.open(`
      <div class="modal-title">Add member to ${U.escapeHtml(group.name)}</div>
      <div class="field">
        <label>Member name</label>
        <input type="text" id="memberNameInput" placeholder="e.g. Priya">
        <div class="field-error" id="memberNameErr">Enter a name.</div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="memberCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="memberAddBtn">Add member</button>
      </div>
    `);
    document.getElementById('memberCancelBtn').onclick = Modal.close;
    document.getElementById('memberAddBtn').onclick = ()=>{
      const name = document.getElementById('memberNameInput').value.trim();
      const err = document.getElementById('memberNameErr');
      if(!name){ err.classList.add('show'); document.getElementById('memberNameInput').classList.add('invalid'); return; }
      State.addGroupMember(group.id, name);
      Toast.show(`${name} added to ${group.name}`);
      Modal.close();
    };
  }

  return { render, title: 'Groups' };
})();
