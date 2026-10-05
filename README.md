# statewalker-shell-theia

## What it is

An Eclipse Theia 1.76 application that runs only in the browser. The build
output is static files and there is no backend. Files come from
`@statewalker/webrun-files` `FilesApi` instances (browser storage, memory,
folders on the computer, S3 buckets), each mounted as a top-level folder of the
explorer. Secrets such as S3 keys live in a password-protected vault encrypted
with WebCrypto. The app has a Markdown editor with a live preview and an
outline, an image viewer and a PDF viewer. It is also a member of an httpeers
mesh: it joins from an invitation, shows the peers and what they serve, lets an
admin invite others, chats with the mesh's LLM service, and exposes outside
HTTP origins to the mesh through a proxy.

The workspace holds the app, the Theia extensions it is made of, and seven
small prototype apps. Each prototype pins down one property of browser-only
Theia. Nothing is published: every package is private and named
`@theia-shell/*`. [`app/README.md`](app/README.md) is the user-level guide to
the app.

## The workspace is one app, its extensions, and prototypes

```
app/                          the browser-only Theia application, its e2e tests (app/tests)
app/files                     the app's file-system defaults and demo files (an extension)
app/style                     the app's Tailwind build (an extension)
packages/theia-files-api      a FilesApi as Theia's file system
packages/theia-files-mounts   mount points over a main storage; settings under shell-system:
packages/theia-files-s3       the S3 mount type
packages/theia-secret-vault   the encrypted vault behind Theia's KeyStoreService
packages/theia-file-panels    Midnight-Commander-style file panels
packages/theia-markdown       Markdown commands, preview and outline
packages/theia-image-viewer   a zoomable image viewer
packages/theia-pdf-viewer     a PDF viewer (EmbedPDF, no network access)
packages/theia-shadcn         shadcn/ui components and tokens; an opt-in shadcn look for Theia's widgets
packages/theia-httpeers       this browser as an httpeers mesh member
packages/theia-httpeers-proxy outside HTTP origins exposed to the mesh
packages/theia-llm-chat       a chat with the mesh's LLM or any OpenAI-compatible endpoint
protos/p1…p7                  one prototype app per question; each README states the question and the answer
tools/                        a static file server, the shared Playwright config, test fixtures
docs/specs, docs/plans        design documents
```

| Package | What it is |
|---|---|
| [`@theia-shell/app`](app) | The application (`"theia": { "target": "browser-only" }`) |
| [`@theia-shell/app-files`](app/files) | The Temporary mount, hidden paths and demo files seeded into the main storage |
| [`@theia-shell/app-style`](app/style) | Tailwind v4 without preflight over the extensions' sources, plus the shadcn theme |
| [`@theia-shell/theia-files-api`](packages/theia-files-api) | Serves a `FilesApi` as the `file:` file system and opens its root as the workspace |
| [`@theia-shell/theia-files-mounts`](packages/theia-files-mounts) | A composite, filterable `FilesApi` of user-defined mount points over a main storage |
| [`@theia-shell/theia-files-s3`](packages/theia-files-s3) | The S3 mount type |
| [`@theia-shell/theia-secret-vault`](packages/theia-secret-vault) | A WebCrypto vault behind Theia's `KeyStoreService` |
| [`@theia-shell/theia-file-panels`](packages/theia-file-panels) | One-folder file panels with sibling-folder breadcrumbs and copy/move |
| [`@theia-shell/theia-markdown`](packages/theia-markdown) | Markdown commands, menus, keybindings, preview and outline |
| [`@theia-shell/theia-image-viewer`](packages/theia-image-viewer) | PNG, JPEG, GIF, WebP, AVIF, BMP, ICO and SVG in a zoomable viewer |
| [`@theia-shell/theia-pdf-viewer`](packages/theia-pdf-viewer) | `.pdf` in EmbedPDF (PDFium in WebAssembly), with no network access |
| [`@theia-shell/theia-shadcn`](packages/theia-shadcn) | shadcn/ui components on Theia's React, tokens per theme, an opt-in shadcn style |
| [`@theia-shell/theia-httpeers`](packages/theia-httpeers) | Mesh membership: join, peers, invitations, `MeshContribution` |
| [`@theia-shell/theia-httpeers-proxy`](packages/theia-httpeers-proxy) | A route table that exposes outside origins to the mesh, with a test console |
| [`@theia-shell/theia-llm-chat`](packages/theia-llm-chat) | An LLM chat over the mesh hub's service or an OpenAI-compatible API |

## How to run it

You need Node 24 and pnpm 10 (`packageManager` is `pnpm@10.16.1`; corepack
provides it). Run everything from the repository root.

1. `corepack enable`
2. `pnpm install`
3. `pnpm build`: every package (`tsc`), every prototype and the app (`theia build`).
4. `pnpm --filter @theia-shell/app start`: serves `app/lib/frontend` on
   http://127.0.0.1:3001.
5. Optional, for a mesh on this machine:
   `node tools/mesh-stack.mjs http://127.0.0.1:3001/`. It prints admin and
   member invitations for the app. It needs a built httpeers source tree
   (see *What will surprise you*).

6. Optional, for S3 mounts on this machine: `pnpm rustfs start`. It runs RustFS in Docker
   (S3 API on http://127.0.0.1:9100, web console on http://127.0.0.1:9101/rustfs/console/,
   keys `theiashell` / `theiashell-secret`), creates the bucket `theia-shell`, and makes the
   bucket's CORS rule allow the app's origins. `pnpm rustfs check` checks that rule against each
   origin and fixes it; `pnpm rustfs stop` removes the container and keeps its data volume.

`pnpm test` runs the unit tests (vitest). `pnpm test:e2e` runs the Playwright
tests of every prototype and the app against their static builds, so build
first.

## Why it is the way it is

### A static file server is all the app needs

The app is `"target": "browser-only"`. Everything a backend would do runs in
the page: the file system is a `FilesApi`, the settings live in the main
storage, search walks the workspace through Theia's `FileService`.
`tools/serve.mjs` is a plain static server, and the e2e tests use it too.

### Every app-level binding lives in its own extension package

Theia ignores `theiaExtensions` in the application's own `package.json`. So
the app's defaults are `app/files` and its stylesheet is `app/style`. Each is a
package with its own `theiaExtensions` entry, listed in the app's
dependencies. A new kind of mount, or any other binding, goes in a package the
same way.

### Theia needs a hoisted node_modules

`.npmrc` sets `node-linker=hoisted`, because Theia's build resolves modules
the way npm lays them out.

### Decorators are on for Theia's dependency injection

`tsconfig.theia.json`, which the packages extend, turns on
`experimentalDecorators` and `emitDecoratorMetadata` for inversify. Biome's
`unsafeParameterDecoratorsEnabled` (in `biome.json`) is on for the same
reason: some widgets take `@inject(...)` constructor parameters, because they
must pass them on to the Theia classes they extend.

### The prototypes hold the properties the app relies on

Each prototype under `protos/` is a small app with its own e2e tests:

| Prototype | Property |
|---|---|
| [P1](protos/p1-browser-only) | A browser-only app builds and runs from static files. The minimum is core, editor, filesystem, messages, monaco, navigator, preferences and workspace; core alone fails dependency injection. |
| [P2](protos/p2-files-api-provider) | Theia's `FileSystemProvider` can be implemented over a `FilesApi`. Theia's `const enum`s are `undefined` at runtime under esbuild and vitest, so the adapter defines its own values. |
| [P3](protos/p3-explorer) | The provider is swapped in by rebinding `FileSystemProvider` and `WorkspaceServer`. Workspace trust is off (`security.workspace.trust.enabled: false` in the app's `package.json`). |
| [P4](protos/p4-editor-save) | Monaco and *Save* work through the adapter with no extra code. |
| [P5](protos/p5-contributions) | Commands, keybindings, menus and views work with the standard APIs. |
| [P6](protos/p6-vscode-extension) | Static VS Code web extensions run once `activationEvents` are explicit, and a small `HostedPluginServer` subclass deploys plugins at runtime. `@theia/plugin-ext` roughly doubles the frontend modules, and the app does not include it. |
| [P7](protos/p7-embedpdf) | EmbedPDF runs inside Theia's bundle with no network access: PDFium's wasm is embedded as a data URL. |

## What will surprise you

- **`tools/mesh-stack.mjs` and `app/tests/mesh.spec.ts` need httpeers' source
  tree.** They start the relay and the hub daemon from a built checkout at
  `$HTTPEERS_DIR` (default: `../httpeers` next to this repository). Without
  it they fail with
  `mesh-stack: <path> is missing; build httpeers first (pnpm -r build)`.
- **An S3 mount fails with a CORS error when the bucket does not list the page's origin.**
  The browser reports `blocked by CORS policy: No 'Access-Control-Allow-Origin' header`.
  `pnpm rustfs check --origin <the page's origin>` adds it. A page served from the internet
  (`https://...`) that reaches `127.0.0.1` also needs the browser's *Local network access*
  permission for that site; without it Chrome reports `Permission was denied for this request to
  access the loopback address space`. The app served on `127.0.0.1` needs no permission.
- **S3 tests skip themselves without Docker.** The S3 and restore e2e tests and
  one unit test of `theia-files-s3` run against RustFS in Docker
  (`tools/rustfs.mjs`). With no Docker they are skipped, not failed.
- **`app/style`'s tests read the compiled CSS.** Run its `build` first, or they
  fail with `ENOENT` on `lib/app.css`.
- **The app's bundle rewrites `import.meta.url` in `@statewalker/webrun-http-browser`.**
  Theia bundles the frontend as a classic script, where `import.meta` is an
  empty object. Without the rewrite in `app/esbuild.mjs` the mesh edge throws
  `Invalid URL` and never starts.
- **The ServiceWorker must be at `/sw.js`.** The app's build copies it there.
  The app must be served from the origin root, over https or from localhost,
  or the mesh edge cannot register.
- **`pnpm typecheck` checks nothing.** No package defines a `typecheck`
  script; types are checked by each package's `tsc` build.
- **The e2e tests use port 3100 by default.** Set `E2E_PORT` to run suites
  from two checkouts side by side.

## Reference

### Commands

| Command | What it does |
|---|---|
| `pnpm build` | `pnpm -r run build` |
| `pnpm test` | `pnpm -r run test` (vitest) |
| `pnpm test:e2e` | `pnpm -r run test:e2e` (Playwright) |
| `pnpm lint` / `pnpm lint:check` | Biome check, with or without writing fixes |
| `pnpm format` / `pnpm format:check` | Biome format, with or without writing |
| `pnpm --filter <name> build` / `test` | One package |
| `pnpm --filter @theia-shell/app build:prod` | The app in production mode |
| `node tools/serve.mjs <dir> <port>` | Serve a built app |
| `node tools/probe.mjs <url> [ms] [png]` | Load a served app; print console errors and element ids; optionally take a screenshot |
| `pnpm rustfs start\|check\|status\|stop` | A local RustFS for S3 mounts (`tools/rustfs-dev.mjs`); `--origin <url>` (repeatable) replaces the default origins (`http://127.0.0.1:3001`, `http://localhost:3001`, `https://theia.httpeers.net`), `--no-fix` only checks, `stop --reset` also deletes the data |
| `node tools/mesh-stack.mjs [appUrl]` | A mesh on loopback: relay, hub with its `llm` service, a fake LiteLLM, an outside origin |

### Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests: a
frozen install, `lint:check`, `format:check`, `build`, `typecheck` and `test`.
The e2e tests are not part of it.

### Releases

None. Every package is private.

### License

No license is declared: there is no LICENSE file and no `license` field.
