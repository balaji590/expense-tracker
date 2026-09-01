window.Pages = window.Pages || {};
window.Pages.acceptInvite = (function(){
  const U = Utils;

  async function render(container){
    const token = Router.currentQuery().get('token');

    if(!token){
      container.innerHTML = `
        <div class="section-head"><h2>Accept invitation</h2></div>
        <div class="card empty-state">
          <div class="es-title">Invalid invitation link</div>
          <div class="es-sub">This link is missing its invitation token.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-head"><h2>Accept invitation</h2></div>
      <div class="card" id="inviteCard" style="max-width:480px;">
        <div class="stat-sub">Checking invitation…</div>
      </div>
    `;
    const card = container.querySelector('#inviteCard');

    let preview;
    try{
      preview = await State.previewInvitation(token);
    }catch(e){
      card.innerHTML = `
        <div class="es-title">Invitation not available</div>
        <div class="es-sub">${U.escapeHtml((e && e.message) || 'This invitation link is invalid or has expired.')}</div>
      `;
      return;
    }

    let me = null;
    try{ me = await State.whoAmI(); }catch(e){ me = null; }

    if(!me){
      renderSignInPrompt(card, preview);
      return;
    }

    renderAcceptPrompt(card, preview, token);
  }

  function renderSignInPrompt(card, preview){
    card.innerHTML = `
      <div class="modal-title">You've been invited to ${U.escapeHtml(preview.groupName)}</div>
      <p class="stat-sub">Sign in as <b>${U.escapeHtml(preview.email)}</b> to accept this invitation. There's no separate password —
      just request a sign-in link for that email.</p>
      <button class="btn btn-primary" id="inviteSendLinkBtn">Send me a sign-in link</button>
      <div id="inviteSigninStatus" class="stat-sub" style="margin-top:10px;"></div>
    `;
    card.querySelector('#inviteSendLinkBtn').onclick = async ()=>{
      const statusEl = card.querySelector('#inviteSigninStatus');
      statusEl.textContent = 'Sending…';
      try{
        const result = await State.requestSignInLink(preview.email);
        statusEl.innerHTML = result && result.devMagicLink
          ? `Development mode — <a href="${result.devMagicLink}">click here to sign in</a>, then reload this page to continue.`
          : 'Check your email for a sign-in link, then reload this page to continue.';
      }catch(e){
        statusEl.textContent = (e && e.message) || 'Could not send a sign-in link. Please try again.';
      }
    };
  }

  function renderAcceptPrompt(card, preview, token){
    card.innerHTML = `
      <div class="modal-title">You've been invited to ${U.escapeHtml(preview.groupName)}</div>
      <p class="stat-sub">Signed in as ${U.escapeHtml(preview.email)}.</p>
      <button class="btn btn-primary" id="inviteAcceptBtn">Accept invitation</button>
      <div id="inviteAcceptStatus" class="field-error" style="margin-top:10px;"></div>
    `;
    card.querySelector('#inviteAcceptBtn').onclick = async ()=>{
      const statusEl = card.querySelector('#inviteAcceptStatus');
      statusEl.classList.remove('show');
      try{
        await State.acceptInvitation(token);
        Toast.show(`You've joined ${preview.groupName}`);
        location.hash = '#/groups';
      }catch(e){
        statusEl.textContent = (e && e.message) || 'Could not accept this invitation. Please try again.';
        statusEl.classList.add('show');
      }
    };
  }

  return { render, title: 'Accept Invitation' };
})();
