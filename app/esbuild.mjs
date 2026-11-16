/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import esbuild from "esbuild";
import { browserOptions, watch } from "./gen-esbuild.browser.mjs";

// The mesh edge's ServiceWorker must sit un-hashed at the origin root (see
// `@theia-shell/theia-httpeers`'s `scripts/copy-sw.mjs`).
const require = createRequire(import.meta.url);
mkdirSync("lib/frontend", { recursive: true });
copyFileSync(require.resolve("@theia-shell/theia-httpeers/lib/sw.js"), "lib/frontend/sw.js");

const browserContext = await esbuild.context(browserOptions);

if (watch) {
  await browserContext.watch();
} else {
  try {
    await browserContext.rebuild();
    await browserContext.dispose();
  } catch {
    process.exit(1);
  }
}
