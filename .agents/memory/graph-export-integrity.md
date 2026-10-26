---
name: Graph export integrity
description: Browser-export verification and reliable access to generated investigative files.
---

A nonempty PNG with valid dimensions does not prove that a React Flow graph exported correctly. Verify visible wallets, arrows, and transaction labels in the image.

**Why:** Browser testing found that DOM-based graph capture produced a valid PNG containing only the background even though the graph itself was visible. File-signature checks and mocked capture tests did not detect the missing graph layers.

**How to apply:** Prefer self-contained graph rendering from the actual node positions and viewport when DOM capture omits layers. Inspect exported image content when changing rendering or capture. Retain explicit user-clickable download/open links for reports and graphs rather than relying solely on hidden print frames or automatic browser actions.
