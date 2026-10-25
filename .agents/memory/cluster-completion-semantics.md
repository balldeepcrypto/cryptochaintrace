---
name: Cluster completion semantics
description: Honest progress and completeness guarantees for recursive wallet scans and recovered results.
---

Recursive wallet expansion has an unknown total until discovery finishes. Fetched observations and saved checkpoints are not evidence that every relevant history has been scanned.

**Why:** Six-hop expansion can branch broadly under a fixed request budget. A connection-based percentage can appear stalled despite active fetching, and interruptions can leave valid observations without a complete investigation.

**How to apply:** Keep incomplete status explicit across live results, recovered checkpoints, and printed reports. Do not imply a saved browser checkpoint continues execution or automatically resumes a scan unless durable execution or cursor-level recovery is actually implemented.
