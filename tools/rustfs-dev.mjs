#!/usr/bin/env node
// A local RustFS (S3) for working with the app's S3 mounts by hand, with its web console.
//
//   node tools/rustfs-dev.mjs start    run it (or keep the running one), make the bucket, fix CORS
//   node tools/rustfs-dev.mjs check    check the bucket's CORS against every origin; fix what is missing
//   node tools/rustfs-dev.mjs status   the container, the endpoints, the CORS origins
//   node tools/rustfs-dev.mjs stop     remove the container (the data volume stays)
//
// Options: --port 9100 (S3 API)  --console-port 9101  --bucket theia-shell
//          --origin <url> (repeatable; replaces the default origins)  --no-fix (check only)
//          --reset (also delete the data volume on stop)
//
// The bucket's CORS rule must name every origin the app is opened from: a browser page signs its
// S3 requests itself, and RustFS answers a preflight only for the origins the rule lists. `check`
// reads the rule, then sends a real preflight from each origin, as the browser would.
import { execFileSync } from "node:child_process";
import {
  CreateBucketCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { hasDocker, RUSTFS_IMAGE, S3_BROWSER_HEADERS } from "./rustfs.mjs";

const DEFAULT_ORIGINS = [
  "http://127.0.0.1:3001",
  "http://localhost:3001",
  "https://theia.httpeers.net",
];
const ACCESS_KEY = "theiashell";
const SECRET_KEY = "theiashell-secret";
const METHODS = ["GET", "PUT", "POST", "DELETE", "HEAD"];

function parseArgs(argv) {
  const opts = {
    command: "start",
    port: 9100,
    consolePort: 9101,
    bucket: "theia-shell",
    origins: [],
    fix: true,
    reset: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") opts.port = Number(argv[++i]);
    else if (a === "--console-port") opts.consolePort = Number(argv[++i]);
    else if (a === "--bucket") opts.bucket = argv[++i];
    else if (a === "--origin") opts.origins.push(argv[++i].replace(/\/$/, ""));
    else if (a === "--no-fix") opts.fix = false;
    else if (a === "--reset") opts.reset = true;
    else if (!a.startsWith("--")) opts.command = a;
    else throw new Error(`unknown option ${a}`);
  }
  if (opts.origins.length === 0) opts.origins = DEFAULT_ORIGINS;
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const name = `theia-shell-rustfs-${opts.port}`;
const volume = `${name}-data`;
const endpoint = `http://127.0.0.1:${opts.port}`;
const consoleUrl = `http://127.0.0.1:${opts.consolePort}/rustfs/console/`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const client = () =>
  new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });

/** "running", "exited", ... or null when there is no such container. */
function containerState() {
  try {
    return docker("inspect", "--format", "{{.State.Status}}", name);
  } catch {
    return null;
  }
}

/** The host ports the container publishes, e.g. { "9000/tcp": "9100", "9001/tcp": "9101" }. */
function publishedPorts() {
  const json = docker("inspect", "--format", "{{json .NetworkSettings.Ports}}", name);
  const out = {};
  for (const [port, bindings] of Object.entries(JSON.parse(json) ?? {}))
    out[port] = bindings?.[0]?.HostPort;
  return out;
}

async function waitReady(s3) {
  for (let i = 0; ; i++) {
    try {
      await s3.send(new ListObjectsV2Command({ Bucket: "ready-probe" }));
      return;
    } catch (error) {
      // Any S3 answer (NoSuchBucket) means the API is up; a socket error means not yet.
      if (error?.$metadata?.httpStatusCode) return;
      if (i > 80) throw new Error(`RustFS did not answer on ${endpoint}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

function startContainer() {
  const state = containerState();
  if (state === "running") {
    const ports = publishedPorts();
    if (ports["9000/tcp"] === String(opts.port) && ports["9001/tcp"] === String(opts.consolePort)) {
      console.log(`container ${name}: running`);
      return;
    }
    // Ports cannot be added to a container: recreate it. The data volume keeps the buckets.
    console.log(
      `container ${name}: running with other ports (${JSON.stringify(ports)}), recreating`,
    );
  }
  if (state) docker("rm", "-f", name);
  docker(
    "run",
    "-d",
    "--name",
    name,
    "-p",
    `127.0.0.1:${opts.port}:9000`,
    "-p",
    `127.0.0.1:${opts.consolePort}:9001`,
    "-v",
    `${volume}:/data`,
    "-e",
    `RUSTFS_ACCESS_KEY=${ACCESS_KEY}`,
    "-e",
    `RUSTFS_SECRET_KEY=${SECRET_KEY}`,
    "-e",
    "RUSTFS_CONSOLE_ENABLE=true",
    RUSTFS_IMAGE,
  );
  console.log(`container ${name}: started (${RUSTFS_IMAGE}, data in volume ${volume})`);
}

async function ensureBucket(s3) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: opts.bucket }));
    console.log(`bucket ${opts.bucket}: exists`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: opts.bucket }));
    await s3.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: "hello.md",
        Body: "# Hello from RustFS\n\nThis file lives in the S3 bucket.\n",
        ContentType: "text/markdown",
      }),
    );
    console.log(`bucket ${opts.bucket}: created, with hello.md`);
  }
}

async function currentRules(s3) {
  try {
    return (await s3.send(new GetBucketCorsCommand({ Bucket: opts.bucket }))).CORSRules ?? [];
  } catch (error) {
    if (error?.name === "NoSuchCORSConfiguration" || error?.Code === "NoSuchCORSConfiguration")
      return [];
    throw error;
  }
}

/** What a browser would see: a preflight for a signed listing from `origin`. */
async function preflight(origin) {
  const res = await fetch(`${endpoint}/${opts.bucket}/?list-type=2`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers":
        "authorization,x-amz-date,x-amz-content-sha256,x-amz-copy-source",
    },
  });
  const allowOrigin = res.headers.get("access-control-allow-origin");
  const allowHeaders = (res.headers.get("access-control-allow-headers") ?? "").toLowerCase();
  const allowMethods = (res.headers.get("access-control-allow-methods") ?? "").toUpperCase();
  const problems = [];
  if (!res.ok) problems.push(`preflight answered HTTP ${res.status}`);
  if (allowOrigin !== origin && allowOrigin !== "*")
    problems.push(`Access-Control-Allow-Origin is ${JSON.stringify(allowOrigin)}`);
  for (const h of ["authorization", "x-amz-date", "x-amz-content-sha256", "x-amz-copy-source"])
    if (!allowHeaders.includes(h)) problems.push(`header ${h} not allowed`);
  if (!allowMethods.includes("PUT")) problems.push("PUT not allowed");
  return problems;
}

/** Check every origin; with fix on, rewrite the rule to cover them all (keeping origins it had). */
async function checkCors(s3) {
  const rules = await currentRules(s3);
  const listed = new Set(rules.flatMap((r) => r.AllowedOrigins ?? []));
  let failing = [];
  for (const origin of opts.origins) {
    const problems = await preflight(origin);
    console.log(`CORS ${origin}: ${problems.length ? `FAIL (${problems.join("; ")})` : "ok"}`);
    if (problems.length) failing.push(origin);
  }
  if (failing.length === 0) return true;
  if (!opts.fix) return false;

  const origins = [...new Set([...listed, ...opts.origins])].sort();
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: opts.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: METHODS,
            AllowedHeaders: S3_BROWSER_HEADERS,
            ExposeHeaders: ["ETag", "x-amz-version-id"],
            MaxAgeSeconds: 600,
          },
        ],
      },
    }),
  );
  console.log(`CORS rule rewritten for: ${origins.join(", ")}`);
  failing = [];
  for (const origin of opts.origins) {
    const problems = await preflight(origin);
    if (problems.length) failing.push(`${origin} (${problems.join("; ")})`);
  }
  if (failing.length) {
    console.log(`CORS still failing after the fix: ${failing.join(", ")}`);
    return false;
  }
  console.log("CORS ok for every origin after the fix");
  return true;
}

function summary(origins) {
  console.log(`
S3 API       ${endpoint}   (the mount's endpoint; region us-east-1)
Web console  ${consoleUrl}
Bucket       ${opts.bucket}
Keys         ${ACCESS_KEY} / ${SECRET_KEY}
Origins      ${origins.join(", ")}

A page served from the internet (https://...) reaching 127.0.0.1 also needs the browser's
"Local network access" permission for that site; the app served on 127.0.0.1 does not.`);
}

if (!hasDocker()) {
  console.error("Docker is not available.");
  process.exit(1);
}

switch (opts.command) {
  case "start": {
    startContainer();
    const s3 = client();
    await waitReady(s3);
    await ensureBucket(s3);
    const ok = await checkCors(s3);
    summary((await currentRules(s3)).flatMap((r) => r.AllowedOrigins ?? []));
    s3.destroy();
    process.exitCode = ok ? 0 : 1;
    break;
  }
  case "check": {
    if (containerState() !== "running") {
      console.error(`container ${name} is not running; run: node tools/rustfs-dev.mjs start`);
      process.exit(1);
    }
    const s3 = client();
    await waitReady(s3);
    await ensureBucket(s3);
    process.exitCode = (await checkCors(s3)) ? 0 : 1;
    s3.destroy();
    break;
  }
  case "status": {
    const state = containerState();
    console.log(`container ${name}: ${state ?? "absent"}`);
    if (state === "running") {
      const s3 = client();
      summary((await currentRules(s3).catch(() => [])).flatMap((r) => r.AllowedOrigins ?? []));
      s3.destroy();
    }
    break;
  }
  case "stop": {
    if (containerState()) docker("rm", "-f", name);
    console.log(`container ${name}: removed`);
    if (opts.reset) {
      try {
        docker("volume", "rm", volume);
        console.log(`volume ${volume}: removed`);
      } catch {
        console.log(`volume ${volume}: absent`);
      }
    } else console.log(`volume ${volume}: kept (--reset removes it)`);
    break;
  }
  default:
    console.error(`unknown command ${opts.command} (start | check | status | stop)`);
    process.exit(2);
}
