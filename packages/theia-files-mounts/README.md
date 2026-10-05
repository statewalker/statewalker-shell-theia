# @theia-shell/theia-files-mounts

## What it is

A Theia extension that turns a browser-only app's file system into **mount
points**. Every workspace folder is a `FilesApi` of its own (memory, browser
storage, a folder on the computer, S3, and any type an extension adds), over
one **main storage** that also holds the settings and the secret vault. Every
backend is an existing `@statewalker/webrun-files-*` class; this package turns
configurations into them, combines them into one tree, and gives users the
commands and forms to manage them.

## Why it exists

`theia-files-api` shows one `FilesApi`. A user's files live in several places
at once, some of which need a password (S3 keys) or a click (a local folder)
before they can be reached. This package keeps those places in the
`files.mounts` setting, mounts each as a workspace root, survives the ones
that fail, and restores the open editors on them after a reload.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-files-mounts": "workspace:^"`, together
with `theia-files-api` and `theia-secret-vault`, which it builds on. Theia
loads it through its `theiaExtensions` entry: `frontend` and `frontendOnly` →
`lib/browser/mounts-frontend-module`.

`main` (`lib/common/index.js`) exports the extension points and helpers:
`MountType`, `MountField`, `MountConfig`, `MountContext`, `NeedsUserGesture`,
`SecretsLocked`, `FilesApiLayer`, `MountedFilesApi`, `SerialQueue`, and the
config, key, table, form, folder-list and workspace-file helpers. The Theia
services are imported by path:

| Module | What an app binds or uses |
|---|---|
| `lib/browser/mount-preferences` | `MountDefaults`: the `files.mounts` and `files.hidden` used while the settings leave them unset |
| `lib/browser/main-storage` | `MainStorageInitializer`: runs once the main storage is open (e.g. to seed it); `MainStorageService` |
| `lib/browser/mount-service` | `MountService`: `start()` resolves to the filtered root `FilesApi` |
| `lib/browser/boot-gate` | `bootGate`: the click gate for a local-folder main storage |

Built-in mount types: **memory**, **OPFS** (a folder under OPFS `mounts/`),
**local folder** (File System Access). Built-in layers: the **system folder**
(always hides `/<main key>/.shell`) and **hidden paths** (the `files.hidden`
globs).

Commands: *File → Mount File System…* / *Add Folder to Workspace…* (the folder
list); on a mount's root folder *Edit Mount…*, *Remove Folder from Workspace* /
*Unmount*, *Reconnect*; *File → Choose Main Storage…*.

Build and test: `pnpm --filter @theia-shell/theia-files-mounts build` and
`pnpm --filter @theia-shell/theia-files-mounts test` (64 unit tests).

### The settings

```json
{
  "files.mounts": [
    { "key": "temp", "name": "Temporary", "type": "memory", "config": {} },
    { "key": "drafts", "name": "Drafts", "type": "opfs", "config": { "directory": "drafts" } },
    {
      "key": "cloud", "name": "Cloud", "type": "s3",
      "config": { "endpoint": "https://s3.example.com", "region": "us-east-1", "bucket": "notes" }
    }
  ],
  "files.hidden": ["**/.git", "**/.git/**", "**/*.log"]
}
```

Unset, both fall back to the app's `MountDefaults`. What happens to bad
values is under *Bad settings are reported, not fatal*.

## Examples

A mount type, bound from a frontend module of its own package (this is how
`theia-files-s3` adds S3):

```ts
import type { FilesApi } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ContainerModule, injectable } from "@theia/core/shared/inversify";
import {
  type MountConfig,
  type MountContext,
  type MountField,
  MountType,
  SecretsLocked,
} from "@theia-shell/theia-files-mounts";

@injectable()
class ScratchMountType implements MountType {
  readonly id = "scratch";
  readonly label = "Scratch Space";
  readonly fields: MountField[] = [{ name: "token", label: "Token", kind: "secret", required: true }];
  isAvailable(): boolean {
    return true;
  }
  async create(_mount: MountConfig, ctx: MountContext): Promise<FilesApi> {
    const token = await ctx.secret("token");
    if (!token && ctx.locked) throw new SecretsLocked();
    return new MemFilesApi();
  }
}

export default new ContainerModule((bind) => {
  bind(ScratchMountType).toSelf().inSingletonScope();
  bind(MountType).toService(ScratchMountType);
});
```

A layer around the whole tree:

```ts
import type { FilesApi } from "@statewalker/webrun-files";
import { FilesApiLayer } from "@theia-shell/theia-files-mounts";

const auditLayer: FilesApiLayer = {
  id: "audit",
  priority: 100, // lower wraps first, closer to the mounts
  wrap: (root: FilesApi) => root, // return a FilteredFilesApi, a guard, a read-only view…
};
// bind(FilesApiLayer).toConstantValue(auditLayer);
```

## Internals

### Mounts are the workspace's roots

The explorer shows one top-level workspace folder per mount — the main storage
first, then `files.mounts` in order — with no single "Files" root. A
multi-root workspace file lists them (`{ "folders": [{ "path": "file:///<key>",
"name": "<name>" }] }`); `MountService` rewrites its `folders` whenever the
mounts change — editing only `folders`, as JSONC, so comments, trailing
commas and every other key stay — and workspace-scope settings (which Theia
stores there) work too. A file it cannot parse is left alone and reported. At
startup it only creates a missing file; the full list follows once the
settings are read.

Mount paths cannot start with `.` (reserved for system mounts) or contain
`/ \ # ? %` (they would change the root's URI).

Theia 1.76 opens only `file:` workspaces, so the file lives in the `file:` tree:
`file:///.workspace/mounts.theia-workspace`, a system mount over the main
storage's `/.shell/workspace`. It is never a root; the key `.workspace` is
reserved. `MountsWorkspaceService` always opens it and leaves the URL alone.

### Folders are remembered, not deleted

- ***File → Mount File System…*** and ***Add Folder to Workspace…*** open the
  **folder list**: remembered folders (one click adds one back), browser-storage
  folders under OPFS `mounts/` that no mount uses (one click mounts one), and a
  "New …" row per available type. A remembered row has a *Forget* button.
- A "New …" row runs the type's interactive step first (a local folder: the
  folder picker), then opens **one form**: the name, the mount path (the
  workspace folder's name; it follows the name until edited, and must be
  unique among all mounts, remembered ones included) and the type's fields.
  **Mount** stays disabled until the form is valid; errors show under each field.
- ***Remove Folder from Workspace*** (and *Unmount*) takes a folder out of the
  workspace but **remembers** it: its `files.mounts` entry gets
  `"mounted": false`, and its secrets and local folder handle are kept. The main
  storage cannot be removed. *Forget* deletes the entry, its secrets and handle.
- *Edit Mount…* opens the same form, prefilled; a local folder's form has
  *Choose another folder…*.

### The main storage holds the settings, under their own scheme

One mount is main: OPFS (`main/`) by default, or a folder on the computer
(*Files: Choose Main Storage…*). Which one is kept in IndexedDB
(`theia-shell-boot`), because the settings are read from it. Its `/.shell`
holds `settings/` (Theia's config directory), `vault.key.json` and
`secrets.json`. A local-folder main storage needs a click after each reload: a
small boot gate, before the workbench, offers "Open ‹name›" or "Use Browser
Storage this time". `?storage=memory`, or no OPFS, gives an in-memory main
storage.

Theia's settings are served from `/.shell/settings` under their own scheme,
`shell-system:`, so they are never in the file tree and no filter can hide them
from Theia. That takes three rebinds: `EnvVariablesServer.getConfigDirUri()` →
`shell-system:///`; `UserStorageContribution` → a subclass whose `getDelegate()`
activates `shell-system` (Theia hard-codes `file`); and a `FileServiceContribution`
registering the provider.

The root never waits for preferences — folder-scope preferences are read
through it — so it starts with the main mount, and the other mounts follow as
reported changes once preferences are ready.

### Open files on a mount come back after a reload

Theia restores the layout (the open editors and viewers) right after every
contribution's `onStart`. `MountsRestore.onStart` holds that until the mounts
the restore needs are up — those the stored layout's widgets live on (a
`file:` URI as a top-level value of a widget's options or stored state: an
editor's `uri`, a files panel's `folder`; read from the stored layout through
`MountsLayoutRestorer`) plus those of the pending reopens below. `MountService`
applies exactly those first; the other mounts follow at once and do not delay
the start-up apply. (After an unlock, though, the re-creation of a locked mount
queues behind them, and the gate waits for that queue: a slow mount no tab
uses can then add up to its create timeout.) So the gate
costs nothing when no restored tab is on a mount, and otherwise what those
mounts take to come up: an S3 mount's first listing (one round trip), up to
its create timeout (15 s) for a host that does not answer. A mount that
fails, or needs a click (`needs-access`), is not waited for. One locked behind
the vault waits for the vault's start-up prompt (`VaultService.startupUnlock`)
and, after an unlock, for its re-creation. The waits for the mounts are
bounded (30 s each, restarted after the prompt is answered); the user's own
time is not — a shown vault prompt, which has Skip. Opening the main storage
(`MountService.start()`) is awaited unbounded: it holds the boot gate's click,
and the main storage's own opening with it. Nothing
the mounts need (the main storage, the preferences) awaits this gate, so it
cannot deadlock.

What still could not be restored — the vault prompt skipped, a local folder
waiting for *Reconnect*, a slow mount — is not lost: `MountsLayoutRestorer`
(Theia's `ShellLayoutRestorer`, rebound, overriding its protected `inflate`
and `convertToWidget`) remembers the shell widgets whose creation failed, with
their area. A file-backed one (a `file:` `uri` option: editors, viewers, the
Markdown preview — whose creation reads the file, so it throws while the file
is missing) on a mount that was not mounted at restore is re-created, with its
saved state, as soon as that mount is `mounted` — unless the file is open in
the same kind of widget by then. It lands in the current tab bar of its area
and does not become active: its split and position in the tab bar are not
kept. Any other failed widget stays dropped, as in Theia.

The pending reopens outlive a reload: Theia stores the layout on unload without
them, so `MountsRestore` keeps them (description and area) in Theia's
`StorageService` under `theia-shell.mounts.pending-reopens`, merges them with
the next restore's failures (each widget once; one open by then is skipped),
and forgets each once it is reopened or dropped. Stored entries are dropped at
start-up when their mount is no longer in the workspace (removed from
`files.mounts`, or `mounted: false`), and after the start-up apply when their
mount failed — otherwise every start would wait for that mount and the tab
would resurface much later. One is re-created in a fresh restore context (no layout
migrations): a layout version change in between is not accounted for.

The app has one perspective, and this relies on it: Theia inflates every
saved perspective's layout, so failures of an inactive perspective would be
reopened into the active shell.

### One failing mount never blocks the others

`create` throws `NeedsUserGesture` ("Needs a click to get access") when it can
only proceed from a click, and `SecretsLocked` ("Secrets are locked") when a
secret is missing because the vault is locked. Any other error makes the
mount a placeholder with that message, and so does a `create` that has not
answered after 15 s (`No answer after 15 s`), so one unreachable host never
holds up the others. The root's label shows the status: `Cloud (locked)`,
`Local Computer (click Reconnect)`, `Cloud (unavailable: …)`. `secret` fields
are stored in the vault (`CredentialsService`, service `theia-shell.mounts`,
account `<key>/<field>`), never in settings. A local folder's handle is kept
in IndexedDB under a random `handleId`, so renaming the key keeps it.

### Bad settings are reported, not fatal

A bad `files.mounts` entry is skipped with one warning; the rest mount. The
warnings read like `files.mounts[2]: mount "cloud" is missing "bucket".` or
`mount "cloud": the secret "secretAccessKey" belongs in the vault, not in settings.`
A `files.mounts` that is not an array is reported, not replaced by the
defaults. A `files.hidden` glob that does not compile is ignored with
`files.hidden: <glob> is not a valid glob pattern; it is ignored.`; the others
apply. A workspace file that does not parse is left alone with
`The workspace file is not valid JSON(C); fix it by hand — it is left as it is.`
Changes to the tree run one at a time (`SerialQueue`), and a failed one is
reported without blocking the next.

### Known gaps

- Theia fires a preference change before it writes `settings.json`; a reload
  in the next instant loses a mount just made.
- `CompositeFilesApi` has no `unmount`, so the composite is rebuilt on every
  change, behind `MountedFilesApi`.

### Dependencies

`@statewalker/webrun-files-composite` (the mount table and the filters),
`@statewalker/webrun-files-browser` (OPFS and local folders),
`@statewalker/webrun-files-mem` (memory mounts), `jsonc-parser` (editing the
workspace file without losing comments), `theia-files-api` (the file system it
feeds), `theia-secret-vault` (secrets), and `@theia/core`, `@theia/filesystem`,
`@theia/navigator`, `@theia/userstorage`, `@theia/workspace` for the bindings
it replaces.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
