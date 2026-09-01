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

  // isOwner is computed from already-loaded State data (no extra fetch) —
  // needed here because the cloud-mode "Invite member" / pending-invitations
  // section is owner-only, and the server enforces this too (never trusted
  // from this UI check alone).
  function isOwnerOfGroup(groupId){
    const members = State.membersForGroup(groupId);
    const mine = members.find(m => m.userId === Storage.PERSONAL_USER_ID);
    return !!(mine && mine.role === 'owner');
  }

  function groupCardShell(group, isPersonal){
    const st = State;
    const isActive = st.activeGroupId() === group.id;
    const cloud = st.isCloudMode();
    const showInvite = !isPersonal && cloud && isOwnerOfGroup(group.id);
    const showAddByName = !isPersonal && !cloud;
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
            ${!isPersonal ? `<button class="btn btn-sm" data-viewbalances="${group.id}">View balances</button>` : ''}
            ${!isPersonal ? `<button class="btn btn-sm" data-rename="${group.id}">Rename</button>` : ''}
            ${!isPersonal ? `<button class="btn btn-sm btn-danger" data-delgroup="${group.id}">Delete</button>` : ''}
          </div>
        </div>
        <div id="memberList-${group.id}"></div>
        ${showInvite ? `<div id="pendingInvites-${group.id}" style="margin-top:10px;"></div>` : ''}
        ${showAddByName ? `<button class="btn btn-sm" style="margin-top:12px;" data-addmember="${group.id}">+ Add member</button>` : ''}
        ${showInvite ? `<button class="btn btn-sm" style="margin-top:12px;" data-invitemember="${group.id}">+ Invite member</button>` : ''}
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

  // Cloud-mode-only, owner-only. Fetches asynchronously (a real network
  // call) after the card's own synchronous HTML is already in place —
  // shows a lightweight "Loading…" placeholder in the meantime, exactly
  // the pattern this page didn't previously need since everything else it
  // shows comes from already-loaded local State.
  async function renderPendingInvitations(container, group){
    const wrap = container.querySelector(`#pendingInvites-${group.id}`);
    if(!wrap) return;
    wrap.innerHTML = `<div class="stat-sub">Loading pending invitations…</div>`;
    let invitations;
    try{
      invitations = await State.listPendingInvitations(group.id);
    }catch(e){
      wrap.innerHTML = `<div class="stat-sub">Could not load pending invitations.</div>`;
      return;
    }
    if(!invitations.length){
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <div class="stat-sub" style="margin-bottom:6px;">Pending invitations</div>
      ${invitations.map(inv => `
        <div class="save-row">
          <div style="font-size:13.5px;">${U.escapeHtml(inv.email)}</div>
          <button class="btn btn-sm btn-danger" data-revokeinvite="${inv.id}" data-revokegroup="${group.id}">Revoke</button>
        </div>
      `).join('')}
    `;
    wrap.querySelectorAll('[data-revokeinvite]').forEach(btn=>{
      btn.onclick = ()=>{
        const invitationId = btn.getAttribute('data-revokeinvite');
        const groupId = btn.getAttribute('data-revokegroup');
        Modal.confirm({
          title: 'Revoke this invitation?',
          body: 'The invitation link will stop working immediately.',
          confirmText: 'Revoke', danger: true,
          onConfirm: ()=>{
            State.revokeInvitation(groupId, invitationId).then(()=>{
              Toast.show('Invitation revoked');
              renderPendingInvitations(container, group);
            }).catch(e=>{
              Toast.show((e && e.message) || 'Could not revoke invitation.');
            });
          }
        });
      };
    });
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
      if(State.isCloudMode() && isOwnerOfGroup(g.id)){
        renderPendingInvitations(container, g);
      }
    });
  }

  function bindCardActions(container, group, isPersonal){
    const setActiveBtn = container.querySelector(`[data-setactive="${group.id}"]`);
    if(setActiveBtn) setActiveBtn.onclick = ()=>{ State.setActiveGroup(group.id); Toast.show(`${group.name} is now active`); };

    const viewBalancesBtn = container.querySelector(`[data-viewbalances="${group.id}"]`);
    if(viewBalancesBtn) viewBalancesBtn.onclick = ()=>{
      State.setActiveGroup(group.id);
      location.hash = '#/settle-up';
    };

    const renameBtn = container.querySelector(`[data-rename="${group.id}"]`);
    if(renameBtn) renameBtn.onclick = ()=> openRenameModal(group);

    const delBtn = container.querySelector(`[data-delgroup="${group.id}"]`);
    if(delBtn) delBtn.onclick = ()=>{
      Modal.confirm({
        title: `Delete "${U.escapeHtml(group.name)}"?`,
        body: 'This removes the group and its member list. It does not delete any expenses.',
        confirmText: 'Delete', danger: true,
        onConfirm: ()=>{
          State.deleteGroup(group.id).then(()=>{
            Toast.show('Group deleted');
          }).catch(e=>{
            Toast.show((e && e.message) || 'Could not delete group. Please try again.');
          });
        }
      });
    };

    const addMemberBtn = container.querySelector(`[data-addmember="${group.id}"]`);
    if(addMemberBtn) addMemberBtn.onclick = ()=> openAddMemberModal(group);

    const inviteMemberBtn = container.querySelector(`[data-invitemember="${group.id}"]`);
    if(inviteMemberBtn) inviteMemberBtn.onclick = ()=> openInviteMemberModal(container, group);

    container.querySelectorAll(`#memberList-${group.id} [data-removemember]`).forEach(btn=>{
      btn.onclick = ()=>{
        const memberId = btn.getAttribute('data-removemember');
        const member = State.membersForGroup(group.id).find(m=>m.id===memberId);
        const name = member ? State.userName(member.userId) : 'this member';

        // Balance-aware warning: only shown here, in the removal confirmation
        // itself — never as a passive indicator elsewhere on this page.
        let warningBody = 'They will no longer be part of this group. Past expenses are not affected.';
        if(member){
          const allMembers = State.membersForBalances(group.id);
          const expenses = State.getExpensesForGroup(group.id);
          const settlements = State.getSettlementsForGroup(group.id);
          const balances = Balances.balancesForGroup(allMembers, expenses, settlements);
          const bal = balances.find(b=>b.memberId===memberId);
          if(bal && bal.balancePaise !== 0){
            const balText = bal.balancePaise > 0
              ? `is owed ${U.fmtMoney(bal.balance)}`
              : `owes ${U.fmtMoney(Math.abs(bal.balance))}`;
            warningBody = `${U.escapeHtml(name)} currently ${balText} in this group. You can still settle this from Settle Up after removing them. Past expenses are not affected.`;
          }
        }

        Modal.confirm({
          title: `Remove ${U.escapeHtml(name)}?`,
          body: warningBody,
          confirmText: 'Remove', danger: true,
          onConfirm: ()=>{
            State.removeGroupMember(memberId).then(()=>{
              Toast.show('Member removed');
            }).catch(e=>{
              Toast.show((e && e.message) || 'Could not remove member. Please try again.');
            });
          }
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
      State.addGroup(name).then(()=>{
        Toast.show('Group created');
        Modal.close();
      }).catch(e=>{
        Toast.show((e && e.message) || 'Could not create group. Please try again.');
      });
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
      State.renameGroup(group.id, name).then(()=>{
        Toast.show('Group renamed');
        Modal.close();
      }).catch(e=>{
        Toast.show((e && e.message) || 'Could not rename group. Please try again.');
      });
    };
  }

  // Local mode only — unchanged from before Phase 5.6.
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
      State.addGroupMember(group.id, name).then(()=>{
        Toast.show(`${name} added to ${group.name}`);
        Modal.close();
      }).catch(e=>{
        Toast.show((e && e.message) || 'Could not add member. Please try again.');
      });
    };
  }

  // Cloud mode only (Phase 5.6) — replaces "add by name" with a real
  // email-based invitation. The identity is only ever created/located when
  // the recipient actually authenticates with that email (existing magic-
  // link flow) — this modal never creates a User itself.
  function openInviteMemberModal(container, group){
    Modal.open(`
      <div class="modal-title">Invite member to ${U.escapeHtml(group.name)}</div>
      <div class="field">
        <label>Email address</label>
        <input type="email" id="inviteEmailInput" placeholder="e.g. priya@example.com">
        <div class="field-error" id="inviteEmailErr">Enter a valid email address.</div>
      </div>
      <div id="inviteDevLinkWrap"></div>
      <div class="modal-actions">
        <button class="btn" id="inviteCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="inviteSendBtn">Send invitation</button>
      </div>
    `);
    document.getElementById('inviteCancelBtn').onclick = Modal.close;
    document.getElementById('inviteSendBtn').onclick = ()=>{
      const email = document.getElementById('inviteEmailInput').value.trim();
      const err = document.getElementById('inviteEmailErr');
      if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        err.classList.add('show'); document.getElementById('inviteEmailInput').classList.add('invalid'); return;
      }
      err.classList.remove('show');
      State.inviteMember(group.id, email).then((result)=>{
        Toast.show(`Invitation sent to ${email}`);
        if(result && result.devInvitationLink){
          document.getElementById('inviteDevLinkWrap').innerHTML = `
            <div class="stat-sub" style="margin-top:8px;">Development mode — share this link with the recipient:</div>
            <input type="text" readonly value="${U.escapeHtml(result.devInvitationLink)}" style="margin-top:4px;" onclick="this.select()">
          `;
        } else {
          Modal.close();
        }
        renderPendingInvitations(container, group);
      }).catch(e=>{
        err.textContent = (e && e.message) || 'Could not send invitation. Please try again.';
        err.classList.add('show');
      });
    };
  }

  return { render, title: 'Groups' };
})();
