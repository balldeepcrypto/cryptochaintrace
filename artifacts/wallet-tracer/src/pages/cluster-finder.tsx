import { useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { AlertCircle, ArrowDownLeft, ArrowRight, Clock3, Copy, GitBranch, LoaderCircle, Network, OctagonX, Play, Printer, ShieldCheck, Square, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClusterFinderGraph } from "@/components/cluster-finder-graph";
import {
  CLUSTER_CHAIN_OPTIONS,
  MAX_CLUSTER_HISTORY_PER_WALLET,
  runClusterFinder,
  canResumeClusterScan,
  DEFAULT_CLUSTER_HOPS,
  type ClusterHopDepth,
  type ClusterChain,
  type ClusterFinderResult,
  type ClusterProgress,
  type ClusterFlow,
} from "@/lib/cluster-finder-engine";
import { getKnownInfo, getNormalizedAddress } from "@/pages/wallet-detail";
import { printClusterReport, printClusterSelectedTrail } from "@/lib/cluster-finder-exports";
import { triggerClusterDownload, type ClusterDownload } from "@/lib/cluster-finder-download";
import { ClusterFinderDownloadLinks } from "@/components/cluster-finder-download-links";
import { useAuth } from "@/lib/auth-context";
import { beginClusterCheckpoint, clearClusterCheckpoint, loadClusterCheckpoint, saveClusterCheckpoint, type ClusterCheckpoint } from "@/lib/cluster-finder-storage";

type ScanState = "idle" | "running" | "cancelled" | "failed" | "complete";

function shortAddress(value: string) {
  return value.length > 30 ? `${value.slice(0, 13)}…${value.slice(-10)}` : value;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function formatValue(value: string, symbol?: string | null) {
  const numeric = Number(value);
  const rendered = Number.isFinite(numeric)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(numeric)
    : value;
  return `${rendered}${symbol ? ` ${symbol}` : ""}`;
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

function addressIdentity(address: string, chain: string) {
  const normalized = getNormalizedAddress(address, chain).trim();
  return ["ethereum", "polygon", "bsc"].includes(chain) ? normalized.toLowerCase() : normalized;
}

export default function ClusterFinder() {
  const { user } = useAuth();
  const owner = user?.id;
  const [chain, setChain] = useState<ClusterChain>("ethereum");
  const [maxHops, setMaxHops] = useState<ClusterHopDepth>(DEFAULT_CLUSTER_HOPS);
  const [addressText, setAddressText] = useState("");
  const [focusText, setFocusText] = useState("");
  const [reportFile, setReportFile] = useState<ClusterDownload | null>(null);
  const [reportError, setReportError] = useState("");
  const [primaryAddress, setPrimaryAddress] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [progress, setProgress] = useState<ClusterProgress | null>(null);
  const [result, setResult] = useState<ClusterFinderResult | null>(null);
  const [scanError, setScanError] = useState("");
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const activeRunRef = useRef<string | null>(null);
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [resumeCheckpoint, setResumeCheckpoint] = useState<ClusterCheckpoint | null>(null);
  const flushCheckpointRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const flush = () => flushCheckpointRef.current?.();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    setCheckpointReady(false);
    setResult(null);
    setProgress(null);
    setScanState("idle");
    setSavedAt(null);
    setStorageWarning("");
    setScanError("");
    setAddressText("");
    setFocusText("");
    setReportFile(null);
    setReportError("");
    setPrimaryAddress("");
    setMaxHops(DEFAULT_CLUSTER_HOPS);
    setSelectedInput(null);
    setResumeCheckpoint(null);
    if (owner) {
      void loadClusterCheckpoint(owner).then((checkpoint) => {
        if (disposed || !checkpoint) return;
        setChain(checkpoint.chain);
        // Checkpoints created before the selector always used six hops.
        setMaxHops(checkpoint.maxHops ?? checkpoint.result?.maxHops ?? 6);
        setAddressText(checkpoint.addressText);
        setFocusText(checkpoint.focusText ?? "");
        setPrimaryAddress(checkpoint.primaryAddress);
        setProgress(checkpoint.progress);
        setResumeCheckpoint(checkpoint);
        setSavedAt(checkpoint.persistenceError ? null : checkpoint.savedAt);
        if (checkpoint.persistenceError) setStorageWarning("Recovered results from this tab's memory, but browser saving failed. Print or export before reloading.");
        const interrupted = checkpoint.state === "running";
        const restored = interrupted && checkpoint.result
          ? { ...checkpoint.result, complete: false, incompleteReason: "Scan interrupted by leaving or reloading the page. This saved checkpoint contains fetched pages only; it has not resumed automatically." }
          : checkpoint.result;
        setResult(restored);
        setScanState(interrupted ? "cancelled" : checkpoint.state);
        setScanError(checkpoint.error);
      }).catch(() => {
        if (!disposed) setStorageWarning("Saved results could not be loaded. Browser storage may be unavailable. New results remain visible in this page, but may not survive a reload.");
      }).finally(() => { if (!disposed) setCheckpointReady(true); });
    } else {
      setCheckpointReady(true);
    }
    return () => {
      disposed = true;
      mountedRef.current = false;
      activeRunRef.current = null;
      // Stop requests on navigation/logout, but the engine returns its fetched
      // pages and the captured account's checkpoint is still saved below.
      controllerRef.current?.abort();
      flushCheckpointRef.current?.();
      flushCheckpointRef.current = null;
    };
  }, [owner]);

  const enteredAddresses = useMemo(() => {
    const parsed = addressText.split(/[\n,\t; ]+/).map((address) => address.trim()).filter(Boolean);
    const normalizedPrimary = primaryAddress.trim();
    const all = normalizedPrimary ? [...parsed, normalizedPrimary] : parsed;
    const seen = new Set<string>();
    return all.filter((address) => {
      const canonical = addressIdentity(address, chain);
      if (!canonical || seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    });
  }, [addressText, primaryAddress, chain]);

  const hasPrimary = Boolean(primaryAddress.trim()) && enteredAddresses.some(
    (address) => addressIdentity(address, chain) === addressIdentity(primaryAddress.trim(), chain),
  );
  const focusAddresses = useMemo(() => {
    const seen = new Set<string>([addressIdentity(primaryAddress.trim(), chain)]);
    return focusText.split(/[\n,\t; ]+/).filter(Boolean).filter((address) => {
      const key = addressIdentity(address, chain);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [focusText, primaryAddress, chain]);
  const inputCount = new Set([...enteredAddresses, ...focusAddresses]
    .map((address) => addressIdentity(address, chain))
    .filter((address) => address !== addressIdentity(primaryAddress.trim(), chain))).size;
  // Recursive fan-out is unknown until fetched. A percentage of total work
  // would be misleading; show the actual BFS hop and queue instead.
  const scannedHopLimit = result?.maxHops ?? maxHops;
  const hopProgress = ((progress?.currentHop ?? 0) / scannedHopLimit) * 100;
  const activeSelection = result?.connections.find((connection) => connection.inputAddress === selectedInput) ?? result?.connections[0];
  const selectedPath = useMemo(() => activeSelection?.nodes ?? [], [activeSelection]);
  const focusFlowIds = useMemo(() => [...new Set(result?.focusConnections?.flatMap((connection) => connection.flows.map((flow) => flow.id)) ?? [])], [result?.focusConnections]);

  const exportReport = () => {
    if (!result) return;
    setReportError("");
    try {
      const file = printClusterReport(result);
      setReportFile(file);
      triggerClusterDownload(file);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Report export failed. Please try again.");
    }
  };

  const exportSelectedTrail = () => {
    if (!result || !activeSelection) return;
    setReportError("");
    try {
      const file = printClusterSelectedTrail(result, activeSelection.inputAddress);
      setReportFile(file);
      triggerClusterDownload(file);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Selected trail export failed. Please try again.");
    }
  };

  const startScan = async (resume?: ClusterCheckpoint) => {
    if (controllerRef.current || scanState === "running" || !checkpointReady || !owner) return;
    if (!resume && (!primaryAddress.trim() || !hasPrimary)) return;
    const config = resume ?? { chain, maxHops, addressText, focusText, primaryAddress: primaryAddress.trim() };
    const scanMaxHops = config.maxHops ?? resume?.result?.maxHops ?? 6;
    if (resume && !resume.scan) return;
    if (resume) {
      setChain(config.chain);
      setMaxHops(scanMaxHops);
      setAddressText(config.addressText);
      setFocusText(config.focusText ?? "");
      setPrimaryAddress(config.primaryAddress);
    }
    // Allocate the run before resetting any recovered results. Startup failures
    // must leave the checkpoint available for another attempt.
    const runId = beginClusterCheckpoint(owner);
    const controller = new AbortController();
    controllerRef.current = controller;
    setReportFile(null);
    setReportError("");
    setResult(resume?.result ?? null);
    setProgress(resume?.progress ?? null);
    setScanError("");
    setSelectedInput(null);
    setScanState("running");
    setSavedAt(null);
    activeRunRef.current = runId;
    const isCurrentRun = () => mountedRef.current && activeRunRef.current === runId;
    let latestResult: ClusterFinderResult | null = resume?.result ?? null;
    let latestProgress: ClusterProgress | null = resume?.progress ?? null;
    let latestScan = resume?.scan;
    const checkpoint = async (state: ClusterCheckpoint["state"], error = "") => {
      const saved: ClusterCheckpoint = {
        version: 1, runId, savedAt: new Date().toISOString(),
        chain: config.chain, maxHops: scanMaxHops, addressText: config.addressText,
        focusText: config.focusText, primaryAddress: config.primaryAddress,
        state, result: latestResult, progress: latestProgress, error,
        scan: latestScan,
      };
      if (isCurrentRun()) setResumeCheckpoint(saved);
      await saveClusterCheckpoint(owner, saved).then((written) => {
        if (written && mountedRef.current && activeRunRef.current === runId) { setSavedAt(saved.savedAt); setStorageWarning(""); }
      }).catch(() => {
        if (mountedRef.current && activeRunRef.current === runId) setStorageWarning("Could not save this checkpoint to browser storage. Keep this page open and print/export any partial results before leaving. In-page results are still available.");
      });
    };
    flushCheckpointRef.current = () => { void checkpoint("running"); };
    try {
      const output = await runClusterFinder({
        addresses: resume ? config.addressText.split(/[\n,\t; ]+/).filter(Boolean) : enteredAddresses,
        primaryAddress: config.primaryAddress,
        chain: config.chain,
        maxHops: scanMaxHops,
        focusAddresses: resume ? (config.focusText ?? "").split(/[\n,\t; ]+/).filter(Boolean) : focusAddresses,
        resumeFrom: resume?.scan,
        signal: controller.signal,
        onProgress: (next) => {
          latestProgress = next;
          if (isCurrentRun()) setProgress(next);
        },
        onSnapshot: (snapshot) => {
          latestResult = snapshot;
          if (isCurrentRun()) setResult(snapshot);
        },
        onCheckpoint: async (snapshot) => {
          latestScan = snapshot;
          await checkpoint("running");
        },
        getKnownInfo,
        normalizeAddress: getNormalizedAddress,
      });
      latestResult = output;
      await checkpoint(controller.signal.aborted ? "cancelled" : "complete");
      if (isCurrentRun()) {
        setResult(output);
        setScanState(controller.signal.aborted ? "cancelled" : "complete");
        setSelectedInput(output.connections[0]?.inputAddress ?? null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (latestResult) {
        latestResult = { ...latestResult, complete: false, incompleteReason: `Scan interrupted: ${message}. Fetched pages retained.` };
        if (isCurrentRun()) setResult(latestResult);
      }
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        await checkpoint("cancelled");
        if (isCurrentRun()) setScanState("cancelled");
      } else {
        await checkpoint("failed", message);
        if (isCurrentRun()) { setScanError(message); setScanState("failed"); }
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        flushCheckpointRef.current = null;
      }
    }
  };

  const handleStartError = (error: unknown) => {
    if (!mountedRef.current) return;
    setScanError(`Could not start the scan: ${error instanceof Error ? error.message : String(error)}. Your saved checkpoint is retained.`);
    setScanState("failed");
  };

  const handleStartScan = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void startScan().catch(handleStartError);
  };

  const handleResumeScan = (event: MouseEvent<HTMLButtonElement>) => {
    // Do not submit an enclosing form or let a parent click handler navigate.
    // Resume/Retry always use saved settings and cursors, never a fresh scan.
    event.preventDefault();
    event.stopPropagation();
    if (!resumeCheckpoint?.scan || !canResumeClusterScan(resumeCheckpoint.scan)) {
      setScanError("There are no resumable history pages in this checkpoint. Saved results are retained; history limits cannot be extended by Resume.");
      return;
    }
    void startScan(resumeCheckpoint).catch(handleStartError);
  };

  const cancelScan = () => {
    controllerRef.current?.abort();
  };

  const clearScan = () => {
    if (scanState === "running") return;
    setReportFile(null);
    setReportError("");
    setResult(null);
    setProgress(null);
    setScanError("");
    setSelectedInput(null);
    setScanState("idle");
    setSavedAt(null);
    setResumeCheckpoint(null);
    activeRunRef.current = null;
    if (owner) void clearClusterCheckpoint(owner).catch(() => {
      setStorageWarning("Results were cleared in this page, but the saved browser checkpoint could not be deleted.");
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8" data-testid="page-cluster-finder">
      <div className="mx-auto max-w-[1500px] space-y-6">
        {!checkpointReady && <p role="status" className="text-sm text-muted-foreground">Loading the latest saved Cluster Finder checkpoint…</p>}
        {storageWarning && <p role="alert" className="border border-amber-200/30 p-3 text-xs text-amber-100" data-testid="status-cluster-storage-warning">{storageWarning}</p>}
        {savedAt && <p className="text-xs text-muted-foreground" data-testid="status-cluster-checkpoint">Latest checkpoint saved in this browser: {formatTimestamp(savedAt)}. Leaving this page stops the scan. Reload restores the last saved checkpoint; the most recent unsaved pages may be absent. Scans do not resume automatically.</p>}
        <header className="relative overflow-hidden border border-border/80 bg-card/70 px-5 py-6 sm:px-7">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] opacity-50 md:block" aria-hidden="true">
            <div className="absolute right-12 top-8 h-28 w-28 rounded-full border border-cyan-300/15" />
            <div className="absolute right-24 top-16 h-12 w-12 rounded-full border border-amber-300/20" />
            <div className="absolute right-0 top-1/2 h-px w-full bg-gradient-to-l from-cyan-200/20 to-transparent" />
            <div className="absolute right-28 top-1/2 h-20 w-px bg-gradient-to-b from-transparent via-cyan-200/20 to-transparent" />
          </div>
          <div className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">
                <Network className="h-3.5 w-3.5" /> Investigative tools <span className="text-border">/</span> cluster analysis
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">Cluster Finder</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Expand unique IN/OUT trails to your selected depth from the lead and any additional starting wallets. Unlabeled wallets and Treasury, Stardust Collective, or Team Foundation labels are allowed; other labeled wallets are excluded. Incomplete history stays visibly incomplete.
              </p>
            </div>
            <div className="flex items-center gap-2 border-t border-border/60 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <ShieldCheck className="h-4 w-4 text-cyan-200/80" />
              <span>Private paths only</span>
              <span className="mx-1 text-border">·</span>
              <span>History cap {MAX_CLUSTER_HISTORY_PER_WALLET.toLocaleString()}</span>
            </div>
          </div>
        </header>

        <section aria-label="Scan configuration" className="grid gap-5 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]">
          <Card className="rounded-none border-border/80 bg-card/70 shadow-none">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">
                <span className="text-amber-200">01</span> Scan parameters
              </div>
              <h2 className="mt-1 text-base font-medium">Define the wallet set</h2>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <label htmlFor="cluster-hop-depth" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Maximum hop depth</label>
                <Select value={String(maxHops)} onValueChange={(value) => setMaxHops(Number(value) as ClusterHopDepth)} disabled={scanState === "running"}>
                  <SelectTrigger id="cluster-hop-depth" data-testid="select-cluster-hop-depth"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 4, 6].map((depth) => <SelectItem key={depth} value={String(depth)}>{depth} hops</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="cluster-chain" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Network</label>
                <Select value={chain} onValueChange={(value) => setChain(value as ClusterChain)} disabled={scanState === "running"}>
                  <SelectTrigger id="cluster-chain" className="h-11 rounded-none border-border/80 bg-background/50 font-mono text-xs" data-testid="select-cluster-chain" aria-label="Select blockchain network">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLUSTER_CHAIN_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="cluster-addresses" className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Wallet address list</span><span className="text-muted-foreground/60">one per line</span>
                </label>
                <Textarea
                  id="cluster-addresses"
                  value={addressText}
                  onChange={(event) => setAddressText(event.target.value)}
                  disabled={scanState === "running"}
                  placeholder={"Paste wallet addresses\nOne address per line"}
                  className="min-h-[130px] resize-y rounded-none border-border/80 bg-background/50 font-mono text-xs leading-6 placeholder:text-muted-foreground/35"
                  data-testid="input-cluster-address-list"
                  aria-label="Wallet addresses to include in the cluster scan"
                />
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground/70">Comma- or whitespace-separated addresses are accepted. Duplicate entries are collapsed before scanning.</p>
              </div>
              <div>
                <label htmlFor="cluster-primary" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Lead / primary wallet</label>
                <Input
                  id="cluster-primary"
                  value={primaryAddress}
                  onChange={(event) => setPrimaryAddress(event.target.value)}
                  disabled={scanState === "running"}
                  placeholder="Enter the lead address"
                  className="h-11 rounded-none border-border/80 bg-background/50 font-mono text-xs placeholder:text-muted-foreground/35"
                  data-testid="input-cluster-primary"
                  aria-label="Primary lead wallet address"
                />
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground/70">The lead is automatically included. Additional starting wallets are optional. Starting wallets are hop 0; each eligible wallet through the selected depth is scanned once.</p>
              </div>
              <div>
                <label htmlFor="cluster-focus-wallets" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Focus Wallets (optional)</label>
                <Textarea id="cluster-focus-wallets" value={focusText} onChange={(event) => setFocusText(event.target.value)}
                  disabled={scanState === "running"} placeholder="One or more focus addresses, separated by commas or new lines"
                  className="min-h-[80px] font-mono text-xs" data-testid="input-cluster-focus-wallets" />
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground/70">Lead and focus wallets are scanned before other starting wallets. Observed shortest IN/OUT connections within the selected lead-to-focus hop depth are highlighted. Existing wallet exclusions still apply. Leave blank for the normal scan.</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground" data-testid="text-scan-input-count">
                  {inputCount} comparison {inputCount === 1 ? "wallet" : "wallets"} <span className="text-border">/</span> {inputCount + (primaryAddress.trim() ? 1 : 0)} total
                </div>
                {scanState === "running" ? (
                  <Button onClick={cancelScan} variant="outline" className="h-10 rounded-none border-rose-300/30 bg-rose-300/[0.04] font-mono text-[10px] uppercase tracking-[0.15em] text-rose-200 hover:bg-rose-300/10" data-testid="button-cancel-cluster-scan">
                    <Square className="h-3.5 w-3.5 fill-current" /> Cancel scan
                  </Button>
                ) : (
                  <Button type="button" onClick={handleStartScan} disabled={!hasPrimary || !checkpointReady || !owner} className="h-10 rounded-none bg-cyan-100 px-5 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-950 hover:bg-cyan-50" data-testid="button-start-cluster-scan">
                    <Play className="h-3.5 w-3.5 fill-current" /> Run cluster scan
                  </Button>
                )}
              </div>
              {scanState !== "running" && resumeCheckpoint && (!result?.complete || scanState === "failed" || scanState === "cancelled") && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <Button type="button" variant="outline" onClick={handleResumeScan}
                    disabled={!checkpointReady || !canResumeClusterScan(resumeCheckpoint.scan)}
                    data-testid="button-resume-cluster-scan">Resume scan</Button>
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    {canResumeClusterScan(resumeCheckpoint.scan)
                      ? "Continue the saved scan with its original settings. Completed histories are reused; unfinished wallets continue from their saved page cursors."
                      : resumeCheckpoint.scan
                        ? "No unfinished history pages remain. History caps or invalid provider cursors cannot be extended by Resume; existing limits and partial results are preserved."
                        : "This older checkpoint contains results only, not pagination state. Start a new scan to create a resumable checkpoint."}
                  </p>
                </div>
              )}
              <p className="text-[11px] leading-5 text-muted-foreground" data-testid="status-cluster-background-limit">
                Scans run in this browser, not a server background worker. Keep the page open to continue scanning.
                Each fetched page is saved on this browser for this account; after closing, reloading or device sleep, return here and choose Resume.
                Unfinished requests may be repeated, but saved pages and completed wallets are reused. Browser storage must remain available.
              </p>
              {!hasPrimary && primaryAddress.trim() && (
                <div className="flex items-start gap-2 border border-amber-300/20 bg-amber-200/[0.04] p-3 text-[11px] leading-5 text-amber-100/80" role="status" data-testid="status-primary-not-in-list">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  The primary address is being included automatically. Check it is the intended lead wallet before scanning.
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-none border-border/80 bg-card/70 shadow-none">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/70"><span className="text-amber-200">02</span> Scan telemetry</div>
                <h2 className="mt-1 text-base font-medium">Live traversal state</h2>
              </div>
              <StateMark state={scanState} />
            </div>
            <div className="p-5">
              {scanState === "running" ? (
                <div className="space-y-5" role="status" aria-live="polite" data-testid="status-cluster-scanning">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <LoaderCircle className="h-4 w-4 animate-spin text-cyan-200" />
                      <div>
                        <div className="font-mono text-xs uppercase tracking-[0.13em] text-foreground">{progress?.phase === "building" ? "Building private paths" : "Scanning wallet history"}</div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">{progress?.activeAddress ? shortAddress(progress.activeAddress) : "Expanding unique IN/OUT histories"}</div>
                      </div>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-cyan-100" data-testid="status-cluster-hop">Hop {progress?.currentHop ?? 0} / {scannedHopLimit}</span>
                  </div>
                  <Progress value={hopProgress} className="h-1 rounded-none bg-muted [&>div]:bg-cyan-200" aria-label="Expansion hop, not percentage of total work" />
                  <p className="text-xs text-muted-foreground">The total work is unknown until links are discovered. Hop {scannedHopLimit} is the final layer, not a guarantee that all histories are finished.</p>
                  {progress?.requestStatus && (
                    <p className="border border-amber-200/20 bg-amber-200/5 p-3 text-xs leading-5 text-amber-100" data-testid="status-cluster-retry">
                      {progress.requestStatus}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-px border border-border/60 bg-border/50 sm:grid-cols-4">
                    <Metric label="Wallets scanned" value={progress?.scannedWallets ?? 0} />
                    <Metric label="Transactions" value={progress?.transactionCount ?? 0} />
                    <Metric label="Queue remaining" value={progress?.queuedWallets ?? 0} />
                    <Metric label="Pages fetched" value={progress?.pagesFetched ?? 0} />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">Discovered {progress?.discoveredWallets ?? 0} · Active {progress?.activeWallets ?? 0} · Directed inputs connected {result?.connections.length ?? 0} / {inputCount}</p>
                  <p className="text-xs leading-5 text-muted-foreground">IN/OUT history expands breadth-first from all starting wallets through {scannedHopLimit} hops, without re-scanning wallets. Requests are queued at most 72 per minute, with automatic backoff for rate limits and temporary failures. The shared API limit may enforce a lower effective rate. Recursive branching can discover many wallets and take hours. Partial results below update about every two seconds as pages arrive; every fetched page is checkpointed. Stopping the scan retains fetched data for Resume.</p>
                </div>
              ) : scanState === "idle" ? (
                <div className="flex min-h-[175px] items-center gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center border border-cyan-200/15 bg-cyan-200/[0.04] text-cyan-100/80"><GitBranch className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm text-foreground/90">Ready to examine convergence.</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Provide a lead address and optional additional starting wallets. Separate components are displayed without implying a connection between them.</p>
                  </div>
                </div>
              ) : scanState === "failed" ? (
                <div className="flex min-h-[175px] items-start gap-3 border border-rose-300/20 bg-rose-300/[0.04] p-4" role="alert" data-testid="status-cluster-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-rose-100">Scan could not complete</p>
                    <p className="mt-2 break-words text-xs leading-5 text-rose-100/70">{scanError}</p>
                    <Button type="button" onClick={handleResumeScan} disabled={!checkpointReady || !canResumeClusterScan(resumeCheckpoint?.scan)} variant="outline" className="mt-4 h-8 rounded-none border-rose-200/20 font-mono text-[10px] uppercase" data-testid="button-retry-cluster-scan">Retry scan from checkpoint</Button>
                  </div>
                </div>
              ) : scanState === "cancelled" ? (
                <div className="flex min-h-[175px] items-start gap-3 border border-amber-200/20 bg-amber-200/[0.04] p-4" role="status" data-testid="status-cluster-cancelled">
                  <OctagonX className="mt-0.5 h-4 w-4 shrink-0 text-amber-100/80" />
                  <div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-amber-100">Scan stopped — partial data retained</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Fetched transactions and observed trails remain below and can be printed or exported. Unscanned histories may contain additional paths.</p><Button onClick={clearScan} variant="outline" className="mt-3" data-testid="button-clear-stopped-cluster-results">Clear results</Button></div>
                </div>
              ) : (
                <div className="space-y-4" role="status" data-testid="status-cluster-scan-complete">
                  <div className={`flex items-start gap-3 border p-4 ${result?.complete ? "border-emerald-200/20 bg-emerald-200/[0.035]" : "border-amber-200/20 bg-amber-200/[0.035]"}`}>
                    {result?.complete ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-100" />}
                    <div>
                      <p className={`font-mono text-[10px] uppercase tracking-[0.15em] ${result?.complete ? "text-emerald-100" : "text-amber-100"}`}>{result?.complete ? "History scan complete" : "Partial / incomplete history"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{result?.complete ? "Results reflect all history returned within the engine scan limits." : "One or more histories failed or reached the scan limit. Connections shown are observed paths, not a complete account of activity."}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-px border border-border/60 bg-border/50 sm:grid-cols-4">
                    <Metric label="Wallets scanned" value={result?.scannedWallets ?? 0} />
                    <Metric label="Transactions" value={result?.scannedTransactions ?? 0} />
                    <Metric label="Connected inputs" value={result?.connections.length ?? 0} />
                    <Metric label="Private nodes" value={result?.nodes.length ?? 0} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={clearScan} variant="outline" className="h-8 rounded-none border-border/80 font-mono text-[10px] uppercase tracking-[0.12em]" data-testid="button-clear-cluster-results">Clear results</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </section>

        {result && (
          <section className="space-y-5" aria-label="Cluster scan results" data-testid="section-cluster-results">
            {!result.complete && <p role="status" className="border border-amber-200/30 bg-amber-200/5 p-3 text-xs text-amber-100" data-testid="status-cluster-partial-results">{result.incompleteReason ?? "Partial / incomplete history: some histories failed or reached the 10,000 transaction limit. Observed results remain available."}</p>}
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={exportReport} data-testid="button-print-cluster-report">
                <Printer className="mr-2 h-4 w-4" /> Print Report
              </Button>
            </div>
            <div className="flex flex-col justify-between gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-end">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">03 / Observed cluster</div>
                <h2 className="mt-1 text-xl font-medium tracking-tight">Recursive private/team IN/OUT trail</h2>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Network <span className="text-foreground">{CLUSTER_CHAIN_OPTIONS.find((item) => item.value === result.chain)?.label}</span><span className="mx-2 text-border">/</span> lead <span className="text-amber-100">{shortAddress(result.primaryAddress)}</span></div>
            </div>

            {result.fetchErrors.length > 0 && (
              <div className="border border-rose-200/20 bg-rose-200/[0.035] p-4" role="alert" data-testid="panel-fetch-errors">
                <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-rose-100"><AlertCircle className="h-3.5 w-3.5" /> History fetch errors <span className="text-rose-100/50">({result.fetchErrors.length})</span></div>
                <div className="space-y-2">
                  {result.fetchErrors.map((error, index) => (
                    <div key={`${error.address}-${index}`} className="grid gap-1 border-t border-rose-100/10 pt-2 text-xs sm:grid-cols-[minmax(150px,0.55fr)_1fr]">
                      <code className="break-all font-mono text-rose-100/80" data-testid={`text-fetch-error-address-${index}`}>{error.address}</code><span className="text-rose-100/60" data-testid={`text-fetch-error-message-${index}`}>{error.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportError && <p role="alert" className="text-sm text-red-400">{reportError}</p>}
            {reportFile && <ClusterFinderDownloadLinks file={reportFile} label="Report" />}
            {!!result.focusAddresses?.length && <div className="border border-cyan-200/30 bg-cyan-200/5 p-4" data-testid="panel-cluster-focus-results">
              <h2 className="text-sm font-semibold text-cyan-100">Focus wallet connections</h2>
              <p className="mt-1 text-xs text-muted-foreground">Shortest observed lead-to-focus IN/OUT routes within {result.maxHops ?? 6} hops. Arrows show actual transfer direction; alternate shortest routes can branch. All scanned data remains available below and in the report.</p>
              {result.focusAddresses.map((address) => {
                const connection = result.focusConnections?.find((item) => item.focusAddress === address);
                return <div key={address} className="mt-3 text-xs">
                  <code className="break-all">{address}</code>
                  <p className="mt-1 text-muted-foreground">{connection ? `${connection.hopCount} hop(s) from lead · ${connection.flows.length} observed link(s), highlighted on graph.` : result.excludedAddresses.includes(address) ? "Excluded by existing wallet rules." : "No connecting path observed within the selected depth. Partial histories may hide paths."}</p>
                  {connection && <ol className="mt-2 space-y-1">{connection.flows.map((flow) => <li key={flow.id} className="break-all font-mono">Hop {flow.hop}: {flow.from} → {flow.to} · {flow.transactions.length} TX</li>)}</ol>}
                </div>;
              })}
            </div>}
            {(result.disconnectedAddresses.length > 0 || result.excludedAddresses.length > 0 || result.truncatedAddresses.length > 0) && (
              <div className="grid gap-3 lg:grid-cols-3" data-testid="panel-scan-qualifiers">
                {result.disconnectedAddresses.length > 0 && <Qualifier title="No directed path to lead" icon={<Unplug className="h-3.5 w-3.5" />} addresses={result.disconnectedAddresses} tone="amber" testId="panel-disconnected-addresses" note={`No directed private-wallet path toward the lead was found within the scanned ${result.maxHops ?? 6}-hop boundary. These wallets may still have IN/OUT links in the full graph. This is not proof that no relationship exists.`} />}
                {result.excludedAddresses.length > 0 && <Qualifier title="Known infrastructure excluded" icon={<ShieldCheck className="h-3.5 w-3.5" />} addresses={result.excludedAddresses} tone="slate" testId="panel-excluded-addresses" note="All labeled wallets are excluded except Treasury, Stardust Collective, and Team Foundation. Exchanges, bridges, and genesis wallets remain excluded regardless of label." />}
                {result.truncatedAddresses.length > 0 && <Qualifier title="History truncated" icon={<AlertCircle className="h-3.5 w-3.5" />} addresses={result.truncatedAddresses} tone="rose" testId="panel-truncated-addresses" note={`Wallet history reached the ${MAX_CLUSTER_HISTORY_PER_WALLET.toLocaleString()} transaction cap. Paths may be incomplete.`} />}
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(330px,0.88fr)]">
              <Card className="min-w-0 rounded-none border-border/80 bg-card/65 shadow-none">
                <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 sm:px-5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Network topology</div>
                    <p className="mt-1 text-xs text-foreground/80">Successful transfers only · directed private-wallet flows</p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-200" /> Lead</span>
                    <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-teal-200" /> Input</span>
                  </div>
                </div>
                <ClusterFinderGraph nodes={result.nodes} flows={result.flows} selectedPath={selectedPath} focusAddresses={result.focusAddresses} focusFlowIds={focusFlowIds} />
                <div className="border-t border-border/60 px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/65">Scanned boundary: {result.maxHops ?? 6} hops · arrows show sender → recipient · separate components do not imply a connection.</div>
                <div className="border-t border-border/60 p-4" data-testid="panel-recursive-trail">
                  <h3 className="text-sm font-medium">Complete recursive trail</h3>
                  <p className="mt-1 mb-3 text-xs text-muted-foreground">Discovery hops are minimum expansion depth from any starting wallet, not chronological transfer order. Expand a flow for all unique transactions.</p>
                  {result.flows.map((flow) => (
                    <RecursiveFlowDetails key={`${flow.from}-${flow.to}`} flow={flow} />
                  ))}
                  {!result.flows.length && <p className="text-xs text-muted-foreground">No eligible transfers were observed.</p>}
                </div>
              </Card>

              <div className="space-y-4">
                <Card className="rounded-none border-border/80 bg-card/65 shadow-none">
                  <div className="border-b border-border/70 px-4 py-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Directed input-to-lead index</div>
                    <p className="mt-1 text-xs text-foreground/80">{result.connections.length} observed path{result.connections.length === 1 ? "" : "s"}</p>
                  </div>
                  {result.connections.length ? (
                    <div className="max-h-[300px] overflow-y-auto">
                      {result.connections.map((connection, index) => {
                        const active = connection.inputAddress === activeSelection?.inputAddress;
                        return (
                          <button key={connection.inputAddress} type="button" onClick={() => setSelectedInput(connection.inputAddress)} className={`group flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/30 ${active ? "bg-cyan-100/[0.045]" : ""}`} data-testid={`button-select-connection-${index}`} aria-pressed={active}>
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${active ? "bg-cyan-100" : "bg-muted-foreground/30"}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block break-all font-mono text-[11px] text-foreground/90" data-testid={`text-connected-input-${index}`}>{connection.inputAddress}</span>
                               <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{connection.flows.length} relevant flow{connection.flows.length === 1 ? "" : "s"} <span className="px-1 text-border">/</span> {connection.nodes.length} nodes</span>
                            </span>
                            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-cyan-100" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-5 text-xs leading-5 text-muted-foreground" data-testid="empty-cluster-connections">No input wallet has a confirmed private-wallet path to the lead in the scanned history.</div>
                  )}
                </Card>

                {activeSelection && (
                  <Card className="rounded-none border-border/80 bg-card/65 shadow-none" data-testid="panel-selected-connection">
                    <div className="border-b border-border/70 px-4 py-3">
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Selected input routes</div>
                      <p className="mt-1 break-all font-mono text-[11px] text-cyan-100/90">{shortAddress(activeSelection.inputAddress)} <ArrowRight className="mx-1 inline h-3 w-3" /> lead</p>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Every observed flow that can continue toward the lead is listed; hop numbers show minimum distance from this input.</p>
                      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={exportSelectedTrail} data-testid="button-print-selected-trail">
                        <Printer className="mr-2 h-4 w-4" /> Print Selected Trail
                      </Button>
                    </div>
                    <div className="max-h-[560px] space-y-0 overflow-y-auto">
                      {activeSelection.flows.map((flow, flowIndex) => (
                        <article key={flow.id} className="relative border-b border-border/50 px-4 py-4 last:border-0" data-testid={`article-cluster-hop-${flowIndex}`}>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-amber-100"><span className="grid h-5 w-5 place-items-center border border-amber-100/20">{String(flow.hop).padStart(2, "0")}</span> Hop {flow.hop} flow</div>
                            <span className="font-mono text-[9px] text-muted-foreground">{flow.transactions.length} observed TX</span>
                          </div>
                          <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border border-border/50 bg-background/30 p-2.5">
                            <code className="truncate font-mono text-[9px] text-muted-foreground" title={flow.from}>{shortAddress(flow.from)}</code>
                            <ArrowRight className="h-3.5 w-3.5 text-cyan-100/70" />
                            <code className="truncate text-right font-mono text-[9px] text-muted-foreground" title={flow.to}>{shortAddress(flow.to)}</code>
                          </div>
                          <div className="space-y-2">
                            {flow.transactions.map((transaction, txIndex) => (
                              <div key={`${transaction.hash}-${txIndex}`} className="border-l border-cyan-200/20 pl-3" data-testid={`row-cluster-transaction-${flowIndex}-${txIndex}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-foreground/90"><ArrowDownLeft className="h-3 w-3 text-cyan-100/60" />{formatValue(transaction.value, transaction.tokenSymbol)}</span>
                                  {transaction.valueUsd != null && <span className="font-mono text-[10px] text-emerald-100/70">${transaction.valueUsd}</span>}
                                  <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground"><Clock3 className="h-3 w-3" />{formatTimestamp(transaction.timestamp)}</span>
                                </div>
                                <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                                  <code className="min-w-0 flex-1 truncate font-mono text-[9px] text-muted-foreground/75" title={transaction.hash}>{transaction.hash}</code>
                                  <button type="button" onClick={() => copyText(transaction.hash)} className="shrink-0 p-1 text-muted-foreground hover:text-foreground" aria-label={`Copy transaction hash ${transaction.hash}`} data-testid={`button-copy-tx-${flowIndex}-${txIndex}`}><Copy className="h-3 w-3" /></button>
                                  <span className={`shrink-0 font-mono text-[8px] uppercase tracking-[0.1em] ${transaction.status?.toLowerCase() === "failed" ? "text-rose-200" : "text-muted-foreground/70"}`}>{transaction.status ?? "status unknown"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function RecursiveFlowDetails({ flow }: { flow: ClusterFlow }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="border-t border-border/60 py-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer break-all font-mono text-[11px]">
        Discovery hop {flow.discoveryHop ?? "—"} · {flow.from} → {flow.to} · {flow.transactions.length} TX
      </summary>
      {open && flow.transactions.map((tx, index) => (
        <div key={`${tx.hash}-${index}`} className="mt-3 space-y-1 break-all border-l border-border pl-3 text-xs">
          <p><strong>Direction:</strong> {flow.from} → {flow.to}</p>
          <p><strong>Exact amount:</strong> {tx.value} {tx.tokenSymbol}</p>
          <p><strong>Date/time:</strong> {formatTimestamp(tx.timestamp)}</p>
          <p className="font-mono"><strong>TX hash:</strong> {tx.hash}</p>
        </div>
      ))}
    </details>
  );
}

function StateMark({ state }: { state: ScanState }) {
  const labels: Record<ScanState, string> = { idle: "Awaiting scan", running: "In progress", cancelled: "Cancelled", failed: "Error", complete: "Scan ended" };
  return <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground" data-testid="status-cluster-scan-state"><span className={`h-1.5 w-1.5 rounded-full ${state === "running" ? "animate-pulse bg-cyan-100" : state === "failed" ? "bg-rose-200" : state === "complete" ? "bg-emerald-200" : "bg-muted-foreground/40"}`} />{labels[state]}</div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="bg-background/70 px-3 py-3">
    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">{label}</div>
    <div className="mt-1 font-mono text-base tabular-nums text-foreground" data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>{value}</div>
  </div>;
}

function Qualifier({ title, icon, addresses, tone, testId, note }: { title: string; icon: ReactNode; addresses: string[]; tone: "amber" | "slate" | "rose"; testId: string; note: string }) {
  const tones = {
    amber: "border-amber-200/20 bg-amber-200/[0.035] text-amber-100",
    slate: "border-slate-200/15 bg-slate-200/[0.025] text-slate-200",
    rose: "border-rose-200/20 bg-rose-200/[0.035] text-rose-100",
  };
  return <div className={`border p-4 ${tones[tone]}`} data-testid={testId}>
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.13em]">{icon}{title}<span className="opacity-60">({addresses.length})</span></div>
    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{note}</p>
    <div className="mt-3 max-h-24 space-y-1 overflow-y-auto">
      {addresses.map((address, index) => <code key={`${address}-${index}`} className="block break-all font-mono text-[9px] opacity-80" data-testid={`${testId}-address-${index}`}>{address}</code>)}
    </div>
  </div>;
}
