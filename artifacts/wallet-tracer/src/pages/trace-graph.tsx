import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "wouter";
import { useGetWalletConnections, getGetWalletConnectionsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, ZoomIn, ZoomOut, Maximize, AlertCircle, X, ExternalLink, FileText, Copy, Check, BookmarkPlus, Download, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressDisplay } from "@/components/address-display";

type ChainId = "ethereum" | "bitcoin" | "xrp" | "xlm" | "hbar" | "xdc" | "dag" | "polygon" | "bsc";
type DepthStr = "1" | "2" | "3" | "4" | "5" | "6";

const EXPLORER_MAP: Partial<Record<ChainId, (a: string) => string>> = {
  ethereum: (a) => `https://eth.blockscout.com/address/${a}`,
  bitcoin:  (a) => `https://blockstream.info/address/${a}`,
  xrp:      (a) => `https://xrpscan.com/account/${a}`,
  xlm:      (a) => `https://stellarchain.io/accounts/${a}`,
  hbar:     (a) => `https://hashscan.io/mainnet/account/${a}`,
  xdc:      (a) => `https://xdcscan.io/address/${a}`,
  dag:      (a) => `https://dagexplorer.io/address/${a}`,
  polygon:  (a) => `https://polygon.blockscout.com/address/${a}`,
};

// Minimum flow amounts per chain — used to filter dust/spam in the report
const GRAPH_MIN_AMOUNTS: Record<string, number> = {
  ethereum: 0.001,
  bitcoin:  0.001,
  polygon:  1.0,
  bsc:      0.01,
  xrp:      1.0,
  xlm:      1.0,
  hbar:     1.0,
  xdc:      1.0,
  dag:      1.0,
};

// Compact exchange/known entity labels for graph enrichment
const GRAPH_KNOWN_LABELS: Record<string, string> = {
  // ── XRP exchanges (comprehensive) ─────────────────────────────────────────
  rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh: "Bitstamp",
  rMQ98K56yXJbDGv49ZSmW51sLn94Xe1mu1: "Bitstamp",
  rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv: "Bitstamp",
  rG6FZ31hDHN1K5Dkbma3PSB5uVCuVVRzfn: "Bitfinex",
  rBndiPPKs9k5rjBb7HsEiqXKVZ9MMhGmhM: "Kraken",
  rKmBGxocj9Abgy25J51Mk1iqFzW9aVF9Tc: "Kraken",
  rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh: "Kraken",
  rBx5RkPh2KR3JqBtZWoU25ZxGHaJzYMD84: "Kraken",
  rnJrjec2vrTJAAQUTMTjj7U6xdXrk9N4mT: "Kraken",
  rEvuKRoEbZSbm5k5Qe5eTD9BixZXsfkxHf: "Kraken",
  rUeDDFNp2q7Ymvyv75hFGC8DAcygVyJbNF: "Kraken",
  rrpNnNLKrartuEqfJGpqyDwPj1BBN1ybNn: "Binance",
  rBttd61FExHC68vsZ8dqmS3DfjFEceA1A:  "Binance",
  rDAE53VfMvftPB4ogpWGWvzkQxfht6JPxr: "Binance",
  rfQ9EcLkU6WnNmkS3EwUkFeXeN47Rk8Cvi: "Binance",
  rBtttd61FExHC68vsZ8dqmS3DfjFEceA1A: "Binance",
  rPCpZwPKogNodbjRxGDnefVXu9Q9R4PN4Q: "Binance",
  rHXuEaRYnnJom5RS9K5pMrfFSmXwcjALBF: "Coinbase",
  rw2ciyaNshpHe7bCHo4bRWq6pqqynnWKQg: "Coinbase",
  rwnYLUsoBQX3ECa1A5bSKLdbPoHKnqf63J: "Coinbase",
  r4sRyacXpbh4HbagmgfoQq8Q3j8ZJzbZ1J: "Coinbase",
  rwpTh9DDa52XkM9nTKp2QrJuCGV5d1mQVP: "Coinbase",
  r3YsZdkznVzYBv141qhwXHDWoPUXLdksNw: "Coinbase",
  rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w: "Coinbase",
  rUjfTQpvBr6wsGGxMw6sRmRQGG76nvp8Ln: "Coinbase",
  r3wcwBpVCGcKu7TzY1ta2kQiJ5UHECDFZS: "Coinbase",
  rayCEqaUBryJSWxf3BEc1Y4EMRYLuK3aJ8: "Coinbase",
  r7BspkyEZqKZ88SovgxZtsGGxoVoPodJf:  "Coinbase",
  rGFNBYb9548VqJojTDoDDYoJBEpvmVywSV: "Coinbase",
  rQGXuQCZH27mj7wcikYrKCEbAh5xfenwb8: "Coinbase",
  r4k4U4Hge3mLfyURfGu3pJFeNTWXduBha2: "Coinbase",
  rGvmcMqafc5HAdyhaoQCG4tpBZKdYLT3cH: "Coinbase",
  rHRHwHJHHzQ328c33wCimeXqCgyDoxLXjF: "Coinbase",
  rU5ACGLKbhPQB92GZhT5UV22NHeVrEGuU6: "Coinbase",
  rJb5KsHsDHF1YS5B5DU6QCkH5NsPaKQTcy: "OKX",
  rUzWJkXyEtT8ekSSxkBYPqCvHpngcy6Fks: "OKX",
  rPVMhWBsfF9iMXYj3aAzJVkPDTFNSyWdKy: "Huobi/HTX",
  rHpSX1VNr3tdsDvvSAFKMPXzTZ3KPAJQ2E: "HTX",
  rDm691szLmEqpUbXmgnj159Ffpp9PntHwj: "HTX",
  rN7n3473SaZBCG4dFL75EpTSMBKmFVBQBh: "Bitget",
  rNxp4h8apvRis6mJf9Sh8C6iRxfrDWN7AV: "KuCoin",
  rGsxGQNdaDyFhZQ5JqDGPkT3VGFFexCaM3: "Gate.io",
  rGmP2iRHqoYkFXF3HqrZEGZVXiqBGKcZmz: "Gate.io",
  rMJXDzU1N9ZSDzPF7s1i2GGKyjM2wB3iom: "Robinhood",
  rBKPS4oLSaV2KVVuHH8EpQqMGgWj5U37h4: "Bittrex",
  rPJwJUmDMijFtBi3GnW2VRFTCEpFCJCGPA: "Poloniex",
  rKNwXQh9GMjaU8uTqKLECsqyib47g5dMvo: "Crypto.com",
  r4DymtkgUAH2wqRxVfdd3Xtswzim6eC6c5: "Crypto.com",
  rHcFoo6a9qT5NHiVn1THwuhbekk8ovtWiL: "Bybit",
  rEvwSpejhGTbdAXbxRTpGAzPBQKRZxN5s:  "eToro",
  rGFuMiw48HdbnrUbkRToR1yMBZkjbqvUhQ: "MEXC",
  raBQUYdAhnnojJQ6Xi3eXztZ74ot24RDq1: "Gemini",
  r4FuDeXifHAZork5KcEQKKBqmBWPGiFmJC: "Uphold",
  rMdG3ju8pgyVh29ELPWaDuA74CpWW6Fxns: "Uphold",
  rsXT3AQqhHDusFs3nQQuwcA1yXRLZJAXKw: "Uphold",
  rBEc94rUFfLfTDwwGN7rQGBHc883c2OHx:  "Uphold",
  rBgnUKAEiFhCRLPoYNPPe3JUWayRjP6Ayg: "Coinspot",
  rBWpYJhuJWBPakzJ4kYQqHShSkkF3rgeD:  "Cobo Custody",
  rQrgppDZMMKeq1x9gDuoytWeRLmLfXYV3q: "Union Chain",
  // ── XLM exchanges ──────────────────────────────────────────────────────────
  GBEZDAORANS52QCQ3UXGE6ZBMW3KMBSB42GBXBZMQEVJGALDEF2MGDM: "Binance XLM",
  GCGNWKCJ3KHRLPM3TM6N7D3W5YKDJFL6A2YCXFXNMRTZ4Q66BZDSBS4: "Coinbase XLM",
  GCO2IP3MJNUOKS4PUDI4C7LGGMQDJGXG3COYX3WSB4HHNAHKYV5YL3VC: "Kraken XLM",
  GDEZTHPGZRQG5IVIMKPLMAHUBFVLKUJDQRZJ3G3BGTKH7JHXN39V63M: "Binance XLM 2",
  GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODB4: "Poloniex XLM",
  // ── HBAR exchanges ─────────────────────────────────────────────────────────
  "0.0.98":    "Hedera Network (fees)",
  "0.0.800":   "Hedera Staking Reward",
  "0.0.29662955": "Binance HBAR",
  "0.0.34741585": "Coinbase HBAR",
  "0.0.15015921": "OKX HBAR",
  // ── ETH / EVM exchanges ────────────────────────────────────────────────────
  "0xd551234ae421e3bcba99a0da6d736074f22192ff": "Binance ETH",
  "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": "Binance ETH 2",
  "0x564286362092d8e7936f0549571a803b203aaced": "Binance ETH 3",
  "0x0681d8db095565fe8a346fa0277bffde9c0edbbf": "Binance ETH 4",
  "0xfe9e8709d3215310075d67e3ed32a380ccf451c8": "Binance ETH 5",
  "0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67": "Binance ETH 6",
  "0x85b931a32a0725be14285b66f1a22178c672d69b": "Binance ETH 7",
  "0xe0f0cfde7ee664943906f17f7f14342e76a5cec7": "Binance ETH 8",
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": "Binance Cold",
  "0xa910f92acdaf488fa6ef02174fb86208ad7722ba": "Kraken ETH",
  "0xe853c56864a2ebe4576a807d26fdc4a0ada51919": "Kraken ETH 2",
  "0xda9dfa130df4de4673b89022ee50ff26f6ea73cf": "Kraken ETH 3",
  "0x2b5634c42055806a59e9107ed44d43c426e58258": "KuCoin ETH",
  "0x88bd4d3e2997371bceefe8d9cf8ca0b038411a1f": "KuCoin ETH 2",
  "0x689c56aef474df92d44a1b70850f808488f9769c": "KuCoin ETH 3",
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": "Gate.io ETH",
  "0x7793cd85c11a924478d358d49b05b37e91b5810f": "Gate.io ETH 2",
  "0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c": "Bittrex ETH",
  "0xfbb1b73c4f0bda4f67dca266ce6ef42f520fbb98": "Bittrex ETH 2",
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": "Coinbase ETH",
  "0x503828976d22510aad0201ac7ec88293211d23da": "Coinbase ETH 2",
  "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740": "Coinbase ETH 3",
  "0x3cd751e6b0078be393132286c442345e5dc49699": "Coinbase ETH 4",
  "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511": "Coinbase ETH 5",
  "0xeb2629a2734e272bcc07bda959863f316f4bd4cf": "Coinbase ETH 6",
  "0xa090e606e30bd747d4e6245a1517ebe430f0057e": "Coinbase ETH 7",
  "0xf6874c88757721a02f9b2c48e6a9f5d2f0c9c1e": "Coinbase ETH 8",
  "0x77696bb39917c91a0c3908d577d5e322095425ca": "Coinbase ETH 9",
  "0x7c195d981abfdc3ddecd2ca0fed0958430488e34": "Coinbase ETH 10",
  "0x4b01721f0244e7c5b5f63c20942850e447f5a5ee": "OKX ETH",
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": "OKX ETH 2",
  "0x236f9f97e0e62388479bf9e5ba4889e46b0273c3": "OKX ETH 3",
  "0xd551234ae421e3bcba99a0da6d736074f22192fd": "OKX ETH 4",
  "0x5041ed759dd4afc3a72b8192c143f72f4724081f": "Huobi/HTX ETH",
  "0xab5c66752a9e8167967685f1450532fb96d5d24f": "Huobi/HTX ETH 2",
  "0xdc76cd25977e0a5ae17155770273ad58648900d3": "Huobi/HTX ETH 3",
  "0x1062a747393198f70f71ec65a582423dba7e5ab3": "Bybit ETH",
  // ── BTC exchanges ──────────────────────────────────────────────────────────
  "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": "Binance BTC",
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": "Binance BTC 2",
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": "Binance Cold",
  "1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd": "Coinbase BTC",
  "3Cbq7aT1tY8kMxWLbitaG7yT6bPbKChq64": "Coinbase BTC 2",
  "bc1qazcm763858nkj2dj986etajv6wquslv8uxjycy": "Coinbase BTC 3",
  "3LYJfcfHcvFYQePXedRGgKKFHfXBdkFvfg": "Kraken BTC",
  "3E5cvCDqmW7gBsHYHosDQNDKGrCi9wjGar": "Kraken BTC 2",
  "1KUUJPkyDhamZXgpsyXqNGc3x1QPXtdhgz": "BitFinex BTC",
  "3JZq4atEAjqAjW7bSNiQVqHdSVJAq5UBXH": "Bittrex BTC",
  "1LdRcdxfbSnmCYYNdeYpUnztiYzVfBEQeC": "Poloniex BTC",
};

interface NodeStyle {
  fill: string; ring: string; glow: string;
  radius: number; textColor: string; category: string;
}

function nodeStyle(
  addr: string, center: string,
  riskScore: number | null | undefined,
  isContract: boolean | null | undefined,
  label: string | null | undefined,
  isCommingling: boolean,
): NodeStyle {
  if (addr === center)
    return { fill: "#3b82f6", ring: "#1d4ed8", glow: "rgba(59,130,246,0.45)", radius: 14, textColor: "#93c5fd", category: "center" };
  if (isCommingling)
    return { fill: "#eab308", ring: "#ca8a04", glow: "rgba(234,179,8,0.4)",   radius: 11, textColor: "#fde047",  category: "commingling" };
  if (label)
    return { fill: "#ef4444", ring: "#b91c1c", glow: "rgba(239,68,68,0.4)",   radius: 10, textColor: "#fca5a5",  category: "exchange" };
  if ((riskScore ?? 0) > 70)
    return { fill: "#f97316", ring: "#ea580c", glow: "rgba(249,115,22,0.4)",  radius: 10, textColor: "#fdba74",  category: "high-risk" };
  if (isContract)
    return { fill: "#a855f7", ring: "#7c3aed", glow: "rgba(168,85,247,0.4)",  radius:  9, textColor: "#d8b4fe",  category: "contract" };
  return   { fill: "#334155", ring: "#1e293b", glow: "rgba(71,85,105,0.25)",  radius:  8, textColor: "#94a3b8",  category: "standard" };
}

const DEPTH_LABELS: Record<DepthStr, string> = {
  "1": "1 Hop (Quick)",
  "2": "2 Hops (Standard)",
  "3": "3 Hops (Deep)",
  "4": "4 Hops (Extended)",
  "5": "5 Hops (Thorough)",
  "6": "6 Hops (Maximum)",
};

export default function TraceGraph() {
  const params = useParams();
  const address = params.address || "";
  const chain = (new URLSearchParams(window.location.search).get("chain") || "ethereum") as ChainId;
  const chainUp = chain.toUpperCase();

  const [depth, setDepth] = useState<DepthStr>("1");

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const commRef      = useRef<Set<string>>(new Set());

  const [hoveredAddr,     setHoveredAddr]     = useState<string | null>(null);
  const [selectedAddr,    setSelectedAddr]    = useState<string | null>(null);
  const [showNodeReport,  setShowNodeReport]  = useState(false);
  const [showGraphReport, setShowGraphReport] = useState(false);
  const [nodeReportText,  setNodeReportText]  = useState("");
  const [graphReportText, setGraphReportText] = useState("");
  const [reportCopied,    setReportCopied]    = useState(false);
  const [addedCopied,     setAddedCopied]     = useState(false);

  const { data: connections, isLoading, error } = useGetWalletConnections(address, {
    chain, depth: parseInt(depth),
  }, {
    query: {
      enabled: !!address,
      queryKey: getGetWalletConnectionsQueryKey(address, { chain, depth: parseInt(depth) }),
    },
  });

  // Enrich nodes with known exchange labels from GRAPH_KNOWN_LABELS
  const enrichedConnections = useMemo(() => {
    if (!connections) return null;
    const enrichedNodes = connections.nodes.map(n => {
      if (n.label) return n; // already labeled (center = "Target")
      const known = GRAPH_KNOWN_LABELS[n.address]
        ?? GRAPH_KNOWN_LABELS[n.address.toLowerCase()]
        ?? null;
      return known ? { ...n, label: known } : n;
    });
    return { ...connections, nodes: enrichedNodes };
  }, [connections]);

  // Chain-specific minimum amount for report filtering
  const graphMinAmount = GRAPH_MIN_AMOUNTS[chain] ?? 1.0;

  const drawGraph = useCallback((hovered: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas || !enrichedConnections || enrichedConnections.nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pr = canvas.parentElement?.getBoundingClientRect();
    if (pr) { canvas.width = pr.width; canvas.height = pr.height; }
    const W = canvas.width, H = canvas.height, CX = W / 2, CY = H / 2;

    ctx.clearRect(0, 0, W, H);

    // Detect commingling nodes — wallets that receive from 2+ distinct senders.
    // Known exchange nodes are excluded: exchanges always aggregate from many sources
    // by design and their presence would otherwise inflate (and destabilise) the hub count.
    const knownExchangeAddrs = new Set(
      enrichedConnections.nodes
        .filter(n => n.label && n.label !== "Target")
        .map(n => n.address)
    );
    const inMap = new Map<string, Set<string>>();
    for (const e of enrichedConnections.edges) {
      if (e.to === enrichedConnections.centerAddress) continue;
      if (knownExchangeAddrs.has(e.to)) continue; // exchange nodes handled separately
      if (!inMap.has(e.to)) inMap.set(e.to, new Set());
      inMap.get(e.to)!.add(e.from);
    }
    const commingling = new Set(
      [...inMap.entries()].filter(([, f]) => f.size > 1).map(([t]) => t)
    );
    commRef.current = commingling;

    // Layout: radial rings by depth (BFS from center via edges)
    const pos = new Map<string, { x: number; y: number }>();
    pos.set(enrichedConnections.centerAddress, { x: CX, y: CY });

    const depthMap = new Map<string, number>();
    depthMap.set(enrichedConnections.centerAddress, 0);
    const queue = [enrichedConnections.centerAddress];
    while (queue.length) {
      const cur = queue.shift()!;
      const curDepth = depthMap.get(cur)!;
      for (const e of enrichedConnections.edges) {
        if (e.from === cur && !depthMap.has(e.to)) {
          depthMap.set(e.to, curDepth + 1);
          queue.push(e.to);
        }
      }
    }
    const depthGroups = new Map<number, string[]>();
    for (const [addr, d] of depthMap) {
      if (addr === enrichedConnections.centerAddress) continue;
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(addr);
    }
    const maxD = Math.max(...[...depthGroups.keys()], 1);
    const minR = Math.min(W, H) * 0.15;
    const maxR = Math.min(W, H) * 0.44;
    for (const [d, addrs] of depthGroups) {
      const r = minR + (maxR - minR) * (d / maxD);
      const sortedAddrs = [...addrs].sort((a, b) => {
        const scoreA = commingling.has(a) ? 2 : enrichedConnections.nodes.find(n => n.address === a)?.label ? 1 : 0;
        const scoreB = commingling.has(b) ? 2 : enrichedConnections.nodes.find(n => n.address === b)?.label ? 1 : 0;
        return scoreB - scoreA;
      });
      sortedAddrs.forEach((addr, i) => {
        const angle = -Math.PI / 2 + (i / sortedAddrs.length) * 2 * Math.PI;
        pos.set(addr, { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) });
      });
    }
    for (const n of enrichedConnections.nodes) {
      if (!pos.has(n.address)) {
        const angle = Math.random() * 2 * Math.PI;
        pos.set(n.address, { x: CX + minR * Math.cos(angle), y: CY + minR * Math.sin(angle) });
      }
    }
    positionsRef.current = pos;

    // Draw edges
    for (const e of enrichedConnections.edges) {
      const s = pos.get(e.from), t = pos.get(e.to);
      if (!s || !t) continue;
      const isHotEdge    = hovered === e.from || hovered === e.to;
      const isCommEdge   = commingling.has(e.to) || commingling.has(e.from);
      const isExchEdge   = enrichedConnections.nodes.find(n => n.address === e.to)?.label != null;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = isHotEdge
        ? "rgba(99,179,237,0.75)"
        : isCommEdge
        ? "rgba(234,179,8,0.25)"
        : isExchEdge
        ? "rgba(239,68,68,0.2)"
        : "rgba(99,179,237,0.08)";
      ctx.lineWidth = isHotEdge ? 2.5 : isCommEdge || isExchEdge ? 1.5 : 1;
      ctx.stroke();
      if (isHotEdge) {
        const px = s.x + (t.x - s.x) * 0.6, py = s.y + (t.y - s.y) * 0.6;
        const ang = Math.atan2(t.y - s.y, t.x - s.x);
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang) * 7, py + Math.sin(ang) * 7);
        ctx.lineTo(px + Math.cos(ang + Math.PI - 2.3) * 7, py + Math.sin(ang + Math.PI - 2.3) * 7);
        ctx.lineTo(px + Math.cos(ang + Math.PI + 2.3) * 7, py + Math.sin(ang + Math.PI + 2.3) * 7);
        ctx.closePath();
        ctx.fillStyle = "rgba(99,179,237,0.75)";
        ctx.fill();
      }
    }

    // Draw nodes (back-to-front: standard → high-risk → exchange → commingling → center)
    const sorted = [...enrichedConnections.nodes].sort((a, b) => {
      const rank = (n: typeof a) =>
        n.address === enrichedConnections.centerAddress ? 4 :
        commingling.has(n.address) ? 3 :
        n.label ? 2 :
        (n.riskScore ?? 0) > 70 ? 1 : 0;
      return rank(a) - rank(b);
    });

    for (const node of sorted) {
      const p = pos.get(node.address);
      if (!p) continue;
      const isComm = commingling.has(node.address);
      const isHov  = node.address === hovered;
      const isSel  = node.address === selectedAddr;
      const st = nodeStyle(node.address, enrichedConnections.centerAddress, node.riskScore, node.isContract, node.label, isComm);
      const r  = st.radius + (isHov ? 3 : 0);

      if (isHov || isSel || isComm || node.label) {
        const grad = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r + (isHov || isSel ? 20 : 12));
        grad.addColorStop(0, st.glow);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + (isHov || isSel ? 20 : 12), 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      if (isSel) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6, 0, 2 * Math.PI);
        ctx.strokeStyle = "#ffffff50";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = st.fill;
      ctx.fill();
      ctx.strokeStyle = isHov ? "#ffffffa0" : st.ring;
      ctx.lineWidth = isHov ? 2.5 : 1.5;
      ctx.stroke();
      ctx.font = `${node.address === enrichedConnections.centerAddress || isComm ? "bold " : ""}10px monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = isHov ? "#fff" : st.textColor;
      const lbl = node.label
        ? (node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label)
        : `${node.address.slice(0, 4)}…${node.address.slice(-4)}`;
      ctx.fillText(lbl, p.x, p.y + r + 14);
    }
  }, [enrichedConnections, selectedAddr]);

  useEffect(() => { drawGraph(hoveredAddr); }, [enrichedConnections, hoveredAddr, selectedAddr, drawGraph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enrichedConnections) return;

    const hit = (e: MouseEvent): string | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * sx, cy = (e.clientY - rect.top) * sy;
      for (const [addr, p] of positionsRef.current) {
        if (Math.hypot(cx - p.x, cy - p.y) <= 22) return addr;
      }
      return null;
    };

    const onMove = (e: MouseEvent) => {
      const h = hit(e);
      canvas.style.cursor = h ? "pointer" : "crosshair";
      setHoveredAddr(h);
    };
    const onClick = (e: MouseEvent) => {
      const h = hit(e);
      setSelectedAddr(prev => (prev === h ? null : h));
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click",     onClick);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click",     onClick);
    };
  }, [enrichedConnections]);

  const selectedNode    = enrichedConnections?.nodes.find(n => n.address === selectedAddr) ?? null;
  const explorerUrl     = EXPLORER_MAP[chain];
  const isCommingling   = selectedAddr ? commRef.current.has(selectedAddr) : false;

  // Edges between selected node and center (for panel stats)
  const edgesWithCenter = enrichedConnections?.edges.filter(e =>
    (e.from === selectedAddr && e.to === address) ||
    (e.to === selectedAddr   && e.from === address)
  ) ?? [];
  const txsWithCenter  = edgesWithCenter.reduce((s, e) => s + (e.transactionCount ?? 0), 0);
  const volWithCenter  = edgesWithCenter.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
  const usdWithCenter  = edgesWithCenter.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0);

  function genNodeReport(): string {
    if (!selectedNode || !enrichedConnections) return "";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const nodeType = selectedNode.isContract
      ? "SMART CONTRACT"
      : isCommingling
      ? "COMMINGLING HUB"
      : selectedNode.label && selectedNode.label !== "Target"
      ? "EXCHANGE / KNOWN ENTITY"
      : "STANDARD WALLET";
    const lines: string[] = [
      `╔══════════════════════════════════════════════════════════════╗`,
      `║        INVESTIGATIVE REPORT — CryptoChainTrace              ║`,
      `╚══════════════════════════════════════════════════════════════╝`,
      `Generated : ${now}`,
      `Chain     : ${chainUp}   |   Source: Trace Graph (${DEPTH_LABELS[depth]})`,
      ``,
      `─── NODE DETAILS ${"─".repeat(47)}`,
      ``,
      `  Address    : ${selectedNode.address}`,
      ...(selectedNode.label && selectedNode.label !== "Target" ? [`  Label      : ${selectedNode.label}`] : []),
      `  Type       : ${nodeType}`,
      `  Risk Score : ${selectedNode.riskScore != null ? selectedNode.riskScore : "UNSCORED"}`,
      ...(selectedNode.balance && selectedNode.balance !== "0" ? [`  Balance    : ${selectedNode.balance} ${chainUp}`] : []),
      ...(selectedNode.transactionCount != null ? [`  Total Txs  : ${selectedNode.transactionCount}`] : []),
      ...(txsWithCenter > 0 ? [
        ``,
        `─── CONNECTION TO CENTER WALLET ${"─".repeat(32)}`,
        ``,
        `  Txs w/ Center : ${txsWithCenter}`,
        `  Volume        : ${volWithCenter.toFixed(4)} ${chainUp}${usdWithCenter > 0 ? `  ($${usdWithCenter.toLocaleString("en-US", {maximumFractionDigits: 2})})` : ""}`,
      ] : []),
      ...(isCommingling ? [
        ``,
        `  ⚠ COMMINGLING HUB — Receives funds from multiple independent`,
        `    sources, indicating potential fund mixing or layering.`,
      ] : []),
      ``,
      `─── GRAPH CONTEXT ${"─".repeat(46)}`,
      ``,
      `  Center wallet : ${address}`,
      `  Graph depth   : ${depth} hop${parseInt(depth) !== 1 ? "s" : ""}`,
      `  Total nodes   : ${enrichedConnections?.nodes.length ?? 0}`,
      `  Total edges   : ${enrichedConnections?.edges.length ?? 0}`,
      `  Commingle hubs: ${commRef.current.size}`,
      ``,
      `${"═".repeat(64)}`,
      `Generated by CryptoChainTrace  ·  cryptochaintrace.com`,
    ];
    return lines.join("\n");
  }

  function genGraphReport(): string {
    if (!enrichedConnections) return "";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const commingling = commRef.current;
    const hubNodes      = enrichedConnections.nodes.filter(n => commingling.has(n.address));
    const exchNodes     = enrichedConnections.nodes.filter(n => n.label && n.label !== "Target" && !commingling.has(n.address));
    const highRiskNodes = enrichedConnections.nodes.filter(n => (n.riskScore ?? 0) > 70 && !commingling.has(n.address) && !n.label);

    // Filter out dust/spam flows below chain minimum
    const filteredEdges = [...enrichedConnections.edges]
      .filter(e => parseFloat(e.totalValue || "0") >= graphMinAmount)
      .sort((a, b) => parseFloat(b.totalValue || "0") - parseFloat(a.totalValue || "0"));

    const totalGraphVolume = filteredEdges.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
    const totalGraphUsd    = filteredEdges.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0);
    const hasUsd = totalGraphUsd > 0;

    const lines: string[] = [
      `╔══════════════════════════════════════════════════════════════╗`,
      `║    GRAPH INVESTIGATIVE REPORT — CryptoChainTrace            ║`,
      `╚══════════════════════════════════════════════════════════════╝`,
      `Generated  : ${now}`,
      `Chain      : ${chainUp}   |   Depth: ${depth} hop${parseInt(depth) !== 1 ? "s" : ""} (${DEPTH_LABELS[depth]})`,
      `Center     : ${address}`,
      `Filter     : Flows below ${graphMinAmount} ${chainUp} hidden`,
      ``,
      `─── GRAPH SUMMARY ${"─".repeat(46)}`,
      ``,
      `  Total Nodes       : ${enrichedConnections.nodes.length}`,
      `  Significant Flows : ${filteredEdges.length}  (${enrichedConnections.edges.length - filteredEdges.length} dust/spam hidden)`,
      `  Commingling Hubs  : ${commingling.size}`,
      `  Exchange Nodes    : ${exchNodes.length}`,
      `  High-Risk Nodes   : ${highRiskNodes.length}`,
      `  Total Volume      : ${totalGraphVolume.toFixed(4)} ${chainUp}${hasUsd ? `  ≈ $${totalGraphUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} USD` : ""}`,
      ``,
    ];

    if (hubNodes.length > 0) {
      lines.push(`─── ⚠ COMMINGLING HUBS (${hubNodes.length}) ${"─".repeat(Math.max(0, 40 - String(hubNodes.length).length))}`);
      lines.push(``);
      for (const n of hubNodes) {
        const inEdges = filteredEdges.filter(e => e.to === n.address);
        const sources = [...new Set(inEdges.map(e => e.from))];
        const hubVol  = inEdges.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
        const hubUsd  = inEdges.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0);
        lines.push(`  ${n.address}`);
        if (n.label && n.label !== "Target") lines.push(`  Label  : ${n.label}`);
        lines.push(`  Inflow : ${hubVol.toFixed(4)} ${chainUp}${hubUsd > 0 ? `  ($${hubUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })})` : ""}`);
        lines.push(`  Receives from ${sources.length} source wallet${sources.length !== 1 ? "s" : ""}:`);
        for (const src of sources.slice(0, 6)) {
          const vol = inEdges.filter(e => e.from === src).reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
          const usd = inEdges.filter(e => e.from === src).reduce((s, e) => s + (e.totalValueUsd ?? 0), 0);
          const srcKnown = GRAPH_KNOWN_LABELS[src] ?? GRAPH_KNOWN_LABELS[src.toLowerCase()];
          const srcLbl = srcKnown ? `  [${srcKnown}]` : "";
          lines.push(`    · ${src}${srcLbl}`);
          lines.push(`      ${vol.toFixed(4)} ${chainUp}${usd > 0 ? `  ($${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })})` : ""}`);
        }
        if (sources.length > 6) lines.push(`    · ... and ${sources.length - 6} more source(s)`);
        lines.push(``);
      }
    }

    if (exchNodes.length > 0) {
      lines.push(`─── EXCHANGE / KNOWN ENTITIES (${exchNodes.length}) ${"─".repeat(Math.max(0, 33 - String(exchNodes.length).length))}`);
      lines.push(``);
      for (const n of exchNodes) {
        const nodeEdges = filteredEdges.filter(e => e.from === n.address || e.to === n.address);
        const vol = nodeEdges.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
        const usd = nodeEdges.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0);
        const inVol  = filteredEdges.filter(e => e.to === n.address).reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
        const outVol = filteredEdges.filter(e => e.from === n.address).reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
        lines.push(`  ${(n.label ?? "").toUpperCase()}`);
        lines.push(`  ${n.address}`);
        lines.push(`  Total Volume : ${vol.toFixed(4)} ${chainUp}${usd > 0 ? `  ($${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })})` : ""}`);
        if (inVol > 0)  lines.push(`  Received     : ${inVol.toFixed(4)} ${chainUp}`);
        if (outVol > 0) lines.push(`  Sent         : ${outVol.toFixed(4)} ${chainUp}`);
        lines.push(``);
      }
    }

    lines.push(`─── ALL NODES ${"─".repeat(50)}`);
    lines.push(``);
    for (const n of enrichedConnections.nodes) {
      const tag = n.address === address ? "[CENTER]"
                : commingling.has(n.address) ? "[HUB]"
                : n.label && n.label !== "Target" ? `[${n.label}]`
                : (n.riskScore ?? 0) > 70 ? "[HIGH-RISK]"
                : "";
      lines.push(`  ${n.address}  ${tag}`);
    }
    lines.push(``);

    if (filteredEdges.length > 0) {
      lines.push(`─── TOP FLOWS BY VOLUME (≥ ${graphMinAmount} ${chainUp}) ${"─".repeat(20)}`);
      lines.push(``);
      for (const e of filteredEdges.slice(0, 25)) {
        const vol = parseFloat(e.totalValue || "0");
        const usd = e.totalValueUsd ?? 0;
        const usdStr = usd > 0 ? `  ($${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })})` : "";
        const fromKnown = GRAPH_KNOWN_LABELS[e.from] ?? GRAPH_KNOWN_LABELS[e.from.toLowerCase()];
        const toKnown   = GRAPH_KNOWN_LABELS[e.to]   ?? GRAPH_KNOWN_LABELS[e.to.toLowerCase()];
        lines.push(`  FROM : ${e.from}${fromKnown ? `  [${fromKnown}]` : ""}`);
        lines.push(`    →    ${e.to}${toKnown ? `  [${toKnown}]` : ""}`);
        lines.push(`         ${vol.toFixed(4)} ${chainUp}${usdStr}  ·  ${e.transactionCount} tx${e.transactionCount !== 1 ? "s" : ""}`);
        lines.push(``);
      }
    }

    lines.push(`${"═".repeat(64)}`);
    lines.push(`Generated by CryptoChainTrace  ·  cryptochaintrace.com`);
    return lines.join("\n");
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2500);
  };

  function exportPdf(reportText: string, title: string) {
    const w = window.open("", "_blank", "width=960,height=720");
    if (!w) { alert("Please allow popups to export PDF."); return; }
    const escaped = reportText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10.5pt;
      line-height: 1.6;
      background: #fff;
      color: #111;
      padding: 2.2cm 2cm 2cm 2cm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #111;
    }
    .header-title { font-size: 14pt; font-weight: bold; font-family: Arial, sans-serif; }
    .header-sub { font-size: 9pt; color: #555; margin-top: 2px; font-family: Arial, sans-serif; }
    .header-meta { font-size: 9pt; color: #555; text-align: right; font-family: Arial, sans-serif; }
    pre {
      white-space: pre-wrap;
      word-break: break-all;
      font-size: 10pt;
      line-height: 1.55;
    }
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 8.5pt;
      color: #777;
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 1.5cm 1.5cm 1.5cm 1.5cm; }
      @page { margin: 0; size: A4; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="header-title">CryptoChainTrace — Graph Investigative Report</div>
      <div class="header-sub">${chainUp} · ${DEPTH_LABELS[depth]} · Center: ${address}</div>
    </div>
    <div class="header-meta">
      ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}<br>
      cryptochaintrace.com
    </div>
  </div>
  <pre>${escaped}</pre>
  <div class="footer">
    <span>CryptoChainTrace — Blockchain Forensics</span>
    <span>Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</span>
  </div>
  <script>window.addEventListener("load", () => { setTimeout(() => window.print(), 400); });<\/script>
</body>
</html>`);
    w.document.close();
  }

  function exportJson() {
    if (!enrichedConnections) return;
    const commingling = commRef.current;
    const filteredEdges = [...enrichedConnections.edges]
      .filter(e => parseFloat(e.totalValue || "0") >= graphMinAmount)
      .sort((a, b) => parseFloat(b.totalValue || "0") - parseFloat(a.totalValue || "0"));
    const exchNodes = enrichedConnections.nodes.filter(n => n.label && n.label !== "Target" && !commingling.has(n.address));

    const data = {
      meta: {
        generated: new Date().toISOString(),
        generator: "CryptoChainTrace — cryptochaintrace.com",
        chain: chainUp,
        depth: parseInt(depth),
        depthLabel: DEPTH_LABELS[depth],
        centerAddress: address,
        minAmountFilter: graphMinAmount,
        minAmountUnit: chainUp,
      },
      summary: {
        totalNodes: enrichedConnections.nodes.length,
        significantFlows: filteredEdges.length,
        dustFlowsHidden: enrichedConnections.edges.length - filteredEdges.length,
        comminglingHubs: commingling.size,
        exchangeNodes: exchNodes.length,
        highRiskNodes: enrichedConnections.nodes.filter(n => (n.riskScore ?? 0) > 70 && !commingling.has(n.address) && !n.label).length,
        totalVolume: filteredEdges.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0),
        totalVolumeUsd: filteredEdges.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0),
      },
      comminglingHubs: enrichedConnections.nodes
        .filter(n => commingling.has(n.address))
        .map(n => {
          const inEdges = filteredEdges.filter(e => e.to === n.address);
          const sources = [...new Set(inEdges.map(e => e.from))];
          return {
            address: n.address,
            label: n.label,
            inboundSources: sources,
            totalInboundVolume: inEdges.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0),
            totalInboundVolumeUsd: inEdges.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0),
            sourceDetails: sources.map(src => ({
              address: src,
              label: GRAPH_KNOWN_LABELS[src] ?? GRAPH_KNOWN_LABELS[src.toLowerCase()] ?? null,
              volume: inEdges.filter(e => e.from === src).reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0),
              volumeUsd: inEdges.filter(e => e.from === src).reduce((s, e) => s + (e.totalValueUsd ?? 0), 0),
            })),
          };
        }),
      exchangeNodes: exchNodes.map(n => {
        const nodeEdges = filteredEdges.filter(e => e.from === n.address || e.to === n.address);
        return {
          address: n.address,
          label: n.label,
          totalVolume: nodeEdges.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0),
          totalVolumeUsd: nodeEdges.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0),
          receivedVolume: filteredEdges.filter(e => e.to === n.address).reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0),
          sentVolume: filteredEdges.filter(e => e.from === n.address).reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0),
        };
      }),
      allNodes: enrichedConnections.nodes.map(n => ({
        address: n.address,
        label: n.label,
        type: n.address === address ? "center"
            : commingling.has(n.address) ? "commingling"
            : n.label && n.label !== "Target" ? "exchange"
            : (n.riskScore ?? 0) > 70 ? "high-risk"
            : "standard",
        riskScore: n.riskScore,
        balance: n.balance,
        isContract: n.isContract,
      })),
      topFlows: filteredEdges.slice(0, 50).map(e => ({
        from: e.from,
        fromLabel: GRAPH_KNOWN_LABELS[e.from] ?? GRAPH_KNOWN_LABELS[e.from.toLowerCase()] ?? null,
        to: e.to,
        toLabel: GRAPH_KNOWN_LABELS[e.to] ?? GRAPH_KNOWN_LABELS[e.to.toLowerCase()] ?? null,
        volume: parseFloat(e.totalValue || "0"),
        volumeUsd: e.totalValueUsd ?? 0,
        transactionCount: e.transactionCount,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `graph-report-${address.slice(0, 8)}-${chain}-${depth}hop.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">

      {/* ── Top-left control card ── */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
        <Card className="bg-card/80 backdrop-blur pointer-events-auto border-primary/20 shadow-lg w-80">
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Center Node</h3>
              <div className="font-mono text-primary truncate">
                <AddressDisplay address={address} truncate={true} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Network Depth</h3>
              <Select value={depth} onValueChange={(v: DepthStr) => setDepth(v)}>
                <SelectTrigger className="font-mono h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Hop (Quick)</SelectItem>
                  <SelectItem value="2">2 Hops (Standard)</SelectItem>
                  <SelectItem value="3">3 Hops (Deep)</SelectItem>
                  <SelectItem value="4">4 Hops (Extended)</SelectItem>
                  <SelectItem value="5">5 Hops (Thorough)</SelectItem>
                  <SelectItem value="6">6 Hops (Maximum)</SelectItem>
                </SelectContent>
              </Select>
              {parseInt(depth) >= 3 && (
                <p className="text-[10px] font-mono text-yellow-500/70 mt-1">
                  Deeper graphs may take a few seconds to load.
                </p>
              )}
            </div>
            {enrichedConnections && (
              <div className="pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground block mb-0.5">NODES</span>
                  <span className="text-lg font-bold">{enrichedConnections.nodes.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">EDGES</span>
                  <span className="text-lg font-bold">{enrichedConnections.edges.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">HUBS</span>
                  <span className="text-lg font-bold text-yellow-400">{commRef.current.size}</span>
                </div>
              </div>
            )}
            {enrichedConnections && (
              <button
                onClick={() => { setGraphReportText(genGraphReport()); setShowGraphReport(true); }}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-emerald-300 hover:text-emerald-200 bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/30 hover:border-emerald-500/50 rounded px-2 py-2 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Generate Investigative Report from Graph
              </button>
            )}
            <p className="text-[10px] font-mono text-muted-foreground/50 pt-0 border-t border-border/30">
              Click any node for details · hover for edges
            </p>
          </div>
        </Card>

        <div className="flex gap-2 pointer-events-auto">
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><Maximize className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* ── Canvas ── */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Network className="w-8 h-8 text-primary animate-pulse" />
            <span className="text-sm font-mono text-muted-foreground">
              Building {DEPTH_LABELS[depth]} graph…
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-destructive">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm font-mono">Failed to load graph data</span>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-full" style={{ cursor: "crosshair" }} />

      {/* ── Node info panel ── */}
      {selectedNode && (
        <div className="absolute bottom-24 right-4 z-20 pointer-events-auto w-[22rem] max-w-[calc(100vw-2rem)]">
          <Card className={`bg-[#0d1117]/96 backdrop-blur-sm shadow-2xl border ${
            isCommingling            ? "border-yellow-500/60" :
            selectedNode.label && selectedNode.label !== "Target" ? "border-red-500/50"    :
            selectedAddr === address ? "border-primary/50"    : "border-border/50"
          }`}>
            <div className="p-4 space-y-3">
              {/* Node header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                  {isCommingling && (
                    <div className="text-[10px] font-mono font-bold text-yellow-400 flex items-center gap-1">
                      ⚠ COMMINGLING HUB
                    </div>
                  )}
                  {selectedNode.label && selectedNode.label !== "Target" && (
                    <div className="text-xs font-mono font-bold text-red-400 uppercase tracking-wide">
                      {selectedNode.label}
                    </div>
                  )}
                  {selectedAddr === address && (
                    <div className="text-[10px] font-mono font-bold text-primary">ROOT NODE</div>
                  )}
                  <div className="font-mono text-[10px] text-muted-foreground break-all leading-relaxed">
                    {selectedNode.address}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAddr(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0 transition-colors mt-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
                <div className="text-center">
                  <div className="text-[9px] font-mono text-muted-foreground mb-0.5">TOTAL TXS</div>
                  <div className="text-sm font-mono font-bold">{selectedNode.transactionCount ?? "—"}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] font-mono text-muted-foreground mb-0.5">RISK</div>
                  <div className={`text-sm font-mono font-bold ${
                    (selectedNode.riskScore ?? 0) > 70 ? "text-red-400" :
                    (selectedNode.riskScore ?? 0) > 40 ? "text-yellow-400" : "text-green-400"
                  }`}>{selectedNode.riskScore ?? "?"}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] font-mono text-muted-foreground mb-0.5">TYPE</div>
                  <div className="text-[10px] font-mono font-bold text-muted-foreground">
                    {selectedNode.isContract ? "CONTRACT" : isCommingling ? "HUB" : selectedNode.label && selectedNode.label !== "Target" ? "EXCHANGE" : "WALLET"}
                  </div>
                </div>
              </div>

              {/* Connection to center stats */}
              {txsWithCenter > 0 && selectedAddr !== address && (
                <div className="pt-2 border-t border-border/20 space-y-1">
                  <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">With Center Wallet</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-border/10 rounded px-2 py-1 text-center">
                      <div className="text-[9px] font-mono text-muted-foreground">TXS</div>
                      <div className="text-sm font-mono font-bold text-primary">{txsWithCenter}</div>
                    </div>
                    <div className="bg-border/10 rounded px-2 py-1 text-center">
                      <div className="text-[9px] font-mono text-muted-foreground">VOLUME</div>
                      <div className="text-xs font-mono font-bold text-primary">
                        {volWithCenter >= 1000
                          ? `${(volWithCenter / 1000).toFixed(1)}K`
                          : volWithCenter.toFixed(3)}{" "}{chainUp}
                      </div>
                    </div>
                  </div>
                  {usdWithCenter > 0 && (
                    <div className="text-[10px] font-mono text-center text-muted-foreground">
                      ≈ ${usdWithCenter.toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
                    </div>
                  )}
                </div>
              )}

              {/* Balance */}
              {selectedNode.balance && selectedNode.balance !== "0" && (
                <div className="pt-1 border-t border-border/20 text-xs font-mono text-center">
                  <span className="text-muted-foreground">BALANCE  </span>
                  <span className="text-primary font-bold">{selectedNode.balance} {chainUp}</span>
                </div>
              )}

              {/* Contract badge */}
              {selectedNode.isContract && (
                <div className="text-[10px] font-mono text-violet-400 bg-violet-950/30 border border-violet-500/20 rounded px-2 py-1 text-center">
                  SMART CONTRACT
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-border/20">
                <div className="flex gap-2">
                  <a
                    href={`/wallet/${selectedNode.address}?chain=${chain}`}
                    className="flex-1 text-center text-[11px] font-mono text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded px-2 py-1.5 transition-colors"
                  >
                    View Profile →
                  </a>
                  {explorerUrl && (
                    <a
                      href={explorerUrl(selectedNode.address)}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 rounded px-2 py-1.5 transition-colors"
                    >
                      Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedNode.address).catch(() => {});
                    setAddedCopied(true);
                    setTimeout(() => setAddedCopied(false), 2500);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-950/30 hover:bg-cyan-950/50 border border-cyan-500/30 hover:border-cyan-500/50 rounded px-2 py-1.5 transition-colors"
                >
                  {addedCopied
                    ? <><Check className="w-3 h-3" /> Copied! Paste into Commingle Check</>
                    : <><BookmarkPlus className="w-3 h-3" /> Add to Commingle Check</>
                  }
                </button>
                <button
                  onClick={() => { setNodeReportText(genNodeReport()); setShowNodeReport(true); }}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-orange-300 hover:text-orange-200 bg-orange-950/30 hover:bg-orange-950/50 border border-orange-500/30 hover:border-orange-500/50 rounded px-2 py-1.5 transition-colors"
                >
                  <FileText className="w-3 h-3" /> Node Investigative Report
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Legend ── */}
      <Card className="absolute bottom-4 left-4 bg-card/80 backdrop-blur pointer-events-none border-border/40 z-10 p-3">
        <h4 className="text-[9px] font-mono uppercase text-muted-foreground mb-2 tracking-widest">Legend</h4>
        <div className="space-y-1.5 text-[10px] font-mono">
          {([
            ["#3b82f6","#1d4ed8","Target Wallet"],
            ["#ef4444","#b91c1c","Exchange / Known Entity"],
            ["#eab308","#ca8a04","Commingling Hub"],
            ["#f97316","#ea580c","High Risk"],
            ["#a855f7","#7c3aed","Smart Contract"],
            ["#334155","#1e293b","Standard Wallet"],
          ] as [string,string,string][]).map(([fill,ring,label]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{background:fill,border:`1.5px solid ${ring}`}} />
              {label}
            </div>
          ))}
        </div>
      </Card>

      {/* ── Node Report Modal ── */}
      {showNodeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowNodeReport(false)}>
          <div className="relative w-full max-w-3xl bg-[#0a0c10] border border-orange-500/30 rounded-lg shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-mono text-sm text-orange-300 font-bold uppercase tracking-widest">Node Investigative Report</span>
                <span className="text-[11px] font-mono text-muted-foreground">{chainUp} · Trace Graph</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyText(nodeReportText)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/70 rounded px-3 py-1.5 transition-colors"
                >
                  {reportCopied ? <><Check className="w-3 h-3 text-green-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <button onClick={() => setShowNodeReport(false)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono text-foreground/90 leading-relaxed whitespace-pre">{nodeReportText}</pre>
          </div>
        </div>
      )}

      {/* ── Graph Report Modal ── */}
      {showGraphReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowGraphReport(false)}>
          <div className="relative w-full max-w-4xl bg-[#0a0c10] border border-emerald-500/30 rounded-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-sm text-emerald-300 font-bold uppercase tracking-widest">Graph Investigative Report</span>
                <span className="text-[11px] font-mono text-muted-foreground">{chainUp} · {DEPTH_LABELS[depth]} · {enrichedConnections?.nodes.length} nodes</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyText(graphReportText)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/70 rounded px-3 py-1.5 transition-colors"
                  title="Copy to clipboard"
                >
                  {reportCopied ? <><Check className="w-3 h-3 text-green-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <button
                  onClick={() => exportPdf(graphReportText, `Graph Report — ${address.slice(0, 8)} ${chainUp}`)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-sky-300 hover:text-sky-200 border border-sky-500/30 hover:border-sky-500/60 rounded px-3 py-1.5 transition-colors"
                  title="Export as PDF"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button
                  onClick={() => exportJson()}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-violet-300 hover:text-violet-200 border border-violet-500/30 hover:border-violet-500/60 rounded px-3 py-1.5 transition-colors"
                  title="Export as JSON"
                >
                  <FileJson className="w-3 h-3" /> JSON
                </button>
                <button onClick={() => setShowGraphReport(false)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="shrink-0 px-5 py-2 border-b border-border/20 flex items-center gap-4 text-[10px] font-mono text-muted-foreground/70">
              <span>Min flow: <span className="text-yellow-400/80">{graphMinAmount} {chainUp}</span></span>
              <span>·</span>
              <span>{enrichedConnections?.edges.filter(e => parseFloat(e.totalValue || "0") >= graphMinAmount).length ?? 0} significant flows</span>
              <span>·</span>
              <span>{commRef.current.size} commingling hub{commRef.current.size !== 1 ? "s" : ""}</span>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono text-foreground/90 leading-relaxed whitespace-pre">{graphReportText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
