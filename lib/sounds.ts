const MESSAGE_URL = "/sounds/message.mp3";
const RING_URL = "/sounds/ringtone.mp3";

let ringTimer = 0;
let ringOsc: OscillatorNode | null = null;
let ringGain: GainNode | null = null;
let ringAudio: HTMLAudioElement | null = null;
let ringGeneration = 0;
let messageAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

function ctx() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export async function unlockAudio() {
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") await c.resume();
}

function tone(freq: number, ms: number, gain = 0.12) {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + ms / 1000);
}

function messageEl() {
  if (typeof window === "undefined") return null;
  if (!messageAudio) {
    messageAudio = new Audio(MESSAGE_URL);
    messageAudio.preload = "auto";
  }
  return messageAudio;
}

function playMessageFallback() {
  tone(880, 90, 0.1);
  window.setTimeout(() => tone(1175, 120, 0.08), 100);
}

export function playMessageSound() {
  void unlockAudio();
  const el = messageEl();
  if (!el) {
    playMessageFallback();
    return;
  }
  el.currentTime = 0;
  void el.play().catch(() => playMessageFallback());
}

function startRingtoneFallback(generation: number) {
  if (generation !== ringGeneration) return;
  stopRingtoneSynth();
  const c = ctx();
  if (!c) return;
  ringOsc = c.createOscillator();
  ringGain = c.createGain();
  ringOsc.type = "triangle";
  ringOsc.frequency.value = 440;
  ringGain.gain.value = 0;
  ringOsc.connect(ringGain);
  ringGain.connect(c.destination);
  ringOsc.start();
  let on = true;
  ringTimer = window.setInterval(() => {
    if (generation !== ringGeneration || !ringGain || !c) return;
    on = !on;
    ringGain.gain.setTargetAtTime(on ? 0.14 : 0, c.currentTime, 0.02);
    if (ringOsc) ringOsc.frequency.value = on ? 480 : 520;
  }, 450);
}

function stopRingtoneSynth() {
  window.clearInterval(ringTimer);
  ringTimer = 0;
  if (ringGain) {
    try { ringGain.gain.value = 0; } catch { /* */ }
  }
  if (ringOsc) {
    try { ringOsc.stop(); } catch { /* */ }
    ringOsc.disconnect();
  }
  ringOsc = null;
  ringGain = null;
}

function silence(audio: HTMLAudioElement) {
  audio.loop = false;
  audio.pause();
  audio.currentTime = 0;
  audio.src = "";
}

export function startRingtone() {
  const generation = ++ringGeneration;
  if (ringAudio) silence(ringAudio);
  stopRingtoneSynth();
  const audio = new Audio(RING_URL);
  audio.loop = true;
  audio.preload = "auto";
  ringAudio = audio;
  void audio.play().then(() => {
    if (generation !== ringGeneration) silence(audio);
  }).catch(() => {
    if (generation !== ringGeneration) return;
    if (ringAudio === audio) ringAudio = null;
    startRingtoneFallback(generation);
  });
  return stopRingtone;
}

export function stopRingtone() {
  ringGeneration += 1;
  if (ringAudio) {
    silence(ringAudio);
    ringAudio = null;
  }
  stopRingtoneSynth();
}

let backAudio: HTMLAudioElement | null = null;
let backGeneration = 0;

/** Quiet loop for the person who placed the call, until the other side connects. */
export function startRingback() {
  const generation = ++backGeneration;
  if (backAudio) silence(backAudio);
  const audio = new Audio(RING_URL);
  audio.loop = true;
  audio.volume = 0.28;
  audio.preload = "auto";
  backAudio = audio;
  void audio.play().then(() => {
    if (generation !== backGeneration) silence(audio);
  }).catch(() => {
    if (backAudio === audio) backAudio = null;
  });
}

export function stopRingback() {
  backGeneration += 1;
  if (backAudio) {
    silence(backAudio);
    backAudio = null;
  }
}
