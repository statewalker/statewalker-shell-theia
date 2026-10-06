# @theia-shell/theia-secret-vault

## What it is

A Theia extension that gives a browser-only app a real secret store: a
password-protected vault, encrypted with WebCrypto, kept in a folder of a
`FilesApi`, behind Theia's `KeyStoreService`.

## Why it exists

Browser-only Theia binds `KeyStoreService` (behind `CredentialsService`, and
VS Code extensions' `context.secrets`) to a stub that silently drops every
secret. This package rebinds it to the vault, so S3 keys and other
credentials survive a reload without ever being stored in clear.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-secret-vault": "workspace:^"`. Theia
loads it through its `theiaExtensions` entry: `frontend` and `frontendOnly` →
`lib/browser/vault-frontend-module`.

`main` (`lib/common/index.js`) exports `SecretVault`, `VaultKeyStore`,
`entryName`, the errors `WrongPasswordError` ("Wrong password"),
`VaultLockedError` ("Secrets are locked") and `VaultCorruptError`, and the
file names `VAULT_KEY_FILE` and `SECRETS_FILE`. `VaultService` and the DI key
`VaultLocation` are imported by path from `lib/browser/vault-service`.

Bind `VaultLocation` to `() => Promise<{ files, dir, persistent }>`: the
`FilesApi`, the folder in it, and whether it survives a reload. The default is
an in-memory, non-persistent location. `theia-files-mounts` binds it to the
main storage's `/.shell`.

Commands (category *Secrets*): *Unlock*, *Lock*, *Change Password* (re-wraps
the data key only), *Forget Remembered Password*, *Reset Vault* (a new key;
the secrets are lost; for a forgotten password). They are also under
*File → Secrets ▸*. A status-bar item shows *Secrets locked* or *Secrets
unlocked*; clicking it unlocks or locks.

Build and test: `pnpm --filter @theia-shell/theia-secret-vault build` and
`pnpm --filter @theia-shell/theia-secret-vault test` (19 unit tests).

## Examples

Point the vault at a folder of a `FilesApi`:

```ts
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ContainerModule } from "@theia/core/shared/inversify";
import { VaultLocation } from "@theia-shell/theia-secret-vault/lib/browser/vault-service";

const files = new MemFilesApi();

export default new ContainerModule((_bind, _unbind, _isBound, rebind) => {
  rebind(VaultLocation).toConstantValue(async () => ({ files, dir: "/.shell", persistent: false }));
});
```

Use `SecretVault` directly:

```ts
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { SecretVault, WrongPasswordError } from "@theia-shell/theia-secret-vault";

const vault = new SecretVault(new MemFilesApi(), "/.shell");
await vault.create("correct horse battery staple");
await vault.set("s3/accessKeyId", "AKIA…");
vault.lock();
try {
  await vault.unlock("wrong");
} catch (error) {
  if (error instanceof WrongPasswordError) console.log(error.message); // "Wrong password"
}
await vault.unlock("correct horse battery staple");
console.log(vault.get("s3/accessKeyId"));
```

Inside Theia, use `CredentialsService` or `KeyStoreService` as usual; the
vault is behind them.

## Internals

### Two files, nothing in clear

The vault lives in a folder of a `FilesApi` (in the app, the main storage's
`/.shell`).

`vault.key.json` — the data key, locked by the password (no secret in clear):

```json
{
  "version": 1,
  "id": "<random uuid>",
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<b64>" },
  "wrap": { "name": "AES-GCM", "iv": "<b64>" },
  "wrappedKey": "<b64>"
}
```

`secrets.json` — `{ "version": 1, "iv": "<b64>", "data": "<b64>" }`: the whole
map of secrets, names and values, as one AES-GCM ciphertext bound to the vault
`id`. A fresh IV on every write; a tampered or swapped file fails to decrypt and
is reported, never silently emptied. Writes re-read the file first and run one
at a time — queued within a tab, and across tabs by the Web Locks API — so
neither two tabs nor two overlapping saves erase each other's secrets. A
corrupt vault file leaves the vault locked and says so in a notification.

### Two keys: one encrypts, one only wraps

- The **data key** (AES-GCM 256) encrypts `secrets.json`. Unlocked, it is held
  non-extractable: code on the page can use it, never read it.
- The **password key** (PBKDF2 of the password) only wraps and unwraps the data key.
- At start: a remembered key unlocks silently; otherwise a dialog asks for the
  password (or a new one, twice, when there is no vault yet), with
  *Remember on this device* and *Skip*. *Remember* keeps the password key, as a
  non-extractable `CryptoKey`, in IndexedDB (`theia-shell-vault-keys`) — never
  the password text.
- A vault on non-persistent storage (in-memory main) is a session vault: a random
  key, no password prompt.
- The start-up prompt opens in `onStart`, before the workbench restores its
  layout (above Theia's loading screen), and is not awaited there.
  `VaultService.startupUnlock` resolves once it is over — unlocked silently or
  through the prompt, skipped, or the vault unreadable — so that what needs the
  vault (restoring files on an S3 mount) can wait for exactly that.
  `VaultService.startupPromptShown` says whether the prompt was shown: waiting
  for it then is the user's time (the prompt has Skip), not a hang, so a waiter
  need not bound it.
  The workbench is attached and its layout restored while the prompt may still
  be open: the dialog makes whatever is added to the page meanwhile inert too
  (Theia's dialogs only inert what is there when they open), so the restored
  editor cannot take the focus or the keys. Another dialog opened over the
  prompt (a `.dialogOverlay`) is left usable.

### When the vault cannot be read, it stays locked and says so

A corrupt `vault.key.json` (`vault.key.json is not valid JSON`) or a
`secrets.json` from another vault or tampered with
(`secrets.json cannot be decrypted with this vault's key`) leaves the vault
locked, with the notification
`Secrets: <message>. The vault stays locked; “Secrets: Reset Vault” starts a new one.`
Nothing is overwritten. While locked or absent, reads through
`KeyStoreService` find nothing and writes throw `VaultLockedError`.

### What the vault does not protect against

Any script running on the app's origin can, while the vault is unlocked, ask it
to decrypt (it cannot extract the keys). At rest, without the password or a
remembered key, the secrets are unreadable. A remembered key trades that at-rest
protection on this device for no prompt.

### Dependencies

Only WebCrypto, IndexedDB and Web Locks from the browser;
`@statewalker/webrun-files` for storage (`@statewalker/webrun-files-mem` for
the default location) and `@theia/core` for the bindings.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
