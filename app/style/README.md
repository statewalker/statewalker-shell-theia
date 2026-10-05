# @theia-shell/app-style

## What it is

The app's stylesheet, as a Theia extension. It is one Tailwind v4 build over
the sources of the app's Tailwind-styled extensions, plus the shadcn/ui tokens
and the alignment of Theia's widgets from
[`@theia-shell/theia-shadcn`](../../packages/theia-shadcn). A private package
of this workspace, not published.

## Why it exists

`theia-markdown`, `theia-image-viewer` and `theia-pdf-viewer` use Tailwind
utility classes and ship no CSS for them. Only the app knows which extensions
it includes, so the app compiles their classes in one place. It is a separate
extension because Theia ignores `theiaExtensions` in the application's own
`package.json`.

## How to use

- `pnpm --filter @theia-shell/app-style build` runs
  `tailwindcss -i src/app.css -o lib/app.css`, then `tsc`.
- `theiaExtensions`: `frontendOnly` → `lib/app-style-frontend-module`. The
  module only imports `./app.css`, so Theia's bundler adds it to `bundle.css`.
- The app lists it in its dependencies (`"@theia-shell/app-style": "workspace:^"`).

## Examples

Adding an extension whose sources hold Tailwind classes takes one line in
`src/app.css`:

```css
/* The app's extensions whose classes are Tailwind utilities. */
@source "../../../packages/theia-markdown/src";
@source "../../../packages/theia-image-viewer/src";
@source "../../../packages/theia-pdf-viewer/src";
@source "../../../packages/<new-extension>/src";
```

Without it, the extension's classes have no CSS and its layout falls apart.

## Internals

### Three rules keep Tailwind from disturbing Theia

- **No preflight.** Only `tailwindcss/theme.css` and
  `tailwindcss/utilities.css` are imported. Preflight would reset Theia's CSS
  (headings, lists, borders). The shadcn components get a reset scoped to
  `[data-slot]` instead.
- **Utilities are not in a cascade layer.** Theia's CSS is unlayered, and an
  unlayered rule beats every layered one. In `@layer utilities`, Theia's
  `.lm-Widget` and similar rules would override the utilities on the
  extensions' own elements.
- **No utility may share a class name with Theia's DOM.** The classes are not
  prefixed, so shadcn's class strings stay copyable. But Tailwind generates a
  utility for any matching word in a scanned file, comments included. `fixed`
  (Monaco's context view) and `container` (`@theia/callhierarchy`) are
  therefore excluded with `@source not inline("container fixed")`. If another
  name collides, exclude it the same way, or switch to a Tailwind prefix
  (`tw:`, which shadcn's CLI supports).

### Checking for class-name collisions

`node tools/audit-classes.mjs`, run after the app's build (it reads
`app/src-gen`), lists every utility in `lib/app.css` whose name Theia or
Monaco also put on their own DOM. Currently it stops with
`ENOENT: no such file or directory, scandir '…/node_modules/@theia/process/lib/browser'`,
because it expects every Theia package the app loads to have a `lib/browser`
folder.

### Dependencies

`@theia/core` at runtime (for `ContainerModule`). The build uses
`tailwindcss`, `@tailwindcss/cli`, `@tailwindcss/typography` (the preview's
prose) and `@theia-shell/theia-shadcn` (its `theme.css` source).

### Tests read the compiled CSS

`pnpm --filter @theia-shell/app-style test` runs 6 unit tests on `lib/app.css`,
so build first; otherwise they fail with `ENOENT` on `lib/app.css`. They check
that there is no preflight, that no utility is in a cascade layer, that both
theme types have tokens, that every rule on Theia's own classes is scoped to
`body.shadcn-ui` (so the default style stays stock Theia), and that the
excluded names are absent.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
