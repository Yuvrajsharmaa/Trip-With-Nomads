import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appendRow, sheetsEnabled } from "../_shared/sheets.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

const LEAD_HEADERS = [
    "Lead ID",
    "Created At",
    "Name",
    "Email",
    "Phone",
    "Instagram ID",
    "Reason",
    "Source",
    "Page URL",
    "Trip ID",
    "Trip Slug",
    "UTM Source",
    "UTM Medium",
    "UTM Campaign",
    "Status",
];

const LIVE_SHEET_HOSTS = new Set([
    "tripwithnomads.com",
    "www.tripwithnomads.com",
]);

function formatTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const text = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    }).format(date);
    return `${text} IST`;
}

function extractHost(value: string | null | undefined): string {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        return new URL(raw).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function isLiveSheetHost(host: string): boolean {
    return LIVE_SHEET_HOSTS.has(String(host || "").trim().toLowerCase());
}

function canWriteSheetsForRequest(req: Request): {
    allowed: boolean;
    decisionHost: string;
    decisionSource: "headers" | "none";
} {
    const originHost = extractHost(req.headers.get("origin"));
    const refererHost = extractHost(req.headers.get("referer"));
    const headerHosts = [originHost, refererHost].filter(Boolean);

    if (headerHosts.length > 0) {
        const liveHeaderHost = headerHosts.find((host) => isLiveSheetHost(host));
        return {
            allowed: Boolean(liveHeaderHost),
            decisionHost: liveHeaderHost || headerHosts[0] || "",
            decisionSource: "headers",
        };
    }

    return { allowed: false, decisionHost: "", decisionSource: "none" };
}

function isMissingLeadsTableMessage(message: string): boolean {
    const normalized = String(message || "").toLowerCase();
    return normalized.includes("table 'public.leads'") ||
        normalized.includes('relation "leads" does not exist') ||
        normalized.includes("could not find the table 'public.leads'");
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    try {
        const body = await req.json();
        const email = String(body?.email || "").trim().toLowerCase();
        if (!email) return json({ error: "Email is required" }, 400);

        const leadId = body?.lead_id ? String(body.lead_id).trim() : undefined;
        const status = body?.status ? String(body.status).trim() : "submitted";

        // Extra fields for sheets only (not in DB leads table)
        const instagram_id = body?.instagram_id ? String(body.instagram_id).trim() : null;
        const reason = body?.reason ? String(body.reason).trim() : null;

        const payload = {
            ...(leadId ? { id: leadId } : {}),
            email,
            name: body?.name ? String(body.name).trim() : null,
            phone: body?.phone ? String(body.phone).trim() : null,
            source: body?.source ? String(body.source).trim() : "waitlist_popup",
            page_url: body?.page_url ? String(body.page_url).trim() : null,
            trip_id: body?.trip_id ? String(body.trip_id).trim() : null,
            trip_slug: body?.trip_slug ? String(body.trip_slug).trim() : null,
            utm_source: body?.utm_source ? String(body.utm_source).trim() : null,
            utm_medium: body?.utm_medium ? String(body.utm_medium).trim() : null,
            utm_campaign: body?.utm_campaign
                ? String(body.utm_campaign).trim()
                : null,
            status,
        };

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !supabaseServiceRole) {
            return json({ error: "Supabase environment not configured" }, 500);
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRole);
        let duplicateByLeadId = false;
        if (payload.id) {
            const { data: existingLead, error: lookupError } = await supabase
                .from("leads")
                .select("id")
                .eq("id", payload.id)
                .maybeSingle();
            if (lookupError && !isMissingLeadsTableMessage(lookupError.message)) {
                console.error("[record-lead] lead lookup error", lookupError);
            } else if (existingLead?.id) {
                duplicateByLeadId = true;
            }
        }

        const { data: insertedLead, error } = await supabase
            .from("leads")
            .upsert(payload, { onConflict: "id" })
            .select()
            .single();

        let lead = insertedLead;
        if (error || !lead) {
            const message = String(error?.message || "");
            const missingLeadsTable = isMissingLeadsTableMessage(message);
            if (!missingLeadsTable) {
                console.error("[record-lead] upsert error", error);
                return json({ error: error?.message || "Could not upsert lead" }, 500);
            }

            console.warn(
                "[record-lead] leads table missing; falling back to Sheets-only logging",
            );
            lead = {
                id: payload.id || crypto.randomUUID(),
                created_at: new Date().toISOString(),
                ...payload,
            } as typeof insertedLead;
        }

        let sheetLogged = false;
        let sheetId = "";
        let sheetTab = "Leads";
        let sheetRoute = "general";
        let sheetWarning: string | null = null;

        // ── Sheet routing ─────────────────────────────────
        const NTC_SHEET_ID = String(Deno.env.get("GOOGLE_SHEET_ID_NTC") || "");
        const ORIGINAL_SHEET_ID = String(Deno.env.get("GOOGLE_SHEET_ID") || "");
        const TRIPS_SHEET_ID = String(Deno.env.get("GOOGLE_SHEET_ID_TRIPS") || "");
        const GENERAL_SHEET_ID = String(Deno.env.get("GOOGLE_SHEET_ID_GENERAL") || "");
        const CUSTOM_TRIPS_SHEET_ID = String(
            Deno.env.get("GOOGLE_SHEET_ID_CUSTOM_TRIPS") || "",
        );
        void ORIGINAL_SHEET_ID;

        if (payload.source === "booking_invite") {
            sheetId = NTC_SHEET_ID;
            sheetTab = status === "partial_fill" ? "Abandoned Leads" : "NTC - Invites";
            sheetRoute = "ntc";
        } else if (payload.source === "custom_trip_lead") {
            // Custom-trip leads should never fall back to trips/general sheets.
            sheetId = CUSTOM_TRIPS_SHEET_ID;
            sheetTab = status === "partial_fill" ? "Abandoned Leads" : "Custom Trip Leads";
            sheetRoute = "custom_trips";
        } else if (payload.source === "trip_page_lead") {
            sheetId = TRIPS_SHEET_ID;
            sheetTab = status === "partial_fill" ? "Abandoned Leads" : "Leads";
            sheetRoute = "trips";
        } else {
            // General leads (waitlist_popup, general_lead, etc)
            sheetId = GENERAL_SHEET_ID;
            sheetTab = status === "partial_fill" ? "Abandoned Leads" : "Leads";
            sheetRoute = "general";
        }

        if (payload.source === "custom_trip_lead" && !sheetId) {
            sheetWarning = "GOOGLE_SHEET_ID_CUSTOM_TRIPS is not configured";
            console.error(
                "[record-lead] GOOGLE_SHEET_ID_CUSTOM_TRIPS is missing; custom leads will not be written to any fallback sheet",
            );
        }

        const sheetWriteGate = canWriteSheetsForRequest(req);
        if (!sheetWriteGate.allowed) {
            const reasonHost = sheetWriteGate.decisionHost || "unknown";
            const reason = `Sheet write blocked for non-live host (${reasonHost})`;
            sheetWarning = sheetWarning ? `${sheetWarning}; ${reason}` : reason;
            console.warn("[record-lead] sheets write skipped", {
                source: payload.source,
                reason,
                decision_source: sheetWriteGate.decisionSource,
            });
        }

        if (sheetWriteGate.allowed && sheetsEnabled() && sheetId && !duplicateByLeadId) {
            const values = [
                lead.id,
                formatTimestamp(String(lead.created_at || "")),
                lead.name || "",
                lead.email,
                lead.phone || "",
                instagram_id || "",
                reason || "",
                lead.source || "",
                lead.page_url || "",
                lead.trip_id || "",
                lead.trip_slug || "",
                lead.utm_source || "",
                lead.utm_medium || "",
                lead.utm_campaign || "",
                status,
            ];
            try {
                await appendRow(sheetId, sheetTab, values, LEAD_HEADERS);
                sheetLogged = true;
            } catch (sheetErr) {
                console.error("[record-lead] sheets append failed", sheetErr);
            }
        }

        return json({
            ok: true,
            lead_id: lead.id,
            sheet_logged: sheetLogged,
            sheet_route: sheetRoute,
            sheet_tab: sheetTab,
            sheet_warning: sheetWarning,
            sheet_write_allowed: sheetWriteGate.allowed,
        });
    } catch (err) {
        console.error("[record-lead] error", err);
        return json({ error: "Internal Server Error" }, 500);
    }
});
