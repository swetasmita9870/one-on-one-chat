import { addDoc, collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { getFirebase } from "./firebase";
import type { CallRecord } from "./types";

function calls() {
  return collection(getFirebase().firestore, "calls");
}

export function watchIncoming(uid: string, onData: (calls: CallRecord[]) => void) {
  const incoming = query(calls(), where("calleeId", "==", uid));
  return onSnapshot(incoming, (snap) => {
    onData(
      snap.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<CallRecord, "id">) }))
        .filter((item) => item.state === "ringing")
    );
  });
}

export function watchCall(id: string, onData: (call: CallRecord | null) => void) {
  return onSnapshot(doc(calls(), id), (snap) => {
    onData(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<CallRecord, "id">) } : null);
  });
}

export async function createCall(input: {
  callerId: string;
  calleeId: string;
  video: boolean;
  offer: RTCSessionDescriptionInit;
}) {
  const ref = doc(calls());
  await setDoc(ref, {
    callerId: input.callerId,
    calleeId: input.calleeId,
    video: input.video,
    state: "ringing",
    offer: { type: input.offer.type, sdp: input.offer.sdp },
    answer: null,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function answerCall(id: string, answer: RTCSessionDescriptionInit) {
  await updateDoc(doc(calls(), id), {
    answer: { type: answer.type, sdp: answer.sdp },
    state: "active",
  });
}

export async function endCall(id: string) {
  await updateDoc(doc(calls(), id), { state: "ended" }).catch(() => {});
}

export async function sendIce(callId: string, from: string, candidate: RTCIceCandidateInit) {
  await addDoc(collection(getFirebase().firestore, "calls", callId, "ice"), { from, candidate });
}

export function watchIce(callId: string, onData: (from: string, candidate: RTCIceCandidateInit) => void) {
  return onSnapshot(collection(getFirebase().firestore, "calls", callId, "ice"), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") onData(change.doc.data().from as string, change.doc.data().candidate);
    });
  });
}
