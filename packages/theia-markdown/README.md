# @theia-shell/theia-markdown

## What it is

A Theia extension for editing Markdown: commands, menus and keybindings for
common edits, a live preview beside the editor, an outline view of the
headings, and a Markdown language registration for Monaco.

## Why it exists

A browser-only Theia app without VS Code plugins has no Markdown support at
all: no grammar, no preview, no outline. This package adds them with Theia's
own extension APIs. Loading and saving stay Theia's editor flow, so they go
through whatever file system the app uses; the extension touches storage only
for *New Markdown File*, which creates the file through Theia's `FileService`.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-markdown": "workspace:^"`. Theia loads it
through its `theiaExtensions` entry: `frontend` and `frontendOnly` →
`lib/browser/markdown-frontend-module`.

`main` (`lib/common/index.js`) exports `renderMarkdown`, `parseOutline` and
`OutlineItem`, and the edit helpers `toggleWrap`, `toggleHeading`,
`nextUntitledName` and `isMarkdownPath`. `lib/browser/markdown-contribution`
exports `MarkdownContribution` and the DI key `MarkdownNewFileFolder`
(`() => Promise<URI | undefined>`): the folder *New Markdown File* writes to.
Unbound, it is the first workspace root.

| Kind | What |
|---|---|
| Commands | *Markdown: New Markdown File*, *Open Preview to the Side*, *Show Outline*, *Toggle Bold*, *Toggle Italic*, *Toggle Heading*, and *View: Toggle Markdown Outline* |
| Menus | *File → New Markdown File*; explorer context menu *Open Markdown Preview*; editor context menu *Markdown ▸* (Bold, Italic, Heading, Preview); *View → Markdown Outline* |
| Keybindings | Preview `Ctrl+Shift+V`, Bold `Ctrl+Alt+B`, Italic `Ctrl+Alt+I`, Heading `Ctrl+Alt+H` (`Cmd` on macOS; while a text editor has the focus) |
| Views | **Markdown Preview**: main area, split to the right. **Markdown Outline**: right side bar; lists the active editor's headings, click one to reveal it. |
| Language | `markdown` for `.md` / `.markdown`, with a small Monarch tokenizer, unless a `markdown` language is already registered |

Build and test: `pnpm --filter @theia-shell/theia-markdown build` and
`pnpm --filter @theia-shell/theia-markdown test` (15 unit tests: outline,
rendering, edits).

## Examples

Send *New Markdown File* to a writable folder when the first root is not
(the app binds the main storage this way):

```ts
import URI from "@theia/core/lib/common/uri";
import { ContainerModule } from "@theia/core/shared/inversify";
import { MarkdownNewFileFolder } from "@theia-shell/theia-markdown/lib/browser/markdown-contribution";

export default new ContainerModule((bind) => {
  bind(MarkdownNewFileFolder).toConstantValue(async () => new URI("file:///browser"));
});
```

The helpers, without Theia:

```ts
import { parseOutline, renderMarkdown, toggleHeading, toggleWrap } from "@theia-shell/theia-markdown";

toggleWrap("bold", "**"); // "**bold**"
toggleWrap("**bold**", "**"); // "bold"
toggleHeading("## Title"); // "### Title"; "###### x" becomes "x"
parseOutline("# A\n\nB\n---\n"); // [{ level: 1, text: "A", line: 0 }, { level: 2, text: "B", line: 2 }]
renderMarkdown("<script>x</script> *hi*"); // the tag is escaped, not rendered
```

## Internals

### File content is data, never code

Documents may come from other peers, so nothing in one runs on the app's
origin. `renderMarkdown` runs markdown-it with `html: false`: raw HTML is
escaped and markdown-it's link validation refuses `javascript:` URLs (such a
link stays inert text). The preview widget also passes the result through
DOMPurify. `renderMarkdown` itself does not sanitize; a caller that puts its
output into the page relies on `html: false` alone unless it sanitizes too.

### The preview follows the editor's unsaved text

The preview renders the shared Monaco text model, not the file, so unsaved
edits show live. Every rendered block carries `data-line` (its first source
line, 0-based) so the preview can follow the editor.

### The outline skips code

`parseOutline` finds ATX (`# x`) and setext (`x` underlined with `===` or
`---`) headings, skips fenced code, and strips inline markup from the labels.

### Styling needs the app's Tailwind build

The preview and outline use shadcn/ui components from
[`theia-shadcn`](../theia-shadcn) and Tailwind classes (the preview is typeset
with Tailwind Typography). The app compiles those classes in
[`app/style`](../../app/style).

### Dependencies

`@theia-shell/theia-shadcn` (components), `@theia/core` (which also provides
markdown-it and DOMPurify as `@theia/core/shared/*`), `@theia/editor`,
`@theia/monaco`, `@theia/monaco-editor-core`, `@theia/filesystem`,
`@theia/navigator` and `@theia/workspace`.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
