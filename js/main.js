(function(){
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIcon').textContent = theme==='dark' ? '☀' : '☾';
    document.getElementById('themeLabel').textContent = theme==='dark' ? 'Light mode' : 'Dark mode';
  }

  function renderBootError(err){
    const isAuthError = err && err.code === 'unauthorized';
    const message = isAuthError
      ? "This app is running in API mode and requires you to be signed in. There's no login page in this proof-of-concept yet — obtain a session via the backend's magic-link flow (see backend/README.md), then reload this page."
      : 'Could not load your data. Please check your connection and try again.';
    document.body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:-apple-system,sans-serif; text-align:center; padding:24px; background:#f5f6f8; color:#14171a;">
        <div style="max-width:440px;">
          <h1 style="font-size:19px; margin:0 0 10px;">Sign-in required</h1>
          <p style="color:#5b6169; font-size:14px; line-height:1.5; margin:0;">${message}</p>
        </div>
      </div>
    `;
  }

  async function init(){
    // State.load() now goes through the Repository (which calls Storage.init()
    // internally) — main.js no longer needs to call Storage.init() directly.
    // In API mode, this can genuinely fail (e.g. no session yet) — fail
    // gracefully with a clear message rather than a blank page or an
    // uncaught rejection.
    try{
      await State.load();
    }catch(err){
      console.warn('Failed to load application data:', err.message);
      renderBootError(err);
      return;
    }

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

    Router.init();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
