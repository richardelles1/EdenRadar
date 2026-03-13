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
import { User, Plus, X } from "lucide-react";
import { getResearcherProfile, saveResearcherProfile } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Required"),
  institution: z.string().min(1, "Required"),
  lab: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ResearchProfile() {
  const { toast } = useToast();
  const profile = getResearcherProfile();
  const [areas, setAreas] = useState<string[]>(profile.researchAreas);
  const [newArea, setNewArea] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: profile.name,
      institution: profile.institution,
      lab: profile.lab,
    },
  });

  function addArea() {
    const trimmed = newArea.trim();
    if (trimmed && !areas.includes(trimmed)) {
      setAreas((prev) => [...prev, trimmed]);
      setNewArea("");
    }
  }

  function removeArea(area: string) {
    setAreas((prev) => prev.filter((a) => a !== area));
  }

  function onSubmit(values: FormValues) {
    saveResearcherProfile({
      name: values.name,
      institution: values.institution,
      lab: values.lab ?? "",
      researchAreas: areas,
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
            Stored locally — used to personalize your dashboard.
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

          <div className="space-y-2">
            <FormLabel>Research Areas</FormLabel>
            <p className="text-xs text-muted-foreground">
              Used to personalize your Breaking Research Alert and Suggested Sources.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., KRAS inhibitor, CAR-T"
                value={newArea}
                onChange={(e) => setNewArea(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArea(); } }}
                data-testid="input-research-area-new"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addArea}
                data-testid="button-add-research-area"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {areas.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {areas.map((area) => (
                  <Badge
                    key={area}
                    variant="secondary"
                    className="gap-1.5 pr-1.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30"
                    data-testid={`badge-research-area-${area}`}
                  >
                    {area}
                    <button
                      type="button"
                      onClick={() => removeArea(area)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

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
