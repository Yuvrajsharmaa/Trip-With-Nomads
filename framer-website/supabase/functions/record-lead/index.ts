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
    "Source",
    "Page URL",
    "Trip ID",
    "Trip Slug",
    "UTM Source",
    "UTM Medium",
    "UTM Campaign",
    "Status"
];

function ordinalSuffix(day: number): string {
    const mod100 = day % 100;
    if (mod100 >= 11 && mod100 <= 13) return "th";
    switch (day % 10) {
        case 1:
            return "st";
        case 2:
            return "nd";
        case 3:
            return "rd";
        default:
            return "th";
    }
}

function formatTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).formatToParts(date);

    const day = Number(parts.find((p) => p.type === "day")?.value || 0);
    const month = parts.find((p) => p.type === "month")?.value || "";
    const year = parts.find((p) => p.type === "year")?.value || "";
    const hour = parts.find((p) => p.type === "hour")?.value || "";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value || "")
        .toUpperCase();

    if (!day || !month || !year) return value;
    return `${day}${ordinalSuffix(day)} ${month} ${year} ${hour}:${minute} ${dayPeriod}`;
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
        const { data: insertedLead, error } = await supabase
            .from("leads")
            .upsert(payload, { onConflict: "id" })
            .select()
            .single();

        let lead = insertedLead;
        if (error || !lead) {
            const message = String(error?.message || "");
            const missingLeadsTable = message.includes("table 'public.leads'") ||
                message.includes('relation "leads" does not exist');
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

        const ORIGINAL_SHEET_ID = String(Deno.env.get("GOOGLE_SHEET_ID") || "");
        const TRIPS_SHEET_ID = String(Deno.env.get("GOOGLE_SHEET_ID_TRIPS") || "1_rewyVrFYtAiy-xPJ0d_xLm8aHRcAeYP0o2BM7EfkkA");
        const GENERAL_SHEET_ID = String(Deno.env.get("GOOGLE_SHEET_ID_GENERAL") || "1tA0hKhcGgo84hmD4iteOCw3Ar26SdDt6VQ2Wy5YTDoQ");

        if (payload.source === "booking_invite") {
            sheetId = ORIGINAL_SHEET_ID;
            sheetTab = status === "partial_fill" ? "Abandoned Leads" : "NTC - Invites";
        } else if (payload.source === "trip_page_lead") {
            sheetId = TRIPS_SHEET_ID;
            sheetTab = status === "partial_fill" ? "Abandoned Leads" : "Leads";
        } else {
            // General leads (waitlist_popup, general_lead, etc)
            sheetId = GENERAL_SHEET_ID;
            sheetTab = status === "partial_fill" ? "Abandoned Leads" : "Leads";
        }

        if (sheetsEnabled() && sheetId) {
            const values = [
                lead.id,
                formatTimestamp(String(lead.created_at || "")),
                lead.name || "",
                lead.email,
                lead.phone || "",
                lead.source || "",
                lead.page_url || "",
                lead.trip_id || "",
                lead.trip_slug || "",
                lead.utm_source || "",
                lead.utm_medium || "",
                lead.utm_campaign || "",
                status
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
            sheet_tab: sheetTab,
            sheet_id: sheetId
        });
    } catch (err) {
        console.error("[record-lead] error", err);
        return json({ error: "Internal Server Error" }, 500);
    }
});
