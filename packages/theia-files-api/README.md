# @theia-shell/theia-files-api

## What it is

A Theia extension that serves a `@statewalker/webrun-files` `FilesApi` as the
`file:` file system of a browser-only Theia app, and opens its root as the
workspace. The explorer, the editors, *Save*, search and every other Theia
feature that goes through `FileService` then read and write the `FilesApi`.

## Why it exists

Browser-only Theia binds its file system to the Origin Private File System
and nothing else. A `FilesApi` can be memory, browser storage, a local folder,
S3, or a composite of these; this package is the one adapter between that
interface and Theia's `FileSystemProvider`, so the rest of the app never
deals with storage.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-files-api": "workspace:^"`. Theia loads
it through its `theiaExtensions` entry: `frontendOnly` →
`lib/browser/files-api-frontend-module`.

`main` (`lib/common/index.js`) exports `FilesApiFileSystemProvider`,
`toFileChanges`, the DI keys below and the `ChangeType` / `Capabilities`
constants.

| DI key | Type | Default | Purpose |
|---|---|---|---|
| `FilesApiSource` | `() => FilesApi \| Promise<FilesApi>` | an empty `MemFilesApi` | the `FilesApi` shown |
| `FilesApiWorkspaceRoot` | `string` | `file:///` | the workspace opened when none was |
| `FilesApiRootLabel` | `string` | `/` | the root's label in the explorer |
| `FilesApiChanges` | `Event<readonly FilesApiChange[]>` | unbound | changes the provider cannot see; when bound, forwarded to Theia as file changes |

Build and test: `pnpm --filter @theia-shell/theia-files-api build` and
`pnpm --filter @theia-shell/theia-files-api test` (23 unit tests: the
`FileSystemProvider` contract, external changes).

## Examples

Show one fixed `FilesApi`, from a frontend module in an extension package of
the app:

```ts
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ContainerModule } from "@theia/core/shared/inversify";
import { FilesApiRootLabel, FilesApiSource } from "@theia-shell/theia-files-api";

export default new ContainerModule((_bind, _unbind, _isBound, rebind) => {
  rebind(FilesApiSource).toConstantValue(() => new MemFilesApi());
  rebind(FilesApiRootLabel).toConstantValue("Files");
});
```

Tell Theia about changes made to the `FilesApi` behind the provider's back:

```ts
import { Emitter } from "@theia/core/lib/common/event";
import { ContainerModule } from "@theia/core/shared/inversify";
import { FilesApiChanges, type FilesApiChange } from "@theia-shell/theia-files-api";

const changes = new Emitter<readonly FilesApiChange[]>();

export default new ContainerModule((bind) => {
  bind(FilesApiChanges).toConstantValue(changes.event);
});

// later, after writing /notes/a.md some other way:
changes.fire([{ type: "added", path: "/notes/a.md" }]);
```

## Internals

### Two rebinds replace the browser-only file system

The frontend module rebinds `FileSystemProvider` to
`FilesApiFileSystemProvider`, replacing `@theia/filesystem`'s OPFS provider.
It loads after `@theia/filesystem` (it depends on it), so the rebind is
enough. It also rebinds `WorkspaceServer` to `FilesApiWorkspaceServer`: the
browser-only server remembers recent workspaces in `localStorage`, and on a
first visit, with none remembered, it opens `FilesApiWorkspaceRoot` instead of
showing "no folder opened". A contribution reveals the explorer on start, and
a label contribution names the root.

### Changes are reported, not watched

`FilesApi` has no watch API. The provider fires a change for every write,
delete, rename and copy it makes itself; `watch()` sets nothing up.
`FilesApiChanges` is how anything else that changes the tree (a mount
appearing, a filter changing) tells Theia. `toFileChanges(root, changes)`
turns `FilesApi` paths into Theia file changes under `root`.

### Whole-file reads and writes

The provider declares `FileReadWrite`, `FileFolderCopy` and
`PathCaseSensitive`: files are read and written whole, and copies and renames
go through the `FilesApi`'s own `copy` and `move`. The `FilesApi` is resolved once from
`FilesApiSource`, then cached.

### Theia's const enums are redefined

Theia declares `FileChangeType` and `FileSystemProviderCapabilities` as
`const enum`s. They exist only for `tsc` inlining, so under esbuild or vitest
`FileChangeType.ADDED` is `undefined`. `const-enums.ts` defines the same
values (fixed by the VS Code file-system contract) as `ChangeType` and
`Capabilities`.

### What the errors look like

The provider throws Theia's file-system errors, which the explorer and
editors show as they are: `Not found: <path>`, `Already exists: <path>`,
`Is a folder: <path>`, `Not a folder: <path>`, and
`Folder is not empty: <path>` for a non-recursive delete of a folder with
content.

### Dependencies

`@statewalker/webrun-files` (the interface), `@statewalker/webrun-files-mem`
(the default source), and `@theia/core`, `@theia/filesystem`,
`@theia/navigator`, `@theia/workspace` for the bindings it replaces.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
