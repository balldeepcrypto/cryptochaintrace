# WebKit Cluster Finder recovery regression

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/wallet-tracer exec playwright install webkit
pnpm --filter @workspace/wallet-tracer test:webkit
```

On a supported Linux host, Playwright's system libraries must also be installed
(`playwright install --with-deps webkit` on Ubuntu). NixOS does not support the
Ubuntu dependency installer; use a compatible WebKit runtime rather than
substituting Chromium or silently skipping these tests.

In this Replit/Nix workspace, the system libraries are declared in `.replit`.
After installing the browser with the command above, run:

```sh
pnpm --filter @workspace/wallet-tracer test:webkit:replit
```

This optional launcher probes installed Mesa EGL vendors and selects a working
software renderer. It avoids the default runtime's possible libc/Mesa mismatch
without hardcoding Nix store hashes. It needs the project's Python runtime for
the EGL probe. It bypasses only Playwright's Ubuntu-specific package-name check,
not browser launch or tests. Missing libraries or EGL support still fail loudly.

The command starts and stops a dedicated Vite server on port 4179. No API server,
real account, workspace secrets, or live wallet services are required. Every case
uses a new non-persistent browser context, real IndexedDB, synthetic local auth,
and intercepted wallet-history responses. Google Fonts CSS is stubbed offline;
unrecognized API or other external requests
fail assertions. Existing browser investigations are never read or changed.

The four cases run **WebKit**, with an iPad touch viewport (820×1180):

- Resume an interrupted saved scan; Retry a failed saved scan.
- Repeat both with `crypto.randomUUID` missing, as on older iPad Safari.
- Require the exact saved page and opaque cursor, retain cached pages from two
  completed wallets, and retain the original chain, hop limit, lead, inputs and
  focus wallets even after editing all current form settings.
- Send a real touch tap with duplicate same-task button activations, asserting
  exactly one history request and one complete persisted checkpoint.
- Reject main-frame navigation, popups, page close/crash, pagehide/unload,
  uncaught errors, lost transactions, and browser-storage warnings.

Failure traces/screenshots go to `generated-artifacts/cluster-webkit` (ignored
by Git and deployment). The existing engine/storage tests remain separately
available with `pnpm --filter @workspace/wallet-tracer test:cluster`.

Playwright WebKit is not a physical iPad or Apple Safari distribution; this suite
does not claim to cover iOS process eviction, device sleep, or OS storage policy.
