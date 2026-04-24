"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lead } from "@/types/leads";

/**
 * Hook that subscribes to Supabase Realtime on `public.leads`.
 * When a new lead is inserted, it's prepended to the local state.
 * When an existing lead is updated, it's patched in place.
 *
 * Usage:
 *   const { realtimeLeads } = useLeadsRealtime(initialLeads);
 */
export function useLeadsRealtime(initialLeads: Lead[]) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);

  // Reset when server-rendered data changes (filter/page switch)
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => {
            // Avoid duplicates
            if (prev.some((l) => l.id === newLead.id)) return prev;
            return [newLead, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          const updated = payload.new as Lead;
          setLeads((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { leads };
}
