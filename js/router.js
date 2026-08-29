window.Router = (function(){
  const routes = {
    dashboard: () => Pages.dashboard,
    expenses: () => Pages.expenses,
    calculator: () => Pages.calculator,
    categories: () => Pages.categories,
    groups: () => Pages.groups,
    analytics: () => Pages.analytics,
    compare: () => Pages.compare,
    budgets: () => Pages.budgets,
    recurring: () => Pages.recurring,
    settings: () => Pages.settings
  };

  function currentRoute(){
    const hash = location.hash.replace('#/', '') || 'dashboard';
    return routes[hash] ? hash : 'dashboard';
  }

  let lastRenderedRoute = null;

  function render(){
    const routeKey = currentRoute();
    const isNewRoute = routeKey !== lastRenderedRoute;
    lastRenderedRoute = routeKey;

    const page = routes[routeKey]();
    const main = document.getElementById('mainContent');
    document.getElementById('pageTitle').textContent = page.title;
    main.classList.remove('page-enter');
    page.render(main, isNewRoute);
    // restart the entrance animation on every render (route change or state update)
    void main.offsetWidth;
    main.classList.add('page-enter');

    document.querySelectorAll('.nav-item, .bn-item').forEach(a=>{
      a.classList.toggle('active', a.getAttribute('data-route') === routeKey);
    });

    // close mobile sidebar drawer if open
    document.getElementById('sidebar').classList.remove('open');
    window.scrollTo(0,0);
  }

  function init(){
    window.addEventListener('hashchange', render);
    State.onChange(()=>{
      // re-render current page whenever state changes, so all views stay in sync
      render();
    });
    render();
  }

  return { init, render };
})();
