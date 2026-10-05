# @theia-shell/app-files

The app's file-system defaults, as a Theia extension of their own (Theia
ignores `theiaExtensions` in the application's own `package.json`, see P3).
A private package of this workspace, not published.

`theiaExtensions`: `frontendOnly` → `lib/app-files-frontend-module`. The module:

- rebinds `MountDefaults` (from `theia-files-mounts`): one extra mount,
  *Temporary* (key `temp`, in memory), and the hidden paths `**/.git`,
  `**/.git/**` and `**/.DS_Store`;
- binds a `MainStorageInitializer` that seeds an empty main storage with the
  demo files (`src/seed.ts`): `welcome.md`, `notes/ideas.md`,
  `docs/cheatsheet.md`, `docs/sample.pdf`, `media/gradient.png` and
  `media/logo.svg`. The PNG is encoded in code (`src/png.ts`) and the PDF is
  made with `createTextPdf` from `theia-pdf-viewer`, so no binary fixtures are
  checked in;
- rebinds `FilesApiRootLabel` (from `theia-files-api`) to `Files`;
- binds `MarkdownNewFileFolder` (from `theia-markdown`) to the main storage,
  because the root above the mounts is read-only;
- puts `window.theiaShell = { filesApi, bootGate }` on the page for the e2e
  tests and the devtools console.

Build and test it with `pnpm --filter @theia-shell/app-files build` and
`pnpm --filter @theia-shell/app-files test` (8 unit tests: seeding, the PNG
encoder).
