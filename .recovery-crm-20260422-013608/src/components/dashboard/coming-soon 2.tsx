"use client";

import { Button } from "@/components/ui/button";
import { MoveLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ComingSoonProps {
  moduleName: string;
  description?: string;
  icon?: React.ReactNode;
}

export function ComingSoon({ 
  moduleName, 
  description = "This section is currently under development. You will receive an update as soon as it's ready for use.",
  icon = <Sparkles className="size-6 text-zinc-400" />
}: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-6 relative">
        <div className="size-16 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-center text-zinc-400">
          {icon}
        </div>
      </div>

      <div className="space-y-4 mb-10">
        <h1 className="text-3xl font-bold font-heading tracking-tight text-zinc-950 uppercase leading-none">
          {moduleName}
        </h1>
        <p className="text-zinc-500 font-sans max-w-sm mx-auto text-xs font-semibold leading-relaxed tracking-wide">
          {description}
        </p>
      </div>

      <Button asChild variant="outline" className="h-10 px-6 font-bold uppercase tracking-widest text-[10px] rounded-xl gap-2 border-zinc-200 hover:bg-zinc-50 transition-all text-zinc-600">
        <Link href="/dashboard">
          <MoveLeft className="size-3" />
          Back to Dashboard
        </Link>
      </Button>

      {/* Subtle background - very quiet */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(#f1f1f1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
    </div>
  );
}
