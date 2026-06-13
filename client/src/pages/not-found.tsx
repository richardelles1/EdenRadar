import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Compass className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We couldn't find the page you were looking for. It may have moved, or the link may be out of date.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/">
              <Button variant="outline" className="gap-2" data-testid="button-404-home">
                <ArrowLeft className="h-4 w-4" /> Back to home
              </Button>
            </Link>
            <Link href="/scout">
              <Button className="gap-2" data-testid="button-404-scout">
                <Compass className="h-4 w-4" /> Go to Scout
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
