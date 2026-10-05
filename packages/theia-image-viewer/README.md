# @theia-shell/theia-image-viewer

## What it is

A Theia extension that opens image files in a zoomable viewer instead of the
text editor: PNG, JPEG, GIF, WebP, AVIF, BMP, ICO and SVG. It works in
browser-only apps and in apps with a backend.

## Why it exists

Theia opens an image in the text editor, as bytes. This viewer shows it, at
fit or actual size, and behaves like an editor tab: *Open Editors* lists it,
the explorer follows it, a rename moves it. It depends on no other package of
this workspace, so any Theia app can add it.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-image-viewer": "workspace:^"`; it takes
over the image file types. Theia loads it through its `theiaExtensions` entry:
`frontend` and `frontendOnly` → `lib/browser/image-viewer-frontend-module`.

`main` (`lib/common/index.js`) exports the view logic: `imageMimeType`,
`fitScale`, `ZOOM_LEVELS`, `stepZoom`, `formatZoom` and the `Size` type.

| Contribution | What |
|---|---|
| Open handler | Priority 500 for image extensions (the text editor has 100). *Open With…* still offers the editor. |
| Commands | *Image: Zoom In*, *Zoom Out*, *Actual Size*, *Fit to Window* |
| Tab toolbar | The same four commands, as buttons on the viewer's tab bar |
| Menu | *View → Image ▸* |
| Keybindings | `=`/`+` zoom in, `-` zoom out, `1` actual size, `0` fit, only while an image viewer has the focus (context `imageViewerFocus`) |

The viewer needs Tailwind CSS compiled by the app (see *Internals*).

Build and test: `pnpm --filter @theia-shell/theia-image-viewer build` and
`pnpm --filter @theia-shell/theia-image-viewer test` (22 unit tests: MIME
types, fit, zoom steps, which file changes trigger a reload). The e2e tests are
in [`app/tests/viewers.spec.ts`](../../app/tests/viewers.spec.ts).

## Examples

```ts
import { fitScale, formatZoom, imageMimeType, stepZoom } from "@theia-shell/theia-image-viewer";

imageMimeType("/media/logo.svg"); // "image/svg+xml"
imageMimeType("/notes/a.md"); // undefined: not an image
const scale = fitScale({ width: 4000, height: 3000 }, { width: 800, height: 600 }); // 0.2
formatZoom(scale); // "20%"
stepZoom(scale, 1); // 0.25, the next preset up
stepZoom(16, 1); // 16: past the last preset it stays
```

## Internals

### The image is shown from bytes, never from a URL of the file

The viewer reads the file through Theia's `FileService` and shows it as a
`blob:` URL. So it works over any file system provider, including a
`FilesApi` with no HTTP address. A status line shows
`width × height · zoom · size`. Clicking the image toggles fit and actual size.
Fit never enlarges: `fitScale` is at most 1.

### SVG cannot run scripts

SVG is displayed through `<img>`, so scripts inside an SVG never run. Files may
come from other peers; their content is data, never code on the app's origin.

### The viewer reloads on changes to its file, and recovers

It reloads when the file itself changes, or when an ancestor folder is
deleted. If the file can no longer be read, the status line says
`<name> cannot be read (deleted or moved?)`, next to a *Reload* button. While
it cannot be read, a change to an ancestor folder (a mount re-created after a
vault unlock) reloads it too. A readable image ignores such changes (a
`files.hidden` edit), so its zoom stays.

### It is navigatable, like a text editor

The viewer is `Navigatable`. *Open Editors* lists it, the explorer reveals its
file when it becomes active (`explorer.autoReveal`), a rename or move re-opens
it at the new name, and deleting the file from the explorer closes it.

### Styling needs the app's Tailwind build

The widget uses Tailwind utility classes coloured by the shadcn/ui tokens and
ships no CSS for them. The app compiles them, as [`app/style`](../../app/style)
does. In an app without that build the classes have no CSS and the layout
falls apart.

### Dependencies

`@theia/core` and `@theia/filesystem` only.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
