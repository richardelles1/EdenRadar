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
import {
  Lightbulb, Loader2, Send, ChevronRight, ChevronLeft,
  Paperclip, X, FileText, Plus, Tag,
} from "lucide-react";

const THERAPY_AREAS = [
  "Oncology", "Neurology", "Immunology", "Cardiology", "Rare Disease",
  "Infectious Disease", "Metabolic", "Ophthalmology", "Dermatology", "Respiratory", "Other",
];

const MODALITIES = [
  "Small Molecule", "Biologic", "Gene Therapy", "Cell Therapy", "mRNA",
  "Antibody", "ADC", "PROTAC", "Diagnostic", "Medical Device", "Digital", "Other",
];

const STAGE_OPTIONS = [
  { value: 1, label: "Hypothesis — idea only, no data" },
  { value: 2, label: "Lit Review — surveying the field" },
  { value: 3, label: "Preliminary Data — early signals" },
  { value: 4, label: "Proof of Concept — data in hand" },
];

const SEEKING_OPTIONS = [
  { id: "collaborating", label: "Research Collaborator" },
  { id: "funding", label: "Funding / Investment" },
  { id: "advising", label: "Scientific Advisor" },
  { id: "industry", label: "Industry Partner" },
];

const MECHANISM_SUGGESTIONS = [
  "oncogenic transcription", "protein aggregation", "kinase inhibition", "receptor agonism",
  "receptor antagonism", "CRISPR gene editing", "RNA splicing", "epigenetic regulation",
  "metabolic reprogramming", "neurodegeneration", "immune checkpoint", "angiogenesis",
  "cell senescence", "autophagy", "apoptosis", "proteolysis targeting",
];

export default function SubmitConcept() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // Step 1
  const [title, setTitle] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterAffiliation, setSubmitterAffiliation] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [therapeuticArea, setTherapeuticArea] = useState("");
  const [modality, setModality] = useState("Other");
  const [stage, setStage] = useState(1);

  // Step 2
  const [hypothesis, setHypothesis] = useState("");
  const [problem, setProblem] = useState("");
  const [proposedApproach, setProposedApproach] = useState("");
  const [openQuestions, setOpenQuestions] = useState<string[]>([""]);
  const [mechanismTags, setMechanismTags] = useState<string[]>([]);
  const [mechanismInput, setMechanismInput] = useState("");

  // Step 3
  const [requiredExpertise, setRequiredExpertise] = useState("");
  const [seeking, setSeeking] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  function toggleSeeking(id: string) {
    setSeeking((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  function addMechanismTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (t && !mechanismTags.includes(t)) setMechanismTags((prev) => [...prev, t]);
  }

  function removeMechanismTag(tag: string) {
    setMechanismTags((prev) => prev.filter((t) => t !== tag));
  }

  function addOpenQuestion() {
    setOpenQuestions((prev) => [...prev, ""]);
  }

  function setOpenQuestion(i: number, val: string) {
    setOpenQuestions((prev) => prev.map((q, idx) => idx === i ? val : q));
  }

  function removeOpenQuestion(i: number) {
    setOpenQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function step1Valid() { return title && submitterName && oneLiner && therapeuticArea; }
  function step2Valid() { return problem && proposedApproach; }

  async function uploadFiles(): Promise<{ name: string; url: string; size: number }[]> {
    if (files.length === 0) return [];
    setUploading(true);
    const session = (await supabase.auth.getSession()).data.session;
    const userId = session?.user?.id ?? "anon";
    const results: { name: string; url: string; size: number }[] = [];
    const failed: string[] = [];
    for (const file of files) {
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("concept-files").upload(path, file);
      if (error) { failed.push(file.name); continue; }
      const { data: urlData } = supabase.storage.from("concept-files").getPublicUrl(path);
      results.push({ name: file.name, url: urlData.publicUrl, size: file.size });
    }
    setUploading(false);
    if (failed.length > 0) {
      toast({ title: `${failed.length} file(s) failed to upload`, description: `Could not upload: ${failed.join(", ")}.`, variant: "destructive" });
    }
    return results;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedFiles = await uploadFiles();
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const filledQuestions = openQuestions.filter((q) => q.trim());
      const res = await fetch("/api/discovery/concepts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title, submitterName,
          submitterAffiliation: submitterAffiliation || null,
          oneLiner,
          hypothesis: hypothesis || null,
          problem, proposedApproach,
          requiredExpertise: requiredExpertise || null,
          seeking: seeking.length > 0 ? seeking : null,
          therapeuticArea, modality, stage,
          status: "active",
          openQuestions: filledQuestions.length > 0 ? filledQuestions : null,
          mechanismTags: mechanismTags.length > 0 ? mechanismTags : null,
          attachedFiles: uploadedFiles,
        }),
      });
      if (!res.ok) { const body = await res.text(); throw new Error(body || "Submission failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/concepts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/my-concepts"] });
      toast({ title: "Concept posted!", description: "AI credibility scoring complete. Your idea is now live on EdenDiscovery." });
      navigate(`/discovery/concept/${data.concept.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  const stepLabels = ["Concept Overview", "Scientific Detail", "Collaboration & Submit"];

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-submit-title">
            Post a Concept
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">
          Share your pre-research idea to attract collaborators before you begin. AI evaluates scientific credibility.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
              step === s ? "border-amber-500 bg-amber-500 text-white"
                : step > s ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-border text-muted-foreground"
            }`}>{s}</div>
            {s < 3 && <div className={`flex-1 h-0.5 w-8 ${step > s ? "bg-amber-500" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">{stepLabels[step - 1]}</span>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Concept Title <span className="text-red-500">*</span></Label>
            <Input
              id="title" placeholder="e.g. Novel KRAS G12C degrader for pancreatic cancer"
              value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-concept-title"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="submitterName">Your Name <span className="text-red-500">*</span></Label>
              <Input id="submitterName" placeholder="Dr. Jane Smith" value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} data-testid="input-submitter-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="affiliation">Affiliation</Label>
              <Input id="affiliation" placeholder="University / Company" value={submitterAffiliation} onChange={(e) => setSubmitterAffiliation(e.target.value)} data-testid="input-submitter-affiliation" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oneLiner">
              Hook — one line that makes someone stop scrolling <span className="text-red-500">*</span>
            </Label>
            <Input
              id="oneLiner" placeholder="e.g. A degrader that eliminates mutant KRAS G12C without touching wild-type"
              value={oneLiner} onChange={(e) => setOneLiner(e.target.value.slice(0, 160))}
              data-testid="input-one-liner"
            />
            <p className="text-[10px] text-muted-foreground text-right">{oneLiner.length}/160</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Therapy Area <span className="text-red-500">*</span></Label>
              <Select value={therapeuticArea} onValueChange={setTherapeuticArea}>
                <SelectTrigger data-testid="select-therapy-area"><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>
                  {THERAPY_AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modality</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger data-testid="select-modality"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODALITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stage Signal</Label>
              <Select value={String(stage)} onValueChange={(v) => setStage(parseInt(v))}>
                <SelectTrigger data-testid="select-stage"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={String(value)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="button" className="bg-amber-500 hover:bg-amber-600 text-white gap-2" disabled={!step1Valid()} onClick={() => setStep(2)} data-testid="button-step1-next">
              Next: Scientific Detail <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="problem">Problem Statement <span className="text-red-500">*</span></Label>
            <Textarea id="problem" placeholder="What unmet need or gap does this concept address?" value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} data-testid="input-problem-statement" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approach">Proposed Approach <span className="text-red-500">*</span></Label>
            <Textarea id="approach" placeholder="How would you tackle this? What's the mechanism or strategy?" value={proposedApproach} onChange={(e) => setProposedApproach(e.target.value)} rows={3} data-testid="input-proposed-approach" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hypothesis">Hypothesis</Label>
            <Textarea id="hypothesis" placeholder="What is your central scientific hypothesis?" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={2} data-testid="input-hypothesis" />
          </div>

          <div className="space-y-2">
            <Label>Open Questions</Label>
            <p className="text-xs text-muted-foreground">What do you not yet know? Honesty attracts the right collaborators.</p>
            <div className="space-y-2">
              {openQuestions.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`e.g. Does the degrader maintain selectivity in vivo?`}
                    value={q}
                    onChange={(e) => setOpenQuestion(i, e.target.value)}
                    data-testid={`input-open-question-${i}`}
                  />
                  {openQuestions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="w-8 h-8 shrink-0 text-muted-foreground" onClick={() => removeOpenQuestion(i)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {openQuestions.length < 5 && (
                <Button type="button" variant="outline" size="sm" className="text-xs gap-1.5" onClick={addOpenQuestion} data-testid="button-add-open-question">
                  <Plus className="w-3 h-3" /> Add question
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mechanism / Biology Tags</Label>
            <p className="text-xs text-muted-foreground">Tag the biological mechanisms at play. These power filtering on EdenDiscovery.</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {mechanismTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                  <button type="button" onClick={() => removeMechanismTag(tag)} className="hover:text-red-500 ml-0.5" data-testid={`button-remove-tag-${tag}`}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. kinase inhibition"
                value={mechanismInput}
                onChange={(e) => setMechanismInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addMechanismTag(mechanismInput); setMechanismInput(""); }
                }}
                data-testid="input-mechanism-tag"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => { addMechanismTag(mechanismInput); setMechanismInput(""); }} disabled={!mechanismInput.trim()} data-testid="button-add-mechanism-tag">
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {MECHANISM_SUGGESTIONS.filter((s) => !mechanismTags.includes(s)).slice(0, 8).map((s) => (
                <button
                  key={s} type="button"
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-violet-500/40 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                  onClick={() => addMechanismTag(s)} data-testid={`button-suggest-tag-${s}`}
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} data-testid="button-step2-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button type="button" className="bg-amber-500 hover:bg-amber-600 text-white gap-2" disabled={!step2Valid()} onClick={() => setStep(3)} data-testid="button-step2-next">
              Next: Collaboration <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="expertise">Required Expertise</Label>
            <Textarea id="expertise" placeholder="What skills, disciplines, or resources would help develop this?" value={requiredExpertise} onChange={(e) => setRequiredExpertise(e.target.value)} rows={2} data-testid="input-required-expertise" />
          </div>

          <div className="space-y-2">
            <Label>What are you seeking?</Label>
            <div className="grid grid-cols-2 gap-2">
              {SEEKING_OPTIONS.map(({ id, label }) => (
                <button
                  key={id} type="button" onClick={() => toggleSeeking(id)}
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

          <div className="space-y-2">
            <Label>Supporting Documents</Label>
            <p className="text-xs text-muted-foreground">Optional: Upload data, slides, or references. Max 5 files, 10 MB each.</p>
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground" data-testid={`button-remove-file-${i}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {files.length < 5 && (
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer transition-colors" data-testid="button-add-file">
                  <Paperclip className="w-4 h-4" />
                  Add file
                  <input type="file" className="hidden" multiple onChange={(e) => {
                    const selected = Array.from(e.target.files ?? []);
                    const toAdd = selected.slice(0, 5 - files.length);
                    const oversized = toAdd.filter(f => f.size > 10 * 1024 * 1024);
                    if (oversized.length > 0) toast({ title: "File too large", description: `${oversized.map(f => f.name).join(", ")} exceed 10 MB.`, variant: "destructive" });
                    const valid = toAdd.filter(f => f.size <= 10 * 1024 * 1024);
                    if (valid.length > 0) setFiles(prev => [...prev, ...valid]);
                    e.target.value = "";
                  }} />
                </label>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">IP Provenance</p>
            <p>Submitting records a timestamp and content hash as a provenance marker. This is not a patent or legal filing.</p>
          </div>

          <div className="pt-2 flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} data-testid="button-step3-back">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              type="button" className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => mutation.mutate()} disabled={mutation.isPending || uploading}
              data-testid="button-submit-concept"
            >
              {mutation.isPending || uploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploading ? "Uploading..." : "AI scoring..."}</>
              ) : (
                <><Send className="w-4 h-4 mr-2" />Post to EdenDiscovery</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
