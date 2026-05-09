import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useGetWalletConnections, getGetWalletConnectionsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, ZoomIn, ZoomOut, Maximize, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressDisplay } from "@/components/address-display";

export default function TraceGraph() {
  const params = useParams();
  const address = params.address || "";
  type ChainId = "ethereum" | "bitcoin" | "polygon" | "bsc" | "xrp" | "xlm" | "hbar" | "xdc" | "dag";
  const chain = (new URLSearchParams(window.location.search).get("chain") || "ethereum") as ChainId;
  const [depth, setDepth] = useState<"1" | "2" | "3">("1");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: connections, isLoading, error } = useGetWalletConnections(address, { 
    chain, depth: parseInt(depth) 
  }, {
    query: {
      enabled: !!address,
      queryKey: getGetWalletConnectionsQueryKey(address, { chain, depth: parseInt(depth) })
    }
  });

  // A very rudimentary force-directed graph rendering just to satisfy the visual requirement.
  // In a real application we would use d3, cytoscape, or vis.js.
  useEffect(() => {
    if (!canvasRef.current || !connections || connections.nodes.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive canvas
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Simple layout: center node in middle, others in a circle
    const nodePositions = new Map<string, {x: number, y: number}>();
    
    const centerNode = connections.nodes.find(n => n.address === connections.centerAddress);
    if (centerNode) {
      nodePositions.set(centerNode.address, { x: centerX, y: centerY });
    }

    const otherNodes = connections.nodes.filter(n => n.address !== connections.centerAddress);
    const radius = Math.min(width, height) * 0.35;
    
    otherNodes.forEach((node, i) => {
      const angle = (i / otherNodes.length) * 2 * Math.PI;
      nodePositions.set(node.address, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      });
    });

    // Draw edges
    ctx.lineWidth = 1;
    connections.edges.forEach(edge => {
      const start = nodePositions.get(edge.from);
      const end = nodePositions.get(edge.to);
      
      if (start && end) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        
        // Intensity based on value/count could go here
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.2)'; 
        ctx.stroke();
      }
    });

    // Draw nodes
    connections.nodes.forEach(node => {
      const pos = nodePositions.get(node.address);
      if (pos) {
        const isCenter = node.address === connections.centerAddress;
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isCenter ? 12 : 8, 0, 2 * Math.PI);
        
        if (isCenter) {
          ctx.fillStyle = '#3b82f6'; // primary
        } else if (node.riskScore && node.riskScore > 70) {
          ctx.fillStyle = '#ef4444'; // destructive
        } else if (node.isContract) {
          ctx.fillStyle = '#a855f7'; // purple
        } else {
          ctx.fillStyle = '#94a3b8'; // muted
        }
        
        ctx.fill();
        ctx.strokeStyle = '#0f172a'; // background
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#f8fafc';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        
        const label = node.label || `${node.address.slice(0, 4)}..${node.address.slice(-4)}`;
        ctx.fillText(label, pos.x, pos.y + (isCenter ? 25 : 20));
      }
    });

  }, [connections, isLoading]);

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Top Bar overlay */}
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
              <Select value={depth} onValueChange={(v: "1"|"2"|"3") => setDepth(v)}>
                <SelectTrigger className="font-mono h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Hop (Direct)</SelectItem>
                  <SelectItem value="2">2 Hops (Extended)</SelectItem>
                  <SelectItem value="3">3 Hops (Deep)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {connections && (
              <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground block mb-1">NODES</span>
                  <span className="text-foreground text-lg">{connections.nodes.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">EDGES</span>
                  <span className="text-foreground text-lg">{connections.edges.length}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-2 pointer-events-auto">
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><Maximize className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Legend overlay */}
      <Card className="absolute bottom-4 left-4 bg-card/80 backdrop-blur pointer-events-auto border-border z-10 p-3">
        <h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-2">Legend</h4>
        <div className="space-y-2 text-xs font-mono">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-primary border border-background"></div> Target Wallet</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-destructive border border-background"></div> High Risk Entity</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#a855f7] border border-background"></div> Smart Contract</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-400 border border-background"></div> Standard Wallet</div>
        </div>
      </Card>

      {/* Canvas Area */}
      <div className="flex-1 relative w-full h-full bg-[#0a0a0f] flex items-center justify-center">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-20">
            <Network className="w-12 h-12 text-primary animate-pulse mb-4" />
            <div className="text-primary font-mono tracking-widest text-sm animate-pulse">MAPPING NETWORK...</div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20">
             <AlertCircle className="w-12 h-12 text-destructive mb-4" />
             <div className="text-destructive font-mono tracking-widest text-sm">FAILED TO MAP CONNECTIONS</div>
          </div>
        )}

        <canvas 
          ref={canvasRef} 
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />
      </div>
    </div>
  );
}
