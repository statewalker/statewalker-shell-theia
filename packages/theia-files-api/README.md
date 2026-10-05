# @theia-shell/theia-files-api

A Theia extension that serves a `@statewalker/webrun-files` `FilesApi` as the
`file:` file system of a browser-only Theia app (`FilesApiFileSystemProvider`),
and opens its root as the workspace.

## Entry points

A private package of this workspace (not published). Theia loads it through
the `theiaExtensions` entry of its `package.json`; it is used by `@theia-shell/theia-files-mounts`, `app/files` and the app.

- `main`: `lib/common/index.js` (from `src/common/index.ts`): `FilesApiFileSystemProvider`, `toFileChanges`, the DI keys below, and the `const enum` replacements in `const-enums.ts`.
- `theiaExtensions`: `frontendOnly` → `lib/browser/files-api-frontend-module` (rebinds `FileSystemProvider` and `WorkspaceServer`, reveals the explorer, labels the root).

Build and test it with `pnpm --filter @theia-shell/theia-files-api build` and
`pnpm --filter @theia-shell/theia-files-api test`.

## DI keys

| Key | Type | Default | Purpose |
|---|---|---|---|
| `FilesApiSource` | `() => FilesApi \| Promise<FilesApi>` | an empty `MemFilesApi` | the FilesApi shown |
| `FilesApiWorkspaceRoot` | `string` | `file:///` | the workspace opened when none was |
| `FilesApiRootLabel` | `string` | `/` | the root's label in the explorer |
| `FilesApiChanges` | `Event<readonly FilesApiChange[]>` | unbound | changes the provider cannot see (a mount appearing, a filter changing); when bound, forwarded to Theia as file changes |

`FilesApi` has no watch API: the provider reports the changes it makes itself,
and `FilesApiChanges` is how anything else that changes the tree tells Theia.

## Red / green

- **External changes** (`tests/files-api-changes.test.ts`). Red: 2 of 2
  (`toFileChanges is not a function`). Green: 2 of 2; the package's 23 of 23.
