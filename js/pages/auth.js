window.Pages = window.Pages || {};
window.Pages.auth = (function(){
  const U = Utils;

  function render(container, mode){
    const isCreate = mode === 'create';
    container.innerHTML = `
      <div class="lp-auth-wrap">
        <div class="lp-auth-card">
          <a href="#/landing" class="lp-auth-brand"><span class="lp-brand-mark">E</span>ExpenseTracker</a>
          <h1>${isCreate ? 'Create your account' : 'Welcome back'}</h1>
          <p>${isCreate
            ? "Enter your email and we'll send you a secure magic link — no password to create or remember."
            : 'Sign in securely using a magic link sent to your email.'}</p>
          <div class="lp-field">
            <label for="authEmailInput">Email address</label>
            <input type="email" id="authEmailInput" placeholder="you@example.com" autocomplete="email">
          </div>
          <button class="lp-btn lp-btn-primary" id="authSubmitBtn" style="width:100%;">${isCreate ? 'Create Account' : 'Send Magic Link'}</button>
          <div class="lp-auth-status" id="authStatus"></div>
          <div class="lp-auth-switch">
            ${isCreate
              ? `Already have an account? <a href="#/signin" id="authSwitchLink">Sign in</a>`
              : `New here? <a href="#/create-account" id="authSwitchLink">Create an account</a>`}
          </div>
        </div>
      </div>
    `;
    bind(container, isCreate);
  }

  function bind(container, isCreate){
    const emailInput = container.querySelector('#authEmailInput');
    const statusEl = container.querySelector('#authStatus');
    const submitBtn = container.querySelector('#authSubmitBtn');

    container.querySelector('#authSwitchLink').onclick = (e)=>{
      e.preventDefault();
      location.hash = isCreate ? '#/signin' : '#/create-account';
    };

    submitBtn.onclick = async ()=>{
      const email = emailInput.value.trim();
      if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        statusEl.className = 'lp-auth-status lp-error';
        statusEl.textContent = 'Please enter a valid email address.';
        return;
      }
      submitBtn.disabled = true;
      statusEl.className = 'lp-auth-status';
      statusEl.textContent = 'Sending…';
      try{
        const result = await State.requestSignInLink(email);
        statusEl.className = 'lp-auth-status lp-success';
        if(result && result.devMagicLink){
          statusEl.innerHTML = `
            Development mode — no real email is sent yet.
            <div class="lp-dev-link-box">
              <a href="${result.devMagicLink}" target="_blank" rel="noopener" id="authDevLink">Click here to sign in</a>, then come back and press Continue.
            </div>
            <button class="lp-btn lp-btn-ghost lp-btn-sm" id="authContinueBtn" style="margin-top:14px;">I've signed in — Continue</button>
          `;
          container.querySelector('#authContinueBtn').onclick = ()=>{
            location.reload();
          };
        } else {
          statusEl.textContent = 'Check your email for a sign-in link.';
        }
      }catch(e){
        statusEl.className = 'lp-auth-status lp-error';
        statusEl.textContent = (e && e.message) || 'Could not send a sign-in link. Please try again.';
      } finally {
        submitBtn.disabled = false;
      }
    };

    emailInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') submitBtn.click(); });
  }

  return { render };
})();
