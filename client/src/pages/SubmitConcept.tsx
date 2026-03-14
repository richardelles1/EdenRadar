import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { Lightbulb, Loader2, Send } from "lucide-react";

const THERAPY_AREAS = [
  "Oncology",
  "Neurology",
  "Immunology",
  "Cardiology",
  "Rare Disease",
  "Infectious Disease",
  "Metabolic",
  "Ophthalmology",
  "Dermatology",
  "Respiratory",
  "Other",
];

const MODALITIES = [
  "Small Molecule",
  "Biologic",
  "Gene Therapy",
  "Cell Therapy",
  "mRNA",
  "Antibody",
  "ADC",
  "PROTAC",
  "Diagnostic",
  "Device",
  "Digital",
  "Other",
];

const STAGES = [
  "idea",
  "literature_review",
  "preliminary_data",
  "proof_of_concept",
];

const STAGE_LABELS: Record<string, string> = {
  idea: "Idea / Hypothesis",
  literature_review: "Literature Review",
  preliminary_data: "Preliminary Data",
  proof_of_concept: "Proof of Concept",
};

export default function SubmitConcept() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [proposedApproach, setProposedApproach] = useState("");
  const [therapyArea, setTherapyArea] = useState("");
  const [modality, setModality] = useState("Other");
  const [stage, setStage] = useState("idea");

  const mutation = useMutation({
    mutationFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/discovery/concepts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title,
          submitterName,
          oneLiner,
          problemStatement,
          proposedApproach,
          therapyArea,
          modality,
          stage,
          status: "active",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Submission failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/concepts"] });
      toast({ title: "Concept submitted!", description: "AI credibility scoring is complete." });
      navigate(`/discovery/concept/${data.concept.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !submitterName || !oneLiner || !problemStatement || !proposedApproach || !therapyArea) return;
    mutation.mutate();
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-submit-title">
            Submit a Concept
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">
          Describe your pre-research idea. AI will evaluate scientific credibility.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">Concept Title</Label>
          <Input
            id="title"
            placeholder="e.g. Novel KRAS G12C degrader for pancreatic cancer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            data-testid="input-concept-title"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="submitterName">Your Name</Label>
          <Input
            id="submitterName"
            placeholder="Dr. Jane Smith"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            required
            data-testid="input-submitter-name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="oneLiner">One-Liner Summary</Label>
          <Input
            id="oneLiner"
            placeholder="A brief elevator pitch (1-2 sentences)"
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
            required
            data-testid="input-one-liner"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="problem">Problem Statement</Label>
          <Textarea
            id="problem"
            placeholder="What unmet need or gap does this concept address?"
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            required
            rows={3}
            data-testid="input-problem-statement"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="approach">Proposed Approach</Label>
          <Textarea
            id="approach"
            placeholder="How would you tackle this problem? What's the mechanism or strategy?"
            value={proposedApproach}
            onChange={(e) => setProposedApproach(e.target.value)}
            required
            rows={3}
            data-testid="input-proposed-approach"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Therapy Area</Label>
            <Select value={therapyArea} onValueChange={setTherapyArea}>
              <SelectTrigger data-testid="select-therapy-area">
                <SelectValue placeholder="Select area" />
              </SelectTrigger>
              <SelectContent>
                {THERAPY_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modality</Label>
            <Select value={modality} onValueChange={setModality}>
              <SelectTrigger data-testid="select-modality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODALITIES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger data-testid="select-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            disabled={mutation.isPending}
            data-testid="button-submit-concept"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                AI is scoring...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Concept
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
