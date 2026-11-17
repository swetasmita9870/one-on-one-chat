"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { answerCall, createCall, endCall, sendIce, watchCall, watchIce } from "@/lib/calls";
import { startRingback, stopRingback, unlockAudio } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Avatar } from "./ChatList";

const iceServers = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
];

const NO_ANSWER_MS = 45_000;

type Phase = "media" | "calling" | "connecting" | "connected" | "reconnecting" | "error";

function callErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") return "Allow the microphone (and camera for video) in the browser prompt, then try again.";
    if (err.name === "NotFoundError") return "No microphone was found on this device.";
    if (err.name === "NotReadableError") return "Microphone or camera is busy in another app.";
    return err.message || "Could not access your microphone.";
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (/jwt|session|sign in/i.test(msg)) return "Your session expired. Sign in again, then retry the call.";
    if (/row-level|policy|permission denied/i.test(msg)) return "The server blocked this call. Sign in again and retry.";
    return msg || "Could not start the call.";
  }
  return "Could not start the call.";
}

async function openLocalMedia(wantsVideo: boolean) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot place calls.");
  if (!wantsVideo) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    return { stream, videoOn: false };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    return { stream, videoOn: stream.getVideoTracks().length > 0 };
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") throw err;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    return { stream, videoOn: false };
  }
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function CallControl({
  label,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn("flex w-[4.25rem] flex-col items-center gap-1.5 text-white/80 transition disabled:opacity-40", active && "text-white")}
      onClick={onClick}
      aria-label={label}
    >
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full ring-1 transition",
          danger && "bg-danger text-white ring-danger/50 hover:brightness-110",
          !danger && active && "bg-white/25 ring-white/30",
          !danger && !active && "bg-white/12 ring-white/15 hover:bg-white/20"
        )}
      >
        {children}
      </span>
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

export function CallScreen({
  me,
  peerId,
  peerName,
  peerPhoto,
  video,
  role,
  existingId,
  onClose,
}: {
  me: string;
  peerId: string;
  peerName: string;
  peerPhoto?: string;
  video: boolean;
  role: "caller" | "callee";
  existingId?: string;
  onClose: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef(existingId || "");
  const onCloseRef = useRef(onClose);
  const endedRef = useRef(false);
  onCloseRef.current = onClose;

  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(video);
  const [useVideo, setUseVideo] = useState(video);
  const [phase, setPhase] = useState<Phase>("media");
  const [detail, setDetail] = useState(role === "caller" ? "Starting call…" : "Joining call…");
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!connectedAt) return;
    const tick = () => setElapsed(Date.now() - connectedAt);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [connectedAt]);

  useEffect(() => {
    const el = localRef.current;
    if (el && streamRef.current) el.srcObject = streamRef.current;
  }, [cameraOn, useVideo, phase]);

  useEffect(() => {
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    let stream: MediaStream | null = null;
    let callId = callIdRef.current;
    const stops: Array<() => void> = [];
    let closed = false;
    let timedOut = false;
    let noAnswerTimer = 0;
    const remoteStream = new MediaStream();
    const alive = () => !closed;

    const markConnected = () => {
      if (!alive() || timedOut) return;
      window.clearTimeout(noAnswerTimer);
      stopRingback();
      setPhase((current) => (current === "error" ? current : "connected"));
      setConnectedAt((current) => current ?? Date.now());
    };

    const finish = (notifyPeer: boolean) => {
      if (endedRef.current) return;
      endedRef.current = true;
      closed = true;
      window.clearTimeout(noAnswerTimer);
      stopRingback();
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (pc.signalingState !== "closed") pc.close();
      if (notifyPeer && callId) void endCall(callId);
      onCloseRef.current();
    };

    const attachRemote = () => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    };

    pc.ontrack = (event) => {
      const incoming = event.streams[0]?.getTracks() || [event.track];
      incoming.forEach((track) => {
        if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
      });
      attachRemote();
      if (remoteStream.getVideoTracks().some((track) => track.readyState === "live")) setUseVideo(true);
      markConnected();
    };

    pc.oniceconnectionstatechange = () => {
      if (!alive()) return;
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") markConnected();
      else if (state === "disconnected") {
        setPhase("reconnecting");
        setDetail("Reconnecting…");
      } else if (state === "failed") {
        stopRingback();
        setPhase("error");
        setDetail("Could not reach them. Check the network and try again.");
      }
    };

    (async () => {
      await unlockAudio();
      if (role === "callee" && !callId) throw new Error("This call is no longer available.");

      const media = await openLocalMedia(video);
      if (!alive()) {
        media.stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = media.stream;
      streamRef.current = stream;
      setUseVideo(media.videoOn);
      setCameraOn(media.videoOn);
      if (localRef.current) localRef.current.srcObject = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream as MediaStream));

      const queuedIce: RTCIceCandidateInit[] = [];
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const candidate = event.candidate.toJSON();
        if (!callId) queuedIce.push(candidate);
        else void sendIce(callId, me, candidate);
      };

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!alive()) return;
        callId = await createCall({ callerId: me, calleeId: peerId, video: media.videoOn, offer });
        callIdRef.current = callId;
        queuedIce.splice(0).forEach((candidate) => void sendIce(callId, me, candidate));
        setPhase("calling");
        setDetail("Ringing…");
        startRingback();
        noAnswerTimer = window.setTimeout(() => {
          if (!alive() || endedRef.current) return;
          timedOut = true;
          setPhase("error");
          setDetail("No answer.");
          stopRingback();
          void endCall(callId);
        }, NO_ANSWER_MS);
      } else {
        setPhase("connecting");
        setDetail("Connecting…");
      }
      if (!alive() || !callId) return;

      const pendingIce: RTCIceCandidateInit[] = [];
      let remoteReady = false;
      const addCandidate = (candidate: RTCIceCandidateInit) => {
        if (!candidate?.candidate) return;
        if (!remoteReady) pendingIce.push(candidate);
        else void pc.addIceCandidate(candidate).catch(() => undefined);
      };
      const flushIce = () => {
        remoteReady = true;
        pendingIce.splice(0).forEach((candidate) => void pc.addIceCandidate(candidate).catch(() => undefined));
      };

      stops.push(watchIce(callId, (from, candidate) => {
        if (from !== me) addCandidate(candidate);
      }));
      stops.push(watchCall(callId, async (call) => {
        if (!alive() || timedOut) return;
        if (!call || call.state === "ended") {
          finish(false);
          return;
        }
        if (role === "caller" && call.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(call.answer);
          flushIce();
          setPhase("connecting");
          setDetail("Connecting…");
          stopRingback();
          window.clearTimeout(noAnswerTimer);
        }
        if (role === "callee" && call.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(call.offer);
          flushIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (!alive()) return;
          await answerCall(callId, answer);
          setPhase("connecting");
          setDetail("Connecting…");
        }
      }));
    })().catch((err) => {
      if (!alive()) return;
      stopRingback();
      setPhase("error");
      setDetail(callErrorMessage(err));
    });

    return () => {
      closed = true;
      window.clearTimeout(noAnswerTimer);
      stopRingback();
      stops.forEach((stop) => stop());
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (pc.signalingState !== "closed") pc.close();
    };
  }, [existingId, me, peerId, role, video]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
  }

  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
  }

  function hangUp() {
    if (endedRef.current) return;
    endedRef.current = true;
    stopRingback();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    pcRef.current?.close();
    if (callIdRef.current) void endCall(callIdRef.current);
    onClose();
  }

  const waiting = phase === "media" || phase === "calling" || phase === "connecting";
  const showRemoteVideo = useVideo && phase === "connected";
  const statusLine = phase === "connected" ? formatDuration(elapsed) : detail;

  return (
    <section className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#050a0e] text-white">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {!showRemoteVideo ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_28%,rgba(30,201,160,0.18),transparent_52%),linear-gradient(180deg,#0a1620,#07111a_65%)]" />
      ) : null}

      <header className="relative z-20 flex flex-col items-center px-6 pt-12 text-center md:pt-14">
        <div className="flex items-center gap-2">
          {phase === "connected" ? <span className="size-2 rounded-full bg-gold shadow-[0_0_12px_rgba(30,201,160,0.8)]" /> : null}
          <p className="text-[11px] font-medium tracking-[0.28em] text-gold uppercase">
            {useVideo ? "Video" : "Voice"}
            {phase === "calling" ? " · ringing" : phase === "reconnecting" ? " · reconnecting" : ""}
          </p>
        </div>
        <h1 className="mt-3 font-serif text-3xl font-light tracking-tight md:text-4xl">{peerName}</h1>
        <p className={cn("mt-1.5 text-sm", phase === "error" ? "max-w-sm text-white/80" : "text-white/65")}>{statusLine}</p>
      </header>

      <div className="relative min-h-0 flex-1">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn(showRemoteVideo ? "h-full w-full object-cover" : "pointer-events-none absolute size-0 opacity-0")}
        />
        {useVideo ? (
          <>
            <video
              ref={localRef}
              muted
              autoPlay
              playsInline
              className={cn(
                "absolute right-4 top-28 z-10 aspect-[3/4] w-28 -scale-x-100 rounded-2xl border border-white/20 object-cover shadow-2xl ring-1 ring-black/40 md:right-6 md:top-32 md:w-36",
                !cameraOn && "pointer-events-none opacity-0"
              )}
            />
            {!cameraOn ? (
              <div className="absolute right-4 top-28 z-10 flex aspect-[3/4] w-28 items-center justify-center rounded-2xl border border-white/15 bg-black/50 backdrop-blur md:right-6 md:top-32 md:w-36">
                <VideoOff className="size-8 text-white/40" />
              </div>
            ) : null}
          </>
        ) : null}
        {!showRemoteVideo ? (
          <div className="flex h-full flex-col items-center justify-center px-6 pb-24">
            <div className="relative">
              {waiting ? (
                <>
                  <span className="absolute inset-0 -m-8 animate-ping rounded-full bg-gold/12" aria-hidden />
                  <span className="absolute inset-0 -m-14 animate-pulse rounded-full bg-gold/5" aria-hidden />
                </>
              ) : null}
              <Avatar name={peerName} photo={peerPhoto} large />
            </div>
          </div>
        ) : null}
      </div>

      <footer className="relative z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 pb-10 pt-8">
        <div className="mx-auto flex max-w-md items-end justify-center gap-5 sm:gap-8">
          <CallControl label={muted ? "Unmute" : "Mute"} active={muted} disabled={phase === "media"} onClick={toggleMute}>
            {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </CallControl>
          {useVideo ? (
            <CallControl label={cameraOn ? "Camera" : "Cam off"} active={!cameraOn} disabled={phase === "media"} onClick={toggleCamera}>
              {cameraOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
            </CallControl>
          ) : null}
          <CallControl label="End" danger onClick={hangUp}>
            <PhoneOff className="size-6" />
          </CallControl>
        </div>
      </footer>
    </section>
  );
}
