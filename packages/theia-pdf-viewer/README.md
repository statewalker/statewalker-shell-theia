# @theia-shell/theia-pdf-viewer

## What it is

A Theia extension that opens `.pdf` files in
[EmbedPDF](https://www.embedpdf.com/) (`@embedpdf/snippet`): PDFium compiled to
WebAssembly, running in a Web Worker, with EmbedPDF's toolbar (pages, zoom,
pan, search, thumbnails, print). It makes no network request.

## Why it exists

Theia opens a PDF in the text editor, as bytes. The app runs offline and its
files come from a `FilesApi`, not from URLs, so a viewer that loads its engine,
fonts or the document from the network does not fit. This one embeds
everything in the bundle and reads the document through Theia's `FileService`.
It depends on no other package of this workspace.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-pdf-viewer": "workspace:^"`. Theia loads
it through its `theiaExtensions` entry: `frontend` and `frontendOnly` →
`lib/browser/pdf-viewer-frontend-module`. It opens `.pdf` files with priority
500 (the text editor has 100), so *Open With…* still offers the editor.

`main` (`lib/common/index.js`) exports `createTextPdf(lines, fontSize = 24)`,
which writes a minimal valid one-page PDF, and `isPdfPath(path)`.

The viewer needs Tailwind CSS compiled by the app (see *Internals*).

Build and test: `pnpm --filter @theia-shell/theia-pdf-viewer build` and
`pnpm --filter @theia-shell/theia-pdf-viewer test` (17 unit tests). The e2e
tests are in [`app/tests/viewers.spec.ts`](../../app/tests/viewers.spec.ts)
and [`protos/p7-embedpdf`](../../protos/p7-embedpdf).

## Examples

A sample PDF with no binary fixture (the app seeds `docs/sample.pdf` this way):

```ts
import { createTextPdf, isPdfPath } from "@theia-shell/theia-pdf-viewer";

const bytes: Uint8Array = createTextPdf(["Hello", "A second line"], 18);
await files.write("/docs/sample.pdf", [bytes]); // files: a FilesApi
isPdfPath("/docs/sample.PDF"); // true
```

Text is ASCII or Latin-1; `(`, `)` and `\` are escaped.

## Internals

### Nothing is fetched from the network

- PDFium's wasm is embedded in the bundle:
  `import pdfiumWasm from "@embedpdf/snippet/dist/pdfium.wasm"` works because
  Theia's esbuild loads `.wasm` as a data URL. It is passed as `wasmUrl`.
- The fallback fonts (jsDelivr), Google Fonts and the stamp manifest are
  switched off: `fontFallback: null`, `fonts: { ui: null, signature: null }`,
  `stamp: { manifests: [] }`.
- The PDF's bytes come from Theia's `FileService`, as a `blob:` URL.

The cost is about 2 MB of JS plus the 4.6 MB wasm, as base64 in the bundle.

### It is a viewer, not an editor

The `annotation` and `redaction` categories are disabled. EmbedPDF can export
a modified document, but nothing saves it back to the file.

### The viewer reloads on changes to its file, and recovers

It reloads when the file itself changes, or when an ancestor folder is deleted
(a new EmbedPDF instance; page and zoom reset). If the file can no longer be
read, it shows `<name> cannot be read (deleted or moved?)` next to a *Reload*
button. While it cannot be read, a change to an ancestor folder (a mount
re-created after a vault unlock) reloads it too. A readable PDF ignores such
changes (a `files.hidden` edit), so its page and zoom stay.

### It is navigatable, like a text editor

*Open Editors* lists it, the explorer reveals its file when it becomes active,
a rename or move re-opens it at the new name, and deleting the file from the
explorer closes it. The viewer's theme follows Theia's light or dark theme.

### Styling needs the app's Tailwind build

The widget uses Tailwind utility classes coloured by the shadcn/ui tokens and
ships no CSS for them. The app compiles them, as [`app/style`](../../app/style)
does. In an app without that build the classes have no CSS and the layout
falls apart.

### Dependencies

`@embedpdf/snippet` (the viewer and PDFium), `@theia/core` and
`@theia/filesystem`.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
