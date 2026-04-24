"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle, Save, UserCheck, ArrowUpRight, CalendarClock,
  Pencil, Trash2, Check, X, ChevronDown
} from "lucide-react";
import Link from "next/link";
import type { Lead } from "@/types/leads";
import type { NoteType, LeadNote } from "@/types/lead-notes";
import type { AssignableAgent } from "@/types/crm-core";
import { NOTE_TYPE_LABELS, NOTE_TYPES } from "@/types/lead-notes";
import { STATUS_CONFIG, LEAD_STATUSES } from "@/types/leads";
import {
  assignLeadToAgent, requestEscalation, resolveEscalation, updateLeadDetails,
} from "@/lib/actions/crm-core";
import { addLeadNote, getLeadNotes, updateLeadNote, deleteLeadNote } from "@/lib/actions/lead-notes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function managerRole(role: string) {
  return ["admin", "operations_manager", "sales_manager", "finance_manager"].includes(role);
}

// ─── Follow-up Date Picker ─────────────────────────────────────────────────────
function FollowUpPicker({
  value,
  onChange,
  disabled,
}: {
  value: string; // ISO string slice (YYYY-MM-DDTHH:mm)
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const selectedDate = value ? new Date(value) : undefined;
  const [open, setOpen] = useState(false);
  const [timeStr, setTimeStr] = useState(value ? value.slice(11, 16) : "10:00");

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const dateStr = format(day, "yyyy-MM-dd");
    onChange(`${dateStr}T${timeStr}`);
    setOpen(false);
  };

  const handleTimeChange = (t: string) => {
    setTimeStr(t);
    if (selectedDate) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      onChange(`${dateStr}T${t}`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-medium text-xs h-9 border-border bg-background shadow-none rounded-xl",
            !selectedDate && "text-muted-foreground"
          )}
        >
          <CalendarClock className="size-3.5 mr-2 shrink-0 text-muted-foreground" />
          {selectedDate ? format(selectedDate, "dd MMM yyyy 'at' HH:mm") : "Pick a date & time"}
          <ChevronDown className="size-3 ml-auto text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDaySelect}
          initialFocus
          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
        />
        <div className="border-t border-border px-4 py-3 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Time</span>
          <Input
            type="time"
            value={timeStr}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="h-7 border-border text-xs w-28 font-medium"
          />
          {selectedDate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] font-bold ml-auto text-muted-foreground"
              onClick={() => { onChange(""); setOpen(false); }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Follow-up Quick Prompt ────────────────────────────────────────────────────
function FollowUpPrompt({
  leadId,
  onScheduled,
  onDismiss,
}: {
  leadId: string;
  onScheduled: (iso: string) => void;
  onDismiss: () => void;
}) {
  const [isSaving, startSave] = useTransition();

  const scheduleFor = (date: Date) => {
    const iso = date.toISOString();
    startSave(async () => {
      try {
        await updateLeadDetails({ leadId, updates: { next_follow_up_at: iso } });
        onScheduled(iso);
        toast.success("Follow-up scheduled");
      } catch {
        toast.error("Failed to schedule follow-up");
      }
    });
  };

  const today = new Date();
  const quickOptions = [
    { label: "Today 6pm", date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18) },
    { label: "Tomorrow 10am", date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 10) },
    { label: "+3 Days", date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 10) },
  ];

  return (
    <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          Schedule a follow-up for this lead?
        </p>
        <button onClick={onDismiss} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-medium">
          No thanks
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {quickOptions.map((opt) => (
          <Button key={opt.label} size="sm" variant="outline" disabled={isSaving}
            className="h-7 text-[11px] font-bold border-amber-300/60 hover:bg-amber-100/60 dark:border-amber-800 dark:hover:bg-amber-900/30 text-amber-800 dark:text-amber-400"
            onClick={() => scheduleFor(opt.date)}>
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─── Inline Note Editor ────────────────────────────────────────────────────────
function NoteCard({
  note,
  currentUserId,
  isManager,
  onUpdated,
  onDeleted,
}: {
  note: LeadNote;
  currentUserId: string;
  isManager: boolean;
  onUpdated: (id: string, content: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [isSaving, startSave] = useTransition();
  const canEdit = isManager || note.agent_id === currentUserId;

  const handleSave = () => {
    if (!editContent?.trim()) { toast.error("Note cannot be empty"); return; }
    startSave(async () => {
      try {
        await updateLeadNote({ noteId: note.id, content: editContent, leadId: note.lead_id });
        onUpdated(note.id, editContent);
        setEditing(false);
        toast.success("Note updated");
      } catch {
        toast.error("Failed to update note");
      }
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this note?")) return;
    startSave(async () => {
      try {
        await deleteLeadNote({ noteId: note.id, leadId: note.lead_id });
        onDeleted(note.id);
        toast.success("Note deleted");
      } catch {
        toast.error("Failed to delete note");
      }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
            {NOTE_TYPE_LABELS[note.note_type]}
          </span>
          <span className="text-[10px] text-muted-foreground/50 font-bold lowercase">
            {formatDistanceToNow(new Date(note.logged_at), { addSuffix: true })}
          </span>
        </div>
        {canEdit && !editing && (
          <div className="flex gap-1 opacity-0 hover:opacity-100 group-hover:opacity-100 [.group:hover_&]:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
              <Pencil className="size-3" />
            </button>
            <button onClick={handleDelete} className="text-muted-foreground hover:text-rose-500 transition-colors p-0.5">
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent ?? ""}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[70px] border-border bg-background text-xs font-medium rounded-lg focus-visible:ring-1 focus-visible:ring-primary"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button size="sm" disabled={isSaving}
              className="h-7 text-[10px] font-bold px-3 bg-primary text-primary-foreground"
              onClick={handleSave}>
              <Check className="size-3 mr-1" /> Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => { setEditing(false); setEditContent(note.content); }}>
              <X className="size-3 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-foreground font-medium leading-relaxed whitespace-pre-wrap">{note.content}</p>
      )}
      <p className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest">— {note.agent_name || "Agent"}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function LeadProfileEditor({
  lead,
  currentUserId,
  currentRole,
  assignableUsers,
}: {
  lead: Lead;
  currentUserId: string;
  currentRole: string;
  assignableUsers: AssignableAgent[];
}) {
  const [isSaving, startSave] = useTransition();
  const [isNoteSaving, startNoteSave] = useTransition();
  const [isAssigning, startAssigning] = useTransition();

  // Core fields
  const [name, setName] = useState(lead.name || "");
  const [phone, setPhone] = useState(lead.phone || "");
  const [email, setEmail] = useState(lead.email || "");
  const [tripSlug, setTripSlug] = useState(lead.trip_slug || "");
  const [source, setSource] = useState(lead.source || "manual_entry");
  const [crmStatus, setCrmStatus] = useState(lead.crm_status);
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toISOString().slice(0, 16) : ""
  );
  const [leadType, setLeadType] = useState<string>(lead.lead_type || "");
  const [dropReason, setDropReason] = useState(lead.drop_reason || "");

  // Reassign
  const [escalationReason, setEscalationReason] = useState("");
  const [selectedOwner, setSelectedOwner] = useState<string>(lead.allotted_to || "");

  // Notes
  const [noteType, setNoteType] = useState<NoteType>("general_note");
  const [noteContent, setNoteContent] = useState("");
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [showFollowUpPrompt, setShowFollowUpPrompt] = useState(false);

  const isManager = managerRole(currentRole);
  const isOwner = lead.allotted_to === currentUserId;
  const canEdit = isManager || isOwner;
  const statusConfig = STATUS_CONFIG[crmStatus] || STATUS_CONFIG.new;

  const ownershipHint = useMemo(() => {
    if (!lead.allotted_to) return "Unassigned";
    return lead.owner_name || "Assigned";
  }, [lead.allotted_to, lead.owner_name]);

  useEffect(() => {
    getLeadNotes(lead.id).then(setNotes).catch(() => setNotes([]));
  }, [lead.id]);

  const handleSave = () => {
    startSave(async () => {
      try {
        await updateLeadDetails({
          leadId: lead.id,
          updates: {
            name, phone, email,
            trip_slug: tripSlug,
            source, crm_status: crmStatus,
            next_follow_up_at: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
            lead_type: leadType || null,
            trip_type: (leadType as "domestic" | "international") || null,
            drop_reason: dropReason || null,
          },
        });
        toast.success("Lead updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    });
  };

  const handleAssign = () => {
    if (!selectedOwner) { toast.error("Select an owner"); return; }
    startAssigning(async () => {
      try {
        await assignLeadToAgent({ leadId: lead.id, agentId: selectedOwner });
        toast.success("Lead assigned");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to assign");
      }
    });
  };

  const handleEscalate = () => {
    if (!escalationReason.trim()) { toast.error("Escalation reason is required"); return; }
    startAssigning(async () => {
      try {
        await requestEscalation({ leadId: lead.id, reason: escalationReason });
        setEscalationReason("");
        toast.success("Escalation sent to manager");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to escalate");
      }
    });
  };

  const handleResolve = () => {
    startAssigning(async () => {
      try {
        await resolveEscalation({ leadId: lead.id, note: "Resolved from lead profile" });
        toast.success("Escalation resolved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to resolve");
      }
    });
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) { toast.error("Note cannot be empty"); return; }
    startNoteSave(async () => {
      try {
        await addLeadNote({ leadId: lead.id, noteType, content: noteContent });
        const items = await getLeadNotes(lead.id);
        setNotes(items);
        setNoteContent("");
        toast.success("Note added");
        setShowFollowUpPrompt(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add note");
      }
    });
  };

  const handleNoteUpdated = (id: string, content: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
  };

  const handleNoteDeleted = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="p-6 md:p-8 space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{lead.name || "Customer Profile"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-medium">
            {lead.source?.replace(/_/g, " ")} · {lead.trip_slug || "No trip"} · {statusConfig.label}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 border-border text-muted-foreground hover:text-foreground">
          <Link href="/dashboard/leads"><ArrowUpRight className="size-3.5 mr-1" /> Back to Leads</Link>
        </Button>
      </div>

      <div className="grid xl:grid-cols-[1.7fr_1fr] gap-4">
        {/* ── Core Info ── */}
        <Card className="border-border shadow-none bg-card overflow-hidden">
          <CardHeader className="pb-3 bg-muted/20">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-between">
              Core Information
              <Badge className={cn(statusConfig.bg, statusConfig.text, "border", statusConfig.border, "font-bold text-[9px] px-2 py-0 uppercase")}>
                {statusConfig.label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">
            <FieldGroup>
              <div className="grid md:grid-cols-2 gap-4">
                {/* Name — managers only */}
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
                    Name {!isManager && <span className="ml-1 normal-case text-muted-foreground/40 font-medium">(manager only)</span>}
                  </FieldLabel>
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isManager} className="border-border bg-background shadow-none focus-visible:ring-1 focus-visible:ring-primary font-bold rounded-xl" />
                </Field>
                {/* Phone — managers only */}
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
                    Phone {!isManager && <span className="ml-1 normal-case text-muted-foreground/40 font-medium">(manager only)</span>}
                  </FieldLabel>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!isManager} className="border-border bg-background shadow-none focus-visible:ring-1 focus-visible:ring-primary font-bold rounded-xl" />
                </Field>
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Email</FieldLabel>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} className="border-border bg-background shadow-none focus-visible:ring-1 focus-visible:ring-primary font-medium rounded-xl" />
                </Field>
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Source</FieldLabel>
                  <Input value={source} onChange={(e) => setSource(e.target.value)} disabled={!canEdit} className="border-border bg-background shadow-none focus-visible:ring-1 focus-visible:ring-primary font-medium rounded-xl h-9" />
                </Field>
                {/* Trip — editable by any assigned agent */}
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Trip / Destination</FieldLabel>
                  <Input value={tripSlug} onChange={(e) => setTripSlug(e.target.value)} disabled={!canEdit} placeholder="e.g. ladakh-2025" className="border-border bg-background shadow-none focus-visible:ring-1 focus-visible:ring-primary font-medium rounded-xl h-9" />
                </Field>
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Travel Category</FieldLabel>
                  <Select value={leadType || "none"} onValueChange={(val) => setLeadType(val === "none" ? "" : val)} disabled={!canEdit}>
                    <SelectTrigger className="border-border bg-background shadow-none text-xs font-bold rounded-xl h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card shadow-lg">
                      <SelectItem value="none" className="text-xs font-bold">None</SelectItem>
                      <SelectItem value="domestic" className="text-xs font-bold">Domestic</SelectItem>
                      <SelectItem value="international" className="text-xs font-bold">International</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Pipeline Status</FieldLabel>
                  <Select value={crmStatus} onValueChange={(val) => setCrmStatus(val as Lead["crm_status"])} disabled={!canEdit}>
                    <SelectTrigger className="border-border bg-background shadow-none text-xs font-bold rounded-xl h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card shadow-lg">
                      {LEAD_STATUSES.map((status) => (
                        <SelectItem key={status} value={status} className="text-xs font-bold">
                          {STATUS_CONFIG[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {/* Follow-up — Shadcn Calendar */}
                <Field>
                  <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Scheduled Callback</FieldLabel>
                  <FollowUpPicker value={nextFollowUpAt} onChange={setNextFollowUpAt} disabled={!canEdit} />
                </Field>
              </div>

              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Dropout Notes</FieldLabel>
                <Textarea value={dropReason} onChange={(e) => setDropReason(e.target.value)} disabled={!canEdit} className="min-h-[80px] border-border bg-background rounded-xl text-xs font-medium" />
              </Field>

              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase text-[10px] tracking-widest h-10 px-6 rounded-xl w-fit" onClick={handleSave} disabled={isSaving || !canEdit}>
                <Save className="size-3.5 mr-1" /> {isSaving ? "Saving..." : "Save changes"}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {/* Assignment / Reassign */}
          <Card className="border-border shadow-none bg-card overflow-hidden">
            <CardHeader className="pb-3 bg-muted/20">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {isManager ? "Assign / Reassign" : "Assignment"}
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Current Owner</span>
                <span className="text-xs font-bold text-foreground">{ownershipHint}</span>
              </div>

              {/* Managers (incl. admins) can always reassign */}
              {isManager && (
                <FieldGroup className="gap-2">
                  <Select value={selectedOwner || "unassigned"} onValueChange={(val) => setSelectedOwner(val === "unassigned" ? "" : val)}>
                    <SelectTrigger className="h-9 border-border bg-background shadow-none text-xs font-bold rounded-lg">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card shadow-lg">
                      <SelectItem value="unassigned" className="text-xs font-bold">Unassigned</SelectItem>
                      {assignableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id} className="text-xs font-bold">
                          {user.full_name} <span className="text-muted-foreground">· {user.role.replace(/_/g, " ")}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-9 w-full border-border hover:bg-muted font-bold text-[10px] tracking-widest uppercase shadow-none rounded-lg" onClick={handleAssign} disabled={isAssigning}>
                    <UserCheck className="size-3.5 mr-1" /> {lead.allotted_to ? "Reassign" : "Assign"}
                  </Button>
                  {lead.escalated_at && (
                    <Button size="sm" variant="outline" className="h-9 w-full border-rose-300/50 hover:bg-rose-500/10 hover:text-rose-600 font-bold text-[10px] uppercase shadow-none rounded-lg" onClick={handleResolve} disabled={isAssigning}>
                      Resolve Escalation
                    </Button>
                  )}
                </FieldGroup>
              )}

              {/* Agents: claim or escalate */}
              {!isManager && (
                <FieldGroup className="gap-2">
                  {!lead.allotted_to && (
                    <Button size="sm" variant="outline" onClick={handleAssign} disabled={isAssigning} className="h-9 w-full border-border hover:bg-muted font-bold text-[10px] uppercase tracking-widest shadow-none rounded-lg">
                      Claim this lead
                    </Button>
                  )}
                  {isOwner && (
                    <>
                      <Textarea value={escalationReason} onChange={(e) => setEscalationReason(e.target.value)} placeholder="Reason for escalation..." className="min-h-[70px] border-border bg-background text-xs font-medium rounded-lg" />
                      <Button size="sm" variant="outline" onClick={handleEscalate} disabled={isAssigning} className="h-9 w-full border-border hover:bg-rose-500/10 hover:text-rose-600 font-bold text-[10px] uppercase shadow-none rounded-lg">
                        <AlertTriangle className="size-3.5 mr-1" /> Escalate to manager
                      </Button>
                    </>
                  )}
                </FieldGroup>
              )}

              {lead.escalated_at && (
                <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-600 py-1.5 px-2.5">
                  <AlertTitle className="text-[10px] font-bold uppercase tracking-widest">Escalated</AlertTitle>
                  <AlertDescription className="text-[10px] font-medium">
                    {formatDistanceToNow(new Date(lead.escalated_at), { addSuffix: true })}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Activity Logs / Notes */}
          <Card className="border-border shadow-none bg-card overflow-hidden">
            <CardHeader className="pb-3 bg-muted/20">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Activity Logs</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-4 pt-4">
              <FieldGroup>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Select value={noteType} onValueChange={(val) => setNoteType(val as NoteType)}>
                    <SelectTrigger className="h-9 border-border bg-background shadow-none text-xs font-bold rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card shadow-lg">
                      {NOTE_TYPES.map((type) => (
                        <SelectItem key={type} value={type} className="text-xs font-bold">{NOTE_TYPE_LABELS[type]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-[10px] uppercase rounded-lg px-4" onClick={handleAddNote} disabled={isNoteSaving}>
                    {isNoteSaving ? "Saving..." : "Add note"}
                  </Button>
                </div>
                <Textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Document the latest interaction, objections, or next steps..."
                  className="min-h-[90px] border-border bg-background shadow-none focus-visible:ring-1 focus-visible:ring-primary text-xs leading-relaxed font-medium rounded-lg"
                />
                {showFollowUpPrompt && canEdit && (
                  <FollowUpPrompt
                    leadId={lead.id}
                    onScheduled={(iso) => { setNextFollowUpAt(new Date(iso).toISOString().slice(0, 16)); setShowFollowUpPrompt(false); }}
                    onDismiss={() => setShowFollowUpPrompt(false)}
                  />
                )}
              </FieldGroup>

              <div className="space-y-3 max-h-[320px] overflow-auto pr-1 group">
                {notes.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic text-center py-4">No notes yet.</p>
                ) : (
                  notes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      currentUserId={currentUserId}
                      isManager={isManager}
                      onUpdated={handleNoteUpdated}
                      onDeleted={handleNoteDeleted}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
