"use client";

import { useTransition, useState } from "react";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signInWithEmail, signInWithGoogle } from "@/lib/actions/auth"
import { toast } from "sonner";
import { Command } from "lucide-react";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, startGoogleTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await signInWithEmail(formData);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Authentication failed");
      }
    });
  };

  const handleGoogleSignIn = () => {
    startGoogleTransition(async () => {
      try {
        await signInWithGoogle();
      } catch (error) {
        toast.error("Google sign-in failed");
      }
    });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border shadow-none bg-card">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">Welcome back</CardTitle>
          <CardDescription className="text-xs font-medium text-muted-foreground">
            Login to your Trip With Nomads agent portal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="grid gap-2">
            <Button 
              variant="outline" 
              type="button" 
              className="h-10 border-border shadow-none font-bold text-[10px] uppercase tracking-widest gap-2 hover:bg-muted text-foreground"
              onClick={handleGoogleSignIn}
              disabled={isGooglePending}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              {isGooglePending ? "Connecting..." : "Continue with Google"}
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-card px-2 text-muted-foreground font-semibold tracking-widest">Or continue with email</span>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest pl-0.5">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="m@example.com"
                required
                className="h-10 border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center">
                <Label htmlFor="password" className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest pl-0.5">Password</Label>
                <a
                  href="/forgot-password"
                  className="ml-auto text-[10px] uppercase font-bold text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Forgot password?
                </a>
              </div>
              <Input 
                id="password" 
                name="password" 
                type="password" 
                required 
                className="h-10 border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 font-bold uppercase text-[10px] tracking-widest transition-all rounded-xl"
              disabled={isPending}
            >
              {isPending ? "Authenticating..." : "Sign In to Workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="px-6 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        By continuing, you agree to the CRM access protocols.
      </p>
    </div>
  )
}
