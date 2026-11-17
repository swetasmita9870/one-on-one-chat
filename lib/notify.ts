export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

let lastCallTag = "";

export function notifyIncomingCall(title: string, body: string, onClick?: () => void) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const tag = `pingora-call-${Date.now()}`;
  lastCallTag = tag;
  const note = new Notification(title, { body, tag, icon: "/favicon.ico" });
  note.onclick = () => {
    window.focus();
    onClick?.();
    note.close();
  };
}

export function notifyNewMessage(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const note = new Notification(title, { body: body.slice(0, 120), icon: "/favicon.ico" });
  note.onclick = () => {
    window.focus();
    note.close();
  };
}

export function clearCallNotification() {
  lastCallTag = "";
}