import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { sql, and } from "drizzle-orm";
import { storage } from "../storage";
import { verifyAnyAuth } from "../lib/supabaseAuth";
import { sendTeamInviteEmail, APP_URL } from "../email";
import { requireOrgAdminOrOwner, requireOrgOwner } from "../lib/routeHelpers";
import { captureException as sentryCaptureException } from "../lib/sentry";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function registerAuthRoutes(app: Express): void {
  // Plan-check endpoint â€” returns the authenticated user's active EdenScout plan tier.
  // Returns { plan: string | null, orgName: string | null }
  // plan is null when the user has no org or their org has no recognised paid tier.
  // planTier="none" is the canonical non-paid sentinel written by the Stripe webhook on
  // subscription cancellation; it is not in PAID_PLANS so this endpoint returns plan=null for it.
  app.get("/api/me/plan", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const PAID_PLANS = ["individual", "team5", "team10", "enterprise"] as const;
      const membership = await storage.getOrgPlanByMembership(userId);
      if (!membership || !PAID_PLANS.includes(membership.plan as (typeof PAID_PLANS)[number])) {
        return res.json({ plan: null, orgName: null, stripeStatus: null, stripeCurrentPeriodEnd: null });
      }
      return res.json({
        plan: membership.plan,
        orgName: membership.orgName,
        stripeStatus: membership.stripeStatus ?? null,
        stripeCurrentPeriodEnd: membership.stripeCurrentPeriodEnd ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/me/buyer-profile â€” load persisted buyer thesis for the signed-in user.
  // Returns null when no server profile exists yet (client falls back to localStorage).
  app.get("/api/me/buyer-profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const profile = await storage.getIndustryProfileByUserId(userId);
      if (!profile) return res.json(null);
      // Return stored JSONB if present; otherwise derive from profile onboarding fields
      const bp = profile.buyerProfile ?? {
        therapeutic_areas: profile.therapeuticAreas ?? [],
        modalities: profile.modalities ?? [],
        preferred_stages: profile.dealStages ?? [],
        excluded_stages: [],
        owner_type_preference: "any",
        freshness_days: 365,
        indication_keywords: [],
        target_keywords: [],
        notes: "",
      };
      return res.json(bp);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/me/buyer-profile â€” persist buyer thesis to the database.
  app.put("/api/me/buyer-profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const profile = req.body;
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        return res.status(400).json({ error: "Invalid buyer profile payload" });
      }
      await storage.saveBuyerProfile(userId, profile as Record<string, unknown>);
      return res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Industry-facing org context route â€” requires verified JWT via verifyAnyAuth
  app.get("/api/industry/org", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!org) return res.json(null);
      const members = await storage.getOrgMembers(org.id);
      // Auto-transition: mark invited member as active on first org access
      const self = members.find((m) => m.userId === userId);
      if (self && self.inviteStatus === "pending") {
        await storage.updateOrgMemberInviteStatus(org.id, userId, "active");
        self.inviteStatus = "active";
      }
      res.json({ ...org, members });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/industry/org â€” update org name / billing email (owner only)
  app.patch("/api/industry/org", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgOwner(req, res);
      if (!ctx) return;
      const { org } = ctx;
      const body = z.object({
        name: z.string().min(1).max(200).optional(),
        billingEmail: z.union([z.string().email(), z.literal("")]).optional(),
      }).parse(req.body);
      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.billingEmail !== undefined) updates.billingEmail = body.billingEmail || null;
      if (Object.keys(updates).length === 0) return res.json({ ok: true });
      const updated = await storage.updateOrganization(org.id, updates);
      res.json(updated);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Activate invite â€” called by /set-password page after the user sets their password.
  // Flips the caller's org_members.invite_status from "pending" â†’ "active" immediately
  // so they have full access when they land on the dashboard.
  app.post("/api/industry/activate-invite", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!org) return res.json({ ok: true, note: "no org found" });
      const members = await storage.getOrgMembers(org.id);
      const self = members.find((m) => m.userId === userId);
      if (self && self.inviteStatus === "pending") {
        await storage.updateOrgMemberInviteStatus(org.id, userId, "active");
      }
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/complete-invite â€” validates a custom invite token and sets the user's password.
  // Called by SetPassword.tsx InviteTokenFlow after the user submits a new password.
  // Returns { email } on success so the frontend can sign in with email+password.
  app.post("/api/auth/complete-invite", async (req, res) => {
    try {
      const { token, password } = z.object({
        token: z.string().uuid(),
        password: z.string().min(8),
      }).parse(req.body);

      const record = await storage.getInviteToken(token);
      if (!record) return res.status(404).json({ error: "Invalid invite link" });
      if (record.usedAt) return res.status(410).json({ error: "already_used" });
      if (record.expiresAt < new Date()) return res.status(410).json({ error: "expired" });

      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "Server configuration error" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(record.userId, { password });
      if (updateError) return res.status(500).json({ error: "Failed to set password" });

      await storage.markInviteTokenUsed(token);
      res.json({ email: record.email });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/resend-invite-link â€” unauthenticated self-service link re-request.
  // Called from the /set-password expired page when the user's link has expired.
  // Looks up the email in org_members, generates a fresh invite link, and emails it.
  // Always returns { ok: true } to avoid user enumeration.
  app.post("/api/auth/resend-invite-link", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);

      // Look up member record to find their org
      const member = await storage.getOrgMemberByEmail(email);
      if (member) {
        const org = await storage.getOrganization(member.orgId);
        if (org) {
          const inviteToken = crypto.randomUUID();
          await storage.createInviteToken({ token: inviteToken, userId: member.userId, email, orgId: member.orgId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
          const setPasswordLink = `${APP_URL}/set-password?invite_token=${inviteToken}`;
          await sendTeamInviteEmail(email, member.memberName ?? "", org.name, org.planTier ?? "individual", setPasswordLink)
            .catch((err) => console.error("[email] Resend invite link (self-service expired) failed:", err));
        }
      }
      // Always return ok â€” do not reveal whether email was found
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Valid email required" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Self-service team invite routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // POST /api/org/members â€” invite a new team member (admin or owner)
  app.post("/api/org/members", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgAdminOrOwner(req, res);
      if (!ctx) return;
      const { org } = ctx;

      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "Server configuration error" });
      }

      const memberSchema = z.object({
        email: z.string().email(),
        fullName: z.string().optional(),
        role: z.enum(["admin", "member"]).default("member"),
      });
      const { email, fullName: rawFullName, role } = memberSchema.parse(req.body);
      const fullName = rawFullName?.trim() || email.split("@")[0];

      const currentCount = await storage.getOrgMemberCount(org.id);
      if (currentCount >= org.seatLimit) {
        return res.status(400).json({ error: `Seat limit reached (${currentCount}/${org.seatLimit}). Upgrade the plan to add more members.` });
      }

      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: userData, error: supabaseError } = await adminSupabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: "industry", fullName },
      });
      if (supabaseError) return res.status(500).json({ error: supabaseError.message });
      const newUserId = userData.user.id;

      const inviteToken = crypto.randomUUID();
      await storage.createInviteToken({ token: inviteToken, userId: newUserId, email, orgId: org.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const setPasswordLink = `${APP_URL}/set-password?invite_token=${inviteToken}`;

      const newMember = await storage.addOrgMember({ orgId: org.id, userId: newUserId, email, memberName: fullName, role, invitedBy: ctx.userId, inviteSource: "self_service", inviteStatus: "pending" });
      await storage.setIndustryProfileOrg(newUserId, org.id);
      await sendTeamInviteEmail(email, fullName, org.name, org.planTier ?? "individual", setPasswordLink).catch((err) =>
        console.error("[email] Self-service invite email failed:", err)
      );

      res.json({ member: newMember, user: { id: newUserId, email: userData.user.email, fullName } });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      console.error("[org/members]", err?.message);
      sentryCaptureException(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/org/members/:userId â€” remove a member (owner only, cannot remove self)
  app.delete("/api/org/members/:memberId", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgOwner(req, res);
      if (!ctx) return;
      const { org, userId: callerId } = ctx;
      const memberId = req.params.memberId as string;
      if (memberId === callerId) {
        return res.status(400).json({ error: "You cannot remove yourself from the organization" });
      }
      // Validate target member belongs to this org before removal
      const targetMember = await storage.getOrgMemberByUserId(org.id, memberId);
      if (!targetMember) {
        return res.status(404).json({ error: "Member not found in your organization" });
      }
      // Block removal of the last owner â€” org would be permanently orphaned
      if (targetMember.role === "owner") {
        const allMembers = await storage.getOrgMembers(org.id);
        const ownerCount = allMembers.filter((m) => m.role === "owner").length;
        if (ownerCount <= 1) {
          return res.status(400).json({ error: "Cannot remove the only owner. Transfer ownership to another member first." });
        }
      }
      await storage.removeOrgMember(org.id, memberId);
      // Reassign the removed member's saved assets in org pipelines to org-owned (userId=null)
      // so they remain visible to the team rather than becoming orphaned.
      await db.execute(sql`
        UPDATE saved_assets sa
        SET user_id = NULL
        FROM pipeline_lists pl
        WHERE sa.pipeline_list_id = pl.id
          AND pl.org_id = ${org.id}
          AND sa.user_id = ${memberId}
      `);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/org/members/:userId/resend â€” resend invite email (admin or owner)
  app.post("/api/org/members/:memberId/resend", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgAdminOrOwner(req, res);
      if (!ctx) return;
      const { org } = ctx;
      const memberId = req.params.memberId as string;

      const members = await storage.getOrgMembers(org.id);
      const member = members.find((m) => m.userId === memberId);
      if (!member) return res.status(404).json({ error: "Member not found" });
      if (!member.email) return res.status(400).json({ error: "Member has no email on record" });

      const inviteToken = crypto.randomUUID();
      await storage.createInviteToken({ token: inviteToken, userId: member.userId, email: member.email, orgId: org.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const setPasswordLink = `${APP_URL}/set-password?invite_token=${inviteToken}`;

      await sendTeamInviteEmail(member.email, member.memberName ?? "", org.name, org.planTier ?? "individual", setPasswordLink).catch((err) =>
        console.error("[email] Resend self-service invite failed:", err)
      );

      res.json({ ok: true, email: member.email });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/org/members/:memberId/role â€” change a member's role (owner only)
  // Transferring ownership (role:"owner") automatically demotes the caller to "admin".
  app.patch("/api/org/members/:memberId/role", verifyAnyAuth, async (req, res) => {
    try {
      const ctx = await requireOrgOwner(req, res);
      if (!ctx) return;
      const { org, userId: callerId } = ctx;
      const memberId = req.params.memberId as string;
      const { role } = z.object({
        role: z.enum(["owner", "admin", "member", "viewer"]),
      }).parse(req.body);

      if (memberId === callerId) return res.status(400).json({ error: "Cannot change your own role this way" });

      const allMembers = await storage.getOrgMembers(org.id);
      const target = allMembers.find((m) => m.userId === memberId);
      if (!target) return res.status(404).json({ error: "Member not found" });

      // Guard: cannot demote last owner
      if (target.role === "owner" && role !== "owner") {
        const ownerCount = allMembers.filter((m) => m.role === "owner").length;
        if (ownerCount <= 1) return res.status(400).json({ error: "Cannot demote the only owner. Transfer ownership first." });
      }

      await storage.updateOrgMemberRole(org.id, memberId, role);

      // Transferring ownership â€” demote caller to admin
      if (role === "owner") {
        await storage.updateOrgMemberRole(org.id, callerId, "admin");
      }

      // Invalidate org cache
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: "Internal server error" });
    }
  });

}