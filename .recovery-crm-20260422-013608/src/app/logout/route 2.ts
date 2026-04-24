import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  
  // Sign out from Supabase
  await supabase.auth.signOut();

  // Redirect to login page
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}

export async function POST(request: Request) {
  const supabase = createClient();
  await (await supabase).auth.signOut();
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
