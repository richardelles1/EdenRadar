import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, Users, Pencil, Trash2, UserPlus, UserMinus, ChevronDown, ChevronRight } from "lucide-react";

interface Organization {
  id: number;
  name: string;
  planTier: string;
  seatLimit: number;
  logoUrl: string | null;
  primaryColor: string | null;
  billingEmail: string | null;
  billingMethod: string;
  billingNotes: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  members?: OrgMember[];
}

interface OrgMember {
  id: number;
  orgId: number;
  userId: string;
  email: string | null;
  memberName: string | null;
  role: string;
  invitedBy: string | null;
  joinedAt: string;
}

const PLAN_LABELS: Record<string, string> = {
  individual: "Individual  $1,999/mo",
  team5: "Team 5-Seat  $4,999/mo",
  team10: "Team 10-Seat  $8,999/mo",
  enterprise: "Enterprise  $50,000+/mo",
};

const PLAN_SEAT_DEFAULTS: Record<string, number> = {
  individual: 1,
  team5: 5,
  team10: 10,
  enterprise: 999,
};

const BILLING_LABELS: Record<string, string> = {
  stripe: "Stripe",
  ach: "ACH",
  invoice: "Invoice",
};

const PLAN_TIER_LABELS: Record<string, string> = {
  individual: "Individual",
  team5: "Team-5",
  team10: "Team-10",
  enterprise: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  individual: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  team5: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  team10: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  member: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

interface OrgFormState {
  name: string;
  planTier: string;
  seatLimit: string;
  logoUrl: string;
  primaryColor: string;
  billingEmail: string;
  billingMethod: string;
  billingNotes: string;
}

const emptyForm = (): OrgFormState => ({
  name: "",
  planTier: "individual",
  seatLimit: "1",
  logoUrl: "",
  primaryColor: "#16a34a",
  billingEmail: "",
  billingMethod: "stripe",
  billingNotes: "",
});

function orgToForm(org: Organization): OrgFormState {
  return {
    name: org.name,
    planTier: org.planTier,
    seatLimit: String(org.seatLimit),
    logoUrl: org.logoUrl ?? "",
    primaryColor: org.primaryColor ?? "#16a34a",
    billingEmail: org.billingEmail ?? "",
    billingMethod: org.billingMethod,
    billingNotes: org.billingNotes ?? "",
  };
}

async function adminFetch(url: string, options: RequestInit = {}, pw: string) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": pw,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? res.statusText);
  }
  return res.json();
}

export function OrganizationsTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const logoFileRef = useRef<HTMLInputElement>(null);

  const { data: orgs = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    queryFn: () => adminFetch("/api/admin/organizations", {}, pw),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: detailData, isLoading: detailLoading } = useQuery<Organization & { members: OrgMember[] }>({
    queryKey: ["/api/admin/organizations", expandedId],
    queryFn: () => adminFetch(`/api/admin/organizations/${expandedId}`, {}, pw),
    enabled: expandedId !== null,
  });

  // Org form dialog
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [orgForm, setOrgForm] = useState<OrgFormState>(emptyForm());

  // Member add dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberOrgId, setMemberOrgId] = useState<number | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberFullName, setMemberFullName] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberRole, setMemberRole] = useState("member");

  // Delete confirm
  const [deleteOrgId, setDeleteOrgId] = useState<number | null>(null);
  const [removeMemberKey, setRemoveMemberKey] = useState<{ orgId: number; userId: string } | null>(null);

  const createOrgMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      adminFetch("/api/admin/organizations", { method: "POST", body: JSON.stringify(data) }, pw),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      setOrgDialogOpen(false);
      toast({ title: "Organization created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateOrgMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) =>
      adminFetch(`/api/admin/organizations/${id}`, { method: "PATCH", body: JSON.stringify(data) }, pw),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations", expandedId] });
      setOrgDialogOpen(false);
      toast({ title: "Organization updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (id: number) =>
      adminFetch(`/api/admin/organizations/${id}`, { method: "DELETE" }, pw),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      if (expandedId === deleteOrgId) setExpandedId(null);
      setDeleteOrgId(null);
      toast({ title: "Organization deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ orgId, data }: { orgId: number; data: Record<string, any> }) =>
      adminFetch(`/api/admin/organizations/${orgId}/members`, { method: "POST", body: JSON.stringify(data) }, pw),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations", expandedId] });
      setMemberDialogOpen(false);
      setMemberEmail("");
      setMemberFullName("");
      setMemberPassword("");
      setMemberRole("member");
      toast({ title: "Member added and account created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ orgId, userId, role }: { orgId: number; userId: string; role: string }) =>
      adminFetch(`/api/admin/organizations/${orgId}/members/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }, pw),
    onSuccess: () => {
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations", expandedId] });
      toast({ title: "Role updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: number; userId: string }) =>
      adminFetch(`/api/admin/organizations/${orgId}/members/${userId}`, { method: "DELETE" }, pw),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations", expandedId] });
      setRemoveMemberKey(null);
      toast({ title: "Member removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openCreateOrg() {
    setEditingOrg(null);
    setOrgForm(emptyForm());
    setOrgDialogOpen(true);
  }

  function openEditOrg(org: Organization) {
    setEditingOrg(org);
    setOrgForm(orgToForm(org));
    setOrgDialogOpen(true);
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setOrgForm((f) => ({ ...f, logoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  function handleOrgFormSubmit() {
    const payload: Record<string, any> = {
      name: orgForm.name.trim(),
      planTier: orgForm.planTier,
      seatLimit: parseInt(orgForm.seatLimit) || 1,
      billingMethod: orgForm.billingMethod,
      primaryColor: orgForm.primaryColor || null,
    };
    if (orgForm.logoUrl.trim()) payload.logoUrl = orgForm.logoUrl.trim();
    if (orgForm.billingEmail.trim()) payload.billingEmail = orgForm.billingEmail.trim();
    if (["ach", "invoice"].includes(orgForm.billingMethod) && orgForm.billingNotes.trim()) {
      payload.billingNotes = orgForm.billingNotes.trim();
    } else {
      payload.billingNotes = null;
    }

    if (editingOrg) {
      updateOrgMutation.mutate({ id: editingOrg.id, data: payload });
    } else {
      createOrgMutation.mutate(payload);
    }
  }

  const members = detailData?.members ?? [];
  const expandedOrg = orgs.find((o) => o.id === expandedId);
  const seatCount = detailData?.members?.length ?? 0;
  const seatLimit = expandedOrg?.seatLimit ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">
            Organizations
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage EdenScout subscriber organizations, seat limits, and billing configuration.
          </p>
        </div>
        <Button onClick={openCreateOrg} data-testid="button-create-org" className="gap-2">
          <Plus className="h-4 w-4" />
          New Organization
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : orgs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No organizations yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
            <span>Organization</span>
            <span>Plan</span>
            <span>Seats</span>
            <span>Billing</span>
            <span>Created</span>
            <span />
          </div>

          {orgs.map((org, idx) => {
            const isExpanded = expandedId === org.id;
            const isLast = idx === orgs.length - 1;
            return (
              <div key={org.id} className={isLast ? "" : "border-b border-border"} data-testid={`card-org-${org.id}`}>
                {/* Row */}
                <div
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : org.id)}
                  data-testid={`row-org-${org.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    {org.primaryColor ? (
                      <div
                        className="h-5 w-5 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: org.primaryColor }}
                      />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium text-sm truncate" data-testid={`text-org-name-${org.id}`}>
                      {org.name}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium w-fit ${PLAN_COLORS[org.planTier] ?? PLAN_COLORS.individual}`}
                    data-testid={`badge-plan-${org.id}`}
                  >
                    {PLAN_TIER_LABELS[org.planTier] ?? org.planTier}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {org.memberCount ?? 0} / {org.seatLimit}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {BILLING_LABELS[org.billingMethod] ?? org.billingMethod}
                  </span>
                  <span className="text-sm text-muted-foreground" data-testid={`text-org-created-${org.id}`}>
                    {new Date(org.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => openEditOrg(org)}
                      data-testid={`button-edit-org-${org.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteOrgId(org.id)}
                      data-testid={`button-delete-org-${org.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-6 py-5">
                    {detailLoading ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">Loading members...</div>
                    ) : (
                      <div className="space-y-5">
                        {/* Org metadata */}
                        <div className="flex flex-wrap gap-6 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs">Plan</span>
                            <p className="font-medium">{PLAN_LABELS[org.planTier] ?? org.planTier}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Billing</span>
                            <p className="font-medium">{BILLING_LABELS[org.billingMethod] ?? org.billingMethod}</p>
                          </div>
                          {org.billingEmail && (
                            <div>
                              <span className="text-muted-foreground text-xs">Billing Email</span>
                              <p className="font-medium">{org.billingEmail}</p>
                            </div>
                          )}
                          {org.primaryColor && (
                            <div>
                              <span className="text-muted-foreground text-xs">Brand Color</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="h-4 w-4 rounded border border-border" style={{ backgroundColor: org.primaryColor }} />
                                <span className="font-mono text-xs">{org.primaryColor}</span>
                              </div>
                            </div>
                          )}
                          {org.logoUrl && (
                            <div>
                              <span className="text-muted-foreground text-xs">Logo</span>
                              <img
                                src={org.logoUrl}
                                alt="Logo"
                                className="h-8 mt-0.5 object-contain"
                                onError={(e) => (e.currentTarget.style.display = "none")}
                              />
                            </div>
                          )}
                        </div>

                        {org.billingNotes && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                            <span className="font-medium">Billing notes:</span> {org.billingNotes}
                          </div>
                        )}

                        {/* Seat usage */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5" />
                              Seats used
                            </span>
                            <span data-testid={`text-seat-usage-${org.id}`}>
                              {seatCount} of {seatLimit}
                            </span>
                          </div>
                          <Progress
                            value={seatLimit > 0 ? Math.min(100, (seatCount / seatLimit) * 100) : 0}
                            className="h-1.5"
                          />
                        </div>

                        {/* Members */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Members</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs h-7"
                              onClick={() => {
                                setMemberOrgId(org.id);
                                setMemberDialogOpen(true);
                              }}
                              data-testid={`button-add-member-${org.id}`}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Add Member
                            </Button>
                          </div>
                          {members.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">No members yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {members.map((m) => (
                                <div
                                  key={m.userId}
                                  className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
                                  data-testid={`row-member-${m.userId}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    {m.memberName ? (
                                      <p className="text-sm font-medium truncate" data-testid={`text-member-name-${m.userId}`}>
                                        {m.memberName}
                                      </p>
                                    ) : null}
                                    {m.email ? (
                                      <p className="text-xs text-muted-foreground truncate" data-testid={`text-member-email-${m.userId}`}>
                                        {m.email}
                                      </p>
                                    ) : (
                                      <p className="text-xs font-mono text-muted-foreground truncate" data-testid={`text-member-userId-${m.userId}`}>
                                        {m.userId}
                                      </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      Joined {new Date(m.joinedAt).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <Select
                                    value={m.role}
                                    onValueChange={(role) =>
                                      updateRoleMutation.mutate({ orgId: org.id, userId: m.userId, role })
                                    }
                                  >
                                    <SelectTrigger
                                      className="h-7 w-24 text-xs"
                                      data-testid={`select-role-${m.userId}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="owner">Owner</SelectItem>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="member">Member</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[m.role] ?? ROLE_COLORS.member}`}
                                  >
                                    {m.role}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => setRemoveMemberKey({ orgId: org.id, userId: m.userId })}
                                    data-testid={`button-remove-member-${m.userId}`}
                                  >
                                    <UserMinus className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Org Dialog */}
      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-org-form">
          <DialogHeader>
            <DialogTitle>{editingOrg ? "Edit Organization" : "New Organization"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={orgForm.name}
                onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Acme Pharma"
                data-testid="input-org-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plan Tier</Label>
                <Select
                  value={orgForm.planTier}
                  onValueChange={(v) =>
                    setOrgForm((f) => ({
                      ...f,
                      planTier: v,
                      seatLimit: String(PLAN_SEAT_DEFAULTS[v] ?? 1),
                    }))
                  }
                >
                  <SelectTrigger data-testid="select-plan-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual  $1,999/mo</SelectItem>
                    <SelectItem value="team5">Team 5-Seat  $4,999/mo</SelectItem>
                    <SelectItem value="team10">Team 10-Seat  $8,999/mo</SelectItem>
                    <SelectItem value="enterprise">Enterprise  $50,000+/mo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-seats">Seat Limit</Label>
                <Input
                  id="org-seats"
                  type="number"
                  min="1"
                  value={orgForm.seatLimit}
                  onChange={(e) => setOrgForm((f) => ({ ...f, seatLimit: e.target.value }))}
                  data-testid="input-org-seats"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Billing Method</Label>
                <Select
                  value={orgForm.billingMethod}
                  onValueChange={(v) => setOrgForm((f) => ({ ...f, billingMethod: v }))}
                >
                  <SelectTrigger data-testid="select-billing-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="ach">ACH</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-billing-email">Billing Email</Label>
                <Input
                  id="org-billing-email"
                  type="email"
                  value={orgForm.billingEmail}
                  onChange={(e) => setOrgForm((f) => ({ ...f, billingEmail: e.target.value }))}
                  placeholder="billing@company.com"
                  data-testid="input-org-billing-email"
                />
              </div>
            </div>
            {["ach", "invoice"].includes(orgForm.billingMethod) && (
              <div className="space-y-1.5">
                <Label htmlFor="org-billing-notes">Billing Notes</Label>
                <Input
                  id="org-billing-notes"
                  value={orgForm.billingNotes}
                  onChange={(e) => setOrgForm((f) => ({ ...f, billingNotes: e.target.value }))}
                  placeholder={orgForm.billingMethod === "ach" ? "Routing: 021000021, Account: ..." : "NET-30, PO required, send to..."}
                  data-testid="input-org-billing-notes"
                />
              </div>
            )}
            {/* Color picker */}
            <div className="space-y-1.5">
              <Label>Brand Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={orgForm.primaryColor}
                  onChange={(e) => setOrgForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                  data-testid="input-org-color-picker"
                />
                <Input
                  value={orgForm.primaryColor}
                  onChange={(e) => setOrgForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  placeholder="#16a34a"
                  className="font-mono w-32"
                  data-testid="input-org-color-hex"
                />
              </div>
            </div>
            {/* Logo */}
            <div className="space-y-1.5">
              <Label htmlFor="org-logo">Logo URL or Upload</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="org-logo"
                  value={orgForm.logoUrl.startsWith("data:") ? "(file uploaded)" : orgForm.logoUrl}
                  onChange={(e) => setOrgForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://..."
                  data-testid="input-org-logo-url"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoFileRef.current?.click()}
                  data-testid="button-org-logo-upload"
                >
                  Upload
                </Button>
                <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              </div>
              {orgForm.logoUrl && (
                <img
                  src={orgForm.logoUrl}
                  alt="Logo preview"
                  className="h-10 mt-1 object-contain rounded border border-border p-1"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgDialogOpen(false)} data-testid="button-cancel-org">
              Cancel
            </Button>
            <Button
              onClick={handleOrgFormSubmit}
              disabled={!orgForm.name.trim() || createOrgMutation.isPending || updateOrgMutation.isPending}
              data-testid="button-save-org"
            >
              {editingOrg ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent data-testid="dialog-add-member">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              A new EdenScout account will be created and linked to this organization.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="user@company.com"
                data-testid="input-member-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-name">Full Name</Label>
              <Input
                id="member-name"
                value={memberFullName}
                onChange={(e) => setMemberFullName(e.target.value)}
                placeholder="Jane Smith"
                data-testid="input-member-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-password">Password (admin sets it)</Label>
              <Input
                id="member-password"
                type="password"
                value={memberPassword}
                onChange={(e) => setMemberPassword(e.target.value)}
                placeholder="min 8 characters"
                data-testid="input-member-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger data-testid="select-member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)} data-testid="button-cancel-member">
              Cancel
            </Button>
            <Button
              disabled={!memberEmail.trim() || !memberFullName.trim() || memberPassword.length < 8 || addMemberMutation.isPending}
              onClick={() => {
                if (!memberOrgId) return;
                addMemberMutation.mutate({
                  orgId: memberOrgId,
                  data: { email: memberEmail.trim(), fullName: memberFullName.trim(), password: memberPassword, role: memberRole },
                });
              }}
              data-testid="button-save-member"
            >
              {addMemberMutation.isPending ? "Creating..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Org Confirm */}
      <AlertDialog open={deleteOrgId !== null} onOpenChange={(o) => { if (!o) setDeleteOrgId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the organization and remove all member associations. Supabase accounts are not deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-org">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteOrgId !== null && deleteOrgMutation.mutate(deleteOrgId)}
              data-testid="button-confirm-delete-org"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Confirm */}
      <AlertDialog open={removeMemberKey !== null} onOpenChange={(o) => { if (!o) setRemoveMemberKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to the organization's shared resources. Their Supabase account is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-member">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeMemberKey && removeMemberMutation.mutate(removeMemberKey)}
              data-testid="button-confirm-remove-member"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
