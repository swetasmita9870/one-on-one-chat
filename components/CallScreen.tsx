"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { answerCall, createCall, endCall, sendIce, watchCall, watchIce } from "@/lib/calls";
import { Button } from "@/components/ui/button";

const iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

export function CallScreen({
  me,
  peerId,
  peerName,
  video,
  role,
  existingId,
  onClose,
}: {
  me: string;
  peerId: string;
  peerName: string;
  video: boolean;
  role: "caller" | "callee";
  existingId?: string;
  onClose: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef(existingId || "");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(video);
  const [status, setStatus] = useState(role === "caller" ? "Calling…" : "Connecting…");

  useEffect(() => {
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    let stream: MediaStream | null = null;
    let callId = callIdRef.current;
    const stops: Array<() => void> = [];
    let closed = false;

    pc.ontrack = (event) => {
      if (remoteRef.current) remoteRef.current.srcObject = event.streams[0];
      setStatus("Connected");
    };

    const hangup = async () => {
      if (closed) return;
      closed = true;
      stream?.getTracks().forEach((track) => track.stop());
      pc.close();
      if (callId) await endCall(callId);
      onCloseRef.current();
    };

    (async () => {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      if (closed) return;
      if (localRef.current) localRef.current.srcObject = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream as MediaStream));
      if (!video) stream.getVideoTracks().forEach((track) => { track.enabled = false; });

      const queuedLocalIce: RTCIceCandidateInit[] = [];
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const candidate = event.candidate.toJSON();
        if (!callId) queuedLocalIce.push(candidate);
        else void sendIce(callId, me, candidate);
      };

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (closed) return;
        callId = await createCall({ callerId: me, calleeId: peerId, video, offer });
        callIdRef.current = callId;
        queuedLocalIce.splice(0).forEach((candidate) => void sendIce(callId, me, candidate));
      }
      if (closed || !callId) return;

      const pendingIce: RTCIceCandidateInit[] = [];
      let remoteReady = false;
      const addCandidate = (candidate: RTCIceCandidateInit) => {
        if (!remoteReady) pendingIce.push(candidate);
        else pc.addIceCandidate(candidate).catch(() => {});
      };
      const flushIce = () => {
        remoteReady = true;
        pendingIce.splice(0).forEach((candidate) => pc.addIceCandidate(candidate).catch(() => {}));
      };
      stops.push(watchIce(callId, (from, candidate) => {
        if (from !== me) addCandidate(candidate);
      }));
      stops.push(watchCall(callId, async (call) => {
        if (!call || closed) return;
        if (call.state === "ended") { await hangup(); return; }
        if (role === "caller" && call.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(call.answer);
          flushIce();
          setStatus("Connected");
        }
        if (role === "callee" && call.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(call.offer);
          flushIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (closed) return;
          await answerCall(callId, answer);
          setStatus("Connected");
        }
      }));
    })().catch(() => setStatus("Could not start the call"));

    return () => {
      closed = true;
      stops.forEach((stop) => stop());
      stream?.getTracks().forEach((track) => track.stop());
      pc.close();
    };
  }, [existingId, me, peerId, role, video]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    pcRef.current?.getSenders().forEach((sender) => {
      if (sender.track?.kind === "audio" && sender.track) sender.track.enabled = !next;
    });
  }

  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    pcRef.current?.getSenders().forEach((sender) => {
      if (sender.track?.kind === "video" && sender.track) sender.track.enabled = next;
    });
  }

  return (
    <section className="fixed inset-0 z-30 flex flex-col bg-black text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-6 py-6 text-center">
        <p className="font-serif text-3xl font-light">{peerName}</p>
        <p className="mt-1 text-sm text-white/70">{status}{video ? " · video" : " · voice"}</p>
      </div>
      <video className="min-h-0 flex-1 w-full bg-black object-cover" ref={remoteRef} autoPlay playsInline />
      <video className={`absolute top-24 right-4 w-36 rounded-2xl border border-white/10 shadow-2xl ${cameraOn ? "" : "hidden"}`} ref={localRef} autoPlay muted playsInline />
      <div className="flex items-center justify-center gap-4 bg-black/80 px-4 py-6">
        <Button variant="outline" className="size-14 border-white/20 bg-white/10 text-white hover:bg-white/20" size="icon" type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <MicOff /> : <Mic />}</Button>
        {video ? <Button variant="outline" className="size-14 border-white/20 bg-white/10 text-white hover:bg-white/20" size="icon" type="button" onClick={toggleCamera} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>{cameraOn ? <Video /> : <VideoOff />}</Button> : null}
        <Button variant="destructive" className="size-14" size="icon" type="button" aria-label="Hang up" onClick={() => { if (callIdRef.current) void endCall(callIdRef.current); onClose(); }}><PhoneOff /></Button>
      </div>
    </section>
  );
}
