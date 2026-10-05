# @theia-shell/app-files

## What it is

The app's file-system defaults, as a Theia extension: an extra in-memory
mount, the hidden paths, the demo files seeded into an empty main storage, and
the folder *New Markdown File* writes to. A private package of this workspace,
not published.

## Why it exists

The extensions leave these choices to the app: `theia-files-mounts` reads its
defaults from `MountDefaults`, and `theia-markdown` asks `MarkdownNewFileFolder`
where to create files. Theia ignores `theiaExtensions` in the application's own
`package.json`, so the app's bindings need a package of their own.

## How to use

- `theiaExtensions`: `frontendOnly` → `lib/app-files-frontend-module` (also
  `main`).
- The app lists it in its dependencies (`"@theia-shell/app-files": "workspace:^"`).
- Build and test: `pnpm --filter @theia-shell/app-files build` and
  `pnpm --filter @theia-shell/app-files test` (8 unit tests: seeding, the PNG
  encoder).

## Examples

The bindings it makes, from `src/app-files-frontend-module.ts`:

```ts
rebind(MountDefaults).toConstantValue({
  mounts: [{ key: "temp", name: "Temporary", type: "memory", config: {} }],
  hidden: ["**/.git", "**/.git/**", "**/.DS_Store"],
});
bind(MainStorageInitializer).toConstantValue(async ({ files }: { files: FilesApi }) => {
  await seedIfEmpty(files, SEED);
});
rebind(FilesApiRootLabel).toConstantValue("Files");
bind(MarkdownNewFileFolder).toDynamicValue(({ container }) => async () => {
  const main = await container.get(MainStorageService).open();
  return new URI(`file:///${main.storage.key}`);
});
```

## Internals

### New Markdown files go to the main storage

The root above the mounts is read-only, so the first workspace root (the
default for *New Markdown File*) is not writable. `MarkdownNewFileFolder`
points at the main storage instead.

### The demo files have no binary fixtures

`src/seed.ts` holds `welcome.md`, `notes/ideas.md`, `docs/cheatsheet.md`,
`docs/sample.pdf`, `media/gradient.png` and `media/logo.svg`. The PNG is
encoded in code (`src/png.ts`) and the PDF is made with `createTextPdf` from
`theia-pdf-viewer`. `seedIfEmpty` writes them only into an empty main storage;
the system folder `.shell` does not count as content.

### The page exposes the file system for tests

`window.theiaShell = { filesApi, bootGate }` is set on start, for the e2e tests
and the devtools console.

### Dependencies

`@theia/core`, `@statewalker/webrun-files` and `@statewalker/webrun-files-mem`,
and the workspace extensions whose keys it binds: `theia-files-api`,
`theia-files-mounts`, `theia-markdown` and `theia-pdf-viewer`.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
