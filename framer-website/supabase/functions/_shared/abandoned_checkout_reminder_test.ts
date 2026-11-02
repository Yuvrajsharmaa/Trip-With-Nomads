import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAbandonedCheckoutEmail,
  buildCheckoutResumeUrl,
  isValidCheckoutReminderToken,
  nextReminderNumber,
} from "./abandoned_checkout_reminder.ts";

Deno.test("abandoned checkout journey sends only the first and next-day reminders", () => {
  assertEquals(nextReminderNumber(0), 1);
  assertEquals(nextReminderNumber(1), 2);
  assertEquals(nextReminderNumber(2), null);
  assertEquals(nextReminderNumber(-1), null);
});

Deno.test("staging reminder delivery is closed by default and allowlist-bound", async () => {
  const policy = await import("./abandoned_checkout_reminder.ts");
  const deliveryEnabled = (policy as any).isCheckoutReminderDeliveryEnabled;
  const recipientAllowed = (policy as any).isCheckoutReminderRecipientAllowed;
  const allowedRecipients = ["yuvrajsharma6367@gmail.com"];

  assertEquals(
    typeof deliveryEnabled,
    "function",
    "reminder delivery needs an explicit mode policy",
  );
  assertEquals(
    typeof recipientAllowed,
    "function",
    "test delivery needs an explicit recipient policy",
  );
  assertEquals(
    deliveryEnabled("disabled", allowedRecipients),
    false,
  );
  assertEquals(
    deliveryEnabled("test", []),
    false,
  );
  assertEquals(deliveryEnabled("test", allowedRecipients), true);
  assertEquals(deliveryEnabled("live", []), true);
  assertEquals(
    recipientAllowed(
      "test",
      "YUVRAJSHARMA6367@gmail.com",
      allowedRecipients,
    ),
    true,
  );
  assertEquals(
    recipientAllowed(
      "test",
      "customer@example.com",
      allowedRecipients,
    ),
    false,
  );
  assertEquals(
    recipientAllowed("live", "guest@example.com", []),
    true,
  );
  assertEquals(
    recipientAllowed("live", "invalid", []),
    false,
  );
});

Deno.test("checkout resume URL contains only validated trip context and no customer PII", () => {
  assertEquals(
    buildCheckoutResumeUrl({
      siteUrl: "https://tripwithnomads.com",
      tripId: "795434d8-16dd-47f9-8ad5-bc363821b743",
      tripSlug: "vietnam-hcm-danang-hanoi-xmas-nye",
    }),
    "https://tripwithnomads.com/checkout?tripId=795434d8-16dd-47f9-8ad5-bc363821b743&slug=vietnam-hcm-danang-hanoi-xmas-nye",
  );
  assertThrows(() =>
    buildCheckoutResumeUrl({
      siteUrl: "https://attacker.example",
      tripId: "795434d8-16dd-47f9-8ad5-bc363821b743",
      tripSlug: "vietnam",
    })
  );
  assertThrows(() =>
    buildCheckoutResumeUrl({
      siteUrl: "https://tripwithnomads.com",
      tripId: "not-a-trip-id",
      tripSlug: "vietnam",
    })
  );
  assertThrows(() =>
    buildCheckoutResumeUrl({
      siteUrl: "https://unrelated-project.framer.app",
      tripId: "795434d8-16dd-47f9-8ad5-bc363821b743",
      tripSlug: "vietnam",
    })
  );
});

Deno.test("reminder email is concise, honest, branded, and includes one-click unsubscribe", () => {
  const email = buildAbandonedCheckoutEmail({
    sequenceId: "795434d8-16dd-47f9-8ad5-bc363821b743",
    reminderNumber: 1 as const,
    email: "guest@example.com",
    tripName: "Vietnam HCM Danang Hanoi",
    resumeUrl:
      "https://tripwithnomads.com/checkout?tripId=795434d8-16dd-47f9-8ad5-bc363821b743&slug=vietnam",
    unsubscribeUrl:
      "https://project.supabase.co/functions/v1/checkout-reminders?token=795434d8-16dd-47f9-8ad5-bc363821b743",
  });

  assertEquals(email.to, "guest@example.com");
  assertEquals(
    email.idempotencyKey,
    "abandoned-checkout:795434d8-16dd-47f9-8ad5-bc363821b743:1",
  );
  assertEquals(
    email.subject,
    "Your Vietnam HCM Danang Hanoi checkout is unfinished",
  );
  assertStringIncludes(
    email.text,
    "You started booking Vietnam HCM Danang Hanoi but didn’t complete checkout. No seat has been reserved.",
  );
  assertStringIncludes(
    email.text,
    "If you’d still like to go, return to checkout below.",
  );
  assertEquals(email.text.includes("where you left off"), false);
  assertStringIncludes(
    email.text,
    "You’re receiving this because you entered your email while checking out with Trip With Nomads.",
  );
  assertEquals(email.text.includes("chose checkout reminders"), false);
  assertStringIncludes(email.text, "Stop these checkout reminders");
  assertStringIncludes(email.html, "https://tripwithnomads.com/checkout?");
  assertStringIncludes(
    email.headers?.["List-Unsubscribe"] || "",
    "795434d8-16dd-47f9-8ad5-bc363821b743",
  );
  assertEquals(
    email.headers?.["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assertEquals(email.text.includes("limited-time"), false);
  assertEquals(email.text.includes("discount"), false);
});

Deno.test("reminder email escapes customer-provided trip text", () => {
  const email = buildAbandonedCheckoutEmail({
    sequenceId: "795434d8-16dd-47f9-8ad5-bc363821b743",
    reminderNumber: 2,
    email: "guest@example.com",
    tripName: "<img src=x onerror=alert(1)>",
    resumeUrl:
      "https://tripwithnomads.com/checkout?tripId=795434d8-16dd-47f9-8ad5-bc363821b743&slug=vietnam",
    unsubscribeUrl:
      "https://project.supabase.co/functions/v1/checkout-reminders?token=795434d8-16dd-47f9-8ad5-bc363821b743",
  });
  assertEquals(email.html.includes("<img src=x"), false);
  assertStringIncludes(email.html, "&lt;img");
  assertEquals(
    email.subject,
    "Final checkout reminder: <img src=x onerror=alert(1)>",
  );
  assertStringIncludes(
    email.text,
    "No seat is held, and availability may change.",
  );
  assertStringIncludes(
    email.text,
    "If you’ve changed your plans, you can ignore this email.",
  );
});

Deno.test("checkout reminder uses a supplied name without exposing it as markup", () => {
  const params = {
    sequenceId: "795434d8-16dd-47f9-8ad5-bc363821b743",
    reminderNumber: 1 as const,
    email: "guest@example.com",
    name: "A <Guest>",
    tripName: "Vietnam",
    resumeUrl:
      "https://tripwithnomads.com/checkout?tripId=795434d8-16dd-47f9-8ad5-bc363821b743&slug=vietnam",
    unsubscribeUrl:
      "https://project.supabase.co/functions/v1/checkout-reminders?token=795434d8-16dd-47f9-8ad5-bc363821b743",
  };
  const email = buildAbandonedCheckoutEmail(params);
  assertStringIncludes(email.text, "Hi A <Guest>,");
  assertStringIncludes(email.html, "Hi A &lt;Guest&gt;,");
});

Deno.test("checkout reminder cron authentication rejects missing or wrong secrets", async () => {
  const { isAuthorizedCheckoutReminder } = await import(
    "./abandoned_checkout_reminder.ts"
  );
  assertEquals(isAuthorizedCheckoutReminder("secret", "secret"), true);
  assertEquals(isAuthorizedCheckoutReminder("wrong", "secret"), false);
  assertEquals(isAuthorizedCheckoutReminder("secret", ""), false);
  assertEquals(isAuthorizedCheckoutReminder("", "secret"), false);
});

Deno.test("unsubscribe tokens must be canonical UUIDs", () => {
  assertEquals(
    isValidCheckoutReminderToken("795434d8-16dd-47f9-8ad5-bc363821b743"),
    true,
  );
  assertEquals(
    isValidCheckoutReminderToken("00000000-0000-0000-0000-000000000000"),
    false,
  );
  assertEquals(
    isValidCheckoutReminderToken("795434d8----16dd-47f9-8ad5-bc363821b743"),
    false,
  );
});
