"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  PhoneIcon,
  MailIcon,
  GlobeIcon,
  MessageSquareIcon,
  Loader2Icon,
  ArrowUpRight,
  MoreVertical,
  Flag,
  Send,
  AlertTriangle,
  UserPlus,
  Calendar
} from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { 
  Field, 
  FieldGroup, 
  FieldLabel,
} from "@/components/ui/field";
import { 
  Alert, 
  AlertDescription, 
  AlertTitle 
} from "@/components/ui/alert";

import type { Lead } from "@/types/leads";
import { STATUS_CONFIG, PIPELINE_STATUSES, TERMINAL_STATUSES } from "@/types/leads";
import { getLeadNotes, addLeadNote } from "@/lib/actions/lead-notes";
import { 
  updateLeadStatus, 
  updateLeadFollowUp 
} from "@/lib/actions/leads";
import { assignLeadToAgent, requestEscalation, resolveEscalation } from "@/lib/actions/crm-core";
import type { LeadNote, NoteType } from "@/types/lead-notes";
import { NOTE_TYPE_LABELS, NOTE_TYPES } from "@/types/lead-notes";

interface LeadSideSheetProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentRole?: string;
}

export function LeadSideSheet({
  lead,
  open,
  onOpenChange,
  currentUserId,
  currentRole = "sales_agent",
}: LeadSideSheetProps) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [optimisticNotes, setOptimisticNotes] = useState<LeadNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [selectedNoteType, setSelectedNoteType] = useState<NoteType | "escalate">("general_note");
  
  const [isPending, startTransition] = useTransition();
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [isNotesPending, startNotesTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !lead) return;

    startNotesTransition(async () => {
      try {
        const fetched = await getLeadNotes(lead.id);
        setNotes(fetched);
        setOptimisticNotes([]);
        const followUpNotes = fetched.filter((entry) => entry.note_type.startsWith("follow_up_"));
        if (followUpNotes.length < 5) {
          setSelectedNoteType(`follow_up_${followUpNotes.length + 1}` as NoteType);
        } else {
          setSelectedNoteType("general_note");
        }
      } catch {
        toast.error("Failed to load notes");
      }
    });
  }, [open, lead, startNotesTransition]);

  // Scroll to bottom when notes update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes, optimisticNotes]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setNotes([]);
      setOptimisticNotes([]);
      setNewNoteContent("");
      setSelectedNoteType("general_note");
    }
  };

  if (!lead) return null;

  const conf = STATUS_CONFIG[lead.crm_status] || STATUS_CONFIG.new;
  const isMyLead = lead.allotted_to === currentUserId;
  const isUnassigned = !lead.allotted_to;
  const isManager = ["admin", "operations_manager", "sales_manager", "finance_manager"].includes(currentRole);
  const canChangeStatus = isManager || isMyLead;

  const handleComposerSubmit = () => {
    if (!newNoteContent.trim()) return;

    if (selectedNoteType === "escalate") {
      startStatusTransition(async () => {
        try {
          await requestEscalation({ leadId: lead.id, reason: newNoteContent.trim() });
          setNewNoteContent("");
          setSelectedNoteType("general_note");
          toast.success("Lead escalated successfully");
          // Re-fetch notes
          const fetched = await getLeadNotes(lead.id);
          setNotes(fetched);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to escalate");
        }
      });
      return;
    }

    startTransition(async () => {
      // Optimistic UI for note submission
      const tempId = `temp-${Date.now()}`;
      const tempNote = {
        id: tempId,
        lead_id: lead.id,
        agent_id: currentUserId,
        note_type: selectedNoteType as NoteType,
        content: newNoteContent,
        logged_at: new Date().toISOString(),
        agent_name: "You (sending...)",
      } as LeadNote;
      
      setOptimisticNotes(prev => [...prev, tempNote]);
      const contentToSubmit = newNoteContent;
      setNewNoteContent(""); // Clear immediately for feel

      try {
        await addLeadNote({
          leadId: lead.id,
          noteType: selectedNoteType as NoteType,
          content: contentToSubmit,
        });

        const updatedNotes = await getLeadNotes(lead.id);
        setNotes(updatedNotes);
        setOptimisticNotes([]);
      } catch (err) {
        toast.error("Failed to save note");
        setOptimisticNotes([]);
        setNewNoteContent(contentToSubmit); // Restore on fail
      }
    });
  };

  const handleStatusChange = (newStatus: string) => {
    startStatusTransition(async () => {
      try {
        await updateLeadStatus(lead.id, newStatus);
        toast.success("Pipeline status updated");
      } catch {
        toast.error("Failed to update status");
      }
    });
  };

  const handleFollowUpChange = (date: string | null) => {
    startStatusTransition(async () => {
      try {
        await updateLeadFollowUp(lead.id, date);
        toast.success(date ? "Follow-up scheduled" : "Follow-up cleared");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update follow-up");
      }
    });
  };

  const handleClaimLead = () => {
    startStatusTransition(async () => {
      try {
        await assignLeadToAgent({ leadId: lead.id, agentId: currentUserId });
        toast.success("Lead claimed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Claim failed");
      }
    });
  };

  const handleResolveEscalation = () => {
    startStatusTransition(async () => {
      try {
        await resolveEscalation({ leadId: lead.id, note: "Escalation resolved via side sheet" });
        toast.success("Escalation resolved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Resolution failed");
      }
    });
  };

  // Semantic color mapper for timeline tags
  const getNoteTagColor = (type: string) => {
    if (type.includes("escalation")) return "bg-rose-500/10 text-rose-500 border-rose-500/20";
    if (type.includes("follow_up")) return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    if (type.includes("whatsapp")) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    if (type.includes("email")) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    return "bg-muted text-muted-foreground border-border";
  };

  const displayNotes = [...notes, ...optimisticNotes];

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-md w-full p-0 flex flex-col h-full bg-muted/30 border-l border-border sm:border-l-0 overflow-hidden outline-none shadow-2xl">
        {/* Header Compact */}
        <div className="bg-card border-b border-border px-5 py-4 flex-shrink-0 relative z-10 shadow-sm">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-xl font-bold text-foreground tracking-tight truncate pb-1">
                {lead.name || "Unknown Lead"}
              </SheetTitle>
              <SheetDescription className="text-xs font-medium text-muted-foreground truncate flex items-center gap-2">
                <Badge variant="secondary" className={`${conf.bg} ${conf.text} ${conf.border} bg-opacity-30 hover:bg-opacity-40 uppercase tracking-widest text-[9px] px-2 py-0 border-none`}>
                  {conf.label}
                </Badge>
                {lead.source || "Website"}
              </SheetDescription>
            </div>
            
            {/* Header Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/leads/${lead.id}`} className="cursor-pointer">
                    <ArrowUpRight className="size-4 mr-2" /> Open Profile
                  </Link>
                </DropdownMenuItem>
                
                {(!isMyLead && isUnassigned) && (
                  <DropdownMenuItem onClick={handleClaimLead} className="cursor-pointer text-primary focus:text-primary focus:bg-primary/10">
                    <UserPlus className="size-4 mr-2" /> Claim Lead
                  </DropdownMenuItem>
                )}
                
                {(isMyLead && !isManager) && (
                  <DropdownMenuItem onClick={() => setSelectedNoteType("escalate")} className="cursor-pointer text-rose-600 focus:text-rose-600">
                    <AlertTriangle className="size-4 mr-2" /> Escalate to Manager
                  </DropdownMenuItem>
                )}
                
                {(lead.escalated_at && isManager) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleResolveEscalation} className="cursor-pointer text-emerald-600 focus:text-emerald-600">
                      <Flag className="size-4 mr-2" /> Resolve Escalation
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <FieldGroup className="gap-3 mt-4">
            <Field>
              <FieldLabel className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest px-1">Next Follow-up</FieldLabel>
              <div className="relative group">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
                <Input 
                  type="datetime-local"
                  defaultValue={lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toISOString().slice(0, 16) : ""}
                  onChange={(e) => handleFollowUpChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className="h-9 pl-9 rounded-xl bg-muted/30 border-border text-[11px] font-bold ring-primary/20"
                />
              </div>
            </Field>

            <Field>
              <FieldLabel className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest px-1">Pipeline State</FieldLabel>
              <Select disabled={isUpdatingStatus || !canChangeStatus} value={lead.crm_status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-full h-9 text-[11px] font-bold rounded-xl border-border bg-muted/30 px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border rounded-xl shadow-2xl">
                  <div className="px-2 py-1.5 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pipeline</div>
                  {PIPELINE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className="text-xs font-semibold py-2">
                      {STATUS_CONFIG[status].label}
                    </SelectItem>
                  ))}
                  <Separator className="my-2 border-border" />
                  <div className="px-2 py-1.5 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Terminal</div>
                  {TERMINAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className="text-xs font-semibold py-2">
                      {STATUS_CONFIG[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>

        {/* Scrollable Timeline */}
        <ScrollArea className="flex-1 px-5 py-4">
          <div ref={scrollRef} className="space-y-4 pb-4">
            {/* Contact At a Glance */}
            <FieldGroup className="grid grid-cols-2 gap-2 text-xs">
              <Field className="p-3 bg-card rounded-lg border border-border shadow-sm flex flex-col gap-1">
                <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Email</span>
                <span className="font-medium text-foreground truncate"><MailIcon className="size-3 inline mr-1 text-muted-foreground/60"/> {lead.email || "—"}</span>
              </Field>
              <Field className="p-3 bg-card rounded-lg border border-border shadow-sm flex flex-col gap-1">
                <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Phone</span>
                <span className="font-medium text-foreground truncate"><PhoneIcon className="size-3 inline mr-1 text-muted-foreground/60"/> {lead.phone || "—"}</span>
              </Field>
              {lead.trip_slug && (
                <Field className="col-span-2 p-3 bg-card rounded-lg border border-border shadow-sm flex flex-col gap-1">
                  <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Trip Reference</span>
                  <span className="font-medium text-foreground truncate"><GlobeIcon className="size-3 inline mr-1 text-muted-foreground/60"/> {lead.trip_slug.replace(/-/g, " ")}</span>
                </Field>
              )}
            </FieldGroup>

            <Separator className="my-4 opacity-50" />

            <div className="space-y-4">
              <h4 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground flex items-center">
                History Timeline
              </h4>

              <div className="relative pl-5 border-l-2 border-border/50 space-y-5">
                {isNotesPending ? (
                  <div className="flex items-center text-xs font-semibold text-muted-foreground/40 animate-pulse">
                    Loading records...
                  </div>
                ) : displayNotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-medium italic">No interaction history yet.</p>
                ) : (
                  displayNotes.map((note) => (
                    <div key={note.id} className="relative group/note animate-in fade-in slide-in-from-bottom-2 duration-300">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ring-1 ring-border ${
                        note.id.startsWith("temp") ? "bg-muted-foreground/30" : "bg-primary"
                      }`} />
                      
                      <div className="bg-card p-3 rounded-lg border border-border shadow-sm group-hover/note:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2.5 gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border ${getNoteTagColor(note.note_type)}`}>
                              {NOTE_TYPE_LABELS[note.note_type] || "Note"}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                            {format(new Date(note.logged_at), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className={`text-xs whitespace-pre-wrap leading-relaxed ${note.id.startsWith("temp") ? "text-muted-foreground" : "text-foreground/80"}`}>
                          {note.content}
                        </p>
                        <div className="mt-2 text-[10px] text-muted-foreground/50 font-medium border-t border-border/10 pt-2">
                          by <span className="text-foreground/60">{note.agent_name}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Pinned Composer */}
        <div className="bg-card border-t border-border p-4 shrink-0 transition-all duration-300 z-10 relative shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
          <FieldGroup>
            <div className="flex items-center justify-between mb-2">
              <Field>
                <Select
                  value={selectedNoteType}
                  onValueChange={(value) => setSelectedNoteType(value as NoteType | "escalate")}
                  disabled={isPending || (!isMyLead && !isManager)}
                >
                  <SelectTrigger className="w-auto h-7 text-[11px] font-semibold bg-muted/50 border-border pl-3 pr-2 focus:ring-1 focus:ring-primary transition-colors">
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent align="start" className="bg-card border-border">
                    {selectedNoteType === "escalate" && (
                      <SelectItem value="escalate" className="text-xs text-rose-600 font-semibold focus:text-rose-700 focus:bg-rose-500/10">
                        <AlertTriangle className="size-3 inline-block mr-1.5 align-text-bottom text-current"/> Submit Escalation
                      </SelectItem>
                    )}
                    <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Log Interaction</div>
                    {NOTE_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs font-medium">
                        {NOTE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                {selectedNoteType === "escalate" ? "Manager Review Required" : "Timeline Entry"}
              </span>
            </div>

            <Field className="relative">
              <Textarea
                placeholder={selectedNoteType === "escalate" ? "Why does this need to be escalated?" : "Type notes from the interaction..."}
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleComposerSubmit();
                  }
                }}
                className={`min-h-[44px] pb-10 text-sm bg-card resize-none border-border focus-visible:ring-1 transition-all ${
                  selectedNoteType === "escalate" ? "focus-visible:ring-rose-400 border-rose-500/20 bg-rose-500/5" : "focus-visible:ring-primary"
                }`}
                disabled={isPending || (!isMyLead && !isManager)}
              />
              <div className="absolute right-2 bottom-2">
                <Button
                  size="icon"
                  onClick={handleComposerSubmit}
                  disabled={isPending || !newNoteContent.trim() || (!isMyLead && !isManager)}
                  className={`size-7 rounded-sm ${selectedNoteType === "escalate" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary hover:bg-primary/90"}`}
                >
                  {isPending || isUpdatingStatus ? <Loader2Icon className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                </Button>
              </div>
            </Field>
          </FieldGroup>
          <div className="text-[9px] text-muted-foreground text-center font-medium mt-2">
            Press <kbd className="font-mono bg-muted rounded px-1 py-0.5 border border-border">Enter</kbd> to submit
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
