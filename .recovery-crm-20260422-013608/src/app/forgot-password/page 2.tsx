"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Command, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;

    startTransition(async () => {
      // For now, this is a placeholder since we don't have the action yet
      toast.success("Reset link sent!", {
        description: `If an account exists for ${email}, you will receive reset instructions shortly.`
      });
    });
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-zinc-50 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-3 self-center font-bold uppercase tracking-widest text-[11px]">
          <div className="flex size-8 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-lg">
            <Command className="size-4" />
          </div>
          TWN Workspace
        </div>
        
        <Card className="border-zinc-200/60 shadow-none">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-bold tracking-tight">Forgot Password</CardTitle>
            <CardDescription className="text-xs font-medium text-zinc-400">
              Enter your email to receive a reset link
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider pl-0.5">Work Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  className="h-10 border-zinc-200 shadow-none focus-visible:ring-0"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-zinc-950 text-white hover:bg-zinc-800 h-10 font-bold uppercase text-[10px] tracking-widest transition-all"
                disabled={isPending}
              >
                {isPending ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <Link 
                href="/login" 
                className="inline-flex items-center gap-2 text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <ArrowLeft className="size-3" />
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
