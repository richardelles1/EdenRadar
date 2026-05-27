import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Phone, ExternalLink, Users } from "lucide-react";

interface TtoContact {
  id: number;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  tto_url?: string;
  verified_at?: string;
}

interface Props {
  institution: string;
  className?: string;
  compact?: boolean;
}

export function TtoContactCard({ institution, className = "", compact = false }: Props) {
  const { data, isLoading } = useQuery<{ contacts: TtoContact[] }>({
    queryKey: ["/api/tto-contacts", institution],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tto-contacts/${encodeURIComponent(institution)}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!institution,
  });

  const contacts = data?.contacts ?? [];

  if (isLoading) {
    return (
      <div className={`animate-pulse space-y-2 ${className}`}>
        <div className="h-3 bg-muted rounded w-24" />
        <div className="h-3 bg-muted rounded w-40" />
      </div>
    );
  }

  if (contacts.length === 0) return null;

  if (compact) {
    const primary = contacts[0];
    return (
      <div className={`flex items-start gap-2 ${className}`}>
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Users className="w-3 h-3 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground leading-tight truncate">{primary.name}</p>
          {primary.title && <p className="text-[11px] text-muted-foreground truncate">{primary.title}</p>}
          {primary.email && (
            <a
              href={`mailto:${primary.email}`}
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5"
              onClick={e => e.stopPropagation()}
            >
              <Mail className="w-2.5 h-2.5" />
              {primary.email}
            </a>
          )}
          {contacts.length > 1 && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">+{contacts.length - 1} more contact{contacts.length > 2 ? "s" : ""}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground/50">
          TTO Contacts
        </span>
        {contacts[0]?.tto_url && (
          <a
            href={contacts[0].tto_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-2.5 h-2.5" />
            TTO site
          </a>
        )}
      </div>

      <div className="space-y-2.5">
        {contacts.map(contact => (
          <div key={contact.id} className="flex items-start gap-2.5 group">
            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-semibold text-primary">
                {contact.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-foreground">{contact.name}</span>
                {contact.verified_at && (
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">✓ verified</span>
                )}
              </div>
              {contact.title && (
                <p className="text-[11px] text-muted-foreground leading-tight">{contact.title}</p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <Mail className="w-3 h-3" />
                    {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <Phone className="w-3 h-3" />
                    {contact.phone}
                  </a>
                )}
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                    LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
