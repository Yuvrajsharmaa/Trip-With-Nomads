"use client";

import { useState, useTransition, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { format, isToday, isYesterday, isSameDay, isPast } from "date-fns";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  ArrowLeft,
  MoreHorizontal,
  UserPlus,
  AlertTriangle,
  Flag,
  Send,
  Loader2,
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  Pencil,
  Copy,
  CheckCheck,
  ChevronDown,
  User,
  Zap,
  Trash2,
  CalendarCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { Lead } from "@/types/leads";
import { STATUS_CONFIG, PIPELINE_STATUSES, TERMINAL_STATUSES } from "@/types/leads";
import type { LeadNote, NoteType } from "@/types/lead-notes";
import { NOTE_TYPE_LABELS, NOTE_TYPES } from "@/types/lead-notes";
import { addLeadNote, getLeadNotes } from "@/lib/actions/lead-notes";
import {
  updateLeadStatus,
  updateLeadFollowUp,
  updateLeadContact,
  updateLeadDetails,
} from "@/lib/actions/leads";
import { assignLeadToAgent, requestEscalation, getAssignableAgents } from "@/lib/actions/crm-core";
import { deleteLeadNote, updateLeadNote } from "@/lib/actions/lead-notes";
import { getLeadActivity } from "@/lib/actions/lead-activity";
import { prepareTripSelection, searchPublishedTrips, type PublishedTripOption } from "@/lib/actions/trips";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import type { AssignableAgent } from "@/types/crm-core";
import type { LeadActivityItem } from "@/types/lead-activity";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Types ───────────────────────────────────────────────────────────
interface LeadProfileViewProps {
  lead: Lead;
  initialNotes: LeadNote[];
  initialActivity: LeadActivityItem[];
  currentUserId: string;
  currentRole: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return format(new Date(dateStr), "MMM d");
}

function groupNotesByDate(notes: LeadNote[]) {
  const groups: { label: string; date: Date; notes: LeadNote[] }[] = [];
  for (const note of notes) {
    const d = new Date(note.logged_at);
    let label: string;
    if (isToday(d)) label = "Today";
    else if (isYesterday(d)) label = "Yesterday";
    else label = format(d, "EEEE, MMM d");

    const existing = groups.find((g) => isSameDay(g.date, d));
    if (existing) {
      existing.notes.push(note);
    } else {
      groups.push({ label, date: d, notes: [note] });
    }
  }
  return groups;
}

function noteTypeIcon(type: string) {
  if (type.includes("escalation")) return "🔴";
  if (type.includes("follow_up")) return "📞";
  return "📝";
}

// ─── Inline Editable Field ──────────────────────────────────────────
function InlineEdit({
  value,
  field,
  placeholder,
  onSave,
  type = "text",
  disabled = false,
  variant = "default",
}: {
  value: string | null;
  field: string;
  placeholder: string;
  onSave: (val: string) => Promise<void>;
  type?: "text" | "email" | "tel";
  disabled?: boolean;
  variant?: "default" | "title";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (draft.trim() === (value || "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to update ${field}`);
      setDraft(value || "");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <Input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={saving}
          className={cn(
            "bg-background border-primary/30 rounded-lg px-2 min-w-0 flex-1 focus-visible:ring-1 focus-visible:ring-primary/40",
            variant === "title" ? "h-10 text-2xl font-bold" : "h-7 text-[13px] font-medium"
          )}
          placeholder={placeholder}
        />
        {saving && <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 group/edit text-left min-w-0 max-w-full",
        !disabled && "cursor-pointer hover:opacity-80",
        disabled && "cursor-default"
      )}
    >
      <span className={cn(
        "truncate transition-colors",
        variant === "title" ? "text-2xl sm:text-3xl font-bold leading-tight" : "text-[13px] font-medium",
        value ? "text-foreground" : "text-muted-foreground/60 italic"
      )}>
        {value || placeholder}
      </span>
      {!disabled && (
        <Pencil className="size-3 text-muted-foreground/0 group-hover/edit:text-muted-foreground/60 transition-all shrink-0" />
      )}
    </button>
  );
}

// ─── Property Row ───────────────────────────────────────────────────
function PropRow({
  icon,
  label,
  children,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-muted/40 transition-colors group/prop min-h-[36px]">
      <div className="text-muted-foreground/60 shrink-0 w-4 flex items-center justify-center">
        {icon}
      </div>
      <span className="text-xs font-medium text-muted-foreground w-20 shrink-0 select-none">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
      {action && (
        <div className="opacity-0 group-hover/prop:opacity-100 transition-opacity shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export function LeadProfileView({
  lead: initialLead,
  initialNotes,
  initialActivity,
  currentUserId,
  currentRole,
}: LeadProfileViewProps) {
  const [lead, setLead] = useState(initialLead);
  const [notes, setNotes] = useState<LeadNote[]>(initialNotes);
  const [activity, setActivity] = useState<LeadActivityItem[]>(initialActivity);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [selectedNoteType, setSelectedNoteType] = useState<NoteType | "escalate">("general_note");
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteEditDraft, setNoteEditDraft] = useState("");

  const [isPending, startTransition] = useTransition();
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [followUpPickerOpen, setFollowUpPickerOpen] = useState(false);
  const [followUpPromptOpen, setFollowUpPromptOpen] = useState(false);
  const [followUpDraftDate, setFollowUpDraftDate] = useState<Date | undefined>(
    initialLead.next_follow_up_at ? new Date(initialLead.next_follow_up_at) : undefined
  );
  const [followUpDraftTime, setFollowUpDraftTime] = useState(() =>
    initialLead.next_follow_up_at ? format(new Date(initialLead.next_follow_up_at), "HH:mm") : "10:00"
  );

  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [tripSearchQuery, setTripSearchQuery] = useState("");
  const [tripOptions, setTripOptions] = useState<PublishedTripOption[]>([]);


  const conf = STATUS_CONFIG[lead.crm_status] || STATUS_CONFIG.new;
  const isMyLead = lead.allotted_to === currentUserId;
  const isUnassigned = !lead.allotted_to;
  const isManager = ["admin", "operations_manager", "sales_manager", "finance_manager"].includes(currentRole);
  const canChangeStatus = isManager || isMyLead;
  const canEdit = isManager || isMyLead;

  useEffect(() => {
    if (isManager) {
      getAssignableAgents().then(setAgents);
    }
  }, [isManager]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const options = await searchPublishedTrips(tripSearchQuery);
        if (!cancelled) {
          setTripOptions(options);
        }
      } catch {
        if (!cancelled) {
          setTripOptions([]);
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tripSearchQuery]);

  // ─── Mutations ──────────────────────────────────────────────────
  const refreshTimeline = useCallback(async () => {
    try {
      const [refreshedNotes, refreshedActivity] = await Promise.all([
        getLeadNotes(lead.id),
        getLeadActivity(lead.id),
      ]);
      setNotes(refreshedNotes);
      setActivity(refreshedActivity);
    } catch { /* silently fail — notes list stays stale */ }
  }, [lead.id]);

  const handleFieldSave = useCallback(
    (field: "name" | "email" | "phone") => async (value: string) => {
      await updateLeadContact(lead.id, field, value);
      setLead((prev) => ({ ...prev, [field]: value.trim() || null }));
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated`);
    },
    [lead.id]
  );

  const handleStatusChange = (newStatus: string) => {
    const previousStatus = lead.crm_status;
    // Optimistic
    setLead((prev) => ({ ...prev, crm_status: newStatus as Lead["crm_status"] }));

    startStatusTransition(async () => {
      try {
        const result = await updateLeadStatus(lead.id, newStatus);
        toast.success(`Status → ${STATUS_CONFIG[newStatus as Lead["crm_status"]]?.label || newStatus}`);
        if (result?.follow_up_missing) {
          setFollowUpDraftDate(undefined);
          setFollowUpDraftTime("10:00");
          setFollowUpPromptOpen(true);
          toast.warning("Stage moved. Add a follow-up date/time to avoid lead staleness.");
        }
        await refreshTimeline();
      } catch (err) {
        setLead((prev) => ({ ...prev, crm_status: previousStatus }));
        toast.error(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  };

  const handleFollowUpChange = (date: string | null) => {
    const previousDate = lead.next_follow_up_at;
    setLead((prev) => ({ ...prev, next_follow_up_at: date }));

    startStatusTransition(async () => {
      try {
        await updateLeadFollowUp(lead.id, date);
        toast.success(date ? "Follow-up scheduled" : "Follow-up cleared");
        await refreshTimeline();
      } catch (err) {
        setLead((prev) => ({ ...prev, next_follow_up_at: previousDate }));
        toast.error(err instanceof Error ? err.message : "Failed to update follow-up");
      }
    });
  };

  const applyFollowUpDraft = () => {
    if (!followUpDraftDate) {
      handleFollowUpChange(null);
      setFollowUpPickerOpen(false);
      return;
    }

    const [hours, minutes] = followUpDraftTime.split(":").map((v) => parseInt(v, 10));
    const merged = new Date(followUpDraftDate);
    merged.setHours(Number.isFinite(hours) ? hours : 10, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    handleFollowUpChange(merged.toISOString());
    setFollowUpPromptOpen(false);
    setFollowUpPickerOpen(false);
  };

  const applyTripSelection = (input: { selectedSlug?: string | null; customTripName?: string | null }) => {
    startStatusTransition(async () => {
      try {
        const resolved = await prepareTripSelection(input);
        await updateLeadDetails(lead.id, {
          trip_slug: resolved.slug,
          lead_type: resolved.lead_type || undefined,
          trip_type: resolved.lead_type || undefined,
        });
        setLead((prev) => ({
          ...prev,
          trip_slug: resolved.slug,
          lead_type: resolved.lead_type || prev.lead_type,
          trip_type: resolved.lead_type || prev.trip_type,
        }));
        toast.success(
          resolved.source === "custom"
            ? `Custom trip set: ${resolved.title}`
            : `Trip selected: ${resolved.title}`
        );
        setTripPickerOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update trip");
      }
    });
  };

  const handleClaimLead = () => {
    startStatusTransition(async () => {
      try {
        await assignLeadToAgent({ leadId: lead.id, agentId: currentUserId });
        setLead((prev) => ({ ...prev, allotted_to: currentUserId, owner_name: "You" }));
        toast.success("Lead claimed to your pipeline");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to claim lead");
      }
    });
  };

  const handleComposerSubmit = () => {
    if (!newNoteContent.trim()) return;

    if (selectedNoteType === "escalate") {
      startStatusTransition(async () => {
        try {
          await requestEscalation({ leadId: lead.id, reason: newNoteContent.trim() });
          setNewNoteContent("");
          setSelectedNoteType("general_note");
          toast.success("Escalated to manager");
          await refreshTimeline();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to escalate");
        }
      });
      return;
    }

    startTransition(async () => {
      try {
        await addLeadNote({
          leadId: lead.id,
          noteType: selectedNoteType as NoteType,
          content: newNoteContent,
        });
        setNewNoteContent("");
        toast.success("Note added");
        await refreshTimeline();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save note");
      }
    });
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleComposerSubmit();
    }
  };

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleUpdateNote = async (noteId: string, content: string) => {
    if (!content.trim()) return;
    startTransition(async () => {
      try {
        await updateLeadNote({ noteId, content, leadId: lead.id });
        setEditingNoteId(null);
        toast.success("Note updated");
        await refreshTimeline();
      } catch {
        toast.error("Failed to update note");
      }
    });
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;
    startTransition(async () => {
      try {
        await deleteLeadNote({ noteId, leadId: lead.id });
        toast.success("Note deleted");
        await refreshTimeline();
      } catch {
        toast.error("Failed to delete note");
      }
    });
  };

  const handleReassign = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    startStatusTransition(async () => {
      try {
        await assignLeadToAgent({ leadId: lead.id, agentId });
        setLead(prev => ({ ...prev, allotted_to: agentId, owner_name: agent?.full_name || "Agent" }));
        toast.success(`Lead reassigned to ${agent?.full_name}`);
      } catch {
        toast.error("Failed to reassign lead");
      }
    });
  };

  const noteGroups = groupNotesByDate(notes);

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 md:px-6 h-12 border-b border-border/60 bg-background shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5">
            <Link href="/dashboard/leads">
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline text-xs font-medium">Leads</span>
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-4 bg-border/60" />
          <span className="text-xs text-muted-foreground/60 font-mono tabular-nums hidden sm:inline">
            {lead.id.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isManager && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5 rounded-lg border-primary/20 bg-primary/5 text-primary hover:bg-primary/10">
                  <UserPlus className="size-3.5" />
                  Reassign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1">
                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Available Agents
                </div>
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    className="text-xs font-semibold py-2 px-3 flex items-center justify-between group/agent"
                    onClick={() => handleReassign(agent.id)}
                  >
                    <div className="flex flex-col">
                      <span>{agent.full_name}</span>
                      <span className="text-[10px] font-medium text-muted-foreground capitalize">{agent.role.replace(/_/g, " ")}</span>
                    </div>
                    {lead.allotted_to === agent.id && <div className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted/60">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1">
              <DropdownMenuItem className="text-xs font-semibold gap-2.5 py-2 px-3">
                <Flag className="size-4 text-orange-500" /> Flag for Review
              </DropdownMenuItem>
              {isUnassigned && !isMyLead && (
                <DropdownMenuItem onClick={handleClaimLead} className="text-xs font-semibold gap-2.5 py-2 px-3">
                  <UserPlus className="size-4 text-primary" /> Claim Lead
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs font-semibold gap-2.5 py-2 px-3 text-destructive focus:text-destructive">
                <AlertTriangle className="size-4" /> Drop Lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Document Body ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">

          {/* ─── Escalation Banner ─────────────────────────────── */}
          {lead.escalated_at && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/15 text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <div className="text-sm font-medium">
                This lead has been escalated for manager review.
                {lead.escalation_reason && (
                  <span className="text-muted-foreground font-normal"> — {lead.escalation_reason}</span>
                )}
              </div>
            </div>
          )}

          {/* ─── Next Best Action (NBA) Banner ─────────────────── */}
          {(() => {
            const getNBA = () => {
              if (lead.crm_status === "handed_off" || lead.crm_status === "dropped" || lead.crm_status === "archived") return null;
              
              const isOverdue = lead.next_follow_up_at && isPast(new Date(lead.next_follow_up_at));
              if (isOverdue) return {
                label: "Action Required",
                title: "Follow-up Overdue",
                desc: "Schedule missed. Contact lead immediately.",
                icon: <AlertTriangle className="size-4 text-rose-500" />,
                style: "bg-rose-500/5 border-rose-500/10 text-rose-600"
              };
              
              if (lead.crm_status === "new") return {
                label: "Priority",
                title: "Initial Outreach",
                desc: "Lead is yet to be contacted. Initiate first touch.",
                icon: <Zap className="size-4 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]" />,
                style: "bg-amber-500/5 border-amber-500/10 text-amber-600"
              };

              if (!lead.trip_slug) return {
                label: "Optimization",
                title: "Assign Destination",
                desc: "No trip assigned. Define interest to improve conversion.",
                icon: <MapPin className="size-4 text-primary" />,
                style: "bg-primary/5 border-primary/10 text-primary"
              };

              if (!lead.next_follow_up_at) return {
                label: "Maintenance",
                title: "Missing Schedule",
                desc: "No follow-up set. Keep the momentum alive.",
                icon: <Clock className="size-4 text-primary" />,
                style: "bg-primary/5 border-primary/10 text-primary"
              };

              return null;
            };

            const nba = getNBA();
            if (!nba) return null;

            return (
              <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border transition-all hover:scale-[1.01]", nba.style)}>
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-full bg-background flex items-center justify-center shadow-sm">
                    {nba.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{nba.label}</span>
                       <span className="size-1 rounded-full bg-current opacity-30" />
                       <h4 className="text-xs font-bold leading-none">{nba.title}</h4>
                    </div>
                    <p className="text-[11px] font-medium opacity-70 mt-1">{nba.desc}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-3 text-[10px] font-bold uppercase tracking-tighter hover:bg-current/5 border border-current/10">
                  Execute now
                </Button>
              </div>
            );
          })()}

          {/* ─── Title ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <InlineEdit
              value={lead.name}
              field="name"
              placeholder="Untitled Lead"
              onSave={handleFieldSave("name")}
              disabled={!canEdit}
              variant="title"
            />

            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px] font-semibold rounded-md px-2 py-0.5 border",
                  conf.bg, conf.text, conf.border
                )}
              >
                <div className={cn("size-1.5 rounded-full mr-1.5", conf.dot)} />
                {conf.label}
              </Badge>
              {lead.lead_type && (
                <span className="text-xs text-muted-foreground font-medium">
                  {lead.lead_type}
                </span>
              )}
              <span className="text-xs text-muted-foreground/50">·</span>
              <span className="text-xs text-muted-foreground/60 font-medium">
                {timeAgo(lead.created_at)}
              </span>
            </div>
          </div>

          {/* ─── Properties Grid ───────────────────────────────── */}
          <div className="border border-border/50 rounded-xl divide-y divide-border/40">
            <PropRow
              icon={<Mail className="size-3.5" />}
              label="Email"
              action={
                lead.email ? (
                  copiedField === "Email" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold tracking-tight border border-emerald-200 animate-in zoom-in-95 duration-200">
                      <CheckCheck className="size-3.5" /> COPIED
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all rounded-full"
                      onClick={() => copyToClipboard(lead.email, "Email")}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  )
                ) : null
              }
            >
              <InlineEdit
                value={lead.email}
                field="email"
                placeholder="Add email"
                onSave={handleFieldSave("email")}
                type="email"
                disabled={!canEdit}
              />
            </PropRow>

            <PropRow
              icon={<Phone className="size-3.5" />}
              label="Phone"
              action={
                lead.phone ? (
                  copiedField === "Phone" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold tracking-tight border border-emerald-200 animate-in zoom-in-95 duration-200">
                      <CheckCheck className="size-3.5" /> COPIED
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all rounded-full"
                      onClick={() => copyToClipboard(lead.phone!, "Phone")}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  )
                ) : null
              }
            >
              <InlineEdit
                value={lead.phone}
                field="phone"
                placeholder="Add phone"
                onSave={handleFieldSave("phone")}
                type="tel"
                disabled={!canEdit}
              />
            </PropRow>

            <PropRow icon={<MapPin className="size-3.5" />} label="Trip">
              <Popover open={tripPickerOpen} onOpenChange={setTripPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    disabled={!canEdit}
                    className={cn(
                      "h-7 p-0 text-[13px] font-semibold hover:bg-transparent shadow-none",
                      lead.trip_slug ? "text-foreground" : "text-muted-foreground/50 italic"
                    )}
                  >
                    {lead.trip_slug ? lead.trip_slug.replace(/-/g, " ") : "Assign trip"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[320px] space-y-2 p-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Search Published Trips
                    </p>
                    <Input
                      placeholder="Search trip by title or slug..."
                      value={tripSearchQuery}
                      onChange={(event) => setTripSearchQuery(event.target.value)}
                    />
                  </div>

                  <div className="max-h-44 overflow-auto rounded-lg border border-border/50">
                    {tripOptions.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground">
                        No published trip matched. You can add a custom trip below.
                      </div>
                    ) : (
                      tripOptions.map((trip) => (
                        <button
                          key={trip.id}
                          type="button"
                          className="flex w-full items-center justify-between border-b border-border/40 px-3 py-2 text-left text-xs font-medium hover:bg-muted/40 last:border-b-0"
                          onClick={() => applyTripSelection({ selectedSlug: trip.slug })}
                        >
                          <span>{trip.title}</span>
                          <span className="text-[10px] uppercase text-muted-foreground">{trip.slug}</span>
                        </button>
                      ))
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-xs"
                    onClick={() => applyTripSelection({ customTripName: tripSearchQuery })}
                    disabled={!tripSearchQuery.trim()}
                  >
                    <Sparkles className="mr-2 size-3.5" />
                    Add as custom trip “{tripSearchQuery.trim() || "..." }”
                  </Button>
                </PopoverContent>
              </Popover>
            </PropRow>

            <PropRow icon={<Zap className="size-3.5" />} label="Source">
              <span className="text-[13px] font-medium text-foreground capitalize">
                {lead.source?.replace(/_/g, " ") || "Website"}
              </span>
            </PropRow>

            <PropRow icon={<User className="size-3.5" />} label="Owner">
              <span className={cn(
                "text-[13px] font-medium",
                lead.owner_name ? "text-foreground" : "text-muted-foreground/60 italic"
              )}>
                {lead.allotted_to === currentUserId ? "You" : lead.owner_name || "Unassigned"}
              </span>
            </PropRow>

            <PropRow icon={<CalendarCheck className="size-3.5" />} label="Follow-up">
              <div className="flex items-center gap-2">
                <Popover
                  open={followUpPickerOpen}
                  onOpenChange={(open) => {
                    setFollowUpPickerOpen(open);
                    if (open) {
                      setFollowUpDraftDate(lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : undefined);
                      setFollowUpDraftTime(lead.next_follow_up_at ? format(new Date(lead.next_follow_up_at), "HH:mm") : "10:00");
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        "h-7 p-0 text-[13px] font-semibold hover:bg-transparent shadow-none",
                        lead.next_follow_up_at ? "text-foreground" : "text-muted-foreground/50 italic"
                      )}
                      disabled={isUpdatingStatus || !canChangeStatus}
                    >
                      {lead.next_follow_up_at
                        ? format(new Date(lead.next_follow_up_at), "PPP, p")
                        : "Schedule follow-up"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] p-0" align="start">
                    <div className="p-3 border-b border-border/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Select Date & Time</p>
                    </div>
                    <CalendarPicker
                      mode="single"
                      selected={followUpDraftDate}
                      onSelect={(date) => setFollowUpDraftDate(date)}
                      initialFocus
                    />
                    <div className="space-y-2 border-t border-border/50 p-2">
                      <div className="space-y-1">
                        <Label htmlFor="followup-time" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                          Time
                        </Label>
                        <Input
                          id="followup-time"
                          type="time"
                          value={followUpDraftTime}
                          onChange={(event) => setFollowUpDraftTime(event.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-[10px] font-bold uppercase h-8"
                          onClick={() => {
                            setFollowUpDraftDate(undefined);
                            setFollowUpDraftTime("10:00");
                            handleFollowUpChange(null);
                            setFollowUpPickerOpen(false);
                          }}
                        >
                          Clear
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 text-[10px] font-bold uppercase h-8"
                          onClick={() => {
                            const morning = new Date();
                            morning.setDate(morning.getDate() + 1);
                            morning.setHours(10, 0, 0, 0);
                            setFollowUpDraftDate(morning);
                            setFollowUpDraftTime("10:00");
                          }}
                        >
                          Tomorrow 10AM
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-[10px] font-bold uppercase h-8"
                          onClick={applyFollowUpDraft}
                          disabled={!followUpDraftDate}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {isUpdatingStatus && <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />}
              </div>
            </PropRow>

            <PropRow icon={<ChevronDown className="size-3.5" />} label="Status">
              <Select
                disabled={isUpdatingStatus || !canChangeStatus}
                value={lead.crm_status}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="w-auto h-7 text-[13px] font-medium bg-transparent border-none shadow-none p-0 gap-1.5 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[180px]">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Pipeline
                  </div>
                  {PIPELINE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs font-medium py-1.5">
                      <div className="flex items-center gap-2">
                        <div className={cn("size-2 rounded-full", STATUS_CONFIG[s].dot)} />
                        {STATUS_CONFIG[s].label}
                      </div>
                    </SelectItem>
                  ))}
                  <Separator className="my-1" />
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Terminal
                  </div>
                  {TERMINAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs font-medium py-1.5">
                      {STATUS_CONFIG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropRow>
          </div>

          {/* ─── Divider ───────────────────────────────────────── */}
          <Separator className="bg-border/40" />

          {/* ─── Notes Composer ─────────────────────────────────── */}
          <div className="space-y-3">
            <div className="border border-border/50 rounded-xl focus-within:border-border focus-within:ring-1 focus-within:ring-ring/20 transition-all bg-card">
              <Textarea
                ref={composerRef}
                placeholder="Write a note… (⌘+Enter to submit)"
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={isPending || (!isMyLead && !isManager)}
                className="min-h-[80px] bg-transparent border-none shadow-none rounded-t-xl resize-none text-[13px] p-4 focus-visible:ring-0 font-medium placeholder:text-muted-foreground/40"
              />
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/30">
                <Select
                  value={selectedNoteType}
                  onValueChange={(val) => setSelectedNoteType(val as NoteType | "escalate")}
                  disabled={isPending || (!isMyLead && !isManager)}
                >
                  <SelectTrigger className="w-auto h-7 text-[11px] font-medium bg-muted/40 border-none rounded-md px-2.5 gap-1 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs font-medium">
                        {NOTE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                    <Separator className="my-1" />
                    <SelectItem value="escalate" className="text-xs font-medium text-destructive">
                      🔴 Escalate to Manager
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  className="h-7 rounded-lg px-3 text-[11px] font-semibold gap-1.5"
                  onClick={handleComposerSubmit}
                  disabled={isPending || !newNoteContent.trim()}
                >
                  {isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Send className="size-3" />
                  )}
                  Post
                </Button>
              </div>
            </div>
          </div>

          {/* ─── Timeline ──────────────────────────────────────── */}
          <div className="relative space-y-6 pb-10 mt-4">
            {notes.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Clock className="size-5 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">
                  Notes and status changes will appear here once you start working this lead.
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical Threading Line */}
                <div className="absolute left-[1.125rem] top-8 bottom-8 w-px bg-border/40 z-0" />
                
                {noteGroups.map((group) => (
                  <div key={group.label} className="space-y-4 relative z-10">
                    {/* Date Header */}
                    <div className="flex items-center gap-3 py-2 bg-background/80 backdrop-blur-sm sticky top-12 z-20">
                      <div className="size-1 bg-border/60 rounded-full ml-[0.9375rem] shrink-0" />
                      <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em] shrink-0">
                        {group.label}
                      </span>
                      <div className="h-px bg-border/30 flex-1" />
                    </div>

                    {/* Notes in this group */}
                    <div className="space-y-3">
                      {group.notes.map((note) => {
                        const isEditing = editingNoteId === note.id;
                        const isOwnNote = note.agent_id === currentUserId;
                        const canManageNote = isOwnNote || currentRole === "admin";

                        return (
                          <div
                            key={note.id}
                            className={cn(
                              "group/note rounded-2xl px-3 py-3 transition-all duration-300 relative",
                              isEditing ? "bg-primary/[0.04] ring-1 ring-primary/20 shadow-lg" : "hover:bg-muted/30"
                            )}
                          >
                            <div className="flex items-start gap-4">
                              <div className={cn(
                                "size-9 rounded-xl flex items-center justify-center text-sm shrink-0 shadow-sm border border-border/50 bg-background relative z-10 transition-transform duration-300 group-hover/note:scale-105",
                                isEditing && "ring-2 ring-primary/20"
                              )}>
                                {noteTypeIcon(note.note_type)}
                              </div>
                              
                              <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    <span className="text-[12px] font-bold text-foreground tracking-tight">
                                      {note.agent_name || "System"}
                                    </span>
                                    <Badge 
                                      variant="secondary" 
                                      className="text-[8px] h-3.5 px-1 font-bold bg-muted/60 text-muted-foreground/70 border-none uppercase tracking-[0.05em]"
                                    >
                                      {NOTE_TYPE_LABELS[note.note_type] || "Note"}
                                    </Badge>
                                    <span className="text-[10px] font-bold text-muted-foreground/30 tabular-nums">
                                      {format(new Date(note.logged_at), "h:mm a")}
                                    </span>
                                  </div>

                                  {!isEditing && canManageNote && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 rounded-lg"
                                        onClick={() => {
                                          setEditingNoteId(note.id);
                                          setNoteEditDraft(note.content || "");
                                        }}
                                      >
                                        <Pencil className="size-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                        onClick={() => handleDeleteNote(note.id)}
                                      >
                                        <Trash2 className="size-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {isEditing ? (
                                  <div className="space-y-3 pt-1">
                                    <Textarea
                                      autoFocus
                                      value={noteEditDraft}
                                      onChange={(e) => setNoteEditDraft(e.target.value)}
                                      className="min-h-[120px] bg-background border-primary/20 focus-visible:ring-primary/20 text-[13px] font-medium leading-relaxed rounded-xl shadow-inner scrollbar-hide"
                                      placeholder="Update your note..."
                                    />
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        className="h-8 rounded-lg px-4 text-[11px] font-bold uppercase tracking-wider bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                                        onClick={() => handleUpdateNote(note.id, noteEditDraft)}
                                        disabled={isPending || noteEditDraft === note.content}
                                      >
                                        {isPending ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                                        Save Changes
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 rounded-lg px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted"
                                        onClick={() => setEditingNoteId(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-[13px] text-foreground/80 font-medium leading-relaxed whitespace-pre-wrap selection:bg-primary/10">
                                    {note.content}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Activity Log ───────────────────────────────────── */}
          <div className="space-y-3 pb-10">
            <div className="flex items-center gap-2">
              <div className="size-1 rounded-full bg-border/80" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                Activity Log
              </p>
            </div>

            {activity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 px-4 py-6 text-center text-xs text-muted-foreground">
                No structured activity yet.
              </div>
            ) : (
              <div className="space-y-2">
                {activity.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/40 bg-card/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-foreground">{item.message}</p>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {format(new Date(item.created_at), "dd MMM, h:mm a")}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      By {item.actor_name || "System"}
                      {item.field_name ? ` · ${item.field_name.replace(/_/g, " ")}` : ""}
                    </div>
                    {(item.before_value || item.after_value) && (
                      <div className="mt-2 rounded-md bg-muted/30 px-2 py-1.5 text-[11px]">
                        <span className="text-muted-foreground">Before:</span> {item.before_value || "—"}
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="text-muted-foreground">After:</span> {item.after_value || "—"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={followUpPromptOpen} onOpenChange={setFollowUpPromptOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add follow-up schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Stage updated successfully. Add next follow-up date/time so this lead stays in the active queue.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start", !followUpDraftDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 size-4" />
                      {followUpDraftDate ? format(followUpDraftDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarPicker mode="single" selected={followUpDraftDate} onSelect={(date) => setFollowUpDraftDate(date)} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followup-dialog-time">Time</Label>
                <Input
                  id="followup-dialog-time"
                  type="time"
                  value={followUpDraftTime}
                  onChange={(event) => setFollowUpDraftTime(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFollowUpPromptOpen(false)}>
              Later
            </Button>
            <Button type="button" onClick={applyFollowUpDraft} disabled={!followUpDraftDate}>
              Save Follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
