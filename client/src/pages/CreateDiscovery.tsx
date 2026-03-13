import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlaskConical, Send } from "lucide-react";
import { useResearcherId, getResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { DiscoveryCard } from "@shared/schema";

const formSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  summary: z.string().min(20, "Summary must be at least 20 characters"),
  researchArea: z.string().min(2, "Required"),
  technologyType: z.string().min(2, "Required"),
  institution: z.string().min(2, "Required"),
  lab: z.string().optional(),
  developmentStage: z.string().min(1, "Required"),
  ipStatus: z.string().min(1, "Required"),
  seeking: z.string().min(2, "Required"),
  contactEmail: z.string().email("Enter a valid email"),
  publicationLink: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  patentLink: z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

const STAGES = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3", "Approved"];
const IP_STATUSES = ["Patent Pending", "Patented", "Trade Secret", "No IP", "Provisional"];
const SEEKING_OPTIONS = [
  "Licensing partner",
  "Co-development",
  "Acquisition",
  "Industry collaborator",
  "Investment",
  "Sponsored research",
];

export default function CreateDiscovery() {
  const researcherId = useResearcherId();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      summary: "",
      researchArea: "",
      technologyType: "",
      institution: "",
      lab: "",
      developmentStage: "",
      ipStatus: "",
      seeking: "",
      contactEmail: "",
      publicationLink: "",
      patentLink: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCard(values: FormValues, publish: boolean) {
    setIsSubmitting(true);
    try {
      const body = {
        ...values,
        researcherId,
        publicationLink: values.publicationLink || null,
        patentLink: values.patentLink || null,
        lab: values.lab || null,
      };
      const createRes = await fetch("/api/research/discoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getResearcherHeaders() },
        body: JSON.stringify(body),
      });
      const { card } = await createRes.json() as { card: DiscoveryCard };
      if (publish) {
        await fetch(`/api/research/discoveries/${card.id}/publish`, {
          method: "PATCH",
          headers: getResearcherHeaders(),
        });
        toast({
          title: "Published to EdenRadar Industry!",
          description: "Your discovery is now visible to industry buyers in the Scout portal.",
        });
      } else {
        toast({ title: "Discovery saved as draft" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/research/discoveries"] });
      navigate("/research/my-discoveries");
    } catch (err: any) {
      toast({
        title: "Error saving discovery",
        description: err?.message ?? "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSaveDraft(values: FormValues) {
    submitCard(values, false);
  }

  function onPublish() {
    form.handleSubmit((values) => submitCard(values, true))();
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-violet-600/10 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Create Discovery Card</h1>
          <p className="text-sm text-muted-foreground">
            Publish your research to reach industry partners through EdenRadar.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSaveDraft)} className="space-y-5">

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discovery Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Novel KRAS G12C Covalent Inhibitor with Enhanced Selectivity" {...field} data-testid="input-discovery-title" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="summary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Summary</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe the discovery, its mechanism, and why it matters..."
                    className="min-h-[100px] resize-none"
                    {...field}
                    data-testid="input-discovery-summary"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="researchArea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Research Area</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Oncology, Neurology" {...field} data-testid="input-research-area" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="technologyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Technology Type</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Small molecule, mRNA" {...field} data-testid="input-technology-type" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="institution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., MIT, Stanford" {...field} data-testid="input-institution" />
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
                    <Input placeholder="e.g., Koch Institute" {...field} data-testid="input-lab" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="developmentStage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Development Stage</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-development-stage">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STAGES.map((s) => (
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
              name="ipStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IP Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-ip-status">
                        <SelectValue placeholder="Select IP status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {IP_STATUSES.map((s) => (
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
            name="seeking"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Seeking</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-seeking">
                      <SelectValue placeholder="What are you looking for?" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SEEKING_OPTIONS.map((s) => (
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
            name="contactEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="lab@university.edu" {...field} data-testid="input-contact-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="publicationLink"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Publication Link <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="https://pubmed.ncbi..." {...field} data-testid="input-publication-link" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="patentLink"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Patent Link <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="https://patents.google.com/..." {...field} data-testid="input-patent-link" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              type="submit"
              variant="outline"
              disabled={isSubmitting}
              className="flex-1"
              data-testid="button-save-draft"
            >
              Save as Draft
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={onPublish}
              className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold"
              data-testid="button-publish-to-industry"
            >
              <Send className="w-4 h-4" />
              Publish to EdenRadar Industry
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
