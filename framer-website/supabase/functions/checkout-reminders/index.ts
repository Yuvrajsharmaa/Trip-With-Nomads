import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAbandonedCheckoutEmail,
  buildCheckoutResumeUrl,
  isAuthorizedCheckoutReminder,
  isCheckoutReminderDeliveryEnabled,
  isCheckoutReminderRecipientAllowed,
  isValidCheckoutReminderToken,
  nextReminderNumber,
} from "../_shared/abandoned_checkout_reminder.ts";
import {
  isResendIdempotencyConflict,
  normalizeResendRecipients,
  sendResendEmail,
} from "../_shared/resend.ts";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>Checkout reminders</title><body style="font:16px system-ui;max-width:560px;margin:15vh auto;padding:24px;color:#0b3550">${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Reminder service is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function unsubscribe(
  request: Request,
  client: ReturnType<typeof serviceClient>,
) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!isValidCheckoutReminderToken(token)) {
    return page(
      "<h1>Checkout reminders</h1><p>This unsubscribe link is invalid or expired.</p>",
      400,
    );
  }

  if (request.method === "GET") {
    const { data, error } = await client.from("checkout_reminder_sequences")
      .select("status").eq("unsubscribe_token", token).maybeSingle();
    if (error) {
      return page(
        "<h1>Try again later</h1><p>We couldn’t load your reminder preferences.</p>",
        503,
      );
    }
    if (!data || data.status === "unsubscribed") {
      return page(
        "<h1>Checkout reminders</h1><p>There are no active checkout reminders for this link.</p>",
      );
    }
    return page(
      `<h1>Stop checkout reminders?</h1><p>We’ll stop the remaining checkout reminders for this email address.</p><form method="post" action="${
        new URL(request.url).toString()
      }"><button style="background:#08b1ff;border:0;border-radius:8px;padding:12px 18px;color:#0b3550;font-weight:700">Stop reminders</button></form>`,
    );
  }

  const { error } = await client.from("checkout_reminder_sequences")
    .update({
      status: "unsubscribed",
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", token);
  if (error) {
    return page(
      "<h1>Try again later</h1><p>We couldn’t update your reminder preferences.</p>",
      503,
    );
  }
  return page(
    "<h1>Reminders stopped</h1><p>You won’t receive further checkout reminders from this sequence.</p>",
  );
}

async function suppress(
  client: ReturnType<typeof serviceClient>,
  sequenceId: string,
) {
  const { error } = await client.from("checkout_reminder_sequences")
    .update({
      status: "suppressed",
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sequenceId).eq("status", "sending");
  if (error) throw error;
}

async function retryLater(
  client: ReturnType<typeof serviceClient>,
  sequence: Record<string, any>,
) {
  const attempts = Number(sequence.attempt_count || 0);
  const exhausted = attempts >= 3;
  const delayMinutes = attempts === 1 ? 15 : 60;
  const { error } = await client.from("checkout_reminder_sequences")
    .update({
      status: exhausted ? "failed" : "pending",
      next_send_at: exhausted
        ? sequence.next_send_at
        : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sequence.id).eq("status", "sending");
  if (error) throw error;
}

async function sendDueReminders(
  client: ReturnType<typeof serviceClient>,
  mode: string,
  allowedRecipients: string[],
) {
  const siteUrl = Deno.env.get("CHECKOUT_REMINDER_SITE_URL") || "";
  if (!siteUrl || !Deno.env.get("RESEND_API_KEY")) {
    return json({ error: "Reminder email configuration is incomplete" }, 503);
  }

  let sent = 0;
  let suppressed = 0;
  for (let count = 0; count < 20; count += 1) {
    const { data, error } = await client.rpc("claim_due_checkout_reminder");
    if (error) throw error;
    const sequence = Array.isArray(data) ? data[0] : data;
    if (!sequence) break;

    try {
      if (
        !isCheckoutReminderRecipientAllowed(
          mode,
          sequence.normalized_email,
          allowedRecipients,
        )
      ) {
        await suppress(client, sequence.id);
        suppressed += 1;
        continue;
      }

      const reminderNumber = nextReminderNumber(
        Number(sequence.sent_count || 0),
      );
      if (
        !reminderNumber ||
        new Date(sequence.created_at).getTime() <
          Date.now() - 7 * 24 * 60 * 60_000
      ) {
        await suppress(client, sequence.id);
        suppressed += 1;
        continue;
      }

      const { data: submission, error: submissionError } = await client
        .from("lead_submissions")
        .select("normalized_email,source,status,payload,created_at")
        .eq("id", sequence.lead_submission_id)
        .maybeSingle();
      if (submissionError) throw submissionError;
      if (
        !submission || submission.source !== "booking_abandoned" ||
        submission.status !== "abandoned_booking" ||
        String(submission.normalized_email || "").toLowerCase() !==
          sequence.normalized_email
      ) {
        await suppress(client, sequence.id);
        suppressed += 1;
        continue;
      }

      const { data: hasBooking, error: bookingError } = await client.rpc(
        "checkout_reminder_has_booking",
        {
          target_email: sequence.normalized_email,
          abandoned_at: submission.created_at,
        },
      );
      if (bookingError) throw bookingError;
      if (hasBooking === true) {
        await suppress(client, sequence.id);
        suppressed += 1;
        continue;
      }

      const { data: current, error: currentError } = await client
        .from("checkout_reminder_sequences").select("status")
        .eq("id", sequence.id).maybeSingle();
      if (currentError) throw currentError;
      if (current?.status !== "sending") continue;

      const payload = submission.payload || {};
      const resumeUrl = buildCheckoutResumeUrl({
        siteUrl,
        tripId: sequence.trip_id,
        tripSlug: sequence.trip_slug,
      });
      const unsubscribeUrl = new URL(
        "/functions/v1/checkout-reminders",
        Deno.env.get("SUPABASE_URL") || "",
      );
      unsubscribeUrl.searchParams.set("token", sequence.unsubscribe_token);
      const email = buildAbandonedCheckoutEmail({
        sequenceId: sequence.id,
        reminderNumber,
        email: sequence.normalized_email,
        name: payload.name,
        tripName: sequence.trip_name || payload.trip_name ||
          payload.itinerary_name || sequence.trip_slug,
        resumeUrl,
        unsubscribeUrl: unsubscribeUrl.toString(),
      });
      try {
        const result = await sendResendEmail(email);
        if (!result.sent) throw new Error("Resend skipped the reminder email");
      } catch (error) {
        if (!isResendIdempotencyConflict(error)) throw error;
      }

      const now = new Date();
      const { error: updateError } = await client.from(
        "checkout_reminder_sequences",
      )
        .update({
          sent_count: reminderNumber,
          status: reminderNumber === 2 ? "complete" : "pending",
          attempt_count: 0,
          next_send_at: reminderNumber === 1
            ? new Date(now.getTime() + 24 * 60 * 60_000).toISOString()
            : sequence.next_send_at,
          last_sent_at: now.toISOString(),
          lease_expires_at: null,
          updated_at: now.toISOString(),
        })
        .eq("id", sequence.id).eq("status", "sending");
      if (updateError) throw updateError;
      sent += 1;
    } catch (error) {
      console.error("[checkout-reminders] sequence processing failed", {
        sequenceId: sequence.id,
        attempt: sequence.attempt_count,
        error: "delivery_or_storage_error",
      });
      await retryLater(client, sequence);
    }
  }
  return json({ sent, suppressed });
}

Deno.serve(async (request) => {
  try {
    const url = new URL(request.url);
    if (
      url.searchParams.has("token") &&
      (request.method === "GET" || request.method === "POST")
    ) {
      return await unsubscribe(request, serviceClient());
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const configuredSecret = Deno.env.get("CHECKOUT_REMINDER_CRON_SECRET") ||
      "";
    if (
      !isAuthorizedCheckoutReminder(
        request.headers.get("x-checkout-reminder-secret"),
        configuredSecret,
      )
    ) {
      return json({ error: "Unauthorized" }, 401);
    }
    const mode = Deno.env.get("CHECKOUT_REMINDER_MODE") || "disabled";
    const allowedRecipients = normalizeResendRecipients(
      Deno.env.get("CHECKOUT_REMINDER_RECIPIENT_ALLOWLIST"),
    );
    if (!isCheckoutReminderDeliveryEnabled(mode, allowedRecipients)) {
      return json({ error: "Reminder email delivery is not configured" }, 503);
    }
    return await sendDueReminders(serviceClient(), mode, allowedRecipients);
  } catch (error) {
    console.error("[checkout-reminders] request failed");
    return json({ error: "Checkout reminders could not be processed" }, 500);
  }
});
