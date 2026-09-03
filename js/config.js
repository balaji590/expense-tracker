/* AppConfig: the ONE place repository mode is decided. state.js reads this
 * once to pick LocalRepository or ApiRepository — nothing else in the app
 * branches on mode.
 *
 * There's no build step / real environment variables in this static app, so
 * a runtime override (localStorage, never committed/shared) stands in for
 * what would be an env var in a built app. It always defaults to 'local' —
 * the existing application must never be silently affected by this file
 * existing, and API mode must always be an explicit, deliberate choice:
 *
 *   localStorage.setItem('et_repository_mode', 'api')
 *   localStorage.setItem('et_api_base_url', 'http://localhost:3001/api') // optional, has a sensible default
 */
window.AppConfig = (function(){
  const DEFAULT_MODE = 'local';
  const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';

  // The real, publicly-hosted deployment of this app should default to
  // cloud mode for a brand-new visitor (there's no "existing local-mode
  // user" to disrupt on a domain nobody has ever visited before, and local
  // mode fundamentally can't do anything this product is now built
  // around — sharing, invitations). Everywhere else (file://, localhost
  // during development/testing) keeps the safe 'local' default this
  // entire codebase's test suite already relies on.
  const PRODUCTION_HOSTNAMES = ['expensetracker-balaji590.netlify.app'];
  const PRODUCTION_API_BASE_URL = 'https://expense-tracker-ugzg.onrender.com/api';

  function isProductionHost(){
    return PRODUCTION_HOSTNAMES.includes(window.location.hostname);
  }

  function repositoryMode(){
    const override = window.localStorage.getItem('et_repository_mode');
    if(override === 'api') return 'api';
    if(override === 'local') return 'local';
    return isProductionHost() ? 'api' : DEFAULT_MODE;
  }

  function apiBaseUrl(){
    const override = window.localStorage.getItem('et_api_base_url');
    if(override) return override;
    return isProductionHost() ? PRODUCTION_API_BASE_URL : DEFAULT_API_BASE_URL;
  }

  return { repositoryMode, apiBaseUrl };
})();
