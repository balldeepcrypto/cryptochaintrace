---
name: Cluster completion semantics
description: Honest progress and completeness guarantees for recursive wallet scans and recovered results.
---

Recursive wallet expansion has an unknown total until discovery finishes. Fetched observations and saved checkpoints are not evidence that every relevant history has been scanned.

**Why:** Six-hop expansion can branch broadly under a fixed request budget. A connection-based percentage can appear stalled despite active fetching, and interruptions can leave valid observations without a complete investigation.

**How to apply:** Keep incomplete status explicit across live results, recovered checkpoints, and printed reports. Do not imply a saved browser checkpoint continues execution or automatically resumes a scan unless durable execution or cursor-level recovery is actually implemented.

A resumable checkpoint must save an internally consistent fetched-page boundary: observations, the next pagination cursor, discovered wallet depths, and completed versus unfinished histories. Resuming must retain the original inputs, focus wallets, chain and hop limit.

**Why:** A saved graph or transaction count cannot identify unfinished pages or restore the breadth-first frontier. Restoring only those results can repeat expensive histories or silently omit branches.

**How to apply:** Persist page state before advancing to another page, preserve partial-history warnings until recovery succeeds, and distinguish browser-local Resume from an actual server background worker. Do not claim continued execution while a tab is closed.

Lowering a history-fetching limit must not discard observations already saved by an older run.

**Why:** A reliability limit restricts future API work; silently deleting previously collected evidence would change existing trails and reports during recovery.

**How to apply:** Preserve legacy cached observations, stop further fetching for wallets already at or above the new limit, and retain explicit truncation warnings when more history exists.

Recovery actions on an incomplete scan must continue its checkpoint, including Retry/Restart, rather than silently starting a fresh scan.

**Why:** The user explicitly requires recovery to retain prior work and remain on the current page on iPad and desktop.

**How to apply:** Keep fresh scans separate from recovery controls. If a checkpoint cannot resume because of caps or missing traversal state, preserve its results and explain the limitation instead of resetting it.
