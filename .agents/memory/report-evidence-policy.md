---
name: Report evidence policy
description: User-selected report history and attribution rules, separate from Cluster Finder limits
---
Reports should attempt complete explorer-cursor history, beyond the normal 25,000-record display limit. Cluster Finder retains its separate 10,000-record limit and existing traversal settings.

**Why:** The user explicitly chose “Load complete history for reports” while requiring Cluster Finder scan logic and limits to remain unchanged.

**How to apply:** Keep report-only fetching isolated. Disclose loaded records, unknown available totals, archive gaps and incomplete cursor chains; never label a capped or interrupted fetch complete.

Use FIFO allocation from the specified source transaction, with model assumptions and coverage limitations disclosed. Do not substitute whole-wallet totals for attributable source value.

**Why:** The user explicitly selected “FIFO allocation” for mixed funds.

**How to apply:** Preserve asset identity, distinguish cumulative arrivals from remaining allocated value, stop at exchange custody, and disclose unsupported UTXO/cross-asset cases rather than inventing attribution.

Existing app-catalog wallet labels do not establish independent explorer confirmation.

**Why:** The catalog has no recorded provider evidence; merely linking an explorer does not verify a label.

**How to apply:** Identify catalog labels as inferred. Only describe a label as provider-confirmed when address-specific supporting evidence is actually available.
