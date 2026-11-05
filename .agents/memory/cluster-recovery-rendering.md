---
name: Lightweight Cluster recovery
description: Keep saved-scan detection separate from history hydration and result rendering on Safari.
---

Opening Cluster Finder must only check whether a saved checkpoint exists. Load its histories on an explicit View or Resume action, and mount the graph only when requested.

**Why:** A saved recursive scan can contain large histories plus result trees. Automatically reading the full IndexedDB value and rendering every transfer on page opening can block iPad Safari before its controls are usable. Merely hiding the graph with CSS does not avoid this work.

**How to apply:** Preserve saved data, cursor-level Resume, and account isolation while keeping checkpoint detection key-only. Resume must not require mounting a graph or detailed results. Avoid putting full-checkpoint reads back into mount effects.
