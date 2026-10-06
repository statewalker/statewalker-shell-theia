# Markdown modes — design

Status: agreed in conversation 2026-10-06; awaiting review of this written form.

## Goal

A Markdown document is **one tab** that shows its **source**, its **rendered preview**, or
**both side by side**, switched from icon buttons on the tab. The **outline works in every
mode**.

- Three modes: **Source**, **Preview**, **Split** (source left, preview right).
- Switched by three icon buttons in the editor's tab-bar toolbar (the active one highlighted),
  by commands, and by `Ctrl/Cmd+Shift+V`, which cycles Source → Preview → Split.
- **Each file reopens in the mode it was last left in**, across reloads. A file never opened
  before uses the `markdown.defaultMode` setting (`source` | `preview` | `split`, default
  `split`).
- **One outline**: Theia's own *Outline* view lists the headings in every mode. Clicking a
  heading reveals it in the source and scrolls the preview to it.
- **Split scrolls together by heading**: when the source enters a section, the preview scrolls to
  that section's heading, and the reverse.

## Non-goals

- No line-accurate scroll sync (no source map in the renderer); sync is by heading only.
- No editing in the preview.
- No change to how the preview renders (markdown-it with `html: false`, then DOMPurify, styled by
  Tailwind Typography and the shadcn tokens).
- No second outline: the custom *Markdown Outline* view is removed, not kept beside Theia's.

## Extension rule

Theia is extended, never patched: subclassing exported classes and rebinding services.

## Design

### The widget is an `EditorWidget`

`EditorWidgetFactory.constructEditor(uri)` builds every code editor. A subclass,
`MarkdownEditorWidgetFactory`, returns a **`MarkdownEditorWidget extends EditorWidget`** for
`.md`/`.markdown` URIs and defers to the base class for everything else. It is rebound in place of
`EditorWidgetFactory` (same factory id `code-editor-opener`, so saved layouts restore).

Because the tab *is* an `EditorWidget`, everything that tracks editors keeps working unchanged:
save and the dirty marker (`saveable`), Find/Replace, undo, the editor context menus, the Ln/Col
and language status-bar items, `EditorManager.currentEditor` (and so the Markdown Bold / Italic /
Heading commands), navigation history and layout restore.

```
MarkdownEditorWidget.node  (flex row)
├── Monaco's DOM            source pane   — hidden in Preview
└── div.markdown-preview    preview pane  — hidden in Source
```

`onResize` gives Monaco the source pane's size through `editor.setSize(...)`: the full width in
Source, half in Split. In Preview the Monaco pane is hidden but the editor stays alive: its model,
cursor and undo stack are kept, and the outline keeps working.

The preview pane renders the editor's own document model, so unsaved changes show live, as the
preview widget did. Rendering is throttled to one frame.

**Spike first.** Before anything else, a throwaway check that Monaco sizes and repaints correctly
next to a sibling pane inside `EditorWidget.node` (resize, show/hide, split ↔ source) in this
Theia version. If it does not, stop and revisit the approach.

### Modes

```ts
type MarkdownMode = "source" | "preview" | "split";
```

- `MarkdownEditorWidget.mode` is read and set through the widget; setting it re-lays out the panes
  and fires `onDidChangeMode`.
- `MarkdownModeStore` keeps `uri → mode` in Theia's `StorageService` (browser local storage), so
  the mode survives closing the tab and reloading. The widget reads it when created and writes it
  on every change.
- `markdown.defaultMode` is a preference contributed by `theia-markdown`.
- Commands (category *Markdown*): **Show Source**, **Show Preview**, **Show Source and Preview**,
  and **Cycle View Mode** (`Ctrl/Cmd+Shift+V`, `when: editorLangId == markdown`). Each is enabled
  when the current editor is a `MarkdownEditorWidget`.
- The three mode commands are tab-bar toolbar items with codicons (`code`, `open-preview`,
  `split-horizontal`), each `toggled` when it is the current mode.
- The explorer's *Open Markdown Preview* opens the file and sets Preview.
- In Preview the widget is focusable so its keybindings still apply: `node` gets `tabIndex`, and
  activation focuses the preview pane instead of Monaco.

### One outline

- A Monaco `DocumentSymbolProvider` for `markdown`, built on the existing `parseOutline`,
  returns the headings nested by level. Theia's *Outline* view (fed by `@theia/monaco` from
  document symbols), the editor breadcrumbs and *Go to Symbol in Editor* (`Ctrl+Shift+O`) then
  work for Markdown.
- Clicking a heading in the Outline sets the editor's cursor to it, as for any language. The
  widget listens to the cursor: in Preview and Split it scrolls the preview to that heading.
  `renderMarkdown` gains an option that adds `data-line="<0-based source line>"` to each rendered
  heading (from markdown-it's `token.map`; DOMPurify keeps `data-*`), so the preview finds a
  heading by its source line, not by position. The chat, which shares the renderer, does not pass
  the option.
- `MarkdownOutlineWidget`, its view contribution (`markdown.toggleOutline`) and *Markdown: Show
  Outline* are removed.

### Scroll sync by heading (Split)

- `headingAt(items, line)`: the last heading whose line is ≤ `line` (or none). A pure function in
  `common/`.
- Source → preview: on Monaco's scroll change, the heading at the top visible line; if it changed
  since the last sync, scroll the preview to it.
- Preview → source: on the preview's scroll, the last heading at or above the pane's top; if it
  changed, reveal its line at the top of the source.
- A `syncing` flag ignores the scroll event that a sync itself causes, so the two panes never
  chase each other.

### Removed

- `MarkdownPreviewWidget` (the second tab) and its widget factory. Its rendering moves into the
  preview pane.
- `MarkdownOutlineWidget` and its factory and view contribution.
- *Markdown: Open Preview to the Side* and *Markdown: Show Outline*. Its key moves to *Cycle View
  Mode*. *Open Markdown Preview* (explorer) stays, now meaning "open in Preview".

## Testing

- **Unit (vitest, `theia-markdown`):** the outline → document-symbol mapping (nesting by level,
  ranges); `headingAt` (before the first heading, on a heading line, between headings, after the
  last).
- **e2e (`app/tests`):**
  - opening a `.md` file uses the default mode (Split): one tab, both panes visible;
  - the toolbar buttons switch modes; Source hides the preview, Preview hides the source;
  - the mode is remembered across a reload, per file;
  - the Outline lists the headings in Preview mode, and clicking one scrolls the preview to it;
  - in Split, revealing a heading in the source scrolls the preview to it;
  - Save works while in Preview, after an edit made in Source.
  - `markdown.spec.ts` and `shadcn.spec.ts` are updated: their outline and preview cases move to
    the modes.

## Docs

The `theia-markdown` README (commands, menus, views, how the outline works), the app README's
package table, and the seeded `welcome.md` text (it names *Open Preview to the Side* and *Show
Outline*), all in the same commit as the behaviour.
