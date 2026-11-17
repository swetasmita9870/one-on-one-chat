import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !apiKey || !apiSecret || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "LiveKit is not configured on the server." }, { status: 503 });
  }

  const header = request.headers.get("authorization") || "";
  const jwt = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { room?: string };
  const callId = (body.room || "").replace(/^pingora-/, "");
  if (!callId) return NextResponse.json({ error: "Missing call room." }, { status: 400 });

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { data: call, error } = await supabase
    .from("calls")
    .select("id, caller_id, callee_id, state")
    .eq("id", callId)
    .maybeSingle();
  if (error || !call) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  if (call.state === "ended") return NextResponse.json({ error: "This call has ended." }, { status: 410 });
  if (auth.user.id !== call.caller_id && auth.user.id !== call.callee_id) {
    return NextResponse.json({ error: "You are not part of this call." }, { status: 403 });
  }

  const name = (auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || "Pingora") as string;
  const token = new AccessToken(apiKey, apiSecret, { identity: auth.user.id, name });
  token.addGrant({
    roomJoin: true,
    room: `pingora-${call.id}`,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({ token: await token.toJwt(), url });
}
