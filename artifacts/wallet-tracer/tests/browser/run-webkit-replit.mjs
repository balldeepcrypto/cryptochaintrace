// Optional Nix/Replit launcher. The standard test:webkit command remains usable
// unchanged on supported Playwright hosts. No browser substitution or test skips.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (!existsSync("/nix/store")) {
  throw new Error("This launcher is for Nix/Replit. Use pnpm test:webkit on other hosts.");
}

// Some Nix runtime profiles expose a Mesa built for a newer libc than the
// Playwright subprocess uses. Probe EGL itself instead of guessing by version
// or hardcoding a machine-specific Nix store hash.
const probe = `
import ctypes
egl = ctypes.CDLL("libEGL.so.1")
egl.eglGetDisplay.restype = ctypes.c_void_p
egl.eglInitialize.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)]
display = egl.eglGetDisplay(0)
major, minor = ctypes.c_int(), ctypes.c_int()
raise SystemExit(0 if display and egl.eglInitialize(display, ctypes.byref(major), ctypes.byref(minor)) else 1)
`;
const env = { ...process.env, EGL_PLATFORM: "surfaceless", LIBGL_ALWAYS_SOFTWARE: "1" };
const entries = readdirSync("/nix/store");
let mesa;
for (const entry of entries.filter((name) => /-mesa-\d/.test(name))) {
  const root = join("/nix/store", entry);
  const vendor = join(root, "share/glvnd/egl_vendor.d/50_mesa.json");
  if (!existsSync(vendor)) continue;
  const candidate = {
    ...env,
    __EGL_VENDOR_LIBRARY_FILENAMES: vendor,
    LIBGL_DRIVERS_PATH: join(root, "lib/dri"),
  };
  if (spawnSync("python", ["-c", probe], { env: candidate, stdio: "ignore" }).status === 0) {
    mesa = candidate;
    break;
  }
}
if (!mesa) throw new Error("No working software EGL runtime. Install the configured Nix libraries before running WebKit.");
const plugins = entries
  .filter((name) => /-gst-libav-\d/.test(name))
  .map((name) => join("/nix/store", name, "lib/gstreamer-1.0"))
  .filter((directory) => existsSync(join(directory, "libgstlibav.so")));
console.log(`WebKit using validated software EGL: ${mesa.__EGL_VENDOR_LIBRARY_FILENAMES}`);
const result = spawnSync("pnpm", ["exec", "playwright", "test", "--config", "playwright.config.ts", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...mesa,
    GST_PLUGIN_PATH: [...plugins, process.env.GST_PLUGIN_PATH].filter(Boolean).join(":"),
    // Playwright's Ubuntu package-name check does not understand Nix libraries.
    // Only bypass that check; actual WebKit launch and every assertion must pass.
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: "1",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
