import { getSupabase, live } from "./supabase";
import type { CallRecord } from "./types";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  video: boolean;
  state: CallRecord["state"];
  offer: CallRecord["offer"];
  answer: CallRecord["answer"];
  created_at: number;
};

function asCall(row: CallRow): CallRecord {
  return {
    id: row.id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    video: row.video,
    state: row.state,
    offer: row.offer,
    answer: row.answer,
    createdAt: Number(row.created_at),
  };
}

const RING_WINDOW_MS = 45_000;

export function watchIncoming(uid: string, onData: (calls: CallRecord[]) => void) {
  return live("calls", async () => {
    const { data } = await getSupabase().from("calls").select("*").eq("callee_id", uid).eq("state", "ringing");
    const now = Date.now();
    onData(
      ((data || []) as CallRow[])
        .map(asCall)
        .filter((call) => now - call.createdAt < RING_WINDOW_MS)
        .sort((a, b) => b.createdAt - a.createdAt)
    );
  }, `callee_id=eq.${uid}`);
}

export function watchCall(id: string, onData: (call: CallRecord | null) => void) {
  return live("calls", async () => {
    const { data } = await getSupabase().from("calls").select("*").eq("id", id).maybeSingle();
    onData(data ? asCall(data as CallRow) : null);
  }, `id=eq.${id}`);
}

export async function createCall(input: {
  callerId: string;
  calleeId: string;
  video: boolean;
  offer: RTCSessionDescriptionInit;
}) {
  const { data, error } = await getSupabase().from("calls").insert({
    caller_id: input.callerId,
    callee_id: input.calleeId,
    video: input.video,
    state: "ringing",
    offer: { type: input.offer.type, sdp: input.offer.sdp },
    answer: null,
    created_at: Date.now(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function answerCall(id: string, answer: RTCSessionDescriptionInit) {
  await getSupabase().from("calls").update({
    answer: { type: answer.type, sdp: answer.sdp },
    state: "active",
  }).eq("id", id);
}

export async function endCall(id: string) {
  await getSupabase().from("calls").update({ state: "ended" }).eq("id", id);
}

export async function sendIce(callId: string, from: string, candidate: RTCIceCandidateInit) {
  await getSupabase().from("call_ice").insert({ call_id: callId, from_user: from, candidate });
}

export async function loadCallHistory(uid: string): Promise<CallRecord[]> {
  const { data } = await getSupabase()
    .from("calls")
    .select("*")
    .or(`caller_id.eq.${uid},callee_id.eq.${uid}`)
    .order("created_at", { ascending: false })
    .limit(60);
  return ((data || []) as CallRow[]).map(asCall);
}

export function watchCallHistory(uid: string, onData: (calls: CallRecord[]) => void) {
  return live("calls", () => void loadCallHistory(uid).then(onData), undefined, false);
}

export function watchIce(callId: string, onData: (from: string, candidate: RTCIceCandidateInit) => void) {
  const seen = new Set<string>();
  return live("call_ice", async () => {
    const { data } = await getSupabase().from("call_ice").select("id, from_user, candidate").eq("call_id", callId);
    (data || []).forEach((row) => {
      const id = row.id as string;
      if (seen.has(id)) return;
      seen.add(id);
      onData(row.from_user as string, row.candidate as RTCIceCandidateInit);
    });
  }, `call_id=eq.${callId}`);
}
