# Repository layer (Phase 5.3 -> Phase 5.4)

## Data flow

**Local mode (default -- always the fallback unless explicitly configured otherwise):**

```
Page -> State -> LocalRepository -> Storage -> localStorage
```

**API mode (Phase 5.4 proof-of-concept -- Personal expenses only):**

```
Page -> State -> ApiRepository -> Node.js API -> PostgreSQL   (for expenses)
Page -> State -> ApiRepository -> LocalRepository -> Storage -> localStorage  (for everything else)
```

Only one line in `state.js` changes to move from one to the other, and
it's decided by `js/config.js` (`AppConfig.repositoryMode()`), which
always defaults to `'local'`:

```js
const repository = (window.AppConfig && window.AppConfig.repositoryMode() === 'api')
  ? window.ApiRepository
  : window.LocalRepository;
```

To enable API mode for local testing:

```js
localStorage.setItem('et_repository_mode', 'api');
localStorage.setItem('et_api_base_url', 'http://localhost:3001/api'); // optional, this is the default
location.reload();
```

localStorage is never touched by this switch -- nothing is uploaded or
deleted automatically. See `backend/README.md`'s "Personal Expense API"
section for the full walkthrough (obtaining a session, running the
backend, IDOR protection, data mapping).

## Why this split

- **`Repository`** (`js/repositories/repository.js`) is the contract every
  implementation must satisfy: `init()`, `getAll(key, fallback)`,
  `save(key, value)` -- that's the base contract, exactly what any
  localStorage-backed collection needs. Phase 5.4 adds an **optional**
  extension -- `addItem(key, item)`, `updateItem(key, id, patch)`,
  `removeItem(key, id)` -- used only by collections that need item-level
  operations (expenses, so far). This was a genuinely necessary addition,
  not scope creep: once a collection is backed by a real REST API, resending
  the *entire* collection on every single add/edit/delete (the plain
  `save()` semantic) would be wasteful, wrong for a POST-one/PUT-one/
  DELETE-one API design, and unable to receive back server-authoritative
  `id`/`createdAt`/`updatedAt` for just the one record that changed. Every
  other collection keeps using plain `save()` exactly as before.
- **`LocalRepository`** implements both the base and item-level contract
  on top of the existing `Storage` module -- no persistence logic of its
  own, `Storage` remains the only code that touches `localStorage`. Its
  item-level methods do a synchronous read-modify-write via `getAll`/`save`
  and return `null` (nothing "authoritative" to hand back -- the caller,
  `State`, already assigned `id`/`createdAt` exactly as it always has).
- **`ApiRepository`** implements the identical contract shape. Only
  Personal expenses are API-backed in this phase -- every other key
  (`categories`, `budgets`, `recurring`, `groups`, `groupMembers`,
  `settlements`, `settings`) delegates straight to `LocalRepository`,
  unchanged. Its item-level methods send real `POST`/`PUT`/`DELETE`
  requests via `ApiClient` and return the server's authoritative response,
  with `groupId`/`addedBy`/`paidBy` explicitly remapped from the server's
  real UUIDs back to the frontend's fixed Personal-mode constants
  (`Storage.PERSONAL_GROUP_ID`/`Storage.PERSONAL_USER_ID`) -- every existing
  page compares against those constants, so this mapping is what lets the
  rest of the app stay completely unaware a real backend identity exists
  underneath.
- **`ApiClient`** (`js/repositories/apiClient.js`) is the single
  centralized place any `fetch()` call to the backend happens -- no page
  and no other repository file calls `fetch()` directly. It maps HTTP
  status codes (401/403/404/409/422/429/5xx/network failure) to a small
  `ApiError` shape with a safe, generic message, never leaking backend
  internals. Authentication is exclusively the existing HttpOnly session
  cookie (`credentials: 'include'`) -- no token is ever read, stored, or
  passed through JavaScript, `localStorage`, or `sessionStorage`.
- **`State`** depends only on the `Repository` contract, never on
  `Storage`, `localStorage`, or `fetch` directly, and never knows which
  concrete implementation is active.
- **Pages** depend only on `State`, exactly as before every one of these
  phases. No page imports `Repository`, `LocalRepository`, `ApiRepository`,
  `ApiClient`, or `AppConfig` -- verified by source inspection as part of
  this phase's tests.

## What's async now, and why only that

`State.load()` and every mutation method (`addExpense`, `updateExpense`,
`addGroup`, `addSettlement`, etc.) are `async` -- they persist through the
Promise-based repository. Pure read-only getters (`categoryById`,
`activeGroupId`, `getExpensesForGroup`, `membersForGroup`, and so on) stay
synchronous, since they only read already-loaded in-memory data and touch
no repository call at all.

No page had to add `await` anywhere, in Phase 5.3 or Phase 5.4. Every
mutation method performs its actual `data` mutation *before* its first
`await` -- JS runs an async function's body synchronously up to that point
regardless of whether the caller awaits the call -- and no existing page
call site ever captured a mutation method's return value (confirmed by
inspection before writing any code, both phases). `main.js` awaits
`State.load()` before `Router.init()` runs, and now also handles that call
failing gracefully (e.g. an unauthenticated API-mode session) with a clear
message instead of a blank page or an uncaught rejection -- still no Login
UI, per the Phase 5.4 scope boundary.
