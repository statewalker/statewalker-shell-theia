# @theia-shell/theia-files-s3

## What it is

The S3 mount type for
[`@theia-shell/theia-files-mounts`](../theia-files-mounts): an S3 bucket (AWS,
or any S3-compatible server such as RustFS or MinIO) as a root folder of the
app, through `@statewalker/webrun-files-s3`. The folder list offers it as
*New S3 Bucket…*.

## Why it exists

`@aws-sdk/client-s3` is large. As its own package, the S3 type is in an app's
bundle only when the app lists it; an app that does not want S3 does not
depend on the SDK.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-files-s3": "workspace:^"`, next to
`theia-files-mounts`. Theia loads it through its `theiaExtensions` entry:
`frontend` and `frontendOnly` → `lib/browser/s3-frontend-module`, which binds
`S3MountType` as a `MountType`.

`main` (`lib/common/index.js`) exports `s3ClientOptions(config, secrets)` and
`normalizeEndpoint(value)`.

The mount's fields: *Endpoint URL* (`endpoint`, http or https; a trailing
slash is dropped), *Region* (`region`, default `us-east-1`), *Bucket*
(`bucket`), *Prefix (optional)* (`prefix`), and two secrets, *Access key ID*
(`accessKeyId`) and *Secret access key* (`secretAccessKey`). The secrets go to
the vault, never to `settings.json`.

Build and test: `pnpm --filter @theia-shell/theia-files-s3 build` and
`pnpm --filter @theia-shell/theia-files-s3 test` (4 unit tests; one needs
Docker).

## Examples

A mount in `settings.json` (the keys are entered in the form and kept in the
vault):

```json
{
  "files.mounts": [
    {
      "key": "cloud", "name": "Cloud", "type": "s3",
      "config": { "endpoint": "http://127.0.0.1:9000", "region": "us-east-1", "bucket": "notes", "prefix": "" }
    }
  ]
}
```

The client options the type builds, for use outside the mount:

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { s3ClientOptions } from "@theia-shell/theia-files-s3";

const client = new S3Client(
  s3ClientOptions(
    { endpoint: "http://127.0.0.1:9000/", region: "" },
    { accessKeyId: "…", secretAccessKey: "…" },
  ),
); // endpoint "http://127.0.0.1:9000", region "us-east-1", path-style
```

## Internals

### Path-style addressing, so S3-compatible servers work

`s3ClientOptions` sets `forcePathStyle: true`. RustFS and MinIO serve buckets
under the path, not as subdomains, and AWS accepts both.

### Errors show when mounting, not on first use

`create` lists the bucket once. Bad keys, a missing bucket or a CORS refusal
then show as the mount's status, `Cloud (unavailable: …)`, instead of on the
first file opened. With the vault locked the mount is `Cloud (locked)` until
*Secrets: Unlock*. With the vault unlocked but no keys stored, the status is
`The access keys are missing; edit the mount to enter them.` A malformed
endpoint is refused with
`The endpoint must be an http:// or https:// URL, not "<value>".`

### A browser reaches only buckets whose CORS rule allows it

The browser calls S3 directly, so the bucket's CORS rule must allow the app's
origin and every header the SDK sends. A `*` in `AllowedHeaders` does not
cover `Authorization`, which every signed request sends, and some servers
(RustFS) echo `AllowedHeaders` literally. `S3_BROWSER_HEADERS` in
[`tools/rustfs.mjs`](../../tools/rustfs.mjs) is the list that works; use it
for real buckets too. It includes `x-amz-checksum-mode`, which reads send,
and `x-amz-copy-source` and `x-amz-metadata-directive`, which copy and move
send. S3 has no native move, so `move()` is `CopyObject` plus `remove()`.
Without those headers the preflight is refused and the browser reports
`Failed to fetch`.

### Tests run against RustFS in Docker

One unit test here and the S3 e2e tests in
[`app/tests/s3.spec.ts`](../../app/tests/s3.spec.ts) run against RustFS in
Docker, started by [`tools/rustfs.mjs`](../../tools/rustfs.mjs), which sets the
bucket's CORS rule with `PutBucketCors`. They are skipped when Docker is not
available.

### Dependencies

`@aws-sdk/client-s3` (the client), `@statewalker/webrun-files-s3` (the
`FilesApi` over it), `@statewalker/webrun-files`, `theia-files-mounts` (the
`MountType` it implements) and `@theia/core`.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
