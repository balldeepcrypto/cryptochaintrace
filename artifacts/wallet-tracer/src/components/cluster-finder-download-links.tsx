import { useEffect } from "react";
import type { ClusterDownload } from "@/lib/cluster-finder-download";

export function ClusterFinderDownloadLinks({ file, label }: { file: ClusterDownload; label: string }) {
  useEffect(() => () => URL.revokeObjectURL(file.url), [file.url]);
  return <div role="status" className="flex flex-wrap items-center gap-3 text-xs text-cyan-100" data-testid="cluster-export-ready">
    <span>{label} ready.</span>
    <a href={file.url} download={file.filename} target="_blank" rel="noopener noreferrer" className="underline">Download {file.filename.split(".").pop()?.toUpperCase()}</a>
    <a href={file.url} target="_blank" rel="noopener noreferrer" className="underline">Open {label.toLowerCase()}</a>
    <span className="text-muted-foreground">If no file appeared, use these links. Open HTML reports to print or save as PDF.</span>
  </div>;
}
