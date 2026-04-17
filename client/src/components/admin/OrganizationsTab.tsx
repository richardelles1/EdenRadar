import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  members?: OrgMember[];
}

interface OrgMember {
  id: number;
  orgId: number;
  userId: string;
  role: string;
  invitedBy: string | null;
  joinedAt: string;
}

const PLAN_LABELS: Record<string, string> = {
  individual: "Individual",
  team5: "Team-5",
  team10: "Team-10",
  enterprise: "Enterprise",
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

const PLAN_COLORS: Record<string, string> = {
  individual: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  team5: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  team10: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
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
  primaryColor: "",
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
    primaryColor: org.primaryColor ?? "",
    billingEmail: org.billingEmail ?? "",
    billingMethod: org.billingMethod,
    billingNotes: org.billingNotes ?? "",
  };
}

export function OrganizationsTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const headers = { "x-admin-password": pw };

  const { data: orgs = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/admin/orgs"],
    queryFn: () =>
      fetch("/api/admin/orgs", { headers }).then((r) => r.json()),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [orgDetail, setOrgDetail] = useState<(Organization & { members: OrgMember[] }) | null>(null);

  const { data: detailData, isLoading: detailLoading } = useQuery<Organization & { members: OrgMember[] }>({
    queryKey: ["/api/admin/orgs", expandedId],
    queryFn: () =>
      fetch(`/api/admin/orgs/${expandedId}`, { headers }).then((r) => r.json()),
    enabled: expandedId !== null,
  });

  // Org form dialog
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [orgForm, setOrgForm] = useState<OrgFormState>(emptyForm());

  // Member add dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberOrgId, setMemberOrgId] = useState<number | null>(null);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState("member");

  // Delete confirm
  const [deleteOrgId, setDeleteOrgId] = useState<number | null>(null);
  const [deleteMemberId, setDeleteMemberId] = useState<number | null>(null);

  const createOrgMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("POST", "/api/admin/orgs", data, { headers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      setOrgDialogOpen(false);
      toast({ title: "Organization created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateOrgMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) =>
      apiRequest("PATCH", `/api/admin/orgs/${id}`, data, { headers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", expandedId] });
      setOrgDialogOpen(false);
      toast({ title: "Organization updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/admin/orgs/${id}`, undefined, { headers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      if (expandedId === deleteOrgId) setExpandedId(null);
      setDeleteOrgId(null);
      toast({ title: "Organization deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ orgId, data }: { orgId: number; data: Record<string, any> }) =>
      apiRequest("POST", `/api/admin/orgs/${orgId}/members`, data, { headers }),
    onSuccess: () => {
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", expandedId] });
      setMemberDialogOpen(false);
      setMemberUserId("");
      setMemberRole("member");
      toast({ title: "Member added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: string }) =>
      apiRequest("PATCH", `/api/admin/orgs/members/${memberId}`, { role }, { headers }),
    onSuccess: () => {
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", expandedId] });
      toast({ title: "Role updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) =>
      apiRequest("DELETE", `/api/admin/orgs/members/${memberId}`, undefined, { headers }),
    onSuccess: () => {
      if (expandedId) queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", expandedId] });
      setDeleteMemberId(null);
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

  function handleOrgFormSubmit() {
    const payload: Record<string, any> = {
      name: orgForm.name.trim(),
      planTier: orgForm.planTier,
      seatLimit: parseInt(orgForm.seatLimit) || 1,
      billingMethod: orgForm.billingMethod,
    };
    if (orgForm.logoUrl.trim()) payload.logoUrl = orgForm.logoUrl.trim();
    if (orgForm.primaryColor.trim()) payload.primaryColor = orgForm.primaryColor.trim();
    if (orgForm.billingEmail.trim()) payload.billingEmail = orgForm.billingEmail.trim();
    if (orgForm.billingNotes.trim()) payload.billingNotes = orgForm.billingNotes.trim();

    if (editingOrg) {
      updateOrgMutation.mutate({ id: editingOrg.id, data: payload });
    } else {
      createOrgMutation.mutate(payload);
    }
  }

  const members = detailData?.members ?? [];
  const activeOrg = orgs.find((o) => o.id === expandedId);

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
        <div className="text-sm text-muted-foreground py-8 text-center">Loading organizations...</div>
      ) : orgs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No organizations yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => {
            const isExpanded = expandedId === org.id;
            return (
              <Card key={org.id} className="overflow-hidden" data-testid={`card-org-${org.id}`}>
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : org.id);
                  }}
                  data-testid={`row-org-${org.id}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  {org.primaryColor ? (
                    <div
                      className="h-6 w-6 rounded-full shrink-0 border border-border"
                      style={{ backgroundColor: org.primaryColor }}
                    />
                  ) : (
                    <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-org-name-${org.id}`}>
                        {org.name}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[org.planTier] ?? PLAN_COLORS.individual}`}
                        data-testid={`badge-plan-${org.id}`}
                      >
                        {PLAN_LABELS[org.planTier] ?? org.planTier}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {BILLING_LABELS[org.billingMethod] ?? org.billingMethod}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {org.seatLimit} seat{org.seatLimit !== 1 ? "s" : ""}
                      {org.billingEmail ? ` · ${org.billingEmail}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditOrg(org)}
                      data-testid={`button-edit-org-${org.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteOrgId(org.id)}
                      data-testid={`button-delete-org-${org.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-4 py-4">
                    {detailLoading ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">Loading members...</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            Members ({members.length} / {org.seatLimit})
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
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
                                key={m.id}
                                className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
                                data-testid={`row-member-${m.id}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-mono truncate" data-testid={`text-member-userId-${m.id}`}>
                                    {m.userId}
                                  </p>
                                  {m.invitedBy && (
                                    <p className="text-xs text-muted-foreground">
                                      Invited by {m.invitedBy}
                                    </p>
                                  )}
                                </div>
                                <Select
                                  value={m.role}
                                  onValueChange={(role) =>
                                    updateMemberRoleMutation.mutate({ memberId: m.id, role })
                                  }
                                >
                                  <SelectTrigger
                                    className="h-7 w-24 text-xs"
                                    data-testid={`select-role-${m.id}`}
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
                                  onClick={() => setDeleteMemberId(m.id)}
                                  data-testid={`button-remove-member-${m.id}`}
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {org.billingNotes && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                            <span className="font-medium">Billing notes:</span> {org.billingNotes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
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
          <div className="space-y-4 py-2">
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
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="team5">Team-5</SelectItem>
                    <SelectItem value="team10">Team-10</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
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
                <Label htmlFor="org-color">Brand Color</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="org-color"
                    value={orgForm.primaryColor}
                    onChange={(e) => setOrgForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    placeholder="#16a34a"
                    data-testid="input-org-color"
                  />
                  {orgForm.primaryColor && (
                    <div
                      className="h-8 w-8 rounded border border-border shrink-0"
                      style={{ backgroundColor: orgForm.primaryColor }}
                    />
                  )}
                </div>
              </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="org-logo">Logo URL</Label>
              <Input
                id="org-logo"
                value={orgForm.logoUrl}
                onChange={(e) => setOrgForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://..."
                data-testid="input-org-logo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-billing-notes">Billing Notes</Label>
              <Input
                id="org-billing-notes"
                value={orgForm.billingNotes}
                onChange={(e) => setOrgForm((f) => ({ ...f, billingNotes: e.target.value }))}
                placeholder="NET-30 invoice, PO required..."
                data-testid="input-org-billing-notes"
              />
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
            <div className="space-y-1.5">
              <Label htmlFor="member-userId">Supabase User ID</Label>
              <Input
                id="member-userId"
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                placeholder="uuid from Supabase auth"
                className="font-mono text-sm"
                data-testid="input-member-userId"
              />
              <p className="text-xs text-muted-foreground">
                Copy the user's UUID from Account Center or Supabase Auth dashboard.
              </p>
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
              disabled={!memberUserId.trim() || addMemberMutation.isPending}
              onClick={() => {
                if (!memberOrgId) return;
                addMemberMutation.mutate({
                  orgId: memberOrgId,
                  data: { userId: memberUserId.trim(), role: memberRole },
                });
              }}
              data-testid="button-save-member"
            >
              Add Member
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
              This will permanently delete the organization and remove all member associations. This cannot be undone.
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
      <AlertDialog open={deleteMemberId !== null} onOpenChange={(o) => { if (!o) setDeleteMemberId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to the organization's shared resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-member">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMemberId !== null && removeMemberMutation.mutate(deleteMemberId)}
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
