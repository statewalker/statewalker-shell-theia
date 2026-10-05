# @theia-shell/theia-shadcn

## What it is

[shadcn/ui](https://ui.shadcn.com/) for Theia: the components (on Theia's
shared React), the design tokens per Theia theme type, and an opt-in,
CSS-only restyling of Theia's own menus, dialogs, buttons, inputs and toasts
with them. shadcn's variables are the single source of truth: Theia's DOM is
restyled with them, and its rendering is left alone.

## Why it exists

The extensions' own widgets (the Markdown outline and preview, the viewers'
status lines) are React. Building them from shadcn/ui gives them one look,
and the tokens make that look follow Theia's colour theme. The same tokens can
restyle Theia's native widgets, so the whole workbench can take shadcn's shape
when a user wants it, while the default stays stock Theia.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-shadcn": "workspace:^"`. Theia loads it
through its `theiaExtensions` entry: `frontend` and `frontendOnly` →
`lib/browser/shadcn-frontend-module`, which registers the `appearance.style`
preference and the *Appearance: Toggle shadcn/ui Style* command.

`main` is `lib/browser/index.js`: the components `Button` (and
`buttonVariants`), `Badge`, `Card` (with `CardHeader`, `CardTitle`,
`CardDescription`, `CardAction`, `CardContent`, `CardFooter`), `Input`,
`Kbd` / `KbdGroup`, `Separator`, the `cn()` helper, and the style preference
(`STYLE_PREFERENCE`, `STYLE_CLASS`, `ShadcnStyle`, `ShadcnStyleCommands`).

`src/browser/style/theme.css` is a Tailwind v4 source file, not plain CSS: an
app compiles it into its own Tailwind entry, as [`app/style`](../../app/style)
does.

Build and test: `pnpm --filter @theia-shell/theia-shadcn build` and
`pnpm --filter @theia-shell/theia-shadcn test` (6 unit tests: `cn`, the button
variants, `asChild`, and the `data-slot` of every component). The look in the
running app is covered by
[`app/tests/shadcn.spec.ts`](../../app/tests/shadcn.spec.ts).

## Examples

A component inside a Theia `ReactWidget`:

```tsx
import * as React from "@theia/core/shared/react";
import { Button, Kbd } from "@theia-shell/theia-shadcn";

<Button variant="ghost" size="sm" onClick={reveal}>
  Getting started <Kbd>Ctrl+P</Kbd>
</Button>;
```

`variant` is one of `default`, `destructive`, `outline`, `secondary`, `ghost`,
`link`; `size` one of `default`, `sm`, `lg`, `icon`, `icon-sm`, `icon-lg`.

Switching the style from code:

```ts
import { PreferenceScope, type PreferenceService } from "@theia/core/lib/common/preferences";
import { STYLE_PREFERENCE } from "@theia-shell/theia-shadcn";

declare const preferences: PreferenceService; // injected
await preferences.set(STYLE_PREFERENCE, "shadcn", PreferenceScope.User);
```

## Internals

### Two styles, on top of any colour theme

The style is independent of the colour theme, so one app can run with either
look:

| `appearance.style` | Look |
|---|---|
| `"theia"` (default) | Stock Theia. The shadcn tokens borrow the colour theme's colours (`--primary` is the theme's button colour, `--accent` its list hover, and so on). Theia's widgets are untouched, and the shadcn components in our widgets look native. |
| `"shadcn"` | shadcn/ui. Light and dark themes get shadcn's *neutral* tokens, Theia's colour variables are mapped onto them, and Theia's menus, dialogs, buttons, inputs and toasts take shadcn's shape. High-contrast themes keep their own colours and get only the shape. |

Switch it with *Appearance: Toggle shadcn/ui Style* in the command palette, or
in Preferences. The change applies live and is stored as a user preference. The
extension's frontend module registers the preference and the command, and
keeps `shadcn-ui` on `<body>` in step with the preference. Every rule of the
shadcn style is scoped to `body.shadcn-ui`. A unit test in
[`app/style`](../../app/style) checks that no rule on Theia's own classes
escapes that scope.

### The components are shadcn's source, on Theia's React

`Button`, `Badge`, `Card` (with `CardHeader`, `CardTitle`, `CardDescription`,
`CardAction`, `CardContent`, `CardFooter`), `Input`, `Kbd`/`KbdGroup`,
`Separator`, and `cn()`. They are shadcn's *new-york* v4 source with two
changes: React comes from `@theia/core/shared/react`, so the components share
Theia's React instance, and Radix is imported per primitive
(`@radix-ui/react-slot`, `@radix-ui/react-separator`) rather than through the
`radix-ui` umbrella package. Class strings are unchanged, so later shadcn
updates can be copied over as they are.

Use them inside `ReactWidget`s. There are no components that portal (Dialog,
Popover, Tooltip, DropdownMenu). Radix renders their content into
`body`, so it needs a `z-index` above Theia's dialog overlay (5000). Theia's
global keybinding handler and Lumino's focus tracking can also fight Radix's
focus trap. A portalling component needs an e2e test of Esc, Tab and shortcuts
while it is open.

### What theme.css holds

This is a Tailwind v4 **source** file, so it cannot be imported as it is. An
app compiles it into its own Tailwind entry. See [`app/style`](../../app/style)
for how, including why preflight is left out. It holds:

1. **Tokens.** By default they map *to* Theia's colour variables, for every
   theme. Under `body.shadcn-ui.theia-light` and `.theia-dark` they take
   shadcn's *neutral* values. Theia puts `theia-<type>` on `<body>`.
2. **`@theme inline`**, which turns the tokens into utilities (`bg-primary`,
   `rounded-md` = `var(--radius) - 2px`, …). The `dark:` variant is keyed to
   `.theia-dark` and `.theia-hc`.
3. **Theia's variables mapped to the tokens** (`--theia-menu-*`,
   `--theia-button-*`, notifications, `--theia-ui-font-family`). This happens
   only under the shadcn style, and only for light and dark. They are defined on `body`, not `:root`, because the active VS
   Code theme writes `--theia-*` on `:root`.
4. **Native widgets in shadcn's shape**, only under the shadcn style. Each is
   written with `@apply` and the
   class string of the matching shadcn component:
   - Lumino menus: `DropdownMenuContent` / `DropdownMenuItem`;
   - `.dialogBlock`: `DialogContent`;
   - `.theia-button`: `Button`, with `.secondary` as `outline`;
   - `.theia-input`: `Input`;
   - notification toasts.

   Every selector starts with `body.shadcn-ui`, so it beats Theia's rule
   whatever order the bundle puts the stylesheets in.
5. **A scoped preflight** for `[data-slot]` elements (the shadcn components):
   no UA borders, margins or button chrome. It is in `@layer base`, so any
   utility overrides it.
6. **`prose-shadcn`**, which colours Tailwind Typography with the tokens.

### Two things that are easy to get wrong

- Lumino menu items are `display: table-row`, and table rows cannot be rounded.
  So the radius goes on the first and last cells, as Theia's own CSS does, and
  `.lm-Menu-item { border-radius }` would do nothing.
- Theia's rule for the active item's cells (`.lm-Menu-item.lm-mod-active >
  div:first-child`, specificity 0,3,0) outranks a plain `body .lm-Menu-item >
  div:first-child`. A `body` prefix alone is not always enough. Check the
  specificity.

### Icons stay Theia's codicons

Commands, tabs and views take a CSS class (`codicon codicon-*`), not a
component, and both styles keep those icons. Lucide, shadcn's icon set, is not
used.

### Dependencies

`@radix-ui/react-slot` and `@radix-ui/react-separator` (imported per
primitive), `class-variance-authority`, `clsx` and `tailwind-merge` (the
variants and `cn`), and `@theia/core` (React, preferences, commands).

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
