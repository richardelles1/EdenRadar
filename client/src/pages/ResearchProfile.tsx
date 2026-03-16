import { useState } from "react";
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
import { User, Plus, X } from "lucide-react";
import { getResearcherProfile, saveResearcherProfile } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Required"),
  institution: z.string().min(1, "Required"),
  lab: z.string().optional(),
  careerStage: z.string().optional(),
  institutionType: z.string().optional(),
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

export default function ResearchProfile() {
  const { toast } = useToast();
  const profile = getResearcherProfile();
  const [areas, setAreas] = useState<string[]>(profile.researchAreas);
  const [alertTopics, setAlertTopics] = useState<string[]>(profile.alertTopics ?? []);
  const [secondaryInterests, setSecondaryInterests] = useState<string[]>(profile.secondaryInterests ?? []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: profile.name,
      institution: profile.institution,
      lab: profile.lab,
      careerStage: profile.careerStage || "",
      institutionType: profile.institutionType || "",
    },
  });

  function onSubmit(values: FormValues) {
    saveResearcherProfile({
      name: values.name,
      institution: values.institution,
      lab: values.lab ?? "",
      careerStage: values.careerStage ?? "",
      institutionType: values.institutionType ?? "",
      researchAreas: areas,
      alertTopics,
      secondaryInterests,
    });
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
            Stored locally — used to personalize your dashboard and alerts.
          </p>
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
