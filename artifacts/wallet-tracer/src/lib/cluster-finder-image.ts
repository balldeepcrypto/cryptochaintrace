import { createClusterDownload, type ClusterDownload } from "./cluster-finder-download";

/** Rasterize self-contained SVG using real React Flow coordinates and viewport.
 * Avoid DOM/foreignObject capture: it can silently omit React Flow layers. */
export async function downloadClusterGraphPng(svg: string, width: number, height: number): Promise<ClusterDownload> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("The graph has no visible size. Expand the graph and try again.");
  }
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("PNG capture timed out. Try SVG export instead.")), 20_000);
      image.onerror = () => reject(new Error("The graph image could not be rendered. Try SVG export instead."));
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ratio = Math.min(2, 8192 / Math.max(width, height));
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("This browser cannot render PNG files. Use SVG export instead.");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((output) => {
            if (!output?.size) reject(new Error("The graph image is empty. Use SVG export instead."));
            else resolve(output);
          }, "image/png");
        } catch (error) { reject(error); }
      };
      image.src = source;
    });
    return createClusterDownload(blob, `cluster-finder-view-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  } finally {
    clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(source);
  }
}
