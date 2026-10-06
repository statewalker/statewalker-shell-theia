# @theia-shell/theia-httpeers

## What it is

A Theia extension that makes the browser a member of an httpeers mesh. It
joins from an invitation, shows the peers and what they serve, lets an admin
invite others, and gives other extensions a place to serve on the mesh. The
member runs in the page, with a ServiceWorker as its edge, so the extension is
browser-only.

## Why it exists

The app's mesh features (the proxy, the LLM chat) need one member session per
app, started before anything uses it, with one identity and one set of rules
for what this browser serves. This package owns that session
(`MeshService`), the UI around it, and the `MeshContribution` contribution
point through which other extensions serve on the mesh.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-httpeers": "workspace:^"`. Theia loads it
through its `theiaExtensions` entry: `frontendOnly` →
`lib/browser/mesh-frontend-module`.

`main` (`lib/common/index.js`) exports `MeshContribution`, `MeshMounts`,
`MeshAdvertisement`, `shellRules`, and the view model (`peerRows`,
`statusBarText`, `isLoopbackHost`). `MeshService` is imported by path from
`lib/browser/mesh-service`. `lib/sw.js` is the ServiceWorker, copied there by
`pnpm build` (`scripts/copy-sw.mjs`).

| Contribution | What |
|---|---|
| `MeshService` | The app's one `PeerSession` (`createSession` from `@statewalker/httpeers-member/browser`), started with the app so a `?join=` link works on first load. It re-publishes session changes and the mesh view as Theia events, and drops a spent `?join=` from the address bar. |
| View *Mesh* (left side bar) | The join widget from `@statewalker/httpeers-join`: paste or scan an invitation, the hub link, disconnect, reconnect, leave, and for an admin the *Invite someone* panel. Below it, the peers: this browser, the hub, then the members, with roles, online state, the connection kind and what each advertises. |
| Status bar | `Mesh: live (direct)`, `Mesh: not joined`, …; clicking it toggles the view. |
| Commands | *Mesh: Join a Mesh…*, *Invite to the Mesh…* (copies the link), *Disconnect*, *Reconnect*, *Leave the Mesh (Reset Identity)…*, *Copy This Browser's Peer Id*; also in the top-level *Mesh* menu |
| `MeshContribution` | What another extension serves from this browser |

Build and test: `pnpm --filter @theia-shell/theia-httpeers build` and
`pnpm --filter @theia-shell/theia-httpeers test` (8 unit tests: the peers
list, the status text, the rules). The e2e tests are in
[`app/tests/mesh.spec.ts`](../../app/tests/mesh.spec.ts).

## Examples

Serve something on the mesh from another extension (this is how
`theia-httpeers-proxy` serves `/proxy`):

```ts
import { ContainerModule, injectable } from "@theia/core/shared/inversify";
import {
  type MeshAdvertisement,
  MeshContribution,
  type MeshMounts,
} from "@theia-shell/theia-httpeers";

@injectable()
class EchoService implements MeshContribution {
  configureMounts(mounts: MeshMounts): void {
    mounts.provide("/echo", async (request) => new Response(await request.text()));
  }
  advertisements(): MeshAdvertisement[] {
    return [{ id: "echo", kind: "echo", title: "Echo" }];
  }
}

export default new ContainerModule((bind) => {
  bind(EchoService).toSelf().inSingletonScope();
  bind(MeshContribution).toService(EchoService);
});
```

`/echo` also needs a policy in `shellRules()` (`src/common/mesh-model.ts`):
an unmatched path is denied, whoever calls it.

Read the session from another extension:

```ts
import { inject, injectable } from "@theia/core/shared/inversify";
import { MeshService } from "@theia-shell/theia-httpeers/lib/browser/mesh-service";

@injectable()
class UsesTheMesh {
  @inject(MeshService) protected readonly mesh!: MeshService;
}
```

## Internals

### Contributions are asked once, adverts on every heartbeat

The member has one mount table and one advertisement list, both fixed when the
session is created. So `configureMounts(mounts)` runs once, before the session
starts. A handler can delegate to state that changes later (the proxy's route
table does). `advertisements()` is read again on every heartbeat, so what this
browser offers can come and go without restarting anything.

### Rules decide who may call what this browser serves

`shellRules()` grants the mesh protocol's capabilities (`std:mesh.read`,
`std:presence.write`, `std:mesh.admin` for admins) and `app:proxy.use` to
every member. Its policies allow `/.well-known/…` and `/proxy/…`; any other
path is denied.

### One identity per origin

The member identity is kept in IndexedDB by `@statewalker/httpeers-member`.
Two tabs of the app share it, and the second one does not join: its status is
`Mesh: blocked`.

### The edge is a ServiceWorker at /sw.js

Peers are called with plain `fetch` to `/peers/<peerId>/…`, which
`@statewalker/webrun-http-browser`'s ServiceWorker routes over libp2p with
the membership token attached. The worker must be served un-hashed at
`/sw.js`: `pnpm build` copies it to `lib/sw.js`, and the app's `esbuild.mjs`
puts it at the root of `lib/frontend`. So the app must be served from the
origin root, over https or from localhost.

### Loopback meshes need a permissive dial gater

A page on a loopback host (`isLoopbackHost`: `localhost`, `127.x.x.x`, `::1`)
switches on libp2p's permissive dial gater, so it can join a mesh whose relay
is on loopback too (`tools/mesh-stack.mjs`). `?meshDev=1` does the same on any
host.

### What the errors look like

Session failures show as `Mesh: <message>`; a failed invitation as
`Mesh: could not create an invitation: <message>`. A created one shows
`Invitation (<role>) copied to the clipboard: <link>`.

### Dependencies

`@statewalker/httpeers-member` (the session), `@statewalker/httpeers-join`
(the join widget), `@statewalker/httpeers-core` (mounts) and
`@statewalker/httpeers-access` (the rules), `@statewalker/webrun-http-browser`
(the ServiceWorker edge), and `@theia/core`.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
