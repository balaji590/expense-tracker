window.Router = (function(){
  const routes = {
    dashboard: () => Pages.dashboard,
    expenses: () => Pages.expenses,
    calculator: () => Pages.calculator,
    categories: () => Pages.categories,
    groups: () => Pages.groups,
    'settle-up': () => Pages.settleUp,
    analytics: () => Pages.analytics,
    compare: () => Pages.compare,
    budgets: () => Pages.budgets,
    recurring: () => Pages.recurring,
    settings: () => Pages.settings,
    'accept-invite': () => Pages.acceptInvite
  };

  function currentRoute(){
    const raw = location.hash.replace('#/', '') || 'dashboard';
    const routeKey = raw.split('?')[0];
    return routes[routeKey] ? routeKey : 'dashboard';
  }

  // Minimal query-string support for routes that need a parameter in the
  // link itself (e.g. #/accept-invite?token=...) — location.hash has no
  // built-in query parsing, since everything after '#' is normally just a
  // route name in this app.
  function currentQuery(){
    const raw = location.hash.replace('#/', '');
    const queryString = raw.includes('?') ? raw.split('?')[1] : '';
    return new URLSearchParams(queryString);
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

  return { init, render, currentQuery };
})();
