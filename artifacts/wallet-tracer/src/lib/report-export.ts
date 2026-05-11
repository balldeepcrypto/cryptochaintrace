function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportAsPdf(title: string, content: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups for this site, then click Export PDF again.");
    return;
  }
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9.5pt;
    line-height: 1.6;
    color: #111;
    background: #fff;
  }
  .wrap { padding: 0 2mm; }
  .hdr {
    border-bottom: 2px solid #111;
    padding-bottom: 8pt;
    margin-bottom: 12pt;
  }
  .hdr h1 {
    font-size: 12.5pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: bold;
    font-family: 'Courier New', Courier, monospace;
  }
  .hdr .meta {
    font-size: 8pt;
    color: #555;
    margin-top: 3pt;
  }
  pre {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-all;
    color: #111;
  }
  .ftr {
    margin-top: 18pt;
    border-top: 1px solid #ddd;
    padding-top: 5pt;
    font-size: 7.5pt;
    color: #aaa;
    font-family: sans-serif;
    letter-spacing: 0.04em;
  }
  @media print {
    @page { margin: 18mm 16mm; size: A4; }
    body { padding: 0; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>${escHtml(title)}</h1>
    <div class="meta">Generated: ${escHtml(now)} &nbsp;|&nbsp; CryptoChainTrace Blockchain Intelligence Platform</div>
  </div>
  <pre>${escHtml(content)}</pre>
  <div class="ftr">CryptoChainTrace &middot; cryptochaintrace.replit.app &middot; For law enforcement and investigative use</div>
</div>
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 250);
  });
</script>
</body>
</html>`;
  w.document.write(html);
  w.document.close();
}

export function exportAsJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function reportFilename(title: string, ext: "pdf" | "json"): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/, "");
  return `${slug}-${dateStr}.${ext}`;
}
