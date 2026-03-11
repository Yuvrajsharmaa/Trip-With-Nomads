import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

async function checkBooking() {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_ref, payment_mode, total_amount, paid_amount, due_amount, payable_now_amount, settlement_status")
    .order("created_at", { ascending: false })
    .limit(10);
  
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

checkBooking();
