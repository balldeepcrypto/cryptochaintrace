---
name: WebKit runtime verification
description: Distinguishing WebKit host setup failures from scan recovery regressions in Nix.
---

Do not treat Chromium touch emulation as Safari verification, or a WebKit launch failure as a recovery failure.

**Why:** Recovery behavior was exercised successfully in real WebKit only after resolving Linux host dependencies and software EGL initialization. The default Nix graphics vendor targeted a newer libc than the browser subprocess could load; even a clean missing-library check did not prove EGL could initialize.

**How to apply:** For browser setup failures, distinguish missing libraries, graphics initialization and actual test assertions. Probe software EGL with the same environment before repeating browser journeys. Select a compatible installed vendor rather than substituting Chromium or claiming physical iPad coverage.
