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
import { Lightbulb, Loader2, Send, ChevronRight, ChevronLeft } from "lucide-react";

const THERAPY_AREAS = [
  "Oncology", "Neurology", "Immunology", "Cardiology", "Rare Disease",
  "Infectious Disease", "Metabolic", "Ophthalmology", "Dermatology", "Respiratory", "Other",
];

const MODALITIES = [
  "Small Molecule", "Biologic", "Gene Therapy", "Cell Therapy", "mRNA",
  "Antibody", "ADC", "PROTAC", "Diagnostic", "Device", "Digital", "Other",
];

const STAGES = ["idea", "literature_review", "preliminary_data", "proof_of_concept"];
const STAGE_LABELS: Record<string, string> = {
  idea: "Idea / Hypothesis",
  literature_review: "Literature Review",
  preliminary_data: "Preliminary Data",
  proof_of_concept: "Proof of Concept",
};

const SEEKING_OPTIONS = [
  { id: "collaborating", label: "Research Collaborator" },
  { id: "funding", label: "Funding / Investment" },
  { id: "advising", label: "Scientific Advisor" },
  { id: "industry", label: "Industry Partner" },
];

export default function SubmitConcept() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // Step 1 — concept core
  const [title, setTitle] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterAffiliation, setSubmitterAffiliation] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [therapyArea, setTherapyArea] = useState("");
  const [modality, setModality] = useState("Other");
  const [stage, setStage] = useState("idea");

  // Step 2 — science
  const [hypothesis, setHypothesis] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [proposedApproach, setProposedApproach] = useState("");

  // Step 3 — collaboration needs
  const [requiredExpertise, setRequiredExpertise] = useState("");
  const [seeking, setSeeking] = useState<string[]>([]);

  function toggleSeeking(id: string) {
    setSeeking((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function step1Valid() {
    return title && submitterName && oneLiner && therapyArea;
  }
  function step2Valid() {
    return problemStatement && proposedApproach;
  }

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
          submitterAffiliation: submitterAffiliation || null,
          oneLiner,
          hypothesis: hypothesis || null,
          problemStatement,
          proposedApproach,
          requiredExpertise: requiredExpertise || null,
          seeking: seeking.length > 0 ? seeking : null,
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

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
              step === s
                ? "border-amber-500 bg-amber-500 text-white"
                : step > s
                  ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-border text-muted-foreground"
            }`}>
              {s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 w-8 ${step > s ? "bg-amber-500" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          {step === 1 ? "Concept Overview" : step === 2 ? "Scientific Detail" : "Collaboration Needs"}
        </span>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Concept Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              placeholder="e.g. Novel KRAS G12C degrader for pancreatic cancer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-concept-title"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="submitterName">Your Name <span className="text-red-500">*</span></Label>
              <Input
                id="submitterName"
                placeholder="Dr. Jane Smith"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                data-testid="input-submitter-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="affiliation">Affiliation</Label>
              <Input
                id="affiliation"
                placeholder="University / Company"
                value={submitterAffiliation}
                onChange={(e) => setSubmitterAffiliation(e.target.value)}
                data-testid="input-submitter-affiliation"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oneLiner">One-Liner Summary <span className="text-red-500">*</span></Label>
            <Input
              id="oneLiner"
              placeholder="A brief elevator pitch (1-2 sentences)"
              value={oneLiner}
              onChange={(e) => setOneLiner(e.target.value)}
              data-testid="input-one-liner"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Therapy Area <span className="text-red-500">*</span></Label>
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

          <div className="pt-2 flex justify-end">
            <Button
              type="button"
              className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
              disabled={!step1Valid()}
              onClick={() => setStep(2)}
              data-testid="button-step1-next"
            >
              Next: Scientific Detail
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="hypothesis">Hypothesis</Label>
            <Textarea
              id="hypothesis"
              placeholder="What is your central scientific hypothesis?"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              rows={2}
              data-testid="input-hypothesis"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="problem">Problem Statement <span className="text-red-500">*</span></Label>
            <Textarea
              id="problem"
              placeholder="What unmet need or gap does this concept address?"
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              rows={3}
              data-testid="input-problem-statement"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approach">Proposed Approach <span className="text-red-500">*</span></Label>
            <Textarea
              id="approach"
              placeholder="How would you tackle this problem? What's the mechanism or strategy?"
              value={proposedApproach}
              onChange={(e) => setProposedApproach(e.target.value)}
              rows={3}
              data-testid="input-proposed-approach"
            />
          </div>

          <div className="pt-2 flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} data-testid="button-step2-back">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button
              type="button"
              className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
              disabled={!step2Valid()}
              onClick={() => setStep(3)}
              data-testid="button-step2-next"
            >
              Next: Collaboration Needs
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="expertise">Required Expertise</Label>
            <Textarea
              id="expertise"
              placeholder="What skills, disciplines, or resources would help develop this concept?"
              value={requiredExpertise}
              onChange={(e) => setRequiredExpertise(e.target.value)}
              rows={3}
              data-testid="input-required-expertise"
            />
          </div>

          <div className="space-y-2">
            <Label>Seeking</Label>
            <div className="grid grid-cols-2 gap-2">
              {SEEKING_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSeeking(id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium text-left transition-colors ${
                    seeking.includes(id)
                      ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-border text-muted-foreground hover:border-amber-500/50"
                  }`}
                  data-testid={`toggle-seeking-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} data-testid="button-step3-back">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button
              type="button"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => mutation.mutate()}
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
        </div>
      )}
    </div>
  );
}
