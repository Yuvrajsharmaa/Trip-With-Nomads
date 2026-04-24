export const NOTE_TYPES = [
  "general_note",
  "escalation_note",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "follow_up_4",
  "follow_up_5",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export interface LeadNote {
  id: string;
  lead_id: string;
  agent_id: string;
  note_type: NoteType;
  content: string | null;
  logged_at: string;
  created_at: string;
  
  // Optional joined data
  agent_name?: string | null;
}

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  general_note: "General Note",
  escalation_note: "Escalation Note",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2",
  follow_up_3: "Follow-up 3",
  follow_up_4: "Follow-up 4",
  follow_up_5: "Final Follow-up (5)",
};
