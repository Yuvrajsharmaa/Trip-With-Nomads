"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { Plus, UserPlus, FileWarning, ExternalLink } from "lucide-react";
import { createManualLead, checkDuplicatePhone } from "@/lib/actions/crm-core";
import type { AssignableAgent } from "@/types/crm-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export function LeadQuickAdd({
  assignableUsers,
  isManager,
}: {
  assignableUsers: AssignableAgent[];
  isManager: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tripSlug, setTripSlug] = useState("");
  const [source, setSource] = useState("manual_entry");
  const [notes, setNotes] = useState("");
  const [assignToId, setAssignToId] = useState<string>("");

  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [duplicate, setDuplicate] = useState<null | {
    existing_lead_id: string;
    owner_name: string;
    owner_role: string | null;
    crm_status: string;
  }>(null);

  // Streaming validation on phone
  useEffect(() => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 5) {
      return;
    }

    const timer = setTimeout(() => {
      setIsCheckingPhone(true);
      checkDuplicatePhone(cleanPhone).then((res) => {
        setDuplicate(res);
        setIsCheckingPhone(false);
      });
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [phone]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setTripSlug("");
    setSource("manual_entry");
    setNotes("");
    setAssignToId("");
    setDuplicate(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) resetForm();
  };

  const handleCreate = () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Required fields missing", { description: "Name and phone are mandatory." });
      return;
    }

    if (duplicate && !isManager) {
      toast.error("Duplicate lead exists", { description: "You cannot create a duplicate lead." });
      return;
    }

    startTransition(async () => {
      try {
        const result = await createManualLead({
          name,
          phone,
          email: email || null,
          source,
          trip_slug: tripSlug || null,
          notes: notes || null,
          claimSelf: !isManager,
          assignToId: assignToId || null,
        });

        if (!result.success && result.duplicate) {
          toast.error("Duplicate detected", { description: result.message });
          return;
        }

        toast.success("Lead created", { description: `${name} has been added to your queue.` });
        setOpen(false);
        resetForm();
      } catch (err) {
        toast.error("Creation failed", { description: err instanceof Error ? err.message : "Network error" });
      }
    });
  };

  const handleReassignDuplicate = () => {
    if (!duplicate || !assignToId) {
      toast.error("Missing information", { description: "Please select an assignee." });
      return;
    }

    startTransition(async () => {
      try {
        const result = await createManualLead({
          name: name || "Duplicate",
          phone,
          reassignExistingToId: assignToId,
        });

        if (result.success && result.reassigned) {
          toast.success("Lead reassigned", { description: "The existing lead was transferred." });
          setOpen(false);
          resetForm();
        }
      } catch (err) {
        toast.error("Reassignment failed", { description: err instanceof Error ? err.message : "Network error" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 shadow-sm">
          <Plus className="size-3.5 mr-1.5" data-icon="inline-start" /> <span className="font-semibold text-[11px]">Add Lead</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden border-border bg-card">
        <DialogHeader className="p-6 pb-4 bg-muted/30">
          <DialogTitle className="text-lg flex items-center gap-2">
            <UserPlus className="size-5 text-foreground" data-icon="inline-start" />
            New Lead
          </DialogTitle>
          <DialogDescription className="text-muted-foreground font-medium">
            Enter phone number first to check for duplicates instantly.
          </DialogDescription>
        </DialogHeader>
        <Separator />

        <div className="p-6">
          <FieldGroup>
            {/* Top Row: Phone & Name */}
            <div className="grid md:grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="lead-phone" className="text-foreground font-bold uppercase tracking-widest text-[10px]">
                  Phone <span className="text-rose-500">*</span>
                </FieldLabel>
                <div className="relative">
                  <Input 
                    id="lead-phone" 
                    autoFocus
                    placeholder="+1 (555) 000-0000" 
                    value={phone} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setPhone(val);
                      if (val.replace(/[^0-9]/g, "").length < 5) {
                        setDuplicate(null);
                        setIsCheckingPhone(false);
                      }
                    }}
                    className="font-bold border-border bg-background focus:ring-1 focus:ring-primary rounded-xl"
                  />
                  {isCheckingPhone && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                      <div className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="lead-name" className="text-foreground font-bold uppercase tracking-widest text-[10px]">
                  Full Name <span className="text-rose-500">*</span>
                </FieldLabel>
                <Input 
                  id="lead-name" 
                  placeholder="E.g. Sarah Jenkins" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="font-bold border-border bg-background focus:ring-1 focus:ring-primary rounded-xl"
                />
              </Field>
            </div>

            {/* Duplicate Banner (Live Validation) */}
            {duplicate && (
              <Alert variant="destructive" className="bg-amber-500/10 border-amber-500/20 text-amber-600 animate-in slide-in-from-top-2 fade-in duration-300">
                <FileWarning className="size-4 text-amber-500 shrink-0" />
                <AlertTitle className="text-xs font-bold uppercase tracking-widest text-amber-600">Existing Lead Found</AlertTitle>
                <AlertDescription className="text-[11px] text-amber-600/80 font-medium pb-2">
                  This phone number belongs to a lead tracked by <strong className="text-amber-600">{duplicate.owner_name}</strong> (Status: {duplicate.crm_status}).
                </AlertDescription>
                <div className="flex items-center gap-2 mt-1">
                  <Button asChild size="sm" variant="outline" className="h-7 text-[10px] font-bold uppercase tracking-widest bg-card border-amber-500/20 text-amber-600 hover:bg-amber-500/10">
                    <Link href={`/dashboard/leads/${duplicate.existing_lead_id}`} onClick={() => setOpen(false)}>
                      <ExternalLink className="size-3 mr-1.5" data-icon="inline-start" /> View Profile
                    </Link>
                  </Button>
                  
                  {isManager && (
                    <Button 
                      size="sm" 
                      onClick={handleReassignDuplicate} 
                      disabled={isPending || !assignToId}
                      className="h-7 text-[10px] font-bold uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white shadow-none"
                    >
                      Force Reassign
                    </Button>
                  )}
                </div>
              </Alert>
            )}

            {/* Details Row */}
            <div className="grid md:grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="lead-email" className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Email</FieldLabel>
                <Input 
                  id="lead-email" 
                  type="email"
                  placeholder="Optional" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  className="font-medium border-border bg-background rounded-xl"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lead-trip" className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Trip Reference</FieldLabel>
                <Input 
                  id="lead-trip" 
                  placeholder="E.g. spiti-valley" 
                  value={tripSlug} 
                  onChange={(e) => setTripSlug(e.target.value)} 
                  className="font-medium border-border bg-background rounded-xl"
                />
              </Field>
            </div>

            {/* Manager Controls */}
            {isManager && (
              <div className="p-4 bg-muted/30 border border-border rounded-xl">
                <FieldGroup>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel className="text-foreground font-bold uppercase tracking-widest text-[10px]">Assign To</FieldLabel>
                      <Select value={assignToId || "unassigned"} onValueChange={(v) => setAssignToId(v === "unassigned" ? "" : v)}>
                        <SelectTrigger className="h-9 bg-card border-border rounded-lg text-xs font-bold">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="unassigned" className="text-xs font-bold">Unassigned</SelectItem>
                          {assignableUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id} className="text-xs font-bold">
                              {user.full_name} <span className="text-muted-foreground/60 capitalize inline-block ml-1 font-medium">· {user.role.replace(/_/g, " ")}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel className="text-foreground font-bold uppercase tracking-widest text-[10px]">Source</FieldLabel>
                      <Select value={source} onValueChange={setSource}>
                        <SelectTrigger className="h-9 bg-card border-border rounded-lg text-xs font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="manual_entry" className="text-xs font-bold">Manual Entry</SelectItem>
                          <SelectItem value="website_form" className="text-xs font-bold">Website Form</SelectItem>
                          <SelectItem value="instagram_manychat" className="text-xs font-bold">Instagram</SelectItem>
                          <SelectItem value="google_sheet_import" className="text-xs font-bold">Data Import</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </FieldGroup>
              </div>
            )}

            {/* Notes */}
            <Field>
              <FieldLabel htmlFor="lead-notes" className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Initial Context</FieldLabel>
              <Textarea
                id="lead-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Drop any context or history here..."
                className="resize-none min-h-[80px] border-border bg-background rounded-xl text-xs font-medium"
              />
            </Field>
          </FieldGroup>
        </div>

        <Separator />
        <div className="p-6 bg-muted/30 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" className="text-xs font-bold text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button 
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase text-[10px] tracking-widest px-6 h-10 rounded-xl"
            onClick={handleCreate} 
            disabled={isPending || (!isManager && duplicate !== null) || !name.trim() || !phone.trim()}
          >
            {isPending ? "Creating..." : "Create Lead"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
