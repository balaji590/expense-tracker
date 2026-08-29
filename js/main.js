(function(){
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIcon').textContent = theme==='dark' ? '☀' : '☾';
    document.getElementById('themeLabel').textContent = theme==='dark' ? 'Light mode' : 'Dark mode';
  }

  function init(){
    Storage.init();
    State.load();

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
