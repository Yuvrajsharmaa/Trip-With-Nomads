"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { LeadNote, NoteType } from "@/types/lead-notes";
import { logLeadActivity } from "@/lib/actions/lead-activity";

interface LeadNoteRow {
  id: string;
  lead_id: string;
  agent_id: string;
  note_type: NoteType;
  content: string | null;
  logged_at: string;
  created_at: string;
}

interface AgentProfileRow {
  id: string;
  full_name: string | null;
}

export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("logged_at", { ascending: false });

  if (error) {
    console.error("Error fetching lead notes:", error);
    throw new Error("Failed to fetch lead notes");
  }

  const noteRows = (data || []) as LeadNoteRow[];
  const agentIds = Array.from(new Set(noteRows.map((note) => note.agent_id).filter(Boolean)));
  const { data: profiles } = agentIds.length
    ? await supabase
        .schema("crm")
        .from("profiles")
        .select("id, full_name")
        .in("id", agentIds)
    : { data: [] as AgentProfileRow[] };

  const profileRows = (profiles || []) as AgentProfileRow[];
  const profileMap = new Map(profileRows.map((profile) => [profile.id, profile.full_name]));

  return noteRows.map((note) => ({
    ...note,
    agent_name: profileMap.get(note.agent_id) || "Unknown Agent",
  }));
}

export async function addLeadNote(params: {
  leadId: string;
  noteType: NoteType;
  content: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  if (params.noteType.startsWith("follow_up_")) {
    const { count } = await supabase
      .from("lead_notes")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", params.leadId)
      .in("note_type", [
        "follow_up_1",
        "follow_up_2",
        "follow_up_3",
        "follow_up_4",
        "follow_up_5",
      ]);

    if ((count || 0) >= 5) {
      throw new Error("Follow-up limit reached. Use general notes for additional context.");
    }
  }

  const { data, error } = await supabase
    .from("lead_notes")
    .insert({
      lead_id: params.leadId,
      agent_id: user.id,
      note_type: params.noteType,
      content: params.content,
    })
    .select()
    .single();

  if (error) {
    console.error("Error adding lead note:", error);
    throw new Error("Failed to add lead note");
  }

  // Update lead follow-up count if it's a follow-up note
  if (params.noteType.startsWith("follow_up_")) {
    const followUpNum = parseInt(params.noteType.replace("follow_up_", ""));
    
    // Also bump the lead's status to this follow-up if it's higher than current
    await supabase
      .from("leads")
      .update({
        follow_up_count: followUpNum,
        crm_status: params.noteType === "follow_up_5" ? "final_call" : params.noteType,
        last_follow_up_at: new Date().toISOString()
      })
      .eq("id", params.leadId);
  }

  await logLeadActivity({
    leadId: params.leadId,
    actorId: user.id,
    eventType: "note_added",
    message: `Note added (${params.noteType.replace(/_/g, " ")})`,
    metadata: {
      note_id: data.id,
      note_type: params.noteType,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${params.leadId}`);

  return data;
}

export async function updateLeadNote(params: {
  noteId: string;
  content: string;
  leadId: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("lead_notes")
    .update({ content: params.content })
    .eq("id", params.noteId)
    .eq("agent_id", user.id); // agents can only edit their own notes

  if (error) {
    console.error("Error updating lead note:", error);
    throw new Error("Failed to update note");
  }

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${params.leadId}`);
}

export async function deleteLeadNote(params: {
  noteId: string;
  leadId: string;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("lead_notes")
    .delete()
    .eq("id", params.noteId)
    .eq("agent_id", user.id);

  if (error) {
    console.error("Error deleting lead note:", error);
    throw new Error("Failed to delete note");
  }

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${params.leadId}`);
}
