import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddressDisplayProps {
  address: string;
  truncate?: boolean;
  className?: string;
  showIcon?: boolean;
}

export function AddressDisplay({ address, truncate = true, className, showIcon = true }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const displayAddress = truncate && address.length > 10
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className={cn("flex items-center gap-2 group cursor-pointer w-fit", className)}
      onClick={handleCopy}
      title={address}
    >
      <span className="font-mono">{displayAddress}</span>
      {showIcon && (
        <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
        </span>
      )}
    </div>
  );
}
