# @theia-shell/theia-markdown

A Theia extension for editing Markdown in a browser-only app: commands, menus,
keybindings, a live preview and an outline view. Loading and saving are
Theia's own editor flow, so they go through whatever `FileSystemProvider` the
app uses (here, the `FilesApi` provider of
[`theia-files-api`](../theia-files-api)). The extension touches storage only
for *New Markdown File*, which creates the file through Theia's `FileService`.

## Entry points

A private package of this workspace (not published). Theia loads it through
the `theiaExtensions` entry of its `package.json`; it is used by
`@theia-shell/theia-llm-chat`, `app/files` and the app.

- `main`: `lib/common/index.js` (from `src/common/index.ts`):
  `renderMarkdown`, `parseOutline` / `OutlineItem`, and the edit helpers
  `toggleWrap`, `toggleHeading`, `nextUntitledName` and `isMarkdownPath`.
- `lib/browser/markdown-contribution`: `MarkdownContribution` and the DI key
  `MarkdownNewFileFolder` (`() => Promise<URI | undefined>`), the folder
  *New Markdown File* writes to. Unbound, it is the first workspace root.
  `app/files` binds it to the main storage, because the app's root is
  read-only.
- `theiaExtensions`: `frontend` and `frontendOnly` →
  `lib/browser/markdown-frontend-module`.

Build and test it with `pnpm --filter @theia-shell/theia-markdown build` and
`pnpm --filter @theia-shell/theia-markdown test`.

## Contributions

| Kind | What |
|---|---|
| Commands | *Markdown: New Markdown File*, *Open Preview to the Side*, *Show Outline*, *Toggle Bold*, *Toggle Italic*, *Toggle Heading*, and *View: Toggle Markdown Outline* |
| Menus | *File → New Markdown File*; explorer context menu *Open Markdown Preview*; editor context menu *Markdown ▸* (Bold, Italic, Heading, Preview); *View → Markdown Outline* |
| Keybindings | Preview `Ctrl+Shift+V`, Bold `Ctrl+Alt+B`, Italic `Ctrl+Alt+I`, Heading `Ctrl+Alt+H` (while a text editor has the focus) |
| Views | **Markdown Preview**: main area, split to the right. It renders the shared text model, so unsaved edits show live. **Markdown Outline**: right side bar; lists the active editor's headings, click one to reveal it. |
| Language | Registers `markdown` for `.md` / `.markdown` with a small Monarch tokenizer, unless a `markdown` language is already registered. A browser-only app without VS Code plugins has no Markdown grammar otherwise. |

## File content is data

`renderMarkdown` runs markdown-it with `html: false`, so raw HTML is escaped
and `javascript:` links are refused. Every block carries `data-line` (its
first source line) so the preview can follow the editor. The preview widget
also passes the result through DOMPurify. This follows the HTTPeers security
model: a document fetched from a peer must never run on the shell's origin.

The preview and outline use shadcn/ui components and Tailwind classes from
[`theia-shadcn`](../theia-shadcn); the app compiles those classes in
[`app/style`](../../app/style).

Tests: `pnpm test` runs 15 unit tests (outline, rendering, edits). The e2e
tests are in [`app/tests`](../../app/tests).
