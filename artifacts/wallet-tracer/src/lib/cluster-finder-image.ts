import { toBlob } from "html-to-image";

/** Capture the rendered viewport, rather than reconstructing the graph. */
export async function downloadClusterGraphPng(element: HTMLElement): Promise<void> {
  const blob = await toBlob(element, {
    backgroundColor: "#0b1118",
    pixelRatio: 2,
    skipFonts: true,
    filter: (node) => !(node instanceof Element && (
      node.classList.contains("react-flow__controls") ||
      node.classList.contains("react-flow__attribution")
    )),
  });
  if (!blob || !blob.size) throw new Error("The graph image could not be created. Try again or use SVG export.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cluster-finder-view-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
