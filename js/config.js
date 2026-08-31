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

  function repositoryMode(){
    const override = window.localStorage.getItem('et_repository_mode');
    return override === 'api' ? 'api' : DEFAULT_MODE;
  }

  function apiBaseUrl(){
    return window.localStorage.getItem('et_api_base_url') || DEFAULT_API_BASE_URL;
  }

  return { repositoryMode, apiBaseUrl };
})();
