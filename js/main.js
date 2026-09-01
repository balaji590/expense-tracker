(function(){
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if(icon) icon.textContent = theme==='dark' ? '☀' : '☾';
    if(label) label.textContent = theme==='dark' ? 'Light mode' : 'Dark mode';
  }

  function showAppShell(){
    document.querySelector('.app-shell').classList.remove('hidden');
    document.getElementById('publicRoot').classList.add('hidden');
  }
  function showPublicShell(){
    document.querySelector('.app-shell').classList.add('hidden');
    document.getElementById('publicRoot').classList.remove('hidden');
  }

  function renderBootError(err){
    // Local-mode-equivalent hard failure (e.g. a genuine network error while
    // already authenticated) — kept as a last-resort fallback distinct from
    // the "not authenticated yet" path, which now goes to the public shell
    // instead of this generic message.
    const message = 'Could not load your data. Please check your connection and try again.';
    document.body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:-apple-system,sans-serif; text-align:center; padding:24px; background:#f5f6f8; color:#14171a;">
        <div style="max-width:440px;">
          <h1 style="font-size:19px; margin:0 0 10px;">Something went wrong</h1>
          <p style="color:#5b6169; font-size:14px; line-height:1.5; margin:0;">${message}</p>
        </div>
      </div>
    `;
  }

  // Injects a small account/logout area into the app sidebar — only ever
  // called in API mode once a real authenticated user is known. Local mode
  // has no "account" concept at all, so this is never invoked there.
  function renderAccountMenu(user){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar || document.getElementById('accountMenu')) return;
    const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
    const wrap = document.createElement('div');
    wrap.className = 'account-menu';
    wrap.id = 'accountMenu';
    wrap.innerHTML = `
      <div class="account-menu-user">
        <span class="account-menu-avatar">${Utils.escapeHtml(initial)}</span>
        <span class="account-menu-email" title="${Utils.escapeHtml(user.email)}">${Utils.escapeHtml(user.email)}</span>
      </div>
      <button class="account-menu-logout" id="accountLogoutBtn">Log out</button>
    `;
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.parentNode.insertBefore(wrap, themeToggle);
    document.getElementById('accountLogoutBtn').onclick = async ()=>{
      try{ await ApiClient.request('/auth/logout', { method: 'POST' }); }catch(e){ /* clearing local state regardless is still correct */ }
      location.hash = '#/landing';
      location.reload();
    };
  }

  function wireAppShellChrome(){
    const theme = State.data.settings.theme || 'light';
    applyTheme(theme);

    document.getElementById('themeToggle').onclick = ()=>{
      const next = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
      applyTheme(next);
      State.setSetting('theme', next);
      Router.render();
    };
    document.getElementById('menuBtn').onclick = ()=>{
      document.getElementById('sidebar').classList.toggle('open');
    };
    document.getElementById('quickAddBtn').onclick = ()=> Pages.expenses.openAddModal();
  }

  // Full existing boot path — unchanged behavior from before this phase.
  // Used for: local mode (always), and API mode once a user is confirmed
  // authenticated.
  async function bootAppShellWithData(){
    try{
      await State.load();
    }catch(err){
      console.warn('Failed to load application data:', err.message);
      renderBootError(err);
      return;
    }
    showAppShell();
    wireAppShellChrome();
    Router.init();
  }

  // Lighter path for #/accept-invite specifically: that page is fully
  // self-contained (previewInvitation is public, whoAmI tolerates being
  // unauthenticated) and needs none of State.load()'s collections — so an
  // unauthenticated visitor who clicks a real invitation link can reach it
  // without first satisfying the full API-mode auth gate. Still renders
  // inside the normal app shell (sidebar/topbar) rather than inventing a
  // second layout, since that's the least risk to "must continue working."
  async function bootAppShellForAcceptInvite(){
    showAppShell();
    wireAppShellChrome();
    Router.init();
  }

  function currentHashRouteKey(){
    const raw = location.hash.replace('#/', '') || '';
    return raw.split('?')[0];
  }

  // ---- Public shell: landing / sign in / create account ----
  function renderPublicRoute(){
    const routeKey = currentHashRouteKey();
    const container = document.getElementById('publicRoot');
    if(routeKey === 'signin'){
      Pages.auth.render(container, 'signin');
    } else if(routeKey === 'create-account'){
      Pages.auth.render(container, 'create');
    } else {
      Pages.landing.render(container);
    }
    window.scrollTo(0, 0);
  }

  function bootPublicShell(){
    showPublicShell();
    // Normalize an empty/unrecognized hash to the landing page without
    // fighting the app Router (which is never initialized in this path).
    const routeKey = currentHashRouteKey();
    if(!['landing', 'signin', 'create-account'].includes(routeKey)){
      location.hash = '#/landing';
    }
    renderPublicRoute();
    window.addEventListener('hashchange', renderPublicRoute);
  }

  function renderInvitationRequiresCloudMode(){
    const container = document.getElementById('publicRoot');
    showPublicShell();
    container.innerHTML = `
      <div class="lp-auth-wrap">
        <div class="lp-auth-card">
          <a href="#/landing" class="lp-auth-brand"><span class="lp-brand-mark">E</span>ExpenseTracker</a>
          <h1>This invitation needs cloud mode</h1>
          <p>Group invitations are a cloud feature. This browser is currently set to local (offline) mode, which never touches a server or shares data.</p>
          <button class="lp-btn lp-btn-primary" id="enableCloudModeBtn" style="width:100%;">Switch to cloud mode &amp; continue</button>
          <div class="lp-auth-status" id="cloudModeStatus"></div>
        </div>
      </div>
    `;
    document.getElementById('enableCloudModeBtn').onclick = ()=>{
      // Deliberate, explicit, user-initiated switch -- never silent. Local
      // mode's own data is untouched either way (see Phase 5.4/5.5's
      // localStorage-safety guarantees).
      localStorage.setItem('et_repository_mode', 'api');
      location.reload();
    };
  }

  async function init(){
    const mode = AppConfig.repositoryMode();
    const routeKey = currentHashRouteKey();

    if(routeKey === 'accept-invite' && mode === 'local'){
      // Invitations are inherently an API-only concept -- local mode has no
      // server and no other identity to share a group with. Rather than
      // silently flipping the user's mode (explicitly disallowed), offer a
      // clear, honest, one-click opt-in.
      renderInvitationRequiresCloudMode();
      return;
    }

    if(mode === 'local'){
      // Local mode has no authentication concept at all -- identical to
      // every prior phase's behavior, completely untouched by this one.
      await bootAppShellWithData();
      return;
    }

    if(routeKey === 'accept-invite'){
      await bootAppShellForAcceptInvite();
      return;
    }

    // API mode: resolve auth status exactly once at startup. No polling,
    // no repeated /me calls, no reload loops -- a single check decides
    // which shell to show for this page load.
    let me = null;
    try{ me = await State.whoAmI(); }catch(e){ me = null; }

    if(me){
      await bootAppShellWithData();
      // Account menu needs the sidebar to exist first (bootAppShellWithData
      // -> showAppShell already ran by the time we get here).
      renderAccountMenu(me);
    } else {
      bootPublicShell();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
