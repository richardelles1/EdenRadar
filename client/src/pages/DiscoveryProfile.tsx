import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { UserCircle, Mail, Lightbulb } from "lucide-react";
import { Link } from "wouter";

export default function DiscoveryProfile() {
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-profile-title">
            Profile
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">
          Your EdenDiscovery account details.
        </p>
      </div>

      <div className="border border-border rounded-xl bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <UserCircle className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <p className="font-semibold text-foreground" data-testid="text-profile-role">Concept Discoverer</p>
            <p className="text-xs text-muted-foreground">EdenDiscovery Member</p>
          </div>
        </div>

        {user && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0" />
              <span data-testid="text-profile-email">{user.email ?? "No email on file"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lightbulb className="w-4 h-4 shrink-0 text-amber-500" />
              <span>Concept submitter</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/discovery/my-concepts">
          <Button variant="outline" data-testid="button-profile-my-concepts">
            View My Concepts
          </Button>
        </Link>
        <Button
          variant="ghost"
          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
          onClick={handleSignOut}
          data-testid="button-profile-sign-out"
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
