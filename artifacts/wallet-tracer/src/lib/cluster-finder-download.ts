export interface ClusterDownload {
  url: string;
  filename: string;
}

/** Keep the URL alive for a visible, user-clickable fallback link. */
export function createClusterDownload(blob: Blob, filename: string): ClusterDownload {
  if (!blob.size) throw new Error("The export is empty. Please try again.");
  return { url: URL.createObjectURL(blob), filename };
}

export function triggerClusterDownload(file: ClusterDownload): void {
  const link = document.createElement("a");
  link.href = file.url;
  link.download = file.filename;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
}
