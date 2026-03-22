import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X, CheckCircle2, FlaskConical, ArrowRight, ArrowLeft } from "lucide-react";
import { getResearcherProfile, saveResearcherProfile } from "@/hooks/use-researcher";

const CAREER_STAGES = [
  "PhD Student",
  "Postdoc",
  "Principal Investigator",
  "Research Director",
  "Lab Manager",
  "Industry Scientist",
];

const INSTITUTION_TYPES = [
  "Academic / University",
  "Hospital / Medical Center",
  "Biotech / Pharma",
  "Government / National Lab",
  "Non-profit / Foundation",
];

const AREA_SUGGESTIONS = [
  "Oncology",
  "Immunology",
  "Neuroscience",
  "Cardiology",
  "Infectious Disease",
  "Gene Therapy",
  "CRISPR",
  "Drug Delivery",
  "Metabolic Disease",
  "Rare Disease",
];

const TOPIC_SUGGESTIONS = [
  "CAR-T manufacturing",
  "mRNA vaccine",
  "CRISPR base editing",
  "Antibody engineering",
  "Tumor microenvironment",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ResearcherOnboarding({ open, onClose }: Props) {
  const saved = getResearcherProfile();
  const [step, setStep] = useState(1);

  const [name, setName] = useState(saved.name || "");
  const [institution, setInstitution] = useState(saved.institution || "");
  const [careerStage, setCareerStage] = useState(saved.careerStage || "");
  const [institutionType, setInstitutionType] = useState(saved.institutionType || "");

  const [researchAreas, setResearchAreas] = useState<string[]>(saved.researchAreas ?? []);
  const [areaInput, setAreaInput] = useState("");

  const [alertTopics, setAlertTopics] = useState<string[]>(saved.alertTopics ?? []);
  const [topicInput, setTopicInput] = useState("");
  const [orcidId, setOrcidId] = useState(saved.orcidId || "");

  function addArea(val?: string) {
    const t = (val ?? areaInput).trim();
    if (t && !researchAreas.includes(t) && researchAreas.length < 8) {
      setResearchAreas((prev) => [...prev, t]);
      if (!val) setAreaInput("");
    }
  }

  function removeArea(a: string) {
    setResearchAreas((prev) => prev.filter((x) => x !== a));
  }

  function addTopic(val?: string) {
    const t = (val ?? topicInput).trim();
    if (t && !alertTopics.includes(t) && alertTopics.length < 10) {
      setAlertTopics((prev) => [...prev, t]);
      if (!val) setTopicInput("");
    }
  }

  function removeTopic(t: string) {
    setAlertTopics((prev) => prev.filter((x) => x !== t));
  }

  function handleSave() {
    saveResearcherProfile({
      name,
      institution,
      careerStage,
      institutionType,
      researchAreas,
      alertTopics,
      orcidId,
      onboardingDone: true,
    } as any);
    onClose();
  }

  function handleSkip() {
    saveResearcherProfile({ onboardingDone: true } as any);
    onClose();
  }

  const canProceedStep1 = name.trim().length > 0 || institution.trim().length > 0;
  const canProceedStep2 = researchAreas.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-violet-500" />
            </div>
            <DialogTitle className="text-base">Welcome to EdenLab</DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            {step === 1 && "Tell us about yourself so we can personalize your research experience."}
            {step === 2 && "What areas are you working in? This powers your Grants Spotlight and Alerts."}
            {step === 3 && "Set up keywords to watch and optionally link your ORCID profile."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5 pt-1 pb-3">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                s <= step ? "bg-violet-500" : "bg-border"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-name">Your Name</Label>
              <Input
                id="onboarding-name"
                placeholder="e.g., Dr. Sarah Chen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-onboarding-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-institution">Institution</Label>
              <Input
                id="onboarding-institution"
                placeholder="e.g., MIT, Stanford, UCSF"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                data-testid="input-onboarding-institution"
              />
            </div>
            <div className="space-y-2">
              <Label>Career Stage</Label>
              <div className="flex flex-wrap gap-2">
                {CAREER_STAGES.map((s) => {
                  const active = careerStage === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCareerStage(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        active
                          ? "border-violet-500 bg-violet-500/15 text-violet-600 dark:text-violet-400 font-medium"
                          : "border-card-border text-muted-foreground hover:border-violet-500/40"
                      }`}
                      data-testid={`toggle-onboarding-career-${s.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Research Areas <span className="text-muted-foreground font-normal">(up to 8)</span></Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Oncology, CRISPR, Neuroscience"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addArea(); }
                  }}
                  data-testid="input-onboarding-research-area"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => addArea()}
                  data-testid="button-onboarding-add-area"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AREA_SUGGESTIONS.filter((a) => !researchAreas.includes(a)).slice(0, 6).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => addArea(a)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-violet-500/40 text-muted-foreground hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 transition-all"
                    data-testid={`suggestion-area-${a}`}
                  >
                    + {a}
                  </button>
                ))}
              </div>
              {researchAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {researchAreas.map((a) => (
                    <Badge
                      key={a}
                      variant="secondary"
                      className="gap-1.5 pr-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
                      data-testid={`badge-onboarding-area-${a}`}
                    >
                      {a}
                      <button
                        type="button"
                        onClick={() => removeArea(a)}
                        className="hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Institution Type</Label>
              <div className="flex flex-wrap gap-2">
                {INSTITUTION_TYPES.map((t) => {
                  const active = institutionType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setInstitutionType(t)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        active
                          ? "border-violet-500 bg-violet-500/15 text-violet-600 dark:text-violet-400 font-medium"
                          : "border-card-border text-muted-foreground hover:border-violet-500/40"
                      }`}
                      data-testid={`toggle-onboarding-type-${t.replace(/[\s/]+/g, "-").toLowerCase()}`}
                    >
                      {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Alert Keywords <span className="text-muted-foreground font-normal">(up to 10)</span></Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Specific terms to monitor — try your target protein, a modality, or a disease subtype.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., CRISPR base editing, CAR-T"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addTopic(); }
                  }}
                  data-testid="input-onboarding-alert-topic"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => addTopic()}
                  data-testid="button-onboarding-add-topic"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TOPIC_SUGGESTIONS.filter((t) => !alertTopics.includes(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTopic(t)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-amber-500/40 text-muted-foreground hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-all"
                    data-testid={`suggestion-topic-${t}`}
                  >
                    + {t}
                  </button>
                ))}
              </div>
              {alertTopics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {alertTopics.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="gap-1.5 pr-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                      data-testid={`badge-onboarding-topic-${t}`}
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTopic(t)}
                        className="hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-orcid">
                ORCID ID{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="onboarding-orcid"
                placeholder="0000-0000-0000-0000"
                value={orcidId}
                onChange={(e) => setOrcidId(e.target.value)}
                data-testid="input-onboarding-orcid"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-3">
          {step > 1 && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setStep((s) => s - 1)}
              data-testid="button-onboarding-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          {step < 3 ? (
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 2 && !canProceedStep2}
              data-testid="button-onboarding-next"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleSave}
              data-testid="button-onboarding-save"
            >
              Start using EdenLab
            </Button>
          )}
          {step === 1 && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
              data-testid="button-onboarding-skip"
            >
              Skip
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
