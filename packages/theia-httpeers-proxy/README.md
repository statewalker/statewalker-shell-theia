# @theia-shell/theia-httpeers-proxy

## What it is

A Theia extension that exposes outside HTTP origins to the httpeers mesh
through this browser, and calls other members' proxies. It serves `/proxy` on
this member from a route table, through
[`@theia-shell/theia-httpeers`](../theia-httpeers)'s `MeshContribution`. The
*Mesh Proxy* view edits the table and has a test console.

## Why it exists

An origin that only this browser can reach (a service on its network, or one
that needs a key only this user holds) can then be used by other members of
the mesh, without opening it to the internet. Other members call
`/peers/<this peer>/proxy/<prefix>/…`; the request leaves from this browser.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-httpeers-proxy": "workspace:^"`, next to
`theia-httpeers`. Theia loads it through its `theiaExtensions` entry:
`frontendOnly` → `lib/browser/proxy-frontend-module`.

`main` (`lib/common/index.js`) exports the table and its parts, with no Theia
in them: `createProxyTable`, `validateRoute`, `underMount`, `ProxyTable`,
`NewRoute`; `proxyUpstream`, `rewriteForUpstream`; and the route store
(`StoredRoute`, `RouteStore`, `localStorageRouteStore`, `toStoredRoute`,
`assertNoSecrets`, `SecretNotPersistableError`).

| Contribution | What |
|---|---|
| Mount | `/proxy` on this member, advertised as `{ id: "proxy", kind: "proxy", title: "Proxy" }` while there is at least one route. `/proxy` itself lists the routes. |
| View *Mesh Proxy* (main area) | The route table (prefix, upstream, credential), a form to add a route, and a test console that calls this browser's table in process, or a peer's proxy over the mesh |
| Command | *View: Toggle Mesh Proxy* (also under *View*) |

Build and test: `pnpm --filter @theia-shell/theia-httpeers-proxy build` and
`pnpm --filter @theia-shell/theia-httpeers-proxy test` (15 unit tests: routing
on segment boundaries, header hygiene, secrets never persisted, requests
re-rooted below the mount). The e2e tests are in
[`app/tests/mesh.spec.ts`](../../app/tests/mesh.spec.ts) and
[`app/tests/chat.spec.ts`](../../app/tests/chat.spec.ts).

## Examples

The table on its own, as the mount handler uses it:

```ts
import { createProxyTable, localStorageRouteStore } from "@theia-shell/theia-httpeers-proxy";

const table = createProxyTable({ store: localStorageRouteStore() });
await table.load();
await table.add({
  prefix: "/weather",
  upstream: "https://api.example.com/v1",
  secretHeader: "authorization",
  secretValue: "Bearer …", // kept in memory for this session only
});
const listing = await table.handle(new Request("http://x/")); // {"routes":[{"prefix":"/weather",…}]}
const forecast = await table.handle(new Request("http://x/weather/today")); // → https://api.example.com/v1/today
```

## Internals

### Credential values are never stored

A route may send a credential upstream. The header's *name* is saved with the
route (in `localStorage`, key `theia-shell:proxy:routes`); the *value* is kept
in memory for this session only. `StoredRoute` has no field for a value, and
`save()` refuses one with
`proxy: refusing to persist a credential value for route "<prefix>". …`
(`SecretNotPersistableError`). The listing at `/proxy` shows prefixes, never
headers.

### The mesh's own headers never leave for the upstream

The membership token and the proven peer (`MESH_CREDENTIAL_HEADERS` from
`@statewalker/httpeers-core`) are stripped. `Authorization` belongs to the
application and goes through, unless the route's own credential replaces it.

### Routes match on path segments

A prefix is one or more segments (`/api`, `/api/v1`; letters, digits,
`. _ ~ -`). `/api` matches `/api` and `/api/…`, never `/apix`. A bad route is
refused with `The prefix must be a path like /api or /api/v1 (letters, digits, . _ ~ -), not "<prefix>".`
or `The upstream must be a full URL, not "<upstream>".` A path with no route
answers `404 no route`. The routing is a Hono router, rebuilt when the table
changes.

### Requests are re-rooted below the mount

The member's mount table hands the handler the full path (`/proxy/out/x`).
`underMount` rewrites it to the path below the mount (`/out/x`, and `/` for
the listing) before the table sees it.

### The upstream must answer CORS

The proxy runs in a browser page, so the upstream is fetched by that page and
must answer CORS for the app's origin. Otherwise the fetch fails in the page
and the calling member gets the error.

### Every member may use the proxy

`shellRules()` in `theia-httpeers` grants `app:proxy.use` to every member and
allows `/proxy/…` with it.

### Dependencies

`@statewalker/webrun-http-proxy` (the upstream forwarding),
`@statewalker/httpeers-core` and `@statewalker/httpeers-join`, `hono` (the
router), `theia-httpeers` (the contribution point) and `@theia/core`.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
