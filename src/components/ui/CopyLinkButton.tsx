import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { broadcastError } from "@/lib/api";
import { cn } from "@/lib/cn";

interface CopyLinkButtonProps {
  url: string;
  /** Accessible label, e.g. "Copy link to this feature". */
  label: string;
  /** Icon size in px. Match the neighboring icons at the call site. */
  size?: number;
  className?: string;
}

/** Icon button that copies a shareable URL and flashes a check for feedback. */
export function CopyLinkButton({ url, label, size = 14, className }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleCopy(e: React.MouseEvent) {
    // Rendered inside clickable rows and <Link> wrappers — copying must not
    // also navigate.
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      broadcastError("Couldn't copy the link to your clipboard.");
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={label}
      title={copied ? "Copied" : label}
      className={cn("shrink-0 text-stone-400 hover:text-accent cursor-pointer transition-colors", className)}
    >
      {copied ? (
        <Check size={size} className="text-emerald-500" aria-hidden="true" />
      ) : (
        <Link2 size={size} aria-hidden="true" />
      )}
    </button>
  );
}
