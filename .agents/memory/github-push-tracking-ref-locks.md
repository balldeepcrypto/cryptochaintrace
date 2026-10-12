---
name: Git push tracking-ref locks
description: Distinguishes a successful remote push from a local remote-tracking ref lock warning.
---

A push to GitHub's `main` branch can succeed while Git reports it could not update the local `refs/remotes/origin/main` tracking ref because its lock file already exists. Confirm success with `git ls-remote --heads origin refs/heads/main` and compare the returned commit to local `HEAD`; do not mistake the local tracking-ref warning for a failed remote push.

**Why:** The remote branch accepted the pushed commit even though a local ref update emitted a lock-file warning.

**How to apply:** When push output contains this warning, verify the live remote branch directly before retrying or changing code.
