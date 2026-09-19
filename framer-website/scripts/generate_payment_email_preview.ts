import { buildPaymentEmail } from "../supabase/functions/_shared/payment_email.ts";

// The supplied .lottie files stay beside their extracted JSON counterparts.
// The browser preview uses the JSON with lottie-web; the sent email keeps its
// inline static fallback because email clients do not execute Lottie players.

const pendingBooking = {
  id: "booking-123",
  booking_ref: "TWN-2026-00123",
  name: "Guest User",
  email: "guest@example.com",
  departure_date: "2026-05-09",
  travellers: [
    { id: 1, name: "Guest User", sharing: "Double", transport: "SUV" },
    { id: 2, name: "A Guest", sharing: "Quad", transport: "Bike" },
    { id: 3, name: "Third Traveller", sharing: "Double", transport: "SUV" },
  ],
  payment_breakdown: [
    {
      count: 2,
      variant: "Double",
      transport: "SUV",
      unit_price: 8000,
      price: 16000,
    },
    {
      count: 1,
      variant: "Quad",
      transport: "Bike",
      unit_price: 6000,
      price: 6000,
    },
  ],
  subtotal_amount: 22000,
  discount_amount: 1000,
  coupon_code: "NOMAD10",
  tax_amount: 3780,
  total_amount: 24780,
  currency: "INR",
  payable_now_amount: 24780,
  paid_amount: 0,
  due_amount: 0,
  payment_status: "pending",
  settlement_status: "pending",
  payment_mode: "full",
  payment_gateway_txn_id: "",
};

const success = buildPaymentEmail(
  pendingBooking,
  {
    ...pendingBooking,
    payment_status: "paid",
    settlement_status: "fully_paid",
    paid_amount: 24780,
    payment_gateway_txn_id: "pay_123",
  },
  "Summer Spiti",
)!;

const partial = buildPaymentEmail(
  pendingBooking,
  {
    ...pendingBooking,
    payment_mode: "partial_25",
    payable_now_amount: 6195,
    payment_status: "paid",
    settlement_status: "partially_paid",
    paid_amount: 6195,
    due_amount: 18585,
    payment_gateway_txn_id: "pay_partial",
  },
  "Summer Spiti",
)!;

const failed = buildPaymentEmail(
  pendingBooking,
  {
    ...pendingBooking,
    payment_status: "failed",
    settlement_status: "failed",
    payment_gateway_txn_id: "pay_failed",
  },
  "Summer Spiti",
  "https://staging.tripwithnomads.com",
  "https://staging.tripwithnomads.com/payment-failed?booking_id=booking-123&status_token=abc",
)!;

const variants = {
  success: {
    label: "Payment received",
    subject: success.subject,
    html: success.html,
    animation: {
      src: "./assets/success-confetti.json",
      label: "Success confetti animation",
      fallback: "✓",
      description: "A small confetti moment for a fully paid booking.",
      loop: false,
    },
  },
  partial: {
    label: "Advance payment received",
    subject: partial.subject,
    html: partial.html,
    animation: {
      src: "./assets/success-confetti.json",
      label: "Advance payment success animation",
      fallback: "✓",
      description:
        "The same success cue, with the email showing the balance still due.",
      loop: false,
    },
  },
  failed: {
    label: "Payment not completed",
    subject: failed.subject,
    html: failed.html,
    animation: {
      src: "./assets/payment-failed-cross.json",
      label: "Payment failed animation",
      fallback: "×",
      description: "A restrained cross loop for an incomplete payment attempt.",
      loop: true,
    },
  },
};

const serializedVariants = JSON.stringify(variants).replace(
  /<\//g,
  "<\\/",
);

const preview = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Trip With Nomads email preview</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, Helvetica, sans-serif;
        background: #f4fbff;
        color: #0b3550;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; background: #f4fbff; }
      .preview-bar {
        max-width: 1120px;
        margin: 0 auto;
        padding: 30px 24px 22px;
      }
      .preview-bar p {
        max-width: 660px;
        margin: 8px 0 0;
        color: #5e7d8d;
        font-size: 14px;
        line-height: 1.6;
      }
      h1 { margin: 0; font-size: 28px; line-height: 1.2; }
      .controls {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 20px;
      }
      label {
        color: #157aa9;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .07em;
        text-transform: uppercase;
      }
      select {
        min-width: 220px;
        padding: 10px 12px;
        border: 1px solid #b5ddef;
        border-radius: 8px;
        background: #fff;
        color: #0b3550;
        font: inherit;
      }
      .subject {
        margin-top: 12px !important;
        color: #0b3550 !important;
        font-size: 13px !important;
      }
      .stage {
        min-height: calc(100vh - 190px);
        padding: 30px 20px 70px;
        background: #eaf7fd;
      }
      iframe {
        display: block;
        width: 640px;
        max-width: 100%;
        height: 1520px;
        margin: 18px auto 0;
        border: 0;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 18px 48px rgba(11, 53, 80, .12);
      }
      @media (max-width: 640px) {
        .preview-bar { padding: 24px 16px 18px; }
        .controls { align-items: flex-start; flex-direction: column; }
        select { width: 100%; }
        .stage { padding: 18px 8px 40px; }
        iframe {
          width: 100%;
          max-width: 600px;
          height: 1520px;
        }
      }
    </style>
  </head>
  <body>
    <header class="preview-bar">
      <h1>Trip With Nomads email preview</h1>
      <p>Minimal transactional email treatment with the supplied Lottie status moment, sample Summer Spiti booking data, and the blue-to-white brand gradient.</p>
      <div class="controls">
        <label for="email-state">State</label>
        <select id="email-state">
          <option value="success">Payment received</option>
          <option value="partial">Advance payment received</option>
          <option value="failed">Payment not completed</option>
        </select>
      </div>
      <p class="subject" id="email-subject"></p>
    </header>
    <main class="stage">
      <iframe id="email-frame" title="Email preview"></iframe>
    </main>
    <script type="module">
      import lottie from "https://cdn.jsdelivr.net/npm/lottie-web@5.13.0/+esm";
      const variants = ${serializedVariants};
      const stateSelect = document.getElementById("email-state");
      const subject = document.getElementById("email-subject");
      const frame = document.getElementById("email-frame");
      let frameAnimation = null;
      function enhanceEmailFrame(variant) {
        if (frameAnimation) {
          frameAnimation.destroy();
          frameAnimation = null;
        }
        const emailDocument = frame.contentDocument;
        const slot = emailDocument &&
          emailDocument.querySelector("[data-payment-animation]");
        if (!slot) return;
        const mount = emailDocument.createElement("div");
        mount.style.width = "120px";
        mount.style.height = "112px";
        mount.setAttribute("role", "img");
        mount.setAttribute("aria-label", variant.animation.label);
        const fallback = slot.querySelector(".payment-animation-fallback");
        slot.insertBefore(mount, fallback);
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        frameAnimation = lottie.loadAnimation({
          container: mount,
          renderer: "svg",
          loop: reduceMotion ? false : variant.animation.loop,
          autoplay: !reduceMotion,
          path: new URL(variant.animation.src, document.baseURI).href,
        });
        frameAnimation.addEventListener("DOMLoaded", function () {
          if (fallback) fallback.style.display = "none";
        });
        frameAnimation.addEventListener("data_failed", function () {
          mount.remove();
        });
      }
      function renderState(state) {
        const variant = variants[state] || variants.success;
        subject.textContent = "Subject: " + variant.subject;
        frame.onload = function () {
          enhanceEmailFrame(variant);
        };
        frame.srcdoc = variant.html;
      }
      stateSelect.addEventListener("change", function (event) {
        renderState(event.target.value);
      });
      renderState(stateSelect.value);
    </script>
  </body>
</html>
`;

await Deno.mkdir(new URL("../email-previews", import.meta.url), {
  recursive: true,
});
await Deno.writeTextFile(
  new URL("../email-previews/payment-update-email.html", import.meta.url),
  preview,
);
console.log("Wrote framer-website/email-previews/payment-update-email.html");
