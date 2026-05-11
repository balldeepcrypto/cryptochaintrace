import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

const EXTERNALS = [
  "*.node",
  "sharp",
  "better-sqlite3",
  "sqlite3",
  "canvas",
  "bcrypt",
  "argon2",
  "fsevents",
  "re2",
  "farmhash",
  "xxhash-addon",
  "bufferutil",
  "utf-8-validate",
  "ssh2",
  "cpu-features",
  "dtrace-provider",
  "isolated-vm",
  "lightningcss",
  "pg-native",
  "oracledb",
  "mongodb-client-encryption",
  "nodemailer",
  "handlebars",
  "knex",
  "typeorm",
  "protobufjs",
  "onnxruntime-node",
  "@tensorflow/*",
  "@prisma/client",
  "@mikro-orm/*",
  "@grpc/*",
  "@swc/*",
  "@aws-sdk/*",
  "@azure/*",
  "@opentelemetry/*",
  "@google-cloud/*",
  "@google/*",
  "googleapis",
  "firebase-admin",
  "@parcel/watcher",
  "@sentry/profiling-node",
  "@tree-sitter/*",
  "aws-sdk",
  "classic-level",
  "dd-trace",
  "ffi-napi",
  "grpc",
  "hiredis",
  "kerberos",
  "leveldown",
  "miniflare",
  "mysql2",
  "newrelic",
  "odbc",
  "piscina",
  "realm",
  "ref-napi",
  "rocksdb",
  "sass-embedded",
  "sequelize",
  "serialport",
  "snappy",
  "tinypool",
  "usb",
  "workerd",
  "wrangler",
  "zeromq",
  "zeromq-prebuilt",
  "playwright",
  "puppeteer",
  "puppeteer-core",
  "electron",
];

const BANNER = {
  js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
};

const SHARED_OPTIONS = {
  platform: "node",
  bundle: true,
  format: "esm",
  logLevel: "info",
  external: EXTERNALS,
  sourcemap: "linked",
  plugins: [
    // pino relies on workers to handle logging; this plugin bundles them correctly
    esbuildPluginPino({ transports: ["pino-pretty"] }),
  ],
  banner: BANNER,
};

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  const apiDir = path.resolve(artifactDir, "../../api");
  await rm(distDir, { recursive: true, force: true });

  // Build the long-running server (used by Replit dev/prod workflows)
  await esbuild({
    ...SHARED_OPTIONS,
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
  });

  // Build the ESM serverless handler (kept for reference / future use)
  await esbuild({
    ...SHARED_OPTIONS,
    entryPoints: [path.resolve(artifactDir, "src/handler.ts")],
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
  });

  // Build the CJS serverless handler for dist/ (kept for reference)
  await esbuild({
    platform: "node",
    bundle: true,
    format: "cjs",
    logLevel: "info",
    external: EXTERNALS,
    sourcemap: "linked",
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    entryPoints: [path.resolve(artifactDir, "src/handler.ts")],
    outdir: distDir,
    outExtension: { ".js": ".cjs" },
  });

  // Build api/_handler.js — the ACTUAL Vercel serverless bundle.
  //
  // Why this approach solves ERR_REQUIRE_ESM once and for all:
  //   1. Built directly into api/ so api/[...route].ts does require('./_handler.js')
  //      — a same-directory path that is ALWAYS correct in Vercel's Lambda regardless
  //      of where the Lambda places __dirname (no path-traversal ambiguity).
  //   2. CJS format: esbuild inlines every ESM dep. require() on a .js file never
  //      hits Node.js's ESM guard (only .mjs / "type":"module" trigger it).
  //   3. No esbuild-plugin-pino: we don't configure pino transports so no worker
  //      threads are spawned. Skipping the plugin means no pino-worker.js / pino-file.js
  //      side-files that Vercel would mistake for additional API routes.
  //   4. Files starting with _ are excluded from Vercel's route discovery.
  //   5. outfile (not outdir) = single self-contained bundle, nothing extra to ship.
  await esbuild({
    platform: "node",
    bundle: true,
    format: "cjs",
    logLevel: "info",
    external: EXTERNALS,
    sourcemap: false,
    define: { "process.env.NODE_ENV": '"production"' },
    entryPoints: [path.resolve(artifactDir, "src/handler.ts")],
    outfile: path.resolve(apiDir, "_handler.js"),
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
