import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Plus, X, Camera, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { getResearcherProfile, saveResearcherProfile, getProfileCompleteness } from "@/hooks/use-researcher";
import { useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Required"),
  institution: z.string().min(1, "Required"),
  lab: z.string().optional(),
  careerStage: z.string().optional(),
  institutionType: z.string().optional(),
  orcidId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const CAREER_STAGES = [
  "Graduate Student",
  "Postdoctoral Fellow",
  "Assistant Professor",
  "Associate Professor",
  "Full Professor",
  "Research Scientist",
  "Principal Investigator",
  "Department Chair",
  "Emeritus",
];

const INSTITUTION_TYPES = [
  "Research University",
  "Medical School",
  "Teaching Hospital",
  "National Lab",
  "Government Agency",
  "Non-Profit Research Institute",
  "Industry R&D",
  "Other",
];

function TagInput({
  label,
  description,
  items,
  setItems,
  placeholder,
  testIdPrefix,
  badgeClass,
}: {
  label: string;
  description?: string;
  items: string[];
  setItems: (fn: (prev: string[]) => string[]) => void;
  placeholder: string;
  testIdPrefix: string;
  badgeClass?: string;
}) {
  const [value, setValue] = useState("");

  function add() {
    const trimmed = value.trim();
    if (trimmed && !items.includes(trimmed)) {
      setItems(prev => [...prev, trimmed]);
      setValue("");
    }
  }

  function remove(item: string) {
    setItems(prev => prev.filter(a => a !== item));
  }

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          data-testid={`input-${testIdPrefix}-new`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          data-testid={`button-add-${testIdPrefix}`}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {items.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className={`gap-1.5 pr-1.5 ${badgeClass ?? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30"}`}
              data-testid={`badge-${testIdPrefix}-${item}`}
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                className="hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function CompletenessBar() {
  const profile = getResearcherProfile();
  const { percent, filled, total, missing } = getProfileCompleteness(profile);

  const barColor = percent === 100
    ? "bg-emerald-500"
    : percent >= 70
      ? "bg-amber-500"
      : "bg-red-400";

  return (
    <div className="mb-6 space-y-2" data-testid="profile-completeness-bar">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {percent === 100 ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : null}
          <span className="text-sm font-medium text-foreground">
            Profile {percent}% complete
          </span>
          <span className="text-xs text-muted-foreground">({filled}/{total} fields)</span>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {missing.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Missing: {missing.join(", ")}
        </p>
      )}
    </div>
  );
}

export default function ResearchProfile() {
  const { toast } = useToast();
  const researcherHeaders = useResearcherHeaders();
  const profile = getResearcherProfile();
  const [areas, setAreas] = useState<string[]>(profile.researchAreas);
  const [alertTopics, setAlertTopics] = useState<string[]>(profile.alertTopics ?? []);
  const [secondaryInterests, setSecondaryInterests] = useState<string[]>(profile.secondaryInterests ?? []);
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [, forceUpdate] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: profile.name,
      institution: profile.institution,
      lab: profile.lab,
      careerStage: profile.careerStage || "",
      institutionType: profile.institutionType || "",
      orcidId: profile.orcidId || "",
    },
  });

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/research/profile/photo", {
        method: "POST",
        headers: researcherHeaders,
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        toast({ title: "Photo upload failed", description: body.error, variant: "destructive" });
        return;
      }
      const { url } = await res.json();
      setPhotoUrl(url);
      saveResearcherProfile({ photoUrl: url });
      forceUpdate(n => n + 1);
      toast({ title: "Photo updated" });
    } catch (err: any) {
      toast({ title: "Photo upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function onSubmit(values: FormValues) {
    saveResearcherProfile({
      name: values.name,
      institution: values.institution,
      lab: values.lab ?? "",
      careerStage: values.careerStage ?? "",
      institutionType: values.institutionType ?? "",
      orcidId: values.orcidId ?? "",
      researchAreas: areas,
      alertTopics,
      secondaryInterests,
      photoUrl,
    });
    forceUpdate(n => n + 1);
    toast({ title: "Profile saved" });
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-violet-600/10 flex items-center justify-center">
          <User className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Researcher Profile</h1>
          <p className="text-sm text-muted-foreground">
            Personalize your dashboard, alerts, and discovery cards.
          </p>
        </div>
      </div>

      <CompletenessBar />

      <div className="flex items-center gap-4 mb-6">
        <div
          className="relative w-20 h-20 rounded-full bg-muted border-2 border-border flex items-center justify-center overflow-hidden cursor-pointer group"
          onClick={() => photoInputRef.current?.click()}
          data-testid="photo-upload-zone"
        >
          {photoUrl ? (
            <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-muted-foreground" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {uploadingPhoto ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handlePhotoUpload}
            data-testid="input-profile-photo"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{profile.name || "Your Name"}</p>
          <p className="text-xs text-muted-foreground">Click photo to upload (PNG, JPG, WebP, max 5 MB)</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="Dr. Jane Smith" {...field} data-testid="input-profile-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="institution"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Institution</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., MIT, Stanford, Harvard" {...field} data-testid="input-profile-institution" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lab"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lab / Department <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Koch Institute for Integrative Cancer Research" {...field} data-testid="input-profile-lab" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="careerStage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Career Stage</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-career-stage">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CAREER_STAGES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="institutionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-institution-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INSTITUTION_TYPES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="orcidId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  ORCID ID <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="0000-0002-1825-0097"
                      {...field}
                      data-testid="input-profile-orcid"
                    />
                    {field.value?.trim() && (
                      <a
                        href={`https://orcid.org/${field.value.trim()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                        data-testid="link-orcid-profile"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </FormControl>
                <p className="text-[11px] text-muted-foreground">
                  Your unique researcher identifier from orcid.org
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <TagInput
            label="Research Areas"
            description="Primary research areas. Used to personalize your Breaking Research alerts."
            items={areas}
            setItems={setAreas}
            placeholder="e.g., KRAS inhibitor, CAR-T"
            testIdPrefix="research-area"
          />

          <TagInput
            label="Alert Topics"
            description="Specific topics for alert notifications. Falls back to Research Areas if empty."
            items={alertTopics}
            setItems={setAlertTopics}
            placeholder="e.g., PD-L1 checkpoint, mRNA delivery"
            testIdPrefix="alert-topic"
            badgeClass="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
          />

          <TagInput
            label="Secondary Interests"
            description="Adjacent fields or cross-disciplinary interests."
            items={secondaryInterests}
            setItems={setSecondaryInterests}
            placeholder="e.g., Computational biology, Drug delivery"
            testIdPrefix="secondary-interest"
            badgeClass="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
          />

          <Button
            type="submit"
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            data-testid="button-save-profile"
          >
            Save Profile
          </Button>
        </form>
      </Form>
    </div>
  );
}