(function(){
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIcon').textContent = theme==='dark' ? '☀' : '☾';
    document.getElementById('themeLabel').textContent = theme==='dark' ? 'Light mode' : 'Dark mode';
  }

  async function init(){
    // State.load() now goes through the Repository (which calls Storage.init()
    // internally) — main.js no longer needs to call Storage.init() directly.
    await State.load();

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
