# Repository layer (Phase 5.3)

## Data flow

**Current (this phase and until a real backend is connected):**

```
Page → State → LocalRepository → Storage → localStorage
```

**Future (once Phase 5.4+ connects the backend):**

```
Page → State → ApiRepository → Backend (Express) → PostgreSQL
```

Only one line in `state.js` changes to move from one to the other:

```js
const repository = window.LocalRepository; // becomes window.ApiRepository later
```

Nothing else — not `State`'s public API, not any page, not `router.js` —
needs to change for that swap, which is the entire point of this layer
existing.

## Why this split

- **`Repository`** (`js/repositories/repository.js`) is the contract every
  implementation must satisfy: `init()`, `getAll(key, fallback)`,
  `save(key, value)`. That's the *entire* contract, deliberately small —
  it's exactly what `State` actually needs, derived from how it already
  used `Storage` before this phase (read a whole collection, write a whole
  collection, initialize once at boot). Every method returns a `Promise`,
  even though `LocalRepository` resolves them synchronously under the hood
  today — that's what lets a future `ApiRepository` implement the same
  shape with real network calls.
- **`LocalRepository`** (`js/repositories/localRepository.js`) implements
  that contract on top of the existing `Storage` module. It adds no
  persistence logic of its own — `Storage` remains the only code that ever
  touches `localStorage` directly. This file is purely an adapter.
- **`State`** (`js/state.js`) depends only on the `Repository` contract,
  never on `Storage` or `localStorage` directly, and never knows which
  concrete implementation is active.
- **Pages** depend only on `State`, exactly as before this phase. No page
  imports `Repository` or `LocalRepository`, and no page calls
  `Storage.read`/`Storage.write` directly — verified by source inspection
  as part of this phase's tests.

## What's async now, and why only that

`State.load()` and every mutation method (`addExpense`, `updateExpense`,
`addGroup`, `addSettlement`, etc.) are now `async` — they persist through
the Promise-based repository. Pure read-only getters (`categoryById`,
`activeGroupId`, `getExpensesForGroup`, `membersForGroup`, and so on) stay
synchronous, since they only read already-loaded in-memory data and touch
no repository call at all — converting them would have been exactly the
"unnecessary async complexity" this phase was asked to avoid.

No page had to add `await` anywhere. Every mutation method performs its
actual `data` mutation *before* its first `await` — JS runs an async
function's body synchronously up to that point regardless of whether the
caller awaits the call — and no existing page call site ever captured a
mutation method's return value (confirmed by inspection before writing any
code). The one real call-site change was `main.js`, which now `await`s
`State.load()` before `Router.init()` runs, since the app's initial data
genuinely must exist before the first render.
