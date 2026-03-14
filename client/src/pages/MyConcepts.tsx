import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { ConceptCard, ConceptInterest } from "@shared/schema";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Lightbulb, TrendingUp, Clock, Sparkles, PlusCircle, Loader2,
  Users, DollarSign, GraduationCap, ChevronDown, ChevronUp, Mail, Trash2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const INTEREST_TYPE_META: Record<string, { label: string; icon: typeof Users; color: string }> = {
  collaborating: { label: "Collaborate", icon: Users, color: "text-violet-600 dark:text-violet-400" },
  funding: { label: "Fund", icon: DollarSign, color: "text-green-600 dark:text-green-400" },
  advising: { label: "Advise", icon: GraduationCap, color: "text-amber-600 dark:text-amber-400" },
};

function InterestInbox({ conceptId }: { conceptId: number }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<{ interests: ConceptInterest[] }>({
    queryKey: ["/api/discovery/concepts", conceptId, "interests"],
    queryFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`/api/discovery/concepts/${conceptId}/interests`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) return { interests: [] };
      return res.json();
    },
    enabled: expanded,
    staleTime: Infinity,
  });

  const interests = data?.interests ?? [];

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
        data-testid={`button-expand-interests-${conceptId}`}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Hide" : "View"} interested parties
      </button>

      {expanded && (
        <div className="mt-2 space-y-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {isLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : interests.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No interested parties yet.</p>
          ) : (
            interests.map((interest) => {
              const meta = INTEREST_TYPE_META[interest.type];
              const Icon = meta?.icon ?? Users;
              return (
                <div
                  key={interest.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/40"
                  data-testid={`interest-item-${interest.id}`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${meta?.color ?? "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {interest.userName || interest.userEmail || "Anonymous"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {meta?.label ?? interest.type} · {new Date(interest.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {interest.userEmail && (
                    <a
                      href={`mailto:${interest.userEmail}`}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`link-interest-email-${interest.id}`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function MyConcepts() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/discovery/my-concepts"],
    queryFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/discovery/my-concepts", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to load concepts");
      return res.json();
    },
    staleTime: Infinity,
  });

  const deleteMutation = useMutation({
    mutationFn: async (conceptId: number) => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`/api/discovery/concepts/${conceptId}`, {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/my-concepts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/concepts"] });
      toast({ title: "Concept deleted", description: "Your concept has been permanently removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const myConcepts = data?.concepts ?? [];

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-my-concepts-title">
              My Concepts
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Concepts you've submitted to Eden Discovery.
          </p>
        </div>
        <Link href="/discovery/submit">
          <Button className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5" data-testid="button-new-concept">
            <PlusCircle className="w-4 h-4" />
            New Concept
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      ) : myConcepts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Lightbulb className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No concepts submitted yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Submit your first pre-research concept to get AI credibility scoring.
          </p>
          <Link href="/discovery/submit">
            <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-first-concept">
              Submit Your First Concept
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {myConcepts.map((c) => {
            const totalInterest = (c.interestCollaborating ?? 0) + (c.interestFunding ?? 0) + (c.interestAdvising ?? 0);
            return (
              <div key={c.id} data-testid={`card-my-concept-${c.id}`}>
                <div className="group p-5 rounded-xl border border-border bg-card hover:border-amber-500/40 hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <Link href={`/discovery/concept/${c.id}`}>
                      <h3 className="font-semibold text-foreground text-base group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors cursor-pointer">
                        {c.title}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.credibilityScore !== null && (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          c.credibilityScore >= 70
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : c.credibilityScore >= 40
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          <Sparkles className="w-3 h-3" />
                          {c.credibilityScore}/100
                        </span>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                            data-testid={`button-delete-concept-${c.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5 text-red-500" />
                              Delete Concept
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete <span className="font-medium text-foreground">"{c.title}"</span> and all associated interest records. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => deleteMutation.mutate(c.id)}
                              disabled={deleteMutation.isPending}
                              data-testid="button-confirm-delete"
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                              ) : (
                                <Trash2 className="w-4 h-4 mr-1" />
                              )}
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <Link href={`/discovery/concept/${c.id}`}>
                    <p className="text-sm text-muted-foreground line-clamp-1 mb-3 cursor-pointer">{c.oneLiner}</p>
                  </Link>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                      {c.therapeuticArea}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3 text-violet-500" />
                      {c.interestCollaborating ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-green-500" />
                      {c.interestFunding ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="w-3 h-3 text-amber-500" />
                      {c.interestAdvising ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1 ml-auto">
                      <TrendingUp className="w-3 h-3" />
                      {totalInterest} total
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {totalInterest > 0 && <InterestInbox conceptId={c.id} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
