import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Cloud, ChevronDown, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";

// Helpers exported for callers that want to upload the current page as a self-contained
// HTML file (a pragmatic fallback when no server-side PDF generator is wired up). Users
// can open the resulting .html in a browser and "Save as PDF" if they need a PDF.
export function captureCurrentPageAsHtml(): string {
  const baseHref = window.location.origin + "/";
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  // Remove any export menu / print-only no-print toolbars from the snapshot
  clone.querySelectorAll(".no-print,[data-export-control]").forEach((el) => el.remove());
  // Prepend <base> so relative URLs to /assets/* resolve against the live app
  const baseTag = `<base href="${baseHref}">`;
  const html = `<!doctype html><html>${clone.outerHTML.replace(/^<html[^>]*>/i, "")}`;
  return html.replace(/<head>/i, `<head>${baseTag}`);
}

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
}

interface ExportStatus {
  onedrive: boolean;
  googledrive: boolean;
}

interface ExportMenuProps {
  getContent: () => Promise<{ content: string; filename: string; fileType: string }>;
  label?: string;
  className?: string;
}

export function ExportMenu({ getContent, label = "Export", className = "" }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: status } = useQuery<ExportStatus>({
    queryKey: ["/api/export/status"],
  });

  const exportMutation = useMutation({
    mutationFn: async (destination: "onedrive" | "googledrive") => {
      const { content, filename, fileType } = await getContent();
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/export/${destination}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ filename, fileType, content }),
      });
      if (!res.ok) {
        let message = `Export failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {}
        if (res.status === 401) {
          message = "Sign in to save documents to your cloud drive.";
        }
        throw new Error(message);
      }
      return { ...(await res.json()), destination };
    },
    onSuccess: (data) => {
      const label = data.destination === "onedrive" ? "OneDrive" : "Google Drive";
      const url = data.url ?? data.webUrl ?? data.editUrl;
      toast({
        title: `Saved to ${label}`,
        description: url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline text-primary"
          >
            Open in {label} <ExternalLink className="h-3 w-3" />
          </a>
        ) : `File uploaded to your ${label} EdenRadar folder.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Export failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleExport = async (destination: "onedrive" | "googledrive") => {
    setOpen(false);
    exportMutation.mutate(destination);
  };

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen((v) => !v)}
        disabled={exportMutation.isPending}
        data-testid="button-export-menu"
      >
        {exportMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Cloud className="h-4 w-4" />
        )}
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-lg overflow-hidden" data-testid="dropdown-export-menu">
            <div className="p-1">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-muted transition-colors text-left"
                onClick={() => handleExport("onedrive")}
                disabled={exportMutation.isPending}
                data-testid="button-export-onedrive"
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                    <path d="M6.5 20C4.01 20 2 17.99 2 15.5c0-2.08 1.44-3.84 3.38-4.34A7 7 0 0 1 12 5a7 7 0 0 1 6.46 4.31A5.5 5.5 0 0 1 22 14.5c0 3.04-2.46 5.5-5.5 5.5H6.5z" stroke="#0078D4" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </span>
                <span className="flex-1">
                  <span className="font-medium text-foreground">Save to OneDrive</span>
                  <span className="block text-xs text-muted-foreground">EdenRadar folder</span>
                </span>
                {status?.onedrive ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
              </button>

              <button
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors text-left ${
                  status?.googledrive
                    ? "hover:bg-muted"
                    : "opacity-50 cursor-not-allowed"
                }`}
                onClick={() => status?.googledrive && handleExport("googledrive")}
                disabled={!status?.googledrive || exportMutation.isPending}
                data-testid="button-export-googledrive"
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                    <path d="M8 3l4 7H4L8 3z" fill="#4285F4"/>
                    <path d="M12 10l4 7H8l4-7z" fill="#FBBC05"/>
                    <path d="M16 10l4 7h-8l4-7z" fill="#34A853"/>
                  </svg>
                </span>
                <span className="flex-1">
                  <span className="font-medium text-foreground">Save to Google Drive</span>
                  <span className="block text-xs text-muted-foreground">
                    {status?.googledrive ? "EdenRadar folder" : "Connect Google Drive"}
                  </span>
                </span>
                {!status?.googledrive && (
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                    Not connected
                  </span>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
