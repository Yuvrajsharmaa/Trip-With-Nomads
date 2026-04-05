import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-sync-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function maintenanceResponse(functionName: string) {
  return new Response(
    JSON.stringify({
      ok: false,
      maintenance: true,
      function: functionName,
      error: "Internal CRM is under reset maintenance",
    }),
    {
      status: 503,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": "3600",
        "X-CRM-Maintenance": "true",
      },
    },
  );
}

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return maintenanceResponse(new URL(req.url).pathname.split("/").pop() || "crm-function");
});
