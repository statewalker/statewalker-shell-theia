// Checks the installed `decompress` (this folder, through the override) the way @theia/cli and
// @theia/plugin-ext load it. Archives are built with the system `tar`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const decompress = createRequire(import.meta.url)(process.env.DECOMPRESS ?? "decompress");

function workdir() {
  return mkdtempSync(path.join(tmpdir(), "decompress-test-"));
}

test("extracts a regular archive and resolves the extracted files", async () => {
  const dir = workdir();
  mkdirSync(path.join(dir, "src/pkg"), { recursive: true });
  writeFileSync(path.join(dir, "src/pkg/a.txt"), "hello");
  execFileSync("tar", ["czf", path.join(dir, "a.tgz"), "-C", path.join(dir, "src"), "pkg"]);

  const files = await decompress(path.join(dir, "a.tgz"), path.join(dir, "out"));

  assert.ok(files.some((f) => f.path === "pkg/a.txt"));
  assert.equal(readFileSync(path.join(dir, "out/pkg/a.txt"), "utf8"), "hello");
});

test("refuses a write through a symlink that points outside the output directory", async () => {
  const dir = workdir();
  const outside = path.join(dir, "outside");
  mkdirSync(outside);
  mkdirSync(path.join(dir, "s1"));
  symlinkSync(outside, path.join(dir, "s1/link"));
  mkdirSync(path.join(dir, "s2/link"), { recursive: true });
  writeFileSync(path.join(dir, "s2/link/pwned"), "pwned");
  const archive = path.join(dir, "evil.tar");
  execFileSync("tar", ["cf", archive, "-C", path.join(dir, "s1"), "link"]);
  execFileSync("tar", ["rf", archive, "-C", path.join(dir, "s2"), "link/pwned"]);

  await assert.rejects(decompress(archive, path.join(dir, "out")));
  assert.equal(existsSync(path.join(outside, "pwned")), false);
});
