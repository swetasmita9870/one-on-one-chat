"use client";

import { useEffect, useRef, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useLocalParticipant, useRemoteParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { endCall, liveKitRoom, markCallActive, startRing, watchCall } from "@/lib/calls";
import { fetchLiveKitToken } from "@/lib/livekit";
import { startRingback, stopRingback, unlockAudio } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Avatar } from "./ChatList";

const NO_ANSWER_MS = 45_000;

type Phase = "media" | "calling" | "connecting" | "connected" | "error";

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

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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
  const onCloseRef = useRef(onClose);
  const endedRef = useRef(false);
  const noAnswerRef = useRef(0);
  onCloseRef.current = onClose;
  const [callId, setCallId] = useState(existingId || "");
  const [session, setSession] = useState<{ token: string; url: string } | null>(null);
  const [phase, setPhase] = useState<Phase>(role === "caller" ? "media" : "connecting");
  const [detail, setDetail] = useState(role === "caller" ? "Starting call…" : "Joining call…");

  useEffect(() => {
    let closed = false;
    (async () => {
      await unlockAudio();
      const id = existingId || await startRing({ callerId: me, calleeId: peerId, video });
      if (closed) return;
      setCallId(id);
      if (role === "caller") {
        setPhase("calling");
        setDetail("Ringing…");
        startRingback();
        noAnswerRef.current = window.setTimeout(() => {
          setPhase("error");
          setDetail("No answer.");
          stopRingback();
          void endCall(id);
        }, NO_ANSWER_MS);
      }
      const creds = await fetchLiveKitToken(id);
      if (closed) return;
      setSession(creds);
    })().catch((err) => {
      if (closed) return;
      stopRingback();
      setPhase("error");
      setDetail(err instanceof Error ? err.message : "Could not start the call.");
    });
    return () => {
      closed = true;
      window.clearTimeout(noAnswerRef.current);
      stopRingback();
    };
  }, [existingId, me, peerId, role, video]);

  useEffect(() => {
    if (!callId) return;
    return watchCall(callId, (call) => {
      if (!call || call.state === "ended") onCloseRef.current();
    });
  }, [callId]);

  function hangUp() {
    if (endedRef.current) return;
    endedRef.current = true;
    window.clearTimeout(noAnswerRef.current);
    stopRingback();
    if (callId) void endCall(callId);
    onClose();
  }

  return (
    <section className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#050a0e] text-white sm:left-[4.5rem]">
      {session ? (
        <LiveKitRoom
          token={session.token}
          serverUrl={session.url}
          connect
          audio
          video={video}
          onConnected={() => {
            if (role === "callee") void markCallActive(callId);
          }}
          onDisconnected={hangUp}
          className="flex min-h-0 flex-1 flex-col"
        >
          <RoomAudioRenderer />
          <LiveStage
            peerName={peerName}
            peerPhoto={peerPhoto}
            video={video}
            phase={phase}
            detail={detail}
            onRemote={() => {
              window.clearTimeout(noAnswerRef.current);
              stopRingback();
              setPhase("connected");
              if (callId) void markCallActive(callId);
            }}
            onHangUp={hangUp}
          />
        </LiveKitRoom>
      ) : (
        <StageChrome peerName={peerName} peerPhoto={peerPhoto} video={video} phase={phase} detail={detail} showFace={false} onHangUp={hangUp} />
      )}
    </section>
  );
}

function LiveStage({
  peerName,
  peerPhoto,
  video,
  phase,
  detail,
  onRemote,
  onHangUp,
}: {
  peerName: string;
  peerPhoto?: string;
  video: boolean;
  phase: Phase;
  detail: string;
  onRemote: () => void;
  onHangUp: () => void;
}) {
  const remotes = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const remoteCam = tracks.find((track) => !track.participant.isLocal && track.publication?.isSubscribed);
  const localCam = tracks.find((track) => track.participant.isLocal);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(video);

  useEffect(() => {
    if (remotes.length) onRemote();
  }, [remotes.length]);

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    await localParticipant.setMicrophoneEnabled(!next);
  }

  async function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    await localParticipant.setCameraEnabled(next);
  }

  return (
    <StageChrome
      peerName={peerName}
      peerPhoto={peerPhoto}
      video={video || Boolean(remoteCam)}
      phase={remotes.length ? "connected" : phase}
      detail={detail}
      showFace={Boolean(remoteCam)}
      remote={remoteCam ? <VideoTrack trackRef={remoteCam} className="h-full w-full object-cover" /> : null}
      local={cameraOn && localCam ? <VideoTrack trackRef={localCam} className="h-full w-full -scale-x-100 object-cover" /> : null}
      muted={muted}
      cameraOn={cameraOn}
      onMute={toggleMute}
      onCamera={toggleCamera}
      onHangUp={onHangUp}
    />
  );
}

function StageChrome({
  peerName,
  peerPhoto,
  video,
  phase,
  detail,
  showFace,
  remote,
  local,
  muted,
  cameraOn,
  onMute,
  onCamera,
  onHangUp,
}: {
  peerName: string;
  peerPhoto?: string;
  video: boolean;
  phase: Phase;
  detail: string;
  showFace: boolean;
  remote?: React.ReactNode;
  local?: React.ReactNode;
  muted?: boolean;
  cameraOn?: boolean;
  onMute?: () => void;
  onCamera?: () => void;
  onHangUp: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    if (phase !== "connected") return;
    if (!started.current) started.current = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started.current), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const waiting = phase === "media" || phase === "calling" || phase === "connecting";
  const statusLine = phase === "connected" ? formatDuration(elapsed) : detail;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showFace ? <div className="absolute inset-0 z-0 bg-black">{remote}</div> : (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_28%,rgba(30,201,160,0.18),transparent_52%),linear-gradient(180deg,#0a1620,#07111a_65%)]" />
      )}
      <header className="relative z-20 flex flex-col items-center px-6 pt-12 text-center md:pt-14">
        <p className="text-[11px] font-medium tracking-[0.28em] text-gold uppercase">
          {video ? "Video" : "Voice"}
          {phase === "calling" ? " · ringing" : ""}
        </p>
        <h1 className="mt-3 font-serif text-3xl font-light tracking-tight md:text-4xl">{peerName}</h1>
        <p className="mt-1.5 text-sm text-white/70">{statusLine}</p>
      </header>
      <div className="relative z-10 min-h-0 flex-1">
        {!showFace ? (
          <div className="flex h-full items-center justify-center pb-24">
            <div className="relative">
              {waiting ? <span className="absolute inset-0 -m-8 animate-ping rounded-full bg-gold/12" aria-hidden /> : null}
              <Avatar name={peerName} photo={peerPhoto} large />
            </div>
          </div>
        ) : null}
        {video ? (
          <div className="absolute right-4 top-6 z-10 aspect-[3/4] w-28 overflow-hidden rounded-2xl border border-white/20 bg-black/50 shadow-2xl md:right-6 md:w-36">
            {local || <div className="grid h-full place-items-center"><VideoOff className="size-8 text-white/40" /></div>}
          </div>
        ) : null}
      </div>
      <footer className="relative z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 pb-10 pt-8">
        <div className="mx-auto flex max-w-md items-end justify-center gap-5 sm:gap-8">
          <CallControl label={muted ? "Unmute" : "Mute"} active={muted} disabled={!onMute} onClick={() => onMute?.()}>
            {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </CallControl>
          {video ? (
            <CallControl label={cameraOn ? "Camera" : "Cam off"} active={!cameraOn} disabled={!onCamera} onClick={() => onCamera?.()}>
              {cameraOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
            </CallControl>
          ) : null}
          <CallControl label="End" danger onClick={onHangUp}>
            <PhoneOff className="size-6" />
          </CallControl>
        </div>
      </footer>
    </div>
  );
}
